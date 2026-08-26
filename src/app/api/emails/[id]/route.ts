import { NextRequest, NextResponse } from 'next/server';
import db, { getEmailWithRelations } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { createActivity } from '@/lib/activity';
import { updateEmailSchema } from '@/lib/validation';
import logger from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const email = await getEmailWithRelations(id, {
      lead: { select: ['fullName', 'email', 'companyName', 'jobTitle'] },
      campaign: { select: ['name'] },
      emailEvents: true,
    });

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: email });
  } catch (error) {
    logger.error('GET /api/emails/[id] failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await db.emailMessages.findById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Email not found' }, { status: 404 });
    }

    if (['sent', 'delivered'].includes(existing.status as string)) {
      return NextResponse.json({ success: false, error: 'Cannot edit a sent email' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = updateEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};

    if (parsed.data.subject !== undefined) updateData.subject = parsed.data.subject;
    if (parsed.data.htmlBody !== undefined) updateData.htmlBody = parsed.data.htmlBody;
    if (parsed.data.textBody !== undefined) updateData.textBody = parsed.data.textBody;

    if (parsed.data.status === 'approved') {
      updateData.status = 'approved';
      updateData.approvedAt = new Date();
      await createActivity({ eventType: 'email.approved', leadId: existing.leadId as string, emailMessageId: id, userId: session.userId });
    } else if (parsed.data.status === 'rejected') {
      updateData.status = 'rejected';
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = parsed.data.rejectionReason || null;
      await createActivity({ eventType: 'email.rejected', leadId: existing.leadId as string, emailMessageId: id, userId: session.userId });
    } else if (parsed.data.subject || parsed.data.htmlBody || parsed.data.textBody) {
      updateData.status = 'edited';
      await createActivity({ eventType: 'email.edited', leadId: existing.leadId as string, emailMessageId: id, userId: session.userId });
    }

    const email = await db.emailMessages.update(id, updateData);

    return NextResponse.json({ success: true, data: email });
  } catch (error) {
    logger.error('PUT /api/emails/[id] failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
