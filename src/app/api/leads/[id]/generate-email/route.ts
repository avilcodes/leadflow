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
        aiAnalyses: { where: { status: 'completed' }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    if (lead.doNotContact || lead.unsubscribed || lead.bounced) {
      return NextResponse.json({ success: false, error: 'Lead is suppressed or has do-not-contact status' }, { status: 400 });
    }

    const body = await request.json();
    const campaignConfig = {
      objective: body.objective || '',
      targetAudience: body.targetAudience || '',
      productDescription: body.productDescription || '',
      valueProposition: body.valueProposition || '',
      tone: body.tone || 'professional',
      emailLength: body.emailLength || 'medium',
      cta: body.cta || '',
      customInstructions: body.customInstructions || '',
      senderName: body.senderName || '',
      senderCompany: body.senderCompany || '',
    };

    const model = body.model || process.env.OPENROUTER_DEFAULT_MODEL || 'anthropic/claude-sonnet-4';
    const analysis = lead.aiAnalyses[0];

    if (!analysis) {
      return NextResponse.json({ success: false, error: 'Lead has no AI analysis. Run analysis first.' }, { status: 400 });
    }

    const aiProvider = getAIProvider();
    const result = await aiProvider.generateEmail({
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
      analysis: {
        personSummary: analysis.personSummary || '',
        companySummary: analysis.companySummary || '',
        currentContext: analysis.currentContext || '',
        signals: (analysis.signals as string[]) || [],
        painPoints: (analysis.painPoints as string[]) || [],
        priorities: (analysis.priorities as string[]) || [],
        personalizations: (analysis.personalizations as string[]) || [],
        outreachAngle: analysis.outreachAngle || '',
        relevanceReasons: (analysis.relevanceReasons as string[]) || [],
        confidenceScore: analysis.confidenceScore || 0,
        rawResponse: {},
        model: analysis.model,
      },
      campaignConfig,
    });

    const email = await prisma.emailMessage.create({
      data: {
        leadId: lead.id,
        campaignId: body.campaignId || null,
        subject: result.subject,
        htmlBody: result.htmlBody,
        textBody: result.textBody,
        aiModel: model,
        aiPrompt: campaignConfig,
        aiRawResponse: result.rawResponse as object,
        status: 'generated',
        recipientEmail: lead.email,
        recipientName: lead.fullName,
        senderName: campaignConfig.senderName || null,
        senderEmail: body.senderEmail || null,
      },
    });

    await prisma.lead.update({ where: { id: lead.id }, data: { outreachStatus: 'draft' } });
    await createActivity({ eventType: 'email.generated', leadId: lead.id, emailMessageId: email.id, userId: session.userId, metadata: { model, subject: result.subject } });

    return NextResponse.json({ success: true, data: email }, { status: 201 });
  } catch (error) {
    logger.error('POST /api/leads/[id]/generate-email failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
