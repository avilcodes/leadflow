import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { createActivity } from '@/lib/activity';
import logger from '@/lib/logger';

const EVENT_MAP: Record<string, string> = {
  delivered: 'email.delivered',
  opened: 'email.opened',
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
      const existingWebhook = await db.webhookEvents.findFirst({
        provider: 'brevo',
        providerEventId,
      });

      if (existingWebhook) {
        logger.debug('Duplicate Brevo webhook event skipped', { providerEventId });
        continue;
      }

      // Store raw webhook event
      await db.webhookEvents.create({
        provider: 'brevo',
        eventType,
        providerEventId,
        payload: event,
        status: 'processing',
      });

      // Find the email message
      const emailMessage = await db.emailMessages.findFirst({
        providerMessageId: messageId,
      });

      if (!emailMessage) {
        logger.warn('Brevo webhook: no matching email message', { messageId });
        await db.webhookEvents.updateMany(
          { provider: 'brevo', providerEventId },
          { status: 'processed', processedAt: new Date() }
        );
        continue;
      }

      // Create email event
      try {
        await db.emailEvents.create({
          emailMessageId: emailMessage.id,
          eventType,
          provider: 'brevo',
          providerEventId,
          metadata: { ip: event.ip, link: event.link, tag: event.tag },
          occurredAt: event.date ? new Date(event.date) : new Date(),
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
          updates.deliveredAt = now;
          updates.status = 'delivered';
          break;
        case 'opened':
          updates.openedAt = now;
          break;
        case 'click':
          updates.clickedAt = now;
          break;
        case 'hard_bounce':
        case 'soft_bounce':
          updates.bouncedAt = now;
          updates.status = 'failed';
          updates.errorMessage = event.reason || `Bounce: ${eventType}`;
          await db.leads.update(emailMessage.leadId as string, { bounced: true, outreachStatus: 'bounced' });
          if (emailMessage.recipientEmail && eventType === 'hard_bounce') {
            await db.suppressionEntries.upsert('email', emailMessage.recipientEmail, {}, {
              email: emailMessage.recipientEmail,
              reason: 'bounced',
              source: 'brevo_webhook',
            });
          }
          break;
        case 'spam':
          updates.bouncedAt = now;
          updates.status = 'failed';
          updates.errorMessage = 'Marked as spam';
          if (emailMessage.recipientEmail) {
            await db.suppressionEntries.upsert('email', emailMessage.recipientEmail, {}, {
              email: emailMessage.recipientEmail,
              reason: 'complained',
              source: 'brevo_webhook',
            });
          }
          break;
        case 'unsubscribed':
          updates.unsubscribedAt = now;
          await db.leads.update(emailMessage.leadId as string, { unsubscribed: true, outreachStatus: 'bounced' });
          if (emailMessage.recipientEmail) {
            await db.suppressionEntries.upsert('email', emailMessage.recipientEmail, {}, {
              email: emailMessage.recipientEmail,
              reason: 'unsubscribed',
              source: 'brevo_webhook',
            });
          }
          break;
        case 'reply':
          updates.repliedAt = now;
          await db.leads.update(emailMessage.leadId as string, { outreachStatus: 'replied' });
          break;
      }

      if (Object.keys(updates).length > 0) {
        await db.emailMessages.update(emailMessage.id, updates);
      }

      // Update campaign stats
      if (emailMessage.campaignId) {
        const campaignStatsField: Record<string, string> = {
          delivered: 'emailsDelivered',
          opened: 'emailsOpened',
          click: 'emailsClicked',
          reply: 'emailsReplied',
          hard_bounce: 'emailsBounced',
          soft_bounce: 'emailsBounced',
        };
        const field = campaignStatsField[eventType];
        if (field) {
          await db.campaigns.increment(emailMessage.campaignId as string, field, 1);
        }
      }

      // Create activity
      const activityType = EVENT_MAP[eventType];
      if (activityType) {
        await createActivity({
          eventType: activityType as Parameters<typeof createActivity>[0]['eventType'],
          leadId: emailMessage.leadId as string,
          campaignId: (emailMessage.campaignId as string) ?? undefined,
          emailMessageId: emailMessage.id,
          provider: 'brevo',
          providerEventId,
          metadata: { brevoEvent: eventType, link: event.link },
        });
      }

      // Update outreach status on lead
      if (['delivered', 'opened'].includes(eventType)) {
        await db.leads.update(emailMessage.leadId as string, {
          outreachStatus: eventType === 'opened' ? 'opened' : 'delivered',
        });
      }

      // Mark webhook processed
      await db.webhookEvents.updateMany(
        { provider: 'brevo', providerEventId },
        { status: 'processed', processedAt: new Date() }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('POST /api/webhooks/brevo failed', { error });
    return NextResponse.json({ success: false, error: 'Webhook processing failed' }, { status: 500 });
  }
}
