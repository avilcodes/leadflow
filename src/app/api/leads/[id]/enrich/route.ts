import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { addJob, QUEUE_NAMES } from '@/lib/queue';
import logger from '@/lib/logger';
import { z } from 'zod';

const enrichSchema = z.object({
  type: z.enum(['linkedin_scrape', 'website_scrape', 'company_info', 'custom']).default('linkedin_scrape'),
  url: z.string().url().optional(),
  provider: z.string().default('apify'),
  actorId: z.string().optional(),
  additionalInput: z.record(z.unknown()).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const lead = await db.leads.findById(id);
    if (!lead || lead.deletedAt) {
      return NextResponse.json(
        { success: false, error: 'Lead not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = enrichSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { type, provider, actorId, additionalInput } = parsed.data;

    // Auto-detect URL if not provided
    let url = parsed.data.url;
    if (!url) {
      if (type === 'linkedin_scrape' && lead.linkedinUrl) {
        url = lead.linkedinUrl as string;
      } else if (type === 'website_scrape' && (lead.website || lead.companyDomain)) {
        url = (lead.website as string) || `https://${lead.companyDomain}`;
      } else if (type === 'company_info' && lead.companyLinkedinUrl) {
        url = lead.companyLinkedinUrl as string;
      }
    }

    if (!url && (type === 'linkedin_scrape' || type === 'website_scrape' || type === 'company_info')) {
      return NextResponse.json(
        { success: false, error: `No URL available for ${type}. Provide a url or ensure the lead has the relevant URL field populated.` },
        { status: 400 }
      );
    }

    const jobId = await addJob(
      QUEUE_NAMES.ENRICHMENT,
      `enrich-${type}`,
      {
        leadId: id,
        type,
        url,
        provider,
        actorId,
        additionalInput,
        userId: session.userId,
      }
    );

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'Failed to enqueue enrichment job. Background job system may be unavailable.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          jobId,
          message: 'Enrichment job queued successfully',
          type,
        },
      },
      { status: 202 }
    );
  } catch (error) {
    logger.error('POST /api/leads/[id]/enrich failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
