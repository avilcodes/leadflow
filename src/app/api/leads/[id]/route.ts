import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
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

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        company: true,
        leadTags: { include: { tag: true } },
        enrichmentJobs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        aiAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        emailMessages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        campaignLeads: {
          include: { campaign: { select: { id: true, name: true, status: true } } },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        sourceRecords: {
          orderBy: { importedAt: 'desc' },
        },
      },
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

    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return NextResponse.json(
        { success: false, error: 'Lead not found' },
        { status: 404 }
      );
    }

    const { tags, customFields, ...updateData } = parsed.data;
    const prismaData: Record<string, unknown> = { ...updateData };
    if (customFields !== undefined) {
      prismaData.customFields = customFields as object;
    }

    // Recompute fullName if first/last name changed
    if (prismaData.firstName !== undefined || prismaData.lastName !== undefined) {
      const firstName = (prismaData.firstName as string) ?? existing.firstName;
      const lastName = (prismaData.lastName as string) ?? existing.lastName;
      if (!prismaData.fullName) {
        prismaData.fullName = [firstName, lastName].filter(Boolean).join(' ') || undefined;
      }
    }

    if (prismaData.email) {
      prismaData.email = (prismaData.email as string).toLowerCase().trim();
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: prismaData,
    });

    // Update tags if provided
    if (tags !== undefined) {
      // Remove existing tags
      await prisma.leadTag.deleteMany({ where: { leadId: id } });

      // Add new tags
      for (const tagName of tags) {
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
        });
        await prisma.leadTag.create({
          data: { leadId: id, tagId: tag.id },
        }).catch(() => {});
      }
    }

    await createActivity({
      eventType: 'lead.updated',
      leadId: id,
      userId: session.userId,
      metadata: { updatedFields: Object.keys(parsed.data) },
    });

    const fullLead = await prisma.lead.findUnique({
      where: { id },
      include: { leadTags: { include: { tag: true } } },
    });

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

    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return NextResponse.json(
        { success: false, error: 'Lead not found' },
        { status: 404 }
      );
    }

    // Soft delete
    await prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

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
