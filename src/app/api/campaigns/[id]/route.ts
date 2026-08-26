import { NextRequest, NextResponse } from 'next/server';
import db, { getCampaignWithRelations } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { updateCampaignSchema } from '@/lib/validation';
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
    const campaign = await getCampaignWithRelations(id, {
      campaignLeads: { includeLeads: true },
      emailMessages: { includeLeads: true },
      createdBy: true,
    });

    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    logger.error('GET /api/campaigns/[id] failed', { error });
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
    const body = await request.json();
    const parsed = updateCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
    }

    const campaign = await db.campaigns.update(id, parsed.data);

    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    logger.error('PUT /api/campaigns/[id] failed', { error });
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
    const campaign = await db.campaigns.findById(id);
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }
    if (campaign.status === 'running') {
      return NextResponse.json({ success: false, error: 'Cannot delete a running campaign' }, { status: 400 });
    }

    await db.campaigns.delete(id);
    return NextResponse.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    logger.error('DELETE /api/campaigns/[id] failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
