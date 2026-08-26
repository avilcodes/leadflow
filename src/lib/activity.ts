import db from './db';
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
      const existing = await db.activities.findFirst({
        providerEventId: params.providerEventId,
        eventType: params.eventType,
      });
      if (existing) {
        logger.debug('Duplicate activity event skipped', {
          eventType: params.eventType,
          providerEventId: params.providerEventId,
        });
        return existing;
      }
    }

    const activity = await db.activities.create({
      eventType: params.eventType,
      leadId: params.leadId,
      campaignId: params.campaignId,
      emailMessageId: params.emailMessageId,
      userId: params.userId,
      provider: params.provider,
      providerEventId: params.providerEventId,
      metadata: params.metadata || undefined,
      errorInfo: params.errorInfo || undefined,
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
  return db.activities.findMany({
    where: { leadId },
    orderBy: { field: 'createdAt', direction: 'desc' },
    limit,
    offset,
  });
}

export async function getCampaignActivities(campaignId: string, limit = 50, offset = 0) {
  return db.activities.findMany({
    where: { campaignId },
    orderBy: { field: 'createdAt', direction: 'desc' },
    limit,
    offset,
  });
}

export async function getRecentActivities(limit = 20) {
  const activities = await db.activities.findMany({
    orderBy: { field: 'createdAt', direction: 'desc' },
    limit,
  });

  // Manually join lead data for each activity that has a leadId
  const activitiesWithLeads = await Promise.all(
    activities.map(async (activity: Record<string, unknown>) => {
      if (activity.leadId) {
        const lead = await db.leads.findById(activity.leadId as string);
        if (lead) {
          return {
            ...activity,
            lead: {
              id: lead.id,
              fullName: lead.fullName,
              email: lead.email,
              companyName: lead.companyName,
            },
          };
        }
      }
      return { ...activity, lead: null };
    })
  );

  return activitiesWithLeads;
}
