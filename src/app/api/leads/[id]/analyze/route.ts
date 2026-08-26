import { NextRequest, NextResponse } from 'next/server';
import db, { getLeadWithRelations } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { createActivity } from '@/lib/activity';
import { getAIProvider } from '@/providers/ai';
import logger from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const lead = await getLeadWithRelations(id, {
      enrichmentJobs: true,
      aiAnalyses: { limit: 1 },
    });

    if (!lead || lead.deletedAt) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const model = body.model || process.env.OPENROUTER_DEFAULT_MODEL || 'anthropic/claude-sonnet-4';

    // Gather enrichment data
    const enrichmentJobs = (lead.enrichmentJobs as Array<Record<string, unknown>>) || [];
    const completedJobs = enrichmentJobs.filter(j => j.status === 'completed');
    const linkedinData = completedJobs.find(j => j.type === 'linkedin_scrape')?.normalizedOutput;
    const websiteData = completedJobs.find(j => j.type === 'website_scrape')?.normalizedOutput;

    // Create analysis record
    const analysis = await db.aiAnalyses.create({
      leadId: lead.id,
      provider: 'openrouter',
      model,
      status: 'running',
      inputData: {
        lead: { firstName: lead.firstName, lastName: lead.lastName, fullName: lead.fullName, jobTitle: lead.jobTitle, companyName: lead.companyName, email: lead.email, industry: lead.industry, location: lead.location, website: lead.website },
      },
      startedAt: new Date(),
    });

    await createActivity({ eventType: 'lead.ai_analysis.started', leadId: lead.id, userId: session.userId, metadata: { analysisId: analysis.id, model } });

    try {
      const aiProvider = getAIProvider();
      const result = await aiProvider.analyze({
        leadData: {
          firstName: (lead.firstName as string) ?? undefined,
          lastName: (lead.lastName as string) ?? undefined,
          fullName: (lead.fullName as string) ?? undefined,
          jobTitle: (lead.jobTitle as string) ?? undefined,
          email: (lead.email as string) ?? undefined,
          companyName: (lead.companyName as string) ?? undefined,
          companyDomain: (lead.companyDomain as string) ?? undefined,
          industry: (lead.industry as string) ?? undefined,
          location: (lead.location as string) ?? undefined,
          website: (lead.website as string) ?? undefined,
        },
        linkedinData: (linkedinData as Record<string, unknown>) ?? undefined,
        websiteData: (websiteData as Record<string, unknown>) ?? undefined,
      });

      const updated = await db.aiAnalyses.update(analysis.id, {
        status: 'completed',
        personSummary: result.personSummary,
        companySummary: result.companySummary,
        currentContext: result.currentContext,
        signals: result.signals,
        painPoints: result.painPoints,
        priorities: result.priorities,
        personalizations: result.personalizations,
        outreachAngle: result.outreachAngle,
        relevanceReasons: result.relevanceReasons,
        confidenceScore: result.confidenceScore,
        rawResponse: result.rawResponse,
        tokensUsed: result.tokensUsed,
        completedAt: new Date(),
      });

      await db.leads.update(lead.id, { enrichmentStatus: 'completed' });
      await createActivity({ eventType: 'lead.ai_analysis.completed', leadId: lead.id, userId: session.userId, metadata: { analysisId: analysis.id, confidenceScore: result.confidenceScore } });

      return NextResponse.json({ success: true, data: updated });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'AI analysis failed';
      await db.aiAnalyses.update(analysis.id, { status: 'failed', errorMessage: errMsg });
      await createActivity({ eventType: 'lead.ai_analysis.failed', leadId: lead.id, errorInfo: { message: errMsg } });
      return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
    }
  } catch (error) {
    logger.error('POST /api/leads/[id]/analyze failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
