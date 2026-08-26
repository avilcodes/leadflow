import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import logger from '@/lib/logger';
import type { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50')));
    const leadId = searchParams.get('leadId') || undefined;
    const campaignId = searchParams.get('campaignId') || undefined;
    const eventType = searchParams.get('eventType') || undefined;

    const where: Prisma.ActivityWhereInput = {};
    if (leadId) where.leadId = leadId;
    if (campaignId) where.campaignId = campaignId;
    if (eventType) where.eventType = eventType;

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          lead: { select: { id: true, fullName: true, email: true, companyName: true } },
        },
      }),
      prisma.activity.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: activities,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    logger.error('GET /api/activities failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
