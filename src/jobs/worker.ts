import { Worker, Job } from 'bullmq';
import { redisConnection, closeAllQueues } from './queues';
import prisma from '@/lib/db';
import logger from '@/lib/logger';
import { createActivity } from '@/lib/activity';
import { deduplicateImport } from '@/lib/deduplication';
import { createLeadSourceProvider } from '@/providers/lead-sources';
import { parseCsvToLeads } from '@/providers/lead-sources/csv';
import { createEnrichmentProvider } from '@/providers/enrichment';
import { createAIProvider } from '@/providers/ai';
import { createEmailProvider } from '@/providers/email';
import type { LeadData } from '@/types';

// ─── Helper: get decrypted API key ───

async function getApiKey(provider: string): Promise<string> {
  const credential = await prisma.apiCredential.findUnique({
    where: { provider },
  });
  if (!credential || !credential.isActive) {
    throw new Error(`No active API credential found for provider: ${provider}`);
  }
  // In production, this would decrypt the key. For now, we store it as-is.
  return credential.encryptedKey;
}

async function getProviderConfig(provider: string): Promise<Record<string, unknown> | undefined> {
  const credential = await prisma.apiCredential.findUnique({
    where: { provider },
  });
  return (credential?.config as Record<string, unknown>) || undefined;
}

// ─── Lead Import Worker ───

async function processLeadImport(job: Job) {
  const { source, query, csvContent, mappings, tags, batchId, userId } = job.data;

  logger.info('Processing lead import', { source, batchId, jobId: job.id });

  let leads: LeadData[] = [];

  if (source === 'csv') {
    leads = parseCsvToLeads(csvContent, { mappings, source: 'csv', batchId });
  } else {
    const apiKey = await getApiKey(source);
    const provider = createLeadSourceProvider(source, apiKey);
    const result = await provider.searchLeads(query || {});
    leads = result.leads;
  }

  if (leads.length === 0) {
    return { imported: 0, duplicates: 0, merged: 0 };
  }

  // Deduplicate
  const deduped = await deduplicateImport(leads, { autoMerge: true, batchId });

  // Insert new leads
  const createdLeads: string[] = [];
  for (const lead of deduped.newLeads) {
    const fullName = lead.fullName
      || [lead.firstName, lead.lastName].filter(Boolean).join(' ')
      || null;

    const created = await prisma.lead.create({
      data: {
        firstName: lead.firstName || null,
        lastName: lead.lastName || null,
        fullName,
        jobTitle: lead.jobTitle || null,
        email: lead.email?.toLowerCase().trim() || null,
        phone: lead.phone || null,
        linkedinUrl: lead.linkedinUrl || null,
        location: lead.location || null,
        website: lead.website || null,
        companyName: lead.companyName || null,
        companyDomain: lead.companyDomain || null,
        companyLinkedinUrl: lead.companyLinkedinUrl || null,
        industry: lead.industry || null,
        companySize: lead.companySize || null,
        revenue: lead.revenue || null,
        funding: lead.funding || null,
        source: lead.source || source,
        sourceLeadId: lead.sourceLeadId || null,
        importedAt: new Date(),
        rawSourceData: lead.rawSourceData ? (lead.rawSourceData as object) : undefined,
        customFields: lead.customFields ? (lead.customFields as object) : undefined,
      },
    });
    createdLeads.push(created.id);

    // Record source
    await prisma.leadSourceRecord.create({
      data: {
        leadId: created.id,
        provider: lead.source || source,
        sourceLeadId: lead.sourceLeadId || null,
        rawData: lead.rawSourceData ? (lead.rawSourceData as object) : undefined,
        importBatchId: batchId || null,
      },
    });

    // Add tags if specified
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
        });
        await prisma.leadTag.create({
          data: { leadId: created.id, tagId: tag.id },
        }).catch(() => {
          // Ignore duplicate tag assignments
        });
      }
    }
  }

  await createActivity({
    eventType: 'lead.imported',
    userId,
    metadata: {
      source,
      batchId,
      totalProcessed: leads.length,
      imported: deduped.newLeads.length,
      duplicates: deduped.duplicates.length,
      merged: deduped.merged.length,
      leadIds: createdLeads,
    },
  });

  return {
    imported: deduped.newLeads.length,
    duplicates: deduped.duplicates.length,
    merged: deduped.merged.length,
    leadIds: createdLeads,
  };
}

// ─── Enrichment Worker ───

async function processEnrichment(job: Job) {
  const { leadId, type, url, provider: providerName, actorId, additionalInput } = job.data;

  logger.info('Processing enrichment', { leadId, type, provider: providerName });

  const apiKey = await getApiKey(providerName || 'apify');
  const config = await getProviderConfig(providerName || 'apify');
  const provider = createEnrichmentProvider(providerName || 'apify', apiKey, config);

  // Create enrichment job record
  const enrichmentJob = await prisma.enrichmentJob.create({
    data: {
      leadId,
      provider: providerName || 'apify',
      actorId: actorId || null,
      type,
      status: 'running',
      input: { url, additionalInput },
      startedAt: new Date(),
    },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: { enrichmentStatus: 'in_progress' },
  });

  await createActivity({
    eventType: 'lead.enrichment.started',
    leadId,
    provider: providerName || 'apify',
    metadata: { type, enrichmentJobId: enrichmentJob.id },
  });

  const result = await provider.enrich({
    leadId,
    type,
    url,
    additionalInput,
  });

  if (result.status === 'completed') {
    await prisma.enrichmentJob.update({
      where: { id: enrichmentJob.id },
      data: {
        status: 'completed',
        providerJobId: result.jobId || null,
        rawOutput: result.rawOutput ? (result.rawOutput as object) : undefined,
        normalizedOutput: result.normalizedOutput ? (result.normalizedOutput as object) : undefined,
        completedAt: new Date(),
      },
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: { enrichmentStatus: 'completed' },
    });

    await createActivity({
      eventType: 'lead.enrichment.completed',
      leadId,
      provider: providerName || 'apify',
      metadata: { type, enrichmentJobId: enrichmentJob.id },
    });
  } else if (result.status === 'running') {
    // Store the job ID for polling
    await prisma.enrichmentJob.update({
      where: { id: enrichmentJob.id },
      data: {
        providerJobId: result.jobId || null,
        rawOutput: result.rawOutput ? (result.rawOutput as object) : undefined,
      },
    });

    // The polling will be handled by a separate scheduled check or webhook
    return { status: 'running', jobId: result.jobId, enrichmentJobId: enrichmentJob.id };
  } else {
    await prisma.enrichmentJob.update({
      where: { id: enrichmentJob.id },
      data: {
        status: 'failed',
        errorMessage: result.error || 'Unknown error',
        completedAt: new Date(),
      },
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: { enrichmentStatus: 'failed' },
    });

    await createActivity({
      eventType: 'lead.enrichment.failed',
      leadId,
      provider: providerName || 'apify',
      errorInfo: { error: result.error },
      metadata: { type, enrichmentJobId: enrichmentJob.id },
    });

    throw new Error(result.error || 'Enrichment failed');
  }

  return { status: result.status, enrichmentJobId: enrichmentJob.id };
}

// ─── AI Analysis Worker ───

async function processAiAnalysis(job: Job) {
  const { leadId, model } = job.data;

  logger.info('Processing AI analysis', { leadId });

  const apiKey = await getApiKey('openrouter');
  const config = await getProviderConfig('openrouter');
  const aiProvider = createAIProvider('openrouter', apiKey, {
    ...config,
    ...(model ? { analysisModel: model } : {}),
  });

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      enrichmentJobs: {
        where: { status: 'completed' },
        orderBy: { completedAt: 'desc' },
      },
      aiAnalyses: {
        where: { status: 'completed' },
        orderBy: { completedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!lead) throw new Error(`Lead not found: ${leadId}`);

  // Create analysis record
  const analysis = await prisma.aiAnalysis.create({
    data: {
      leadId,
      provider: 'openrouter',
      model: model || config?.defaultModel as string || 'anthropic/claude-sonnet-4',
      status: 'running',
      startedAt: new Date(),
    },
  });

  await createActivity({
    eventType: 'lead.ai_analysis.started',
    leadId,
    metadata: { analysisId: analysis.id },
  });

  try {
    // Gather enrichment data
    const enrichmentData: Record<string, unknown> = {};
    const linkedinData: Record<string, unknown> = {};
    const websiteData: Record<string, unknown> = {};

    for (const ej of lead.enrichmentJobs) {
      const output = ej.normalizedOutput || ej.rawOutput;
      if (!output) continue;
      if (ej.type === 'linkedin_scrape') {
        Object.assign(linkedinData, output as Record<string, unknown>);
      } else if (ej.type === 'website_scrape') {
        Object.assign(websiteData, output as Record<string, unknown>);
      } else {
        Object.assign(enrichmentData, output as Record<string, unknown>);
      }
    }

    const result = await aiProvider.analyze({
      leadData: {
        firstName: lead.firstName || undefined,
        lastName: lead.lastName || undefined,
        fullName: lead.fullName || undefined,
        jobTitle: lead.jobTitle || undefined,
        email: lead.email || undefined,
        linkedinUrl: lead.linkedinUrl || undefined,
        location: lead.location || undefined,
        companyName: lead.companyName || undefined,
        companyDomain: lead.companyDomain || undefined,
        industry: lead.industry || undefined,
        companySize: lead.companySize || undefined,
        revenue: lead.revenue || undefined,
        funding: lead.funding || undefined,
      },
      enrichmentData: Object.keys(enrichmentData).length > 0 ? enrichmentData : undefined,
      linkedinData: Object.keys(linkedinData).length > 0 ? linkedinData : undefined,
      websiteData: Object.keys(websiteData).length > 0 ? websiteData : undefined,
    });

    await prisma.aiAnalysis.update({
      where: { id: analysis.id },
      data: {
        status: 'completed',
        personSummary: result.personSummary,
        companySummary: result.companySummary,
        currentContext: result.currentContext,
        signals: result.signals,
        painPoints: result.painPoints,
        priorities: result.priorities,
        personalizations: result.personalizations,
        outreachAngle: result.outreachAngle,
        relevanceReasons: result.relevanceReasons,
        confidenceScore: result.confidenceScore,
        rawResponse: result.rawResponse as object,
        tokensUsed: result.tokensUsed || null,
        model: result.model,
        completedAt: new Date(),
      },
    });

    await createActivity({
      eventType: 'lead.ai_analysis.completed',
      leadId,
      metadata: { analysisId: analysis.id, confidenceScore: result.confidenceScore },
    });

    return { analysisId: analysis.id, confidenceScore: result.confidenceScore };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await prisma.aiAnalysis.update({
      where: { id: analysis.id },
      data: {
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
      },
    });

    await createActivity({
      eventType: 'lead.ai_analysis.failed',
      leadId,
      errorInfo: { error: errorMessage },
      metadata: { analysisId: analysis.id },
    });

    throw error;
  }
}

// ─── Email Generation Worker ───

async function processEmailGeneration(job: Job) {
  const { leadId, campaignId, model } = job.data;

  logger.info('Processing email generation', { leadId, campaignId });

  const apiKey = await getApiKey('openrouter');
  const config = await getProviderConfig('openrouter');
  const aiProvider = createAIProvider('openrouter', apiKey, {
    ...config,
    ...(model ? { emailModel: model } : {}),
  });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error(`Lead not found: ${leadId}`);

  const campaign = campaignId
    ? await prisma.campaign.findUnique({ where: { id: campaignId } })
    : null;

  // Get latest analysis
  const latestAnalysis = await prisma.aiAnalysis.findFirst({
    where: { leadId, status: 'completed' },
    orderBy: { completedAt: 'desc' },
  });

  if (!latestAnalysis) {
    throw new Error(`No completed AI analysis found for lead: ${leadId}. Run analysis first.`);
  }

  const analysisResult = {
    personSummary: latestAnalysis.personSummary || '',
    companySummary: latestAnalysis.companySummary || '',
    currentContext: latestAnalysis.currentContext || '',
    signals: (latestAnalysis.signals as string[]) || [],
    painPoints: (latestAnalysis.painPoints as string[]) || [],
    priorities: (latestAnalysis.priorities as string[]) || [],
    personalizations: (latestAnalysis.personalizations as string[]) || [],
    outreachAngle: latestAnalysis.outreachAngle || '',
    relevanceReasons: (latestAnalysis.relevanceReasons as string[]) || [],
    confidenceScore: latestAnalysis.confidenceScore || 0.5,
    rawResponse: (latestAnalysis.rawResponse as Record<string, unknown>) || {},
    model: latestAnalysis.model,
  };

  const result = await aiProvider.generateEmail({
    leadData: {
      firstName: lead.firstName || undefined,
      lastName: lead.lastName || undefined,
      fullName: lead.fullName || undefined,
      jobTitle: lead.jobTitle || undefined,
      email: lead.email || undefined,
      linkedinUrl: lead.linkedinUrl || undefined,
      location: lead.location || undefined,
      companyName: lead.companyName || undefined,
      companyDomain: lead.companyDomain || undefined,
      industry: lead.industry || undefined,
      companySize: lead.companySize || undefined,
    },
    analysis: analysisResult,
    campaignConfig: {
      objective: campaign?.objective || undefined,
      targetAudience: campaign?.targetAudience || undefined,
      productDescription: campaign?.productDescription || undefined,
      valueProposition: campaign?.valueProposition || undefined,
      tone: campaign?.tone || undefined,
      emailLength: campaign?.emailLength || undefined,
      cta: campaign?.cta || undefined,
      customInstructions: campaign?.customInstructions || undefined,
      senderName: campaign?.senderName || undefined,
    },
  });

  const emailMessage = await prisma.emailMessage.create({
    data: {
      campaignId: campaignId || null,
      leadId,
      subject: result.subject,
      htmlBody: result.htmlBody,
      textBody: result.textBody,
      aiModel: result.model,
      aiPrompt: undefined,
      aiRawResponse: result.rawResponse as object,
      status: campaign?.autoApprove ? 'approved' : 'generated',
      senderName: campaign?.senderName || null,
      senderEmail: campaign?.senderEmail || null,
      recipientEmail: lead.email || null,
      recipientName: lead.fullName || lead.firstName || null,
      ...(campaign?.autoApprove ? { approvedAt: new Date() } : {}),
    },
  });

  // Update campaign lead status
  if (campaignId) {
    await prisma.campaignLead.updateMany({
      where: { campaignId, leadId },
      data: { status: campaign?.autoApprove ? 'approved' : 'email_generated' },
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { emailsGenerated: { increment: 1 } },
    });
  }

  // Update lead outreach status
  await prisma.lead.update({
    where: { id: leadId },
    data: { outreachStatus: 'draft' },
  });

  await createActivity({
    eventType: 'email.generated',
    leadId,
    campaignId: campaignId || undefined,
    emailMessageId: emailMessage.id,
    metadata: { model: result.model, tokensUsed: result.tokensUsed },
  });

  return { emailMessageId: emailMessage.id };
}

// ─── Campaign Send Worker ───

async function processCampaignSend(job: Job) {
  const { emailMessageId, campaignId } = job.data;

  logger.info('Processing campaign send', { emailMessageId, campaignId });

  const emailMessage = await prisma.emailMessage.findUnique({
    where: { id: emailMessageId },
    include: { lead: true, campaign: true },
  });

  if (!emailMessage) throw new Error(`Email message not found: ${emailMessageId}`);
  if (emailMessage.status !== 'approved' && emailMessage.status !== 'queued') {
    throw new Error(`Email not in sendable state: ${emailMessage.status}`);
  }

  if (!emailMessage.recipientEmail || !emailMessage.lead.email) {
    throw new Error('No recipient email address');
  }

  // Check suppression list
  const suppressed = await prisma.suppressionEntry.findUnique({
    where: { email: emailMessage.recipientEmail },
  });

  if (suppressed || emailMessage.lead.doNotContact || emailMessage.lead.unsubscribed || emailMessage.lead.bounced) {
    await prisma.emailMessage.update({
      where: { id: emailMessageId },
      data: { status: 'failed', errorMessage: 'Recipient is suppressed or on do-not-contact list' },
    });
    if (campaignId) {
      await prisma.campaignLead.updateMany({
        where: { campaignId, leadId: emailMessage.leadId },
        data: { status: 'skipped' },
      });
    }
    return { status: 'skipped', reason: 'suppressed' };
  }

  // Send via Brevo
  const apiKey = await getApiKey('brevo');
  const emailProvider = createEmailProvider('brevo', apiKey);

  await prisma.emailMessage.update({
    where: { id: emailMessageId },
    data: { status: 'sending' },
  });

  const sendResult = await emailProvider.sendEmail({
    to: {
      email: emailMessage.recipientEmail,
      name: emailMessage.recipientName || undefined,
    },
    from: {
      email: emailMessage.senderEmail || emailMessage.campaign?.senderEmail || '',
      name: emailMessage.senderName || emailMessage.campaign?.senderName || undefined,
    },
    replyTo: emailMessage.campaign?.replyToEmail
      ? { email: emailMessage.campaign.replyToEmail }
      : undefined,
    subject: emailMessage.subject || '',
    htmlContent: emailMessage.htmlBody || '',
    textContent: emailMessage.textBody || undefined,
    tags: campaignId ? [`campaign-${campaignId}`] : undefined,
  });

  if (sendResult.status === 'sent' || sendResult.status === 'queued') {
    await prisma.emailMessage.update({
      where: { id: emailMessageId },
      data: {
        status: 'sent',
        provider: 'brevo',
        providerMessageId: sendResult.messageId,
        sentAt: new Date(),
      },
    });

    await prisma.lead.update({
      where: { id: emailMessage.leadId },
      data: { outreachStatus: 'sent' },
    });

    if (campaignId) {
      await prisma.campaignLead.updateMany({
        where: { campaignId, leadId: emailMessage.leadId },
        data: { status: 'sent' },
      });
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { emailsSent: { increment: 1 } },
      });
    }

    await createActivity({
      eventType: 'email.sent',
      leadId: emailMessage.leadId,
      campaignId: campaignId || undefined,
      emailMessageId,
      provider: 'brevo',
      metadata: { providerMessageId: sendResult.messageId },
    });

    return { status: 'sent', messageId: sendResult.messageId };
  } else {
    await prisma.emailMessage.update({
      where: { id: emailMessageId },
      data: {
        status: 'failed',
        errorMessage: sendResult.error || 'Send failed',
      },
    });

    if (campaignId) {
      await prisma.campaignLead.updateMany({
        where: { campaignId, leadId: emailMessage.leadId },
        data: { status: 'failed' },
      });
    }

    throw new Error(sendResult.error || 'Email send failed');
  }
}

// ─── Webhook Process Worker ───

async function processWebhook(job: Job) {
  const { provider, eventType, payload, webhookEventId } = job.data;

  logger.info('Processing webhook', { provider, eventType, webhookEventId });

  if (provider === 'brevo') {
    await processBrevoWebhookEvent(eventType, payload, webhookEventId);
  }

  // Mark webhook event as processed
  if (webhookEventId) {
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { status: 'processed', processedAt: new Date() },
    });
  }
}

async function processBrevoWebhookEvent(
  eventType: string,
  payload: Record<string, unknown>,
  webhookEventId?: string
) {
  const messageId = payload['message-id'] as string || payload.messageId as string;
  if (!messageId) {
    logger.warn('Brevo webhook missing message-id', { eventType, payload });
    return;
  }

  const emailMessage = await prisma.emailMessage.findFirst({
    where: { providerMessageId: messageId },
  });

  if (!emailMessage) {
    logger.warn('Email message not found for Brevo webhook', { messageId, eventType });
    return;
  }

  const now = new Date();
  const eventMap: Record<string, { status: string; field: string; activityType: string }> = {
    delivered: { status: 'delivered', field: 'deliveredAt', activityType: 'email.delivered' },
    opened: { status: 'delivered', field: 'openedAt', activityType: 'email.opened' },
    click: { status: 'delivered', field: 'clickedAt', activityType: 'email.clicked' },
    hard_bounce: { status: 'failed', field: 'bouncedAt', activityType: 'email.bounced' },
    soft_bounce: { status: 'failed', field: 'bouncedAt', activityType: 'email.bounced' },
    spam: { status: 'failed', field: 'bouncedAt', activityType: 'email.bounced' },
    unsubscribed: { status: 'delivered', field: 'unsubscribedAt', activityType: 'email.unsubscribed' },
    reply: { status: 'delivered', field: 'repliedAt', activityType: 'email.replied' },
  };

  const mapping = eventMap[eventType];
  if (!mapping) {
    logger.warn('Unknown Brevo event type', { eventType });
    return;
  }

  // Create email event (idempotent via unique constraint)
  const providerEventId = `${messageId}-${eventType}-${payload.ts || Date.now()}`;
  try {
    await prisma.emailEvent.create({
      data: {
        emailMessageId: emailMessage.id,
        eventType,
        provider: 'brevo',
        providerEventId,
        metadata: payload as object,
        occurredAt: payload.ts ? new Date(Number(payload.ts) * 1000) : now,
      },
    });
  } catch (error) {
    // Duplicate event, skip
    if ((error as { code?: string }).code === 'P2002') {
      logger.debug('Duplicate email event skipped', { providerEventId });
      return;
    }
    throw error;
  }

  // Update email message
  const updates: Record<string, unknown> = {};
  updates[mapping.field] = now;

  await prisma.emailMessage.update({
    where: { id: emailMessage.id },
    data: updates,
  });

  // Update lead outreach status
  const outreachStatusMap: Record<string, string> = {
    delivered: 'delivered',
    opened: 'opened',
    reply: 'replied',
  };

  if (outreachStatusMap[eventType]) {
    await prisma.lead.update({
      where: { id: emailMessage.leadId },
      data: { outreachStatus: outreachStatusMap[eventType] },
    });
  }

  // Handle bounces - add to suppression list
  if (eventType === 'hard_bounce' || eventType === 'spam') {
    const recipientEmail = emailMessage.recipientEmail;
    if (recipientEmail) {
      await prisma.suppressionEntry.upsert({
        where: { email: recipientEmail },
        update: {},
        create: {
          email: recipientEmail,
          reason: eventType === 'hard_bounce' ? 'bounced' : 'complained',
          source: 'brevo_webhook',
        },
      });

      await prisma.lead.update({
        where: { id: emailMessage.leadId },
        data: { bounced: true, outreachStatus: 'bounced' },
      });
    }
  }

  // Handle unsubscribes
  if (eventType === 'unsubscribed') {
    const recipientEmail = emailMessage.recipientEmail;
    if (recipientEmail) {
      await prisma.suppressionEntry.upsert({
        where: { email: recipientEmail },
        update: {},
        create: {
          email: recipientEmail,
          reason: 'unsubscribed',
          source: 'brevo_webhook',
        },
      });

      await prisma.lead.update({
        where: { id: emailMessage.leadId },
        data: { unsubscribed: true },
      });
    }
  }

  // Update campaign stats
  if (emailMessage.campaignId) {
    const campaignStatsField: Record<string, string> = {
      delivered: 'emailsDelivered',
      opened: 'emailsOpened',
      click: 'emailsClicked',
      reply: 'emailsReplied',
      hard_bounce: 'emailsBounced',
      soft_bounce: 'emailsBounced',
    };
    const field = campaignStatsField[eventType];
    if (field) {
      await prisma.campaign.update({
        where: { id: emailMessage.campaignId },
        data: { [field]: { increment: 1 } },
      });
    }
  }

  await createActivity({
    eventType: mapping.activityType as Parameters<typeof createActivity>[0]['eventType'],
    leadId: emailMessage.leadId,
    campaignId: emailMessage.campaignId || undefined,
    emailMessageId: emailMessage.id,
    provider: 'brevo',
    providerEventId,
    metadata: { originalEvent: eventType },
  });
}

// ─── Workers ───

const workers: Worker[] = [];

function createWorkers() {
  const leadImportWorker = new Worker('lead-import', processLeadImport, {
    connection: redisConnection,
    concurrency: 2,
  });

  const enrichmentWorker = new Worker('enrichment', processEnrichment, {
    connection: redisConnection,
    concurrency: 3,
  });

  const aiAnalysisWorker = new Worker('ai-analysis', processAiAnalysis, {
    connection: redisConnection,
    concurrency: 2,
  });

  const emailGenerationWorker = new Worker('email-generation', processEmailGeneration, {
    connection: redisConnection,
    concurrency: 2,
  });

  const campaignSendWorker = new Worker('campaign-send', processCampaignSend, {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: 50,
      duration: 60000, // 50 per minute max
    },
  });

  const webhookProcessWorker = new Worker('webhook-process', processWebhook, {
    connection: redisConnection,
    concurrency: 5,
  });

  const allWorkers = [
    leadImportWorker,
    enrichmentWorker,
    aiAnalysisWorker,
    emailGenerationWorker,
    campaignSendWorker,
    webhookProcessWorker,
  ];

  for (const worker of allWorkers) {
    worker.on('completed', (job) => {
      logger.info('Job completed', { queue: worker.name, jobId: job.id, name: job.name });
    });

    worker.on('failed', (job, err) => {
      logger.error('Job failed', {
        queue: worker.name,
        jobId: job?.id,
        name: job?.name,
        error: err.message,
        attemptsMade: job?.attemptsMade,
      });
    });

    worker.on('error', (err) => {
      logger.error('Worker error', { queue: worker.name, error: err.message });
    });
  }

  workers.push(...allWorkers);
  return allWorkers;
}

// ─── Graceful Shutdown ───

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down workers...`);

  const closePromises = workers.map(async (worker) => {
    try {
      await worker.close();
      logger.info('Worker stopped', { queue: worker.name });
    } catch (error) {
      logger.error('Error stopping worker', { queue: worker.name, error });
    }
  });

  await Promise.allSettled(closePromises);
  await closeAllQueues();
  await prisma.$disconnect();

  logger.info('All workers shut down');
  process.exit(0);
}

// ─── Main ───

function main() {
  logger.info('Starting LeadFlow workers...');

  const allWorkers = createWorkers();

  logger.info('Workers started', {
    queues: allWorkers.map((w) => w.name),
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
