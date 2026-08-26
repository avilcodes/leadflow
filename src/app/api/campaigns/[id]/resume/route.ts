import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { createActivity } from '@/lib/activity';
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
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }
    if (campaign.status !== 'paused') {
      return NextResponse.json({ success: false, error: 'Only paused campaigns can be resumed' }, { status: 400 });
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: { status: 'running', pausedAt: null },
    });

    await createActivity({ eventType: 'campaign.resumed', campaignId: id, userId: session.userId });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error('POST /api/campaigns/[id]/resume failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
