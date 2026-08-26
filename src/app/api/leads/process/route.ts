import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { createActivity } from '@/lib/activity';
import logger from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { leadIds } = body as { leadIds?: string[] };

    // Find leads that haven't been processed yet
    // "Not processed" = enrichmentStatus is 'none' or 'pending'
    let leadsToProcess: { id: string; fullName?: string; email?: string }[];

    if (leadIds && leadIds.length > 0) {
      // Process specific leads
      const leads = await Promise.all(
        leadIds.map((id) => db.leads.findById(id))
      );
      leadsToProcess = leads
        .filter((l) => l && !l.deletedAt)
        .map((l) => ({ id: l!.id, fullName: l!.fullName as string, email: l!.email as string }));
    } else {
      // Process all unprocessed leads
      const allLeads = await db.leads.findMany({});
      leadsToProcess = allLeads
        .filter(
          (l) =>
            !l.deletedAt &&
            (l.enrichmentStatus === 'none' || l.enrichmentStatus === 'pending' || !l.enrichmentStatus)
        )
        .map((l) => ({ id: l.id, fullName: l.fullName as string, email: l.email as string }));
    }

    if (leadsToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        data: { processedCount: 0, message: 'No unprocessed leads found' },
      });
    }

    // Trigger enrichment for each lead
    // In production this would queue BullMQ jobs; for now we update status
    // and create activities to track the intent
    const results = await Promise.all(
      leadsToProcess.map(async (lead) => {
        try {
          // Update lead status to show it's being processed
          await db.leads.update(lead.id, {
            enrichmentStatus: 'pending',
          });

          // Create enrichment job record
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
            metadata: { source: 'auto-processing', trigger: 'bulk' },
          });

          return { id: lead.id, status: 'queued' };
        } catch (err) {
          logger.error('Failed to queue lead for processing', {
            leadId: lead.id,
            error: err,
          });
          return { id: lead.id, status: 'failed' };
        }
      })
    );

    const queued = results.filter((r) => r.status === 'queued').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    logger.info('Bulk processing triggered', {
      userId: session.userId,
      totalLeads: leadsToProcess.length,
      queued,
      failed,
    });

    return NextResponse.json({
      success: true,
      data: {
        processedCount: queued,
        failedCount: failed,
        totalLeads: leadsToProcess.length,
        message: `${queued} lead(s) queued for processing`,
      },
    });
  } catch (error) {
    logger.error('POST /api/leads/process failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
