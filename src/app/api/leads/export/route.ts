import { NextRequest, NextResponse } from 'next/server';
import db, { searchLeads } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { leadFiltersSchema } from '@/lib/validation';
import { stringify } from 'csv-stringify/sync';
import logger from '@/lib/logger';

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

    const parsed = leadFiltersSchema.safeParse({ ...searchParams, pageSize: 100 });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    // Use searchLeads with large page size for export
    const { leads } = await searchLeads({
      ...parsed.data,
      page: 1,
      pageSize: 10000,
    });

    // Load tags for each lead
    const leadsWithTags = await Promise.all(
      leads.map(async (lead) => {
        const tagDocs = await db.leadTags.findMany({ where: { leadId: lead.id } });
        const tags = await Promise.all(
          tagDocs.map(async (lt) => {
            const tag = await db.tags.findById(lt.tagId as string);
            return tag?.name || '';
          })
        );
        return { ...lead, tagNames: tags.filter(Boolean) };
      })
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = leadsWithTags.map((lead: any) => ({
      id: lead.id,
      first_name: (lead.firstName as string) || '',
      last_name: (lead.lastName as string) || '',
      full_name: (lead.fullName as string) || '',
      job_title: (lead.jobTitle as string) || '',
      email: (lead.email as string) || '',
      phone: (lead.phone as string) || '',
      linkedin_url: (lead.linkedinUrl as string) || '',
      location: (lead.location as string) || '',
      website: (lead.website as string) || '',
      company_name: (lead.companyName as string) || '',
      company_domain: (lead.companyDomain as string) || '',
      industry: (lead.industry as string) || '',
      company_size: (lead.companySize as string) || '',
      revenue: (lead.revenue as string) || '',
      funding: (lead.funding as string) || '',
      status: lead.status as string,
      enrichment_status: lead.enrichmentStatus as string,
      outreach_status: lead.outreachStatus as string,
      source: (lead.source as string) || '',
      tags: (lead.tagNames as string[]).join(', '),
      created_at: lead.createdAt instanceof Date ? lead.createdAt.toISOString() : String(lead.createdAt || ''),
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
