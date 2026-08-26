import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { createActivity } from '@/lib/activity';
import { createLeadSchema, leadFiltersSchema } from '@/lib/validation';
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

    // Handle tags as array
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

    const {
      search, status, enrichmentStatus, outreachStatus, source,
      companyName, industry, location, tags,
      page, pageSize, sortBy, sortOrder,
    } = parsed.data;

    const where: Prisma.LeadWhereInput = {
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
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
      where.leadTags = {
        some: { tag: { name: { in: tags } } },
      };
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          leadTags: {
            include: { tag: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.lead.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: leads,
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
      const existing = await prisma.lead.findFirst({
        where: { email: leadData.email.toLowerCase().trim(), deletedAt: null },
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

    const lead = await prisma.lead.create({
      data: {
        ...leadData,
        customFields: customFields ? (customFields as object) : undefined,
        fullName,
        email: leadData.email?.toLowerCase().trim() || null,
        source: leadData.source || 'manual',
      },
    });

    // Add tags
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
        });
        await prisma.leadTag.create({
          data: { leadId: lead.id, tagId: tag.id },
        }).catch(() => {
          // Ignore duplicate tag assignment
        });
      }
    }

    await createActivity({
      eventType: 'lead.created',
      leadId: lead.id,
      userId: session.userId,
      metadata: { source: lead.source },
    });

    const fullLead = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: { leadTags: { include: { tag: true } } },
    });

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
