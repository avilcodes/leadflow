import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { createActivity } from '@/lib/activity';
import { createCampaignSchema } from '@/lib/validation';
import logger from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '25')));
    const status = searchParams.get('status') || undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [campaigns, total] = await Promise.all([
      db.campaigns.findMany({
        where,
        orderBy: { field: 'createdAt', direction: 'desc' },
        offset: (page - 1) * pageSize,
        limit: pageSize,
      }),
      db.campaigns.count(where),
    ]);

    // Load counts for each campaign
    const campaignsWithCounts = await Promise.all(
      campaigns.map(async (c) => {
        const [leadCount, emailCount] = await Promise.all([
          db.campaignLeads.count({ campaignId: c.id }),
          db.emailMessages.count({ campaignId: c.id }),
        ]);
        return { ...c, _count: { campaignLeads: leadCount, emailMessages: emailCount } };
      })
    );

    return NextResponse.json({
      success: true,
      data: campaignsWithCounts,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    logger.error('GET /api/campaigns failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
    }

    const campaign = await db.campaigns.create({
      ...parsed.data,
      createdById: session.userId,
      status: 'draft',
      totalLeads: 0,
      emailsGenerated: 0,
      emailsSent: 0,
      emailsDelivered: 0,
      emailsOpened: 0,
      emailsClicked: 0,
      emailsReplied: 0,
      emailsBounced: 0,
    });

    await createActivity({ eventType: 'campaign.created', campaignId: campaign.id, userId: session.userId, metadata: { name: campaign.name } });

    return NextResponse.json({ success: true, data: campaign }, { status: 201 });
  } catch (error) {
    logger.error('POST /api/campaigns failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
