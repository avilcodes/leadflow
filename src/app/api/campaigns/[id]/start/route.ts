import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
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
    const campaign = await db.campaigns.findById(id);

    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    if (!['draft', 'ready', 'paused'].includes(campaign.status as string)) {
      return NextResponse.json({ success: false, error: `Cannot start campaign in ${campaign.status} status` }, { status: 400 });
    }

    // Get approved emails with their leads
    const approvedEmails = await db.emailMessages.findMany({
      where: { campaignId: id, status: 'approved' },
    });

    if (approvedEmails.length === 0) {
      return NextResponse.json({ success: false, error: 'No approved emails to send' }, { status: 400 });
    }

    if (process.env.EMAIL_SENDING_ENABLED !== 'true') {
      return NextResponse.json({ success: false, error: 'Email sending is disabled. Set EMAIL_SENDING_ENABLED=true in environment.' }, { status: 400 });
    }

    await db.campaigns.update(id, { status: 'running', startedAt: new Date() });
    await createActivity({ eventType: 'campaign.started', campaignId: id, userId: session.userId });

    const emailProvider = getEmailProvider();
    let sent = 0;
    let failed = 0;

    for (const email of approvedEmails) {
      const lead = await db.leads.findById(email.leadId as string);
      if (!lead) { failed++; continue; }

      if (lead.doNotContact || lead.unsubscribed || lead.bounced) {
        await db.emailMessages.update(email.id, { status: 'failed', errorMessage: 'Lead suppressed' });
        failed++;
        continue;
      }

      if (!email.recipientEmail) {
        await db.emailMessages.update(email.id, { status: 'failed', errorMessage: 'No recipient email' });
        failed++;
        continue;
      }

      try {
        const result = await emailProvider.sendEmail({
          to: { email: email.recipientEmail as string, name: (email.recipientName as string) || undefined },
          from: { email: (email.senderEmail as string) || (campaign.senderEmail as string) || '', name: (email.senderName as string) || (campaign.senderName as string) || undefined },
          replyTo: campaign.replyToEmail ? { email: campaign.replyToEmail as string } : undefined,
          subject: (email.subject as string) || '',
          htmlContent: (email.htmlBody as string) || '',
          textContent: (email.textBody as string) || undefined,
          tags: [campaign.name as string],
        });

        await db.emailMessages.update(email.id, {
          status: 'sent',
          provider: result.provider,
          providerMessageId: result.messageId,
          sentAt: new Date(),
        });

        await db.leads.update(lead.id, { outreachStatus: 'sent' });
        await createActivity({ eventType: 'email.sent', leadId: lead.id, campaignId: id, emailMessageId: email.id, provider: 'brevo', metadata: { messageId: result.messageId } });
        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Send failed';
        await db.emailMessages.update(email.id, { status: 'failed', errorMessage: msg });
        failed++;
      }

      // Rate limiting delay
      const rateLimit = (campaign.maxPerHour as number) || parseInt(process.env.EMAIL_RATE_LIMIT_PER_HOUR || '50');
      const delayMs = Math.ceil(3600000 / rateLimit);
      await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 5000)));
    }

    const finalStatus = failed === approvedEmails.length ? 'failed' : 'completed';
    await db.campaigns.update(id, { status: finalStatus, completedAt: new Date() });
    if (sent > 0) {
      await db.campaigns.increment(id, 'emailsSent', sent);
    }

    await createActivity({ eventType: finalStatus === 'completed' ? 'campaign.completed' : 'campaign.failed', campaignId: id, userId: session.userId, metadata: { sent, failed } });

    return NextResponse.json({ success: true, data: { sent, failed, status: finalStatus } });
  } catch (error) {
    logger.error('POST /api/campaigns/[id]/start failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
