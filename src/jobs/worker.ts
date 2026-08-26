import { Worker, Job } from 'bullmq';
import { redisConnection, closeAllQueues } from './queues';
import db from '@/lib/db';
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
  const credential = await db.apiCredentials.findByField('provider', provider);
  if (!credential || !credential.isActive) {
    throw new Error(`No active API credential found for provider: ${provider}`);
  }
  return credential.encryptedKey as string;
}

async function getProviderConfig(provider: string): Promise<Record<string, unknown> | undefined> {
  const credential = await db.apiCredentials.findByField('provider', provider);
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

    const created = await db.leads.create({
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
      rawSourceData: lead.rawSourceData || undefined,
      customFields: lead.customFields || undefined,
      status: 'new',
      enrichmentStatus: 'none',
      outreachStatus: 'none',
      deletedAt: null,
    });
    createdLeads.push(created.id);

    // Record source
    await db.leadSourceRecords.create({
      leadId: created.id,
      provider: lead.source || source,
      sourceLeadId: lead.sourceLeadId || null,
      rawData: lead.rawSourceData || undefined,
      importBatchId: batchId || null,
      importedAt: new Date(),
    });

    // Add tags if specified
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        const tag = await db.tags.upsert('name', tagName, {}, { name: tagName });
        await db.leadTags.create({ leadId: created.id, tagId: tag.id }).catch(() => {});
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

  const enrichmentJob = await db.enrichmentJobs.create({
    leadId,
    provider: providerName || 'apify',
    actorId: actorId || null,
    type,
    status: 'running',
    input: { url, additionalInput },
    startedAt: new Date(),
  });

  await db.leads.update(leadId, { enrichmentStatus: 'in_progress' });

  await createActivity({
    eventType: 'lead.enrichment.started',
    leadId,
    provider: providerName || 'apify',
    metadata: { type, enrichmentJobId: enrichmentJob.id },
  });

  const result = await provider.enrich({ leadId, type, url, additionalInput });

  if (result.status === 'completed') {
    await db.enrichmentJobs.update(enrichmentJob.id, {
      status: 'completed',
      providerJobId: result.jobId || null,
      rawOutput: result.rawOutput || undefined,
      normalizedOutput: result.normalizedOutput || undefined,
      completedAt: new Date(),
    });

    await db.leads.update(leadId, { enrichmentStatus: 'completed' });

    await createActivity({
      eventType: 'lead.enrichment.completed',
      leadId,
      provider: providerName || 'apify',
      metadata: { type, enrichmentJobId: enrichmentJob.id },
    });
  } else if (result.status === 'running') {
    await db.enrichmentJobs.update(enrichmentJob.id, {
      providerJobId: result.jobId || null,
      rawOutput: result.rawOutput || undefined,
    });
    return { status: 'running', jobId: result.jobId, enrichmentJobId: enrichmentJob.id };
  } else {
    await db.enrichmentJobs.update(enrichmentJob.id, {
      status: 'failed',
      errorMessage: result.error || 'Unknown error',
      completedAt: new Date(),
    });

    await db.leads.update(leadId, { enrichmentStatus: 'failed' });

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

  const lead = await db.leads.findById(leadId);
  if (!lead) throw new Error(`Lead not found: ${leadId}`);

  // Load related data
  const enrichmentJobs = await db.enrichmentJobs.findMany({
    where: { leadId, status: 'completed' },
    orderBy: { field: 'completedAt', direction: 'desc' },
  });

  const analysis = await db.aiAnalyses.create({
    leadId,
    provider: 'openrouter',
    model: model || (config?.defaultModel as string) || 'anthropic/claude-sonnet-4',
    status: 'running',
    startedAt: new Date(),
  });

  await createActivity({
    eventType: 'lead.ai_analysis.started',
    leadId,
    metadata: { analysisId: analysis.id },
  });

  try {
    const enrichmentData: Record<string, unknown> = {};
    const linkedinData: Record<string, unknown> = {};
    const websiteData: Record<string, unknown> = {};

    for (const ej of enrichmentJobs) {
      const output = (ej.normalizedOutput || ej.rawOutput) as Record<string, unknown> | null;
      if (!output) continue;
      if (ej.type === 'linkedin_scrape') {
        Object.assign(linkedinData, output);
      } else if (ej.type === 'website_scrape') {
        Object.assign(websiteData, output);
      } else {
        Object.assign(enrichmentData, output);
      }
    }

    const result = await aiProvider.analyze({
      leadData: {
        firstName: (lead.firstName as string) || undefined,
        lastName: (lead.lastName as string) || undefined,
        fullName: (lead.fullName as string) || undefined,
        jobTitle: (lead.jobTitle as string) || undefined,
        email: (lead.email as string) || undefined,
        linkedinUrl: (lead.linkedinUrl as string) || undefined,
        location: (lead.location as string) || undefined,
        companyName: (lead.companyName as string) || undefined,
        companyDomain: (lead.companyDomain as string) || undefined,
        industry: (lead.industry as string) || undefined,
        companySize: (lead.companySize as string) || undefined,
        revenue: (lead.revenue as string) || undefined,
        funding: (lead.funding as string) || undefined,
      },
      enrichmentData: Object.keys(enrichmentData).length > 0 ? enrichmentData : undefined,
      linkedinData: Object.keys(linkedinData).length > 0 ? linkedinData : undefined,
      websiteData: Object.keys(websiteData).length > 0 ? websiteData : undefined,
    });

    await db.aiAnalyses.update(analysis.id, {
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
      rawResponse: result.rawResponse,
      tokensUsed: result.tokensUsed || null,
      model: result.model,
      completedAt: new Date(),
    });

    await createActivity({
      eventType: 'lead.ai_analysis.completed',
      leadId,
      metadata: { analysisId: analysis.id, confidenceScore: result.confidenceScore },
    });

    return { analysisId: analysis.id, confidenceScore: result.confidenceScore };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await db.aiAnalyses.update(analysis.id, {
      status: 'failed',
      errorMessage,
      completedAt: new Date(),
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

  const lead = await db.leads.findById(leadId);
  if (!lead) throw new Error(`Lead not found: ${leadId}`);

  const campaign = campaignId ? await db.campaigns.findById(campaignId) : null;

  const latestAnalysis = await db.aiAnalyses.findFirst(
    { leadId, status: 'completed' },
    { field: 'completedAt', direction: 'desc' }
  );

  if (!latestAnalysis) {
    throw new Error(`No completed AI analysis found for lead: ${leadId}. Run analysis first.`);
  }

  const analysisResult = {
    personSummary: (latestAnalysis.personSummary as string) || '',
    companySummary: (latestAnalysis.companySummary as string) || '',
    currentContext: (latestAnalysis.currentContext as string) || '',
    signals: (latestAnalysis.signals as string[]) || [],
    painPoints: (latestAnalysis.painPoints as string[]) || [],
    priorities: (latestAnalysis.priorities as string[]) || [],
    personalizations: (latestAnalysis.personalizations as string[]) || [],
    outreachAngle: (latestAnalysis.outreachAngle as string) || '',
    relevanceReasons: (latestAnalysis.relevanceReasons as string[]) || [],
    confidenceScore: (latestAnalysis.confidenceScore as number) || 0.5,
    rawResponse: (latestAnalysis.rawResponse as Record<string, unknown>) || {},
    model: latestAnalysis.model as string,
  };

  const result = await aiProvider.generateEmail({
    leadData: {
      firstName: (lead.firstName as string) || undefined,
      lastName: (lead.lastName as string) || undefined,
      fullName: (lead.fullName as string) || undefined,
      jobTitle: (lead.jobTitle as string) || undefined,
      email: (lead.email as string) || undefined,
      linkedinUrl: (lead.linkedinUrl as string) || undefined,
      location: (lead.location as string) || undefined,
      companyName: (lead.companyName as string) || undefined,
      companyDomain: (lead.companyDomain as string) || undefined,
      industry: (lead.industry as string) || undefined,
      companySize: (lead.companySize as string) || undefined,
    },
    analysis: analysisResult,
    campaignConfig: {
      objective: (campaign?.objective as string) || undefined,
      targetAudience: (campaign?.targetAudience as string) || undefined,
      productDescription: (campaign?.productDescription as string) || undefined,
      valueProposition: (campaign?.valueProposition as string) || undefined,
      tone: (campaign?.tone as string) || undefined,
      emailLength: (campaign?.emailLength as string) || undefined,
      cta: (campaign?.cta as string) || undefined,
      customInstructions: (campaign?.customInstructions as string) || undefined,
      senderName: (campaign?.senderName as string) || undefined,
    },
  });

  const emailMessage = await db.emailMessages.create({
    campaignId: campaignId || null,
    leadId,
    subject: result.subject,
    htmlBody: result.htmlBody,
    textBody: result.textBody,
    aiModel: result.model,
    aiRawResponse: result.rawResponse,
    status: campaign?.autoApprove ? 'approved' : 'generated',
    senderName: (campaign?.senderName as string) || null,
    senderEmail: (campaign?.senderEmail as string) || null,
    recipientEmail: (lead.email as string) || null,
    recipientName: (lead.fullName as string) || (lead.firstName as string) || null,
    ...(campaign?.autoApprove ? { approvedAt: new Date() } : {}),
  });

  // Update campaign lead status
  if (campaignId) {
    const cl = await db.campaignLeads.findFirst({ campaignId, leadId });
    if (cl) {
      await db.campaignLeads.update(cl.id, { status: campaign?.autoApprove ? 'approved' : 'email_generated' });
    }
    await db.campaigns.increment(campaignId, 'emailsGenerated', 1);
  }

  await db.leads.update(leadId, { outreachStatus: 'draft' });

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

  const emailMessage = await db.emailMessages.findById(emailMessageId);
  if (!emailMessage) throw new Error(`Email message not found: ${emailMessageId}`);

  const lead = await db.leads.findById(emailMessage.leadId as string);
  const campaign = emailMessage.campaignId ? await db.campaigns.findById(emailMessage.campaignId as string) : null;

  if (emailMessage.status !== 'approved' && emailMessage.status !== 'queued') {
    throw new Error(`Email not in sendable state: ${emailMessage.status}`);
  }

  if (!emailMessage.recipientEmail || !lead?.email) {
    throw new Error('No recipient email address');
  }

  // Check suppression list
  const suppressed = await db.suppressionEntries.findByField('email', emailMessage.recipientEmail);

  if (suppressed || lead?.doNotContact || lead?.unsubscribed || lead?.bounced) {
    await db.emailMessages.update(emailMessageId, { status: 'failed', errorMessage: 'Recipient is suppressed or on do-not-contact list' });
    if (campaignId) {
      const cl = await db.campaignLeads.findFirst({ campaignId, leadId: emailMessage.leadId as string });
      if (cl) await db.campaignLeads.update(cl.id, { status: 'skipped' });
    }
    return { status: 'skipped', reason: 'suppressed' };
  }

  // Send via Brevo
  const apiKey = await getApiKey('brevo');
  const emailProvider = createEmailProvider('brevo', apiKey);

  await db.emailMessages.update(emailMessageId, { status: 'sending' });

  const sendResult = await emailProvider.sendEmail({
    to: {
      email: emailMessage.recipientEmail as string,
      name: (emailMessage.recipientName as string) || undefined,
    },
    from: {
      email: (emailMessage.senderEmail as string) || (campaign?.senderEmail as string) || '',
      name: (emailMessage.senderName as string) || (campaign?.senderName as string) || undefined,
    },
    replyTo: campaign?.replyToEmail ? { email: campaign.replyToEmail as string } : undefined,
    subject: (emailMessage.subject as string) || '',
    htmlContent: (emailMessage.htmlBody as string) || '',
    textContent: (emailMessage.textBody as string) || undefined,
    tags: campaignId ? [`campaign-${campaignId}`] : undefined,
  });

  if (sendResult.status === 'sent' || sendResult.status === 'queued') {
    await db.emailMessages.update(emailMessageId, {
      status: 'sent',
      provider: 'brevo',
      providerMessageId: sendResult.messageId,
      sentAt: new Date(),
    });

    await db.leads.update(emailMessage.leadId as string, { outreachStatus: 'sent' });

    if (campaignId) {
      const cl = await db.campaignLeads.findFirst({ campaignId, leadId: emailMessage.leadId as string });
      if (cl) await db.campaignLeads.update(cl.id, { status: 'sent' });
      await db.campaigns.increment(campaignId, 'emailsSent', 1);
    }

    await createActivity({
      eventType: 'email.sent',
      leadId: emailMessage.leadId as string,
      campaignId: campaignId || undefined,
      emailMessageId,
      provider: 'brevo',
      metadata: { providerMessageId: sendResult.messageId },
    });

    return { status: 'sent', messageId: sendResult.messageId };
  } else {
    await db.emailMessages.update(emailMessageId, {
      status: 'failed',
      errorMessage: sendResult.error || 'Send failed',
    });

    if (campaignId) {
      const cl = await db.campaignLeads.findFirst({ campaignId, leadId: emailMessage.leadId as string });
      if (cl) await db.campaignLeads.update(cl.id, { status: 'failed' });
    }

    throw new Error(sendResult.error || 'Email send failed');
  }
}

// ─── Webhook Process Worker ───

async function processWebhook(job: Job) {
  const { provider, eventType, payload, webhookEventId } = job.data;

  logger.info('Processing webhook', { provider, eventType, webhookEventId });

  if (provider === 'brevo') {
    await processBrevoWebhookEvent(eventType, payload);
  }

  if (webhookEventId) {
    await db.webhookEvents.update(webhookEventId, { status: 'processed', processedAt: new Date() });
  }
}

async function processBrevoWebhookEvent(
  eventType: string,
  payload: Record<string, unknown>
) {
  const messageId = (payload['message-id'] as string) || (payload.messageId as string);
  if (!messageId) {
    logger.warn('Brevo webhook missing message-id', { eventType, payload });
    return;
  }

  const emailMessage = await db.emailMessages.findFirst({ providerMessageId: messageId });

  if (!emailMessage) {
    logger.warn('Email message not found for Brevo webhook', { messageId, eventType });
    return;
  }

  const now = new Date();
  const eventMap: Record<string, { field: string; activityType: string }> = {
    delivered: { field: 'deliveredAt', activityType: 'email.delivered' },
    opened: { field: 'openedAt', activityType: 'email.opened' },
    click: { field: 'clickedAt', activityType: 'email.clicked' },
    hard_bounce: { field: 'bouncedAt', activityType: 'email.bounced' },
    soft_bounce: { field: 'bouncedAt', activityType: 'email.bounced' },
    spam: { field: 'bouncedAt', activityType: 'email.bounced' },
    unsubscribed: { field: 'unsubscribedAt', activityType: 'email.unsubscribed' },
    reply: { field: 'repliedAt', activityType: 'email.replied' },
  };

  const mapping = eventMap[eventType];
  if (!mapping) {
    logger.warn('Unknown Brevo event type', { eventType });
    return;
  }

  const providerEventId = `${messageId}-${eventType}-${payload.ts || Date.now()}`;
  try {
    await db.emailEvents.create({
      emailMessageId: emailMessage.id,
      eventType,
      provider: 'brevo',
      providerEventId,
      metadata: payload,
      occurredAt: payload.ts ? new Date(Number(payload.ts) * 1000) : now,
    });
  } catch {
    logger.debug('Duplicate email event skipped', { providerEventId });
    return;
  }

  const updates: Record<string, unknown> = {};
  updates[mapping.field] = now;
  await db.emailMessages.update(emailMessage.id, updates);

  const outreachStatusMap: Record<string, string> = {
    delivered: 'delivered',
    opened: 'opened',
    reply: 'replied',
  };

  if (outreachStatusMap[eventType]) {
    await db.leads.update(emailMessage.leadId as string, { outreachStatus: outreachStatusMap[eventType] });
  }

  if (eventType === 'hard_bounce' || eventType === 'spam') {
    const recipientEmail = emailMessage.recipientEmail as string;
    if (recipientEmail) {
      await db.suppressionEntries.upsert('email', recipientEmail, {}, {
        email: recipientEmail,
        reason: eventType === 'hard_bounce' ? 'bounced' : 'complained',
        source: 'brevo_webhook',
      });
      await db.leads.update(emailMessage.leadId as string, { bounced: true, outreachStatus: 'bounced' });
    }
  }

  if (eventType === 'unsubscribed') {
    const recipientEmail = emailMessage.recipientEmail as string;
    if (recipientEmail) {
      await db.suppressionEntries.upsert('email', recipientEmail, {}, {
        email: recipientEmail,
        reason: 'unsubscribed',
        source: 'brevo_webhook',
      });
      await db.leads.update(emailMessage.leadId as string, { unsubscribed: true });
    }
  }

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
      await db.campaigns.increment(emailMessage.campaignId as string, field, 1);
    }
  }

  await createActivity({
    eventType: mapping.activityType as Parameters<typeof createActivity>[0]['eventType'],
    leadId: emailMessage.leadId as string,
    campaignId: (emailMessage.campaignId as string) || undefined,
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
      duration: 60000,
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
