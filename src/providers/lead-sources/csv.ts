import { parse } from 'csv-parse/sync';
import type { LeadData } from '@/types';
import logger from '@/lib/logger';

export interface CsvFieldMapping {
  [csvColumn: string]: keyof LeadData;
}

const DEFAULT_FIELD_MAPPINGS: Record<string, keyof LeadData> = {
  'first_name': 'firstName',
  'first name': 'firstName',
  'firstname': 'firstName',
  'last_name': 'lastName',
  'last name': 'lastName',
  'lastname': 'lastName',
  'full_name': 'fullName',
  'full name': 'fullName',
  'fullname': 'fullName',
  'name': 'fullName',
  'job_title': 'jobTitle',
  'job title': 'jobTitle',
  'jobtitle': 'jobTitle',
  'title': 'jobTitle',
  'position': 'jobTitle',
  'email': 'email',
  'email_address': 'email',
  'email address': 'email',
  'work_email': 'email',
  'phone': 'phone',
  'phone_number': 'phone',
  'phone number': 'phone',
  'mobile': 'phone',
  'linkedin_url': 'linkedinUrl',
  'linkedin url': 'linkedinUrl',
  'linkedin': 'linkedinUrl',
  'linkedin_profile': 'linkedinUrl',
  'location': 'location',
  'city': 'location',
  'website': 'website',
  'company_name': 'companyName',
  'company name': 'companyName',
  'company': 'companyName',
  'organization': 'companyName',
  'company_domain': 'companyDomain',
  'company domain': 'companyDomain',
  'domain': 'companyDomain',
  'company_linkedin_url': 'companyLinkedinUrl',
  'industry': 'industry',
  'company_size': 'companySize',
  'company size': 'companySize',
  'employees': 'companySize',
  'revenue': 'revenue',
  'funding': 'funding',
};

export interface CsvImportOptions {
  mappings?: CsvFieldMapping;
  source?: string;
  batchId?: string;
  delimiter?: string;
  skipEmptyRows?: boolean;
}

export function parseCsvToLeads(
  csvContent: string,
  options: CsvImportOptions = {}
): LeadData[] {
  const {
    mappings,
    source = 'csv',
    delimiter = ',',
    skipEmptyRows = true,
  } = options;

  try {
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: skipEmptyRows,
      trim: true,
      delimiter,
      relax_column_count: true,
    }) as Array<Record<string, string>>;

    if (records.length === 0) {
      return [];
    }

    // Build the effective mapping: user-provided mappings override auto-detected
    const effectiveMapping = buildMapping(Object.keys(records[0]), mappings);

    const leads: LeadData[] = [];

    for (const record of records) {
      const lead = mapRecordToLead(record, effectiveMapping, source);
      if (lead && hasMinimumData(lead)) {
        leads.push(lead);
      }
    }

    logger.info('CSV parsed successfully', {
      totalRows: records.length,
      validLeads: leads.length,
      skippedRows: records.length - leads.length,
    });

    return leads;
  } catch (error) {
    logger.error('CSV parsing failed', { error });
    throw new Error(
      `Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export function detectCsvColumns(csvContent: string): string[] {
  try {
    const records = parse(csvContent, {
      columns: true,
      to: 1,
      trim: true,
    }) as Array<Record<string, string>>;

    if (records.length === 0) return [];
    return Object.keys(records[0]);
  } catch {
    return [];
  }
}

export function suggestMappings(columns: string[]): CsvFieldMapping {
  const suggested: CsvFieldMapping = {};

  for (const col of columns) {
    const normalizedCol = col.toLowerCase().trim();
    const mapped = DEFAULT_FIELD_MAPPINGS[normalizedCol];
    if (mapped) {
      suggested[col] = mapped;
    }
  }

  return suggested;
}

function buildMapping(
  columns: string[],
  userMappings?: CsvFieldMapping
): CsvFieldMapping {
  if (userMappings && Object.keys(userMappings).length > 0) {
    return userMappings;
  }

  // Auto-detect mappings from column names
  return suggestMappings(columns);
}

function mapRecordToLead(
  record: Record<string, string>,
  mapping: CsvFieldMapping,
  source: string
): LeadData {
  const lead: LeadData = {
    source,
    rawSourceData: record,
  };
  const customFields: Record<string, unknown> = {};
  let hasMappedField = false;

  for (const [csvCol, value] of Object.entries(record)) {
    if (!value || value.trim() === '') continue;

    const leadField = mapping[csvCol];
    if (leadField) {
      (lead as Record<string, unknown>)[leadField] = value.trim();
      hasMappedField = true;
    } else {
      // Store unmapped fields as custom fields
      customFields[csvCol] = value.trim();
    }
  }

  if (Object.keys(customFields).length > 0) {
    lead.customFields = customFields;
  }

  // Auto-generate fullName if we have first/last
  if (!lead.fullName && (lead.firstName || lead.lastName)) {
    lead.fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
  }

  if (!hasMappedField) {
    return lead;
  }

  return lead;
}

function hasMinimumData(lead: LeadData): boolean {
  // A lead must have at least an email, LinkedIn URL, or a name
  return !!(lead.email || lead.linkedinUrl || lead.fullName || lead.firstName);
}
