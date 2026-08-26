import { NextRequest, NextResponse } from 'next/server';
import db, { getEmailWithRelations } from '@/lib/db';
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

    if (process.env.EMAIL_SENDING_ENABLED !== 'true') {
      return NextResponse.json({ success: false, error: 'Email sending is disabled. Set EMAIL_SENDING_ENABLED=true.' }, { status: 400 });
    }

    const { id } = await params;
    const email = await getEmailWithRelations(id, { lead: true, campaign: true });

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email not found' }, { status: 404 });
    }

    if (!['approved', 'edited', 'generated'].includes(email.status as string)) {
      return NextResponse.json({ success: false, error: `Cannot send email in ${email.status} status` }, { status: 400 });
    }

    if (!email.recipientEmail) {
      return NextResponse.json({ success: false, error: 'No recipient email address' }, { status: 400 });
    }

    const lead = email.lead as Record<string, unknown>;
    const campaign = email.campaign as Record<string, unknown> | null;

    // Check suppression
    if (lead?.doNotContact || lead?.unsubscribed || lead?.bounced) {
      return NextResponse.json({ success: false, error: 'Recipient is suppressed' }, { status: 400 });
    }

    const suppressed = await db.suppressionEntries.findByField('email', email.recipientEmail);
    if (suppressed) {
      return NextResponse.json({ success: false, error: `Recipient suppressed: ${suppressed.reason}` }, { status: 400 });
    }

    const senderEmail = (email.senderEmail as string) || (campaign?.senderEmail as string);
    if (!senderEmail) {
      return NextResponse.json({ success: false, error: 'No sender email configured' }, { status: 400 });
    }

    const emailProvider = getEmailProvider();
    const result = await emailProvider.sendEmail({
      to: { email: email.recipientEmail as string, name: (email.recipientName as string) || undefined },
      from: { email: senderEmail, name: (email.senderName as string) || (campaign?.senderName as string) || undefined },
      replyTo: campaign?.replyToEmail ? { email: campaign.replyToEmail as string } : undefined,
      subject: (email.subject as string) || '',
      htmlContent: (email.htmlBody as string) || '',
      textContent: (email.textBody as string) || undefined,
    });

    await db.emailMessages.update(id, {
      status: 'sent',
      provider: result.provider,
      providerMessageId: result.messageId,
      sentAt: new Date(),
    });

    await db.leads.update(email.leadId as string, { outreachStatus: 'sent' });
    await createActivity({
      eventType: 'email.sent',
      leadId: email.leadId as string,
      campaignId: (email.campaignId as string) ?? undefined,
      emailMessageId: id,
      userId: session.userId,
      provider: 'brevo',
      metadata: { messageId: result.messageId },
    });

    if (email.campaignId) {
      await db.campaigns.increment(email.campaignId as string, 'emailsSent', 1);
    }

    return NextResponse.json({ success: true, data: { messageId: result.messageId, status: 'sent' } });
  } catch (error) {
    logger.error('POST /api/emails/[id]/send failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
