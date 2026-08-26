import { NextRequest, NextResponse } from 'next/server';
import db, { getLeadWithRelations } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { createActivity } from '@/lib/activity';
import { updateLeadSchema } from '@/lib/validation';
import logger from '@/lib/logger';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const lead = await getLeadWithRelations(id, {
      company: true,
      leadTags: true,
      enrichmentJobs: { limit: 10 },
      aiAnalyses: { limit: 5 },
      emailMessages: { limit: 10 },
      campaignLeads: true,
      activities: { limit: 20 },
      sourceRecords: true,
    });

    if (!lead || lead.deletedAt) {
      return NextResponse.json(
        { success: false, error: 'Lead not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: lead });
  } catch (error) {
    logger.error('GET /api/leads/[id] failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateLeadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const existing = await db.leads.findById(id);
    if (!existing || existing.deletedAt) {
      return NextResponse.json(
        { success: false, error: 'Lead not found' },
        { status: 404 }
      );
    }

    const { tags, customFields, ...updateData } = parsed.data;
    const updateFields: Record<string, unknown> = { ...updateData };
    if (customFields !== undefined) {
      updateFields.customFields = customFields;
    }

    // Recompute fullName if first/last name changed
    if (updateFields.firstName !== undefined || updateFields.lastName !== undefined) {
      const firstName = (updateFields.firstName as string) ?? existing.firstName;
      const lastName = (updateFields.lastName as string) ?? existing.lastName;
      if (!updateFields.fullName) {
        updateFields.fullName = [firstName, lastName].filter(Boolean).join(' ') || undefined;
      }
    }

    if (updateFields.email) {
      updateFields.email = (updateFields.email as string).toLowerCase().trim();
    }

    const lead = await db.leads.update(id, updateFields);

    // Update tags if provided
    if (tags !== undefined) {
      await db.leadTags.deleteMany({ leadId: id });
      for (const tagName of tags) {
        const tag = await db.tags.upsert('name', tagName, {}, { name: tagName });
        await db.leadTags.create({ leadId: id, tagId: tag.id }).catch(() => {});
      }
    }

    await createActivity({
      eventType: 'lead.updated',
      leadId: id,
      userId: session.userId,
      metadata: { updatedFields: Object.keys(parsed.data) },
    });

    // Load tags
    const tagDocs = await db.leadTags.findMany({ where: { leadId: id } });
    const leadTags = await Promise.all(
      tagDocs.map(async (lt) => {
        const tag = await db.tags.findById(lt.tagId as string);
        return { ...lt, tag };
      })
    );
    const fullLead = { ...lead, leadTags };

    return NextResponse.json({ success: true, data: fullLead });
  } catch (error) {
    logger.error('PUT /api/leads/[id] failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const existing = await db.leads.findById(id);
    if (!existing || existing.deletedAt) {
      return NextResponse.json(
        { success: false, error: 'Lead not found' },
        { status: 404 }
      );
    }

    // Soft delete
    await db.leads.update(id, { deletedAt: new Date() });

    await createActivity({
      eventType: 'lead.deleted',
      leadId: id,
      userId: session.userId,
    });

    return NextResponse.json({ success: true, message: 'Lead deleted' });
  } catch (error) {
    logger.error('DELETE /api/leads/[id] failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
