import { describe, it, expect } from 'vitest';
import { parse } from 'csv-parse/sync';
import type { LeadData } from '@/types';

// ─── CSV Parsing Logic (matching app import behavior) ───

interface CSVFieldMapping {
  [csvColumn: string]: string; // maps CSV header to LeadData field
}

function parseCSV(csvContent: string): Record<string, string>[] {
  return parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];
}

function applyFieldMappings(
  rows: Record<string, string>[],
  mappings: CSVFieldMapping
): LeadData[] {
  return rows.map((row) => {
    const lead: Record<string, string> = {};

    for (const [csvColumn, leadField] of Object.entries(mappings)) {
      if (row[csvColumn] !== undefined && row[csvColumn] !== '') {
        lead[leadField] = row[csvColumn];
      }
    }

    return lead as unknown as LeadData;
  });
}

function detectMissingColumns(
  headers: string[],
  mappings: CSVFieldMapping
): string[] {
  const missing: string[] = [];
  for (const csvColumn of Object.keys(mappings)) {
    if (!headers.includes(csvColumn)) {
      missing.push(csvColumn);
    }
  }
  return missing;
}

// ─── Tests ───

describe('CSV Import', () => {
  describe('parseCSV', () => {
    it('parses valid CSV with headers', () => {
      const csv = `First Name,Last Name,Email,Company
John,Doe,john@acme.com,Acme Corp
Jane,Smith,jane@widgets.io,Widgets Inc`;

      const rows = parseCSV(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0]['First Name']).toBe('John');
      expect(rows[0]['Last Name']).toBe('Doe');
      expect(rows[0]['Email']).toBe('john@acme.com');
      expect(rows[0]['Company']).toBe('Acme Corp');
      expect(rows[1]['First Name']).toBe('Jane');
    });

    it('handles empty CSV (headers only)', () => {
      const csv = `First Name,Last Name,Email\n`;
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(0);
    });

    it('trims whitespace from values', () => {
      const csv = `Name,Email
  John Doe  , john@example.com `;

      const rows = parseCSV(csv);
      expect(rows[0]['Name']).toBe('John Doe');
      expect(rows[0]['Email']).toBe('john@example.com');
    });

    it('handles quoted fields with commas', () => {
      const csv = `Name,Company,Email
"Doe, John","Acme, Corp",john@acme.com`;

      const rows = parseCSV(csv);
      expect(rows[0]['Name']).toBe('Doe, John');
      expect(rows[0]['Company']).toBe('Acme, Corp');
    });

    it('handles quoted fields with newlines', () => {
      const csv = `Name,Bio,Email
"John Doe","Line 1
Line 2",john@acme.com`;

      const rows = parseCSV(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0]['Bio']).toContain('Line 1');
      expect(rows[0]['Bio']).toContain('Line 2');
    });

    it('handles special characters', () => {
      const csv = `Name,Company,Email
Müller,Schöne GmbH,mueller@schoene.de
O'Brien,O'Neil & Co,obrien@oneil.com`;

      const rows = parseCSV(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0]['Name']).toBe('Müller');
      expect(rows[0]['Company']).toBe('Schöne GmbH');
      expect(rows[1]['Name']).toBe("O'Brien");
    });

    it('skips empty lines', () => {
      const csv = `Name,Email
John,john@example.com

Jane,jane@example.com

`;

      const rows = parseCSV(csv);
      expect(rows).toHaveLength(2);
    });

    it('handles BOM marker', () => {
      const csv = `﻿Name,Email
John,john@example.com`;

      const rows = parseCSV(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0]['Name']).toBe('John');
    });
  });

  describe('applyFieldMappings', () => {
    it('maps CSV columns to LeadData fields', () => {
      const rows = [
        { 'First Name': 'John', 'Last Name': 'Doe', Email: 'john@acme.com', Company: 'Acme Corp' },
      ];
      const mappings: CSVFieldMapping = {
        'First Name': 'firstName',
        'Last Name': 'lastName',
        Email: 'email',
        Company: 'companyName',
      };

      const leads = applyFieldMappings(rows, mappings);
      expect(leads).toHaveLength(1);
      expect(leads[0].firstName).toBe('John');
      expect(leads[0].lastName).toBe('Doe');
      expect(leads[0].email).toBe('john@acme.com');
      expect(leads[0].companyName).toBe('Acme Corp');
    });

    it('ignores empty values in mapped fields', () => {
      const rows = [{ Name: 'John', Email: '', Phone: '' }];
      const mappings: CSVFieldMapping = {
        Name: 'fullName',
        Email: 'email',
        Phone: 'phone',
      };

      const leads = applyFieldMappings(rows, mappings);
      expect(leads[0].fullName).toBe('John');
      expect(leads[0].email).toBeUndefined();
      expect(leads[0].phone).toBeUndefined();
    });

    it('ignores unmapped columns', () => {
      const rows = [
        { Name: 'John', Email: 'john@example.com', UnmappedField: 'ignored' },
      ];
      const mappings: CSVFieldMapping = {
        Name: 'fullName',
        Email: 'email',
      };

      const leads = applyFieldMappings(rows, mappings);
      expect(leads[0].fullName).toBe('John');
      expect(leads[0].email).toBe('john@example.com');
      expect((leads[0] as Record<string, unknown>)['UnmappedField']).toBeUndefined();
    });

    it('handles multiple rows', () => {
      const rows = [
        { Name: 'Alice', Email: 'alice@example.com' },
        { Name: 'Bob', Email: 'bob@example.com' },
        { Name: 'Charlie', Email: 'charlie@example.com' },
      ];
      const mappings: CSVFieldMapping = {
        Name: 'fullName',
        Email: 'email',
      };

      const leads = applyFieldMappings(rows, mappings);
      expect(leads).toHaveLength(3);
      expect(leads[0].fullName).toBe('Alice');
      expect(leads[2].fullName).toBe('Charlie');
    });

    it('handles empty rows array', () => {
      const leads = applyFieldMappings([], { Name: 'fullName' });
      expect(leads).toHaveLength(0);
    });
  });

  describe('detectMissingColumns', () => {
    it('returns empty array when all mapped columns exist', () => {
      const headers = ['Name', 'Email', 'Company'];
      const mappings: CSVFieldMapping = {
        Name: 'fullName',
        Email: 'email',
      };

      const missing = detectMissingColumns(headers, mappings);
      expect(missing).toHaveLength(0);
    });

    it('reports missing columns', () => {
      const headers = ['Name', 'Email'];
      const mappings: CSVFieldMapping = {
        Name: 'fullName',
        Email: 'email',
        Phone: 'phone',
        Company: 'companyName',
      };

      const missing = detectMissingColumns(headers, mappings);
      expect(missing).toContain('Phone');
      expect(missing).toContain('Company');
      expect(missing).toHaveLength(2);
    });

    it('reports all columns missing when headers are empty', () => {
      const headers: string[] = [];
      const mappings: CSVFieldMapping = {
        Name: 'fullName',
        Email: 'email',
      };

      const missing = detectMissingColumns(headers, mappings);
      expect(missing).toHaveLength(2);
    });
  });
});
