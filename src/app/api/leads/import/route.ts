import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { addJob, QUEUE_NAMES } from '@/lib/queue';
import { detectCsvColumns, suggestMappings } from '@/providers/lead-sources';
import logger from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const importSchema = z.object({
  source: z.enum(['apollo', 'prospeo', 'deepenrich', 'csv']),
  // For provider imports
  query: z.object({
    query: z.string().optional(),
    jobTitle: z.string().optional(),
    company: z.string().optional(),
    location: z.string().optional(),
    industry: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  }).optional(),
  // For CSV imports
  csvContent: z.string().optional(),
  mappings: z.record(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  // Auto-detect columns mode
  detectColumns: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = importSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { source, query, csvContent, mappings, tags, detectColumns } = parsed.data;

    // Column detection mode for CSV
    if (source === 'csv' && detectColumns && csvContent) {
      const columns = detectCsvColumns(csvContent);
      const suggested = suggestMappings(columns);
      return NextResponse.json({
        success: true,
        data: { columns, suggestedMappings: suggested },
      });
    }

    // Validate required fields per source
    if (source === 'csv' && !csvContent) {
      return NextResponse.json(
        { success: false, error: 'csvContent is required for CSV imports' },
        { status: 400 }
      );
    }

    if (source !== 'csv' && !query) {
      return NextResponse.json(
        { success: false, error: 'query is required for provider imports' },
        { status: 400 }
      );
    }

    const batchId = uuidv4();

    const jobId = await addJob(
      QUEUE_NAMES.LEAD_IMPORT,
      `import-${source}`,
      {
        source,
        query,
        csvContent,
        mappings,
        tags,
        batchId,
        userId: session.userId,
      }
    );

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'Failed to enqueue import job. Background job system may be unavailable.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          jobId,
          batchId,
          message: 'Import job queued successfully',
        },
      },
      { status: 202 }
    );
  } catch (error) {
    logger.error('POST /api/leads/import failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
