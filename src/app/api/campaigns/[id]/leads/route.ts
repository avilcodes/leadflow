import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import logger from '@/lib/logger';
import { z } from 'zod';

const leadsSchema = z.object({ leadIds: z.array(z.string()).min(1).max(1000) });

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
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = leadsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
    }

    let added = 0;
    for (const leadId of parsed.data.leadIds) {
      try {
        await prisma.campaignLead.create({ data: { campaignId: id, leadId } });
        added++;
      } catch {
        // duplicate, skip
      }
    }

    await prisma.campaign.update({
      where: { id },
      data: { totalLeads: { increment: added } },
    });

    return NextResponse.json({ success: true, data: { added, total: parsed.data.leadIds.length } });
  } catch (error) {
    logger.error('POST /api/campaigns/[id]/leads failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = leadsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
    }

    const result = await prisma.campaignLead.deleteMany({
      where: { campaignId: id, leadId: { in: parsed.data.leadIds } },
    });

    await prisma.campaign.update({
      where: { id },
      data: { totalLeads: { decrement: result.count } },
    });

    return NextResponse.json({ success: true, data: { removed: result.count } });
  } catch (error) {
    logger.error('DELETE /api/campaigns/[id]/leads failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
