import { NextRequest, NextResponse } from 'next/server';
import db, { searchLeads } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { createActivity } from '@/lib/activity';
import { createLeadSchema, leadFiltersSchema } from '@/lib/validation';
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

    const parsed = leadFiltersSchema.safeParse(searchParams);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { leads, total } = await searchLeads(parsed.data);

    // Load tags for each lead
    const leadsWithTags = await Promise.all(
      leads.map(async (lead) => {
        const tagDocs = await db.leadTags.findMany({ where: { leadId: lead.id } });
        const leadTags = await Promise.all(
          tagDocs.map(async (lt) => {
            const tag = await db.tags.findById(lt.tagId as string);
            return { ...lt, tag };
          })
        );
        return { ...lead, leadTags };
      })
    );

    const { page, pageSize } = parsed.data;

    return NextResponse.json({
      success: true,
      data: leadsWithTags,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logger.error('GET /api/leads failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

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
    const parsed = createLeadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { tags, customFields, ...leadData } = parsed.data;

    // Check for duplicate email
    if (leadData.email) {
      const existing = await db.leads.findFirst({
        email: leadData.email.toLowerCase().trim(),
        deletedAt: null,
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'A lead with this email already exists' },
          { status: 409 }
        );
      }
    }

    const fullName = leadData.fullName
      || [leadData.firstName, leadData.lastName].filter(Boolean).join(' ')
      || null;

    const lead = await db.leads.create({
      ...leadData,
      customFields: customFields || undefined,
      fullName,
      email: leadData.email?.toLowerCase().trim() || null,
      source: leadData.source || 'manual',
      status: 'new',
      enrichmentStatus: 'none',
      outreachStatus: 'none',
      deletedAt: null,
    });

    // Add tags
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        const tag = await db.tags.upsert('name', tagName, {}, { name: tagName });
        await db.leadTags.create({ leadId: lead.id, tagId: tag.id }).catch(() => {});
      }
    }

    await createActivity({
      eventType: 'lead.created',
      leadId: lead.id,
      userId: session.userId,
      metadata: { source: lead.source },
    });

    // Check auto-processing setting and trigger if enabled
    try {
      const settingsDoc = await db.firestore
        .collection('settings')
        .doc('auto-processing')
        .get();
      if (settingsDoc.exists && settingsDoc.data()?.enabled) {
        // Auto-process: create enrichment job
        await db.leads.update(lead.id, { enrichmentStatus: 'pending' });
        await db.enrichmentJobs.create({
          leadId: lead.id,
          type: 'linkedin_scrape',
          provider: 'auto-process',
          status: 'pending',
          priority: 5,
        });
        await createActivity({
          eventType: 'lead.enrichment.started',
          leadId: lead.id,
          userId: session.userId,
          metadata: { source: 'auto-processing', trigger: 'lead-create' },
        });
        logger.info('Auto-processing triggered for new lead', { leadId: lead.id });
      }
    } catch (autoErr) {
      // Don't fail lead creation if auto-processing check fails
      logger.error('Auto-processing check failed', { error: autoErr });
    }

    // Load full lead with tags
    const tagDocs = await db.leadTags.findMany({ where: { leadId: lead.id } });
    const leadTags = await Promise.all(
      tagDocs.map(async (lt) => {
        const tag = await db.tags.findById(lt.tagId as string);
        return { ...lt, tag };
      })
    );
    const fullLead = { ...lead, leadTags };

    return NextResponse.json(
      { success: true, data: fullLead },
      { status: 201 }
    );
  } catch (error) {
    logger.error('POST /api/leads failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
