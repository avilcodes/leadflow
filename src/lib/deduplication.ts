import prisma from './db';
import logger from './logger';
import type { LeadData } from '@/types';

export interface DuplicateMatch {
  existingLeadId: string;
  matchField: 'email' | 'linkedinUrl' | 'fullName+companyName';
  matchValue: string;
  confidence: number;
}

export interface DeduplicationResult {
  newLeads: LeadData[];
  duplicates: Array<{
    incoming: LeadData;
    match: DuplicateMatch;
  }>;
  merged: Array<{
    leadId: string;
    incoming: LeadData;
    match: DuplicateMatch;
  }>;
}

/**
 * Find existing leads that match the incoming lead data.
 * Matches on email (exact), LinkedIn URL (exact), or fullName+companyName (case-insensitive).
 */
export async function findDuplicates(leadData: LeadData): Promise<DuplicateMatch[]> {
  const matches: DuplicateMatch[] = [];

  try {
    // 1. Match on email (highest confidence)
    if (leadData.email) {
      const emailMatch = await prisma.lead.findFirst({
        where: {
          email: leadData.email.toLowerCase().trim(),
          deletedAt: null,
        },
        select: { id: true, email: true },
      });

      if (emailMatch) {
        matches.push({
          existingLeadId: emailMatch.id,
          matchField: 'email',
          matchValue: leadData.email,
          confidence: 1.0,
        });
        return matches; // Email is definitive, no need to check further
      }
    }

    // 2. Match on LinkedIn URL (high confidence)
    if (leadData.linkedinUrl) {
      const normalizedUrl = normalizeLinkedInUrl(leadData.linkedinUrl);
      if (normalizedUrl) {
        const linkedinMatch = await prisma.lead.findFirst({
          where: {
            linkedinUrl: normalizedUrl,
            deletedAt: null,
          },
          select: { id: true, linkedinUrl: true },
        });

        if (linkedinMatch) {
          matches.push({
            existingLeadId: linkedinMatch.id,
            matchField: 'linkedinUrl',
            matchValue: normalizedUrl,
            confidence: 0.95,
          });
          return matches;
        }
      }
    }

    // 3. Match on fullName + companyName (moderate confidence)
    const fullName = leadData.fullName
      || [leadData.firstName, leadData.lastName].filter(Boolean).join(' ');

    if (fullName && leadData.companyName) {
      const nameMatch = await prisma.lead.findFirst({
        where: {
          fullName: { equals: fullName, mode: 'insensitive' },
          companyName: { equals: leadData.companyName, mode: 'insensitive' },
          deletedAt: null,
        },
        select: { id: true, fullName: true, companyName: true },
      });

      if (nameMatch) {
        matches.push({
          existingLeadId: nameMatch.id,
          matchField: 'fullName+companyName',
          matchValue: `${fullName} @ ${leadData.companyName}`,
          confidence: 0.8,
        });
      }
    }
  } catch (error) {
    logger.error('findDuplicates failed', { error, email: leadData.email });
  }

  return matches;
}

/**
 * Merge incoming lead data into an existing lead record.
 * Only fills in fields that are currently null/empty on the existing lead.
 */
export async function mergeLeadData(
  existingLeadId: string,
  incoming: LeadData
): Promise<void> {
  try {
    const existing = await prisma.lead.findUnique({
      where: { id: existingLeadId },
    });

    if (!existing) {
      logger.warn('mergeLeadData: existing lead not found', { existingLeadId });
      return;
    }

    const updates: Record<string, unknown> = {};

    // Only update fields that are currently empty on the existing lead
    const fieldsToMerge: Array<{ key: keyof LeadData; dbKey: string }> = [
      { key: 'firstName', dbKey: 'firstName' },
      { key: 'lastName', dbKey: 'lastName' },
      { key: 'fullName', dbKey: 'fullName' },
      { key: 'jobTitle', dbKey: 'jobTitle' },
      { key: 'email', dbKey: 'email' },
      { key: 'phone', dbKey: 'phone' },
      { key: 'linkedinUrl', dbKey: 'linkedinUrl' },
      { key: 'location', dbKey: 'location' },
      { key: 'website', dbKey: 'website' },
      { key: 'companyName', dbKey: 'companyName' },
      { key: 'companyDomain', dbKey: 'companyDomain' },
      { key: 'companyLinkedinUrl', dbKey: 'companyLinkedinUrl' },
      { key: 'industry', dbKey: 'industry' },
      { key: 'companySize', dbKey: 'companySize' },
      { key: 'revenue', dbKey: 'revenue' },
      { key: 'funding', dbKey: 'funding' },
    ];

    for (const { key, dbKey } of fieldsToMerge) {
      const existingValue = (existing as Record<string, unknown>)[dbKey];
      const incomingValue = incoming[key];
      if (!existingValue && incomingValue) {
        updates[dbKey] = incomingValue;
      }
    }

    // Merge custom fields
    if (incoming.customFields) {
      const existingCustom = (existing.customFields as Record<string, unknown>) || {};
      const mergedCustom = { ...existingCustom, ...incoming.customFields };
      updates.customFields = mergedCustom as object;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.lead.update({
        where: { id: existingLeadId },
        data: updates,
      });

      logger.info('Lead data merged', {
        leadId: existingLeadId,
        fieldsUpdated: Object.keys(updates),
      });
    }

    // Record the source
    if (incoming.source) {
      await prisma.leadSourceRecord.create({
        data: {
          leadId: existingLeadId,
          provider: incoming.source,
          sourceLeadId: incoming.sourceLeadId || null,
          rawData: incoming.rawSourceData ? (incoming.rawSourceData as object) : undefined,
        },
      });
    }
  } catch (error) {
    logger.error('mergeLeadData failed', { error, existingLeadId });
    throw error;
  }
}

/**
 * Deduplicate an array of incoming leads against the database.
 * Returns new leads, duplicates, and auto-merged records.
 */
export async function deduplicateImport(
  leads: LeadData[],
  options: { autoMerge?: boolean; batchId?: string } = {}
): Promise<DeduplicationResult> {
  const { autoMerge = true, batchId } = options;

  const result: DeduplicationResult = {
    newLeads: [],
    duplicates: [],
    merged: [],
  };

  // Also deduplicate within the incoming batch by email
  const seenEmails = new Set<string>();
  const seenLinkedIn = new Set<string>();

  for (const lead of leads) {
    // Check for intra-batch duplicates
    if (lead.email) {
      const normalizedEmail = lead.email.toLowerCase().trim();
      if (seenEmails.has(normalizedEmail)) {
        result.duplicates.push({
          incoming: lead,
          match: {
            existingLeadId: '',
            matchField: 'email',
            matchValue: normalizedEmail,
            confidence: 1.0,
          },
        });
        continue;
      }
      seenEmails.add(normalizedEmail);
    }

    if (lead.linkedinUrl) {
      const normalizedUrl = normalizeLinkedInUrl(lead.linkedinUrl);
      if (normalizedUrl && seenLinkedIn.has(normalizedUrl)) {
        result.duplicates.push({
          incoming: lead,
          match: {
            existingLeadId: '',
            matchField: 'linkedinUrl',
            matchValue: normalizedUrl,
            confidence: 0.95,
          },
        });
        continue;
      }
      if (normalizedUrl) seenLinkedIn.add(normalizedUrl);
    }

    // Check against database
    const matches = await findDuplicates(lead);

    if (matches.length > 0) {
      const bestMatch = matches[0];

      if (autoMerge && bestMatch.confidence >= 0.8) {
        await mergeLeadData(bestMatch.existingLeadId, lead);
        result.merged.push({
          leadId: bestMatch.existingLeadId,
          incoming: lead,
          match: bestMatch,
        });
      } else {
        result.duplicates.push({ incoming: lead, match: bestMatch });
      }
    } else {
      result.newLeads.push(lead);
    }
  }

  logger.info('Deduplication complete', {
    total: leads.length,
    new: result.newLeads.length,
    duplicates: result.duplicates.length,
    merged: result.merged.length,
    batchId,
  });

  return result;
}

/**
 * Normalize a LinkedIn URL to a canonical form for comparison.
 */
function normalizeLinkedInUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('linkedin.com')) return null;

    // Extract the path and normalize
    let path = parsed.pathname.replace(/\/+$/, '').toLowerCase();

    // Remove language prefix if present (e.g., /in/en/username -> /in/username)
    path = path.replace(/^\/[a-z]{2}\/in\//, '/in/');

    return `https://www.linkedin.com${path}`;
  } catch {
    // If it's not a valid URL but looks like a LinkedIn path
    if (url.includes('linkedin.com')) {
      const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
      if (match) {
        return `https://www.linkedin.com/in/${match[1].toLowerCase()}`;
      }
    }
    return null;
  }
}
