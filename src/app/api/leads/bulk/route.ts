import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { createActivity } from '@/lib/activity';
import logger from '@/lib/logger';
import { z } from 'zod';

const bulkActionSchema = z.object({
  action: z.enum(['enrich', 'analyze', 'generate-email', 'delete', 'tag', 'update-status']),
  leadIds: z.array(z.string()).min(1).max(500),
  params: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = bulkActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { action, leadIds, params: actionParams } = parsed.data;
    let processed = 0;
    let failed = 0;

    switch (action) {
      case 'delete': {
        const result = await prisma.lead.updateMany({
          where: { id: { in: leadIds }, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        processed = result.count;
        for (const leadId of leadIds) {
          await createActivity({ eventType: 'lead.deleted', leadId, userId: session.userId });
        }
        break;
      }

      case 'update-status': {
        const status = (actionParams as Record<string, string>)?.status;
        if (!status) {
          return NextResponse.json({ success: false, error: 'status param required' }, { status: 400 });
        }
        const result = await prisma.lead.updateMany({
          where: { id: { in: leadIds }, deletedAt: null },
          data: { status },
        });
        processed = result.count;
        for (const leadId of leadIds) {
          await createActivity({ eventType: 'lead.updated', leadId, userId: session.userId, metadata: { status } });
        }
        break;
      }

      case 'tag': {
        const tagName = (actionParams as Record<string, string>)?.tag;
        if (!tagName) {
          return NextResponse.json({ success: false, error: 'tag param required' }, { status: 400 });
        }
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
        });
        for (const leadId of leadIds) {
          try {
            await prisma.leadTag.create({ data: { leadId, tagId: tag.id } });
            processed++;
          } catch {
            // duplicate tag, skip
          }
        }
        break;
      }

      case 'enrich':
      case 'analyze':
      case 'generate-email': {
        // These are queued operations - mark as pending
        for (const leadId of leadIds) {
          try {
            if (action === 'enrich') {
              await prisma.lead.update({ where: { id: leadId }, data: { enrichmentStatus: 'in_progress' } });
              await createActivity({ eventType: 'lead.enrichment.started', leadId, userId: session.userId });
            } else if (action === 'analyze') {
              await createActivity({ eventType: 'lead.ai_analysis.started', leadId, userId: session.userId });
            }
            processed++;
          } catch {
            failed++;
          }
        }
        break;
      }
    }

    return NextResponse.json({
      success: true,
      data: { action, processed, failed, total: leadIds.length },
    });
  } catch (error) {
    logger.error('POST /api/leads/bulk failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
