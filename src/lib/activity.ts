import prisma from './db';
import logger from './logger';
import type { ActivityEventType } from '@/types';

interface CreateActivityParams {
  eventType: ActivityEventType;
  leadId?: string;
  campaignId?: string;
  emailMessageId?: string;
  userId?: string;
  provider?: string;
  providerEventId?: string;
  metadata?: Record<string, unknown>;
  errorInfo?: Record<string, unknown>;
}

export async function createActivity(params: CreateActivityParams) {
  try {
    // Idempotency check for provider events
    if (params.providerEventId) {
      const existing = await prisma.activity.findFirst({
        where: {
          providerEventId: params.providerEventId,
          eventType: params.eventType,
        },
      });
      if (existing) {
        logger.debug('Duplicate activity event skipped', {
          eventType: params.eventType,
          providerEventId: params.providerEventId,
        });
        return existing;
      }
    }

    const activity = await prisma.activity.create({
      data: {
        eventType: params.eventType,
        leadId: params.leadId,
        campaignId: params.campaignId,
        emailMessageId: params.emailMessageId,
        userId: params.userId,
        provider: params.provider,
        providerEventId: params.providerEventId,
        metadata: params.metadata ?? undefined,
        errorInfo: params.errorInfo ?? undefined,
      },
    });

    logger.info('Activity created', {
      eventType: params.eventType,
      leadId: params.leadId,
      activityId: activity.id,
    });

    return activity;
  } catch (error) {
    logger.error('Failed to create activity', {
      error,
      params,
    });
    // Don't throw - activity logging should never break the main flow
    return null;
  }
}

export async function getLeadActivities(leadId: string, limit = 50, offset = 0) {
  return prisma.activity.findMany({
    where: { leadId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
}

export async function getCampaignActivities(campaignId: string, limit = 50, offset = 0) {
  return prisma.activity.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
}

export async function getRecentActivities(limit = 20) {
  return prisma.activity.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      lead: { select: { id: true, fullName: true, email: true, companyName: true } },
    },
  });
}
