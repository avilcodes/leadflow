import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import logger from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalLeads,
      newLeads,
      enrichedLeads,
      leadsNeedingReview,
      totalEmailsSent,
      emailsDelivered,
      emailsOpened,
      emailsClicked,
      emailsReplied,
      emailsBounced,
      emailsUnsubscribed,
      activeCampaigns,
      failedJobs,
      recentActivities,
      leadsBySource,
      leadsByStatus,
    ] = await Promise.all([
      prisma.lead.count({ where: { deletedAt: null } }),
      prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.lead.count({ where: { deletedAt: null, enrichmentStatus: 'completed' } }),
      prisma.lead.count({ where: { deletedAt: null, enrichmentStatus: 'completed', outreachStatus: 'none' } }),
      prisma.emailMessage.count({ where: { status: 'sent' } }),
      prisma.emailMessage.count({ where: { deliveredAt: { not: null } } }),
      prisma.emailMessage.count({ where: { openedAt: { not: null } } }),
      prisma.emailMessage.count({ where: { clickedAt: { not: null } } }),
      prisma.emailMessage.count({ where: { repliedAt: { not: null } } }),
      prisma.emailMessage.count({ where: { bouncedAt: { not: null } } }),
      prisma.emailMessage.count({ where: { unsubscribedAt: { not: null } } }),
      prisma.campaign.count({ where: { status: 'running' } }),
      prisma.backgroundJob.count({ where: { status: 'failed' } }),
      prisma.activity.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { lead: { select: { id: true, fullName: true, email: true, companyName: true } } },
      }),
      prisma.lead.groupBy({ by: ['source'], _count: { id: true }, where: { deletedAt: null } }),
      prisma.lead.groupBy({ by: ['status'], _count: { id: true }, where: { deletedAt: null } }),
    ]);

    const safeDiv = (a: number, b: number) => b > 0 ? Math.round((a / b) * 1000) / 10 : 0;

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalLeads,
          newLeads,
          enrichedLeads,
          leadsNeedingReview,
          emailsGenerated: await prisma.emailMessage.count(),
          emailsSent: totalEmailsSent,
          deliveryRate: safeDiv(emailsDelivered, totalEmailsSent),
          openRate: safeDiv(emailsOpened, emailsDelivered),
          clickRate: safeDiv(emailsClicked, emailsDelivered),
          replyRate: safeDiv(emailsReplied, emailsDelivered),
          bounceRate: safeDiv(emailsBounced, totalEmailsSent),
          unsubscribeRate: safeDiv(emailsUnsubscribed, emailsDelivered),
          activeCampaigns,
          failedJobs,
        },
        recentActivities,
        leadsBySource: leadsBySource.map(s => ({ source: s.source || 'unknown', count: s._count.id })),
        leadsByStatus: leadsByStatus.map(s => ({ status: s.status, count: s._count.id })),
      },
    });
  } catch (error) {
    logger.error('GET /api/dashboard failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
