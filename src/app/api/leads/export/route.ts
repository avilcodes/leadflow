import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { leadFiltersSchema } from '@/lib/validation';
import { stringify } from 'csv-stringify/sync';
import logger from '@/lib/logger';
import type { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const tagsParam = request.nextUrl.searchParams.getAll('tags');
    if (tagsParam.length > 0) {
      (searchParams as Record<string, unknown>).tags = tagsParam;
    }

    // Use same filters as list endpoint but ignore pagination
    const parsed = leadFiltersSchema.safeParse({ ...searchParams, pageSize: 100 });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const {
      search, status, enrichmentStatus, outreachStatus, source,
      companyName, industry, location, tags, sortBy, sortOrder,
    } = parsed.data;

    const where: Prisma.LeadWhereInput = { deletedAt: null };

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (enrichmentStatus) where.enrichmentStatus = enrichmentStatus;
    if (outreachStatus) where.outreachStatus = outreachStatus;
    if (source) where.source = source;
    if (companyName) where.companyName = { contains: companyName, mode: 'insensitive' };
    if (industry) where.industry = { contains: industry, mode: 'insensitive' };
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (tags && tags.length > 0) {
      where.leadTags = { some: { tag: { name: { in: tags } } } };
    }

    const leads = await prisma.lead.findMany({
      where,
      include: {
        leadTags: { include: { tag: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      take: 10000, // Cap at 10k for export
    });

    const rows = leads.map((lead) => ({
      id: lead.id,
      first_name: lead.firstName || '',
      last_name: lead.lastName || '',
      full_name: lead.fullName || '',
      job_title: lead.jobTitle || '',
      email: lead.email || '',
      phone: lead.phone || '',
      linkedin_url: lead.linkedinUrl || '',
      location: lead.location || '',
      website: lead.website || '',
      company_name: lead.companyName || '',
      company_domain: lead.companyDomain || '',
      industry: lead.industry || '',
      company_size: lead.companySize || '',
      revenue: lead.revenue || '',
      funding: lead.funding || '',
      status: lead.status,
      enrichment_status: lead.enrichmentStatus,
      outreach_status: lead.outreachStatus,
      source: lead.source || '',
      tags: lead.leadTags.map((lt) => lt.tag.name).join(', '),
      created_at: lead.createdAt.toISOString(),
    }));

    const csv = stringify(rows, { header: true });

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="leads-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    logger.error('GET /api/leads/export failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
