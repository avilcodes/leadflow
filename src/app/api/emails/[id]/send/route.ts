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

    if (process.env.EMAIL_SENDING_ENABLED !== 'true') {
      return NextResponse.json({ success: false, error: 'Email sending is disabled. Set EMAIL_SENDING_ENABLED=true.' }, { status: 400 });
    }

    const { id } = await params;
    const email = await prisma.emailMessage.findUnique({
      where: { id },
      include: { lead: true, campaign: true },
    });

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email not found' }, { status: 404 });
    }

    if (!['approved', 'edited', 'generated'].includes(email.status)) {
      return NextResponse.json({ success: false, error: `Cannot send email in ${email.status} status` }, { status: 400 });
    }

    if (!email.recipientEmail) {
      return NextResponse.json({ success: false, error: 'No recipient email address' }, { status: 400 });
    }

    // Check suppression
    if (email.lead.doNotContact || email.lead.unsubscribed || email.lead.bounced) {
      return NextResponse.json({ success: false, error: 'Recipient is suppressed' }, { status: 400 });
    }

    const suppressed = await prisma.suppressionEntry.findUnique({ where: { email: email.recipientEmail } });
    if (suppressed) {
      return NextResponse.json({ success: false, error: `Recipient suppressed: ${suppressed.reason}` }, { status: 400 });
    }

    const senderEmail = email.senderEmail || email.campaign?.senderEmail;
    if (!senderEmail) {
      return NextResponse.json({ success: false, error: 'No sender email configured' }, { status: 400 });
    }

    const emailProvider = getEmailProvider();
    const result = await emailProvider.sendEmail({
      to: { email: email.recipientEmail, name: email.recipientName || undefined },
      from: { email: senderEmail, name: email.senderName || email.campaign?.senderName || undefined },
      replyTo: email.campaign?.replyToEmail ? { email: email.campaign.replyToEmail } : undefined,
      subject: email.subject || '',
      htmlContent: email.htmlBody || '',
      textContent: email.textBody || undefined,
    });

    await prisma.emailMessage.update({
      where: { id },
      data: { status: 'sent', provider: result.provider, providerMessageId: result.messageId, sentAt: new Date() },
    });

    await prisma.lead.update({ where: { id: email.leadId }, data: { outreachStatus: 'sent' } });
    await createActivity({ eventType: 'email.sent', leadId: email.leadId, campaignId: email.campaignId ?? undefined, emailMessageId: id, userId: session.userId, provider: 'brevo', metadata: { messageId: result.messageId } });

    if (email.campaignId) {
      await prisma.campaign.update({ where: { id: email.campaignId }, data: { emailsSent: { increment: 1 } } });
    }

    return NextResponse.json({ success: true, data: { messageId: result.messageId, status: 'sent' } });
  } catch (error) {
    logger.error('POST /api/emails/[id]/send failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
