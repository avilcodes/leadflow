import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
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
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        campaignLeads: {
          include: {
            lead: { select: { id: true, fullName: true, email: true, companyName: true, jobTitle: true, outreachStatus: true } },
          },
        },
        emailMessages: {
          orderBy: { createdAt: 'desc' },
          include: { lead: { select: { id: true, fullName: true, email: true } } },
        },
        createdBy: { select: { id: true, name: true, email: true } },
      },
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

    const campaign = await prisma.campaign.update({
      where: { id },
      data: parsed.data,
    });

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
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }
    if (campaign.status === 'running') {
      return NextResponse.json({ success: false, error: 'Cannot delete a running campaign' }, { status: 400 });
    }

    await prisma.campaign.delete({ where: { id } });
    return NextResponse.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    logger.error('DELETE /api/campaigns/[id] failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
