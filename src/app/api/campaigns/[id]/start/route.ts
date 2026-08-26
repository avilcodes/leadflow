import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { createActivity } from '@/lib/activity';
import { getEmailProvider } from '@/providers/email';
import logger from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        emailMessages: {
          where: { status: 'approved' },
          include: { lead: true },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    if (!['draft', 'ready', 'paused'].includes(campaign.status)) {
      return NextResponse.json({ success: false, error: `Cannot start campaign in ${campaign.status} status` }, { status: 400 });
    }

    if (campaign.emailMessages.length === 0) {
      return NextResponse.json({ success: false, error: 'No approved emails to send' }, { status: 400 });
    }

    if (process.env.EMAIL_SENDING_ENABLED !== 'true') {
      return NextResponse.json({ success: false, error: 'Email sending is disabled. Set EMAIL_SENDING_ENABLED=true in environment.' }, { status: 400 });
    }

    await prisma.campaign.update({
      where: { id },
      data: { status: 'running', startedAt: new Date() },
    });

    await createActivity({ eventType: 'campaign.started', campaignId: id, userId: session.userId });

    // Send emails
    const emailProvider = getEmailProvider();
    let sent = 0;
    let failed = 0;

    for (const email of campaign.emailMessages) {
      const lead = email.lead;

      // Check suppression
      if (lead.doNotContact || lead.unsubscribed || lead.bounced) {
        await prisma.emailMessage.update({ where: { id: email.id }, data: { status: 'failed', errorMessage: 'Lead suppressed' } });
        failed++;
        continue;
      }

      if (!email.recipientEmail) {
        await prisma.emailMessage.update({ where: { id: email.id }, data: { status: 'failed', errorMessage: 'No recipient email' } });
        failed++;
        continue;
      }

      try {
        const result = await emailProvider.sendEmail({
          to: { email: email.recipientEmail, name: email.recipientName || undefined },
          from: { email: email.senderEmail || campaign.senderEmail || '', name: email.senderName || campaign.senderName || undefined },
          replyTo: campaign.replyToEmail ? { email: campaign.replyToEmail } : undefined,
          subject: email.subject || '',
          htmlContent: email.htmlBody || '',
          textContent: email.textBody || undefined,
          tags: [campaign.name],
        });

        await prisma.emailMessage.update({
          where: { id: email.id },
          data: {
            status: 'sent',
            provider: result.provider,
            providerMessageId: result.messageId,
            sentAt: new Date(),
          },
        });

        await prisma.lead.update({ where: { id: lead.id }, data: { outreachStatus: 'sent' } });
        await createActivity({ eventType: 'email.sent', leadId: lead.id, campaignId: id, emailMessageId: email.id, provider: 'brevo', metadata: { messageId: result.messageId } });
        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Send failed';
        await prisma.emailMessage.update({ where: { id: email.id }, data: { status: 'failed', errorMessage: msg } });
        failed++;
      }

      // Rate limiting delay
      const rateLimit = campaign.maxPerHour || parseInt(process.env.EMAIL_RATE_LIMIT_PER_HOUR || '50');
      const delayMs = Math.ceil(3600000 / rateLimit);
      await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 5000)));
    }

    const finalStatus = failed === campaign.emailMessages.length ? 'failed' : 'completed';
    await prisma.campaign.update({
      where: { id },
      data: { status: finalStatus, emailsSent: { increment: sent }, completedAt: new Date() },
    });

    await createActivity({ eventType: finalStatus === 'completed' ? 'campaign.completed' : 'campaign.failed', campaignId: id, userId: session.userId, metadata: { sent, failed } });

    return NextResponse.json({ success: true, data: { sent, failed, status: finalStatus } });
  } catch (error) {
    logger.error('POST /api/campaigns/[id]/start failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
