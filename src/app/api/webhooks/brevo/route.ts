import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createActivity } from '@/lib/activity';
import logger from '@/lib/logger';

// Brevo webhook event types mapping
const EVENT_MAP: Record<string, string> = {
  delivered: 'email.delivered',
  opened: 'email.opened',  // Brevo sends "opened" for unique opens
  click: 'email.clicked',
  hard_bounce: 'email.bounced',
  soft_bounce: 'email.bounced',
  spam: 'email.bounced',
  unsubscribed: 'email.unsubscribed',
  reply: 'email.replied',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Brevo can send single event or array
    const events = Array.isArray(body) ? body : [body];

    for (const event of events) {
      const eventType = event.event?.toLowerCase();
      const messageId = event['message-id'] || event.messageId;
      const providerEventId = `${messageId}-${eventType}-${event.date || event.ts_event}`;

      if (!eventType || !messageId) {
        logger.warn('Brevo webhook: missing event type or message ID', { event });
        continue;
      }

      // Idempotency check
      const existingWebhook = await prisma.webhookEvent.findUnique({
        where: { provider_providerEventId: { provider: 'brevo', providerEventId } },
      });

      if (existingWebhook) {
        logger.debug('Duplicate Brevo webhook event skipped', { providerEventId });
        continue;
      }

      // Store raw webhook event
      await prisma.webhookEvent.create({
        data: {
          provider: 'brevo',
          eventType,
          providerEventId,
          payload: event,
          status: 'processing',
        },
      });

      // Find the email message
      const emailMessage = await prisma.emailMessage.findFirst({
        where: { providerMessageId: messageId },
        include: { lead: true, campaign: true },
      });

      if (!emailMessage) {
        logger.warn('Brevo webhook: no matching email message', { messageId });
        await prisma.webhookEvent.updateMany({
          where: { provider: 'brevo', providerEventId },
          data: { status: 'processed', processedAt: new Date() },
        });
        continue;
      }

      // Create email event (idempotent)
      try {
        await prisma.emailEvent.create({
          data: {
            emailMessageId: emailMessage.id,
            eventType,
            provider: 'brevo',
            providerEventId,
            metadata: { ip: event.ip, link: event.link, tag: event.tag },
            occurredAt: event.date ? new Date(event.date) : new Date(),
          },
        });
      } catch {
        // Duplicate event, skip
        continue;
      }

      // Update email message status
      const updates: Record<string, unknown> = {};
      const now = new Date();

      switch (eventType) {
        case 'delivered':
          updates.deliveredAt = updates.deliveredAt || now;
          updates.status = 'delivered';
          break;
        case 'opened':
          updates.openedAt = updates.openedAt || now;
          break;
        case 'click':
          updates.clickedAt = updates.clickedAt || now;
          break;
        case 'hard_bounce':
        case 'soft_bounce':
          updates.bouncedAt = now;
          updates.status = 'failed';
          updates.errorMessage = event.reason || `Bounce: ${eventType}`;
          // Update lead
          await prisma.lead.update({
            where: { id: emailMessage.leadId },
            data: { bounced: true, outreachStatus: 'bounced' },
          });
          // Add to suppression list
          if (emailMessage.recipientEmail && eventType === 'hard_bounce') {
            await prisma.suppressionEntry.upsert({
              where: { email: emailMessage.recipientEmail },
              update: {},
              create: { email: emailMessage.recipientEmail, reason: 'bounced', source: 'brevo_webhook' },
            });
          }
          break;
        case 'spam':
          updates.bouncedAt = now;
          updates.status = 'failed';
          updates.errorMessage = 'Marked as spam';
          if (emailMessage.recipientEmail) {
            await prisma.suppressionEntry.upsert({
              where: { email: emailMessage.recipientEmail },
              update: {},
              create: { email: emailMessage.recipientEmail, reason: 'complained', source: 'brevo_webhook' },
            });
          }
          break;
        case 'unsubscribed':
          updates.unsubscribedAt = now;
          await prisma.lead.update({
            where: { id: emailMessage.leadId },
            data: { unsubscribed: true, outreachStatus: 'bounced' },
          });
          if (emailMessage.recipientEmail) {
            await prisma.suppressionEntry.upsert({
              where: { email: emailMessage.recipientEmail },
              update: {},
              create: { email: emailMessage.recipientEmail, reason: 'unsubscribed', source: 'brevo_webhook' },
            });
          }
          break;
        case 'reply':
          updates.repliedAt = now;
          await prisma.lead.update({
            where: { id: emailMessage.leadId },
            data: { outreachStatus: 'replied' },
          });
          break;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.emailMessage.update({ where: { id: emailMessage.id }, data: updates });
      }

      // Update campaign stats
      if (emailMessage.campaignId) {
        const campaignUpdates: Record<string, unknown> = {};
        if (eventType === 'delivered') campaignUpdates.emailsDelivered = { increment: 1 };
        if (eventType === 'opened') campaignUpdates.emailsOpened = { increment: 1 };
        if (eventType === 'click') campaignUpdates.emailsClicked = { increment: 1 };
        if (eventType === 'reply') campaignUpdates.emailsReplied = { increment: 1 };
        if (['hard_bounce', 'soft_bounce'].includes(eventType)) campaignUpdates.emailsBounced = { increment: 1 };

        if (Object.keys(campaignUpdates).length > 0) {
          await prisma.campaign.update({ where: { id: emailMessage.campaignId }, data: campaignUpdates });
        }
      }

      // Create activity
      const activityType = EVENT_MAP[eventType];
      if (activityType) {
        await createActivity({
          eventType: activityType as never,
          leadId: emailMessage.leadId,
          campaignId: emailMessage.campaignId ?? undefined,
          emailMessageId: emailMessage.id,
          provider: 'brevo',
          providerEventId,
          metadata: { brevoEvent: eventType, link: event.link },
        });
      }

      // Update outreach status on lead
      if (['delivered', 'opened'].includes(eventType)) {
        await prisma.lead.update({
          where: { id: emailMessage.leadId },
          data: { outreachStatus: eventType === 'opened' ? 'opened' : 'delivered' },
        });
      }

      // Mark webhook processed
      await prisma.webhookEvent.updateMany({
        where: { provider: 'brevo', providerEventId },
        data: { status: 'processed', processedAt: new Date() },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('POST /api/webhooks/brevo failed', { error });
    return NextResponse.json({ success: false, error: 'Webhook processing failed' }, { status: 500 });
  }
}
