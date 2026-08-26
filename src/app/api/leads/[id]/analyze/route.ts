import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
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
    const lead = await prisma.lead.findUnique({
      where: { id, deletedAt: null },
      include: {
        enrichmentJobs: { where: { status: 'completed' }, orderBy: { completedAt: 'desc' } },
        aiAnalyses: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const model = body.model || process.env.OPENROUTER_DEFAULT_MODEL || 'anthropic/claude-sonnet-4';

    // Gather enrichment data
    const linkedinData = lead.enrichmentJobs.find(j => j.type === 'linkedin_scrape')?.normalizedOutput;
    const websiteData = lead.enrichmentJobs.find(j => j.type === 'website_scrape')?.normalizedOutput;

    // Create analysis record
    const analysis = await prisma.aiAnalysis.create({
      data: {
        leadId: lead.id,
        provider: 'openrouter',
        model,
        status: 'running',
        inputData: {
          lead: { firstName: lead.firstName, lastName: lead.lastName, fullName: lead.fullName, jobTitle: lead.jobTitle, companyName: lead.companyName, email: lead.email, industry: lead.industry, location: lead.location, website: lead.website },
        } as object,
        startedAt: new Date(),
      },
    });

    await createActivity({ eventType: 'lead.ai_analysis.started', leadId: lead.id, userId: session.userId, metadata: { analysisId: analysis.id, model } });

    // Run analysis asynchronously (but in this request for simplicity - in production use queue)
    try {
      const aiProvider = getAIProvider();
      const result = await aiProvider.analyze({
        leadData: {
          firstName: lead.firstName ?? undefined,
          lastName: lead.lastName ?? undefined,
          fullName: lead.fullName ?? undefined,
          jobTitle: lead.jobTitle ?? undefined,
          email: lead.email ?? undefined,
          companyName: lead.companyName ?? undefined,
          companyDomain: lead.companyDomain ?? undefined,
          industry: lead.industry ?? undefined,
          location: lead.location ?? undefined,
          website: lead.website ?? undefined,
        },
        linkedinData: (linkedinData as Record<string, unknown>) ?? undefined,
        websiteData: (websiteData as Record<string, unknown>) ?? undefined,
      });

      const updated = await prisma.aiAnalysis.update({
        where: { id: analysis.id },
        data: {
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
          rawResponse: result.rawResponse as object,
          tokensUsed: result.tokensUsed,
          completedAt: new Date(),
        },
      });

      await prisma.lead.update({ where: { id: lead.id }, data: { enrichmentStatus: 'completed' } });
      await createActivity({ eventType: 'lead.ai_analysis.completed', leadId: lead.id, userId: session.userId, metadata: { analysisId: analysis.id, confidenceScore: result.confidenceScore } });

      return NextResponse.json({ success: true, data: updated });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'AI analysis failed';
      await prisma.aiAnalysis.update({ where: { id: analysis.id }, data: { status: 'failed', errorMessage: errMsg } });
      await createActivity({ eventType: 'lead.ai_analysis.failed', leadId: lead.id, errorInfo: { message: errMsg } });
      return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
    }
  } catch (error) {
    logger.error('POST /api/leads/[id]/analyze failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
