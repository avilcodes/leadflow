import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
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
    const campaign = await db.campaigns.findById(id);
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }
    if (campaign.status !== 'running') {
      return NextResponse.json({ success: false, error: 'Only running campaigns can be paused' }, { status: 400 });
    }

    const updated = await db.campaigns.update(id, { status: 'paused', pausedAt: new Date() });

    await createActivity({ eventType: 'campaign.paused', campaignId: id, userId: session.userId });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error('POST /api/campaigns/[id]/pause failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
