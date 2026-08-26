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
      aiAnalyses: { limit: 1, where: { status: 'completed' } },
    });

    if (!lead || lead.deletedAt) {
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
    const analyses = (lead.aiAnalyses as Array<Record<string, unknown>>) || [];
    const analysis = analyses[0];

    if (!analysis) {
      return NextResponse.json({ success: false, error: 'Lead has no AI analysis. Run analysis first.' }, { status: 400 });
    }

    const aiProvider = getAIProvider();
    const result = await aiProvider.generateEmail({
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
      analysis: {
        personSummary: (analysis.personSummary as string) || '',
        companySummary: (analysis.companySummary as string) || '',
        currentContext: (analysis.currentContext as string) || '',
        signals: (analysis.signals as string[]) || [],
        painPoints: (analysis.painPoints as string[]) || [],
        priorities: (analysis.priorities as string[]) || [],
        personalizations: (analysis.personalizations as string[]) || [],
        outreachAngle: (analysis.outreachAngle as string) || '',
        relevanceReasons: (analysis.relevanceReasons as string[]) || [],
        confidenceScore: (analysis.confidenceScore as number) || 0,
        rawResponse: {},
        model: analysis.model as string,
      },
      campaignConfig,
    });

    const email = await db.emailMessages.create({
      leadId: lead.id,
      campaignId: body.campaignId || null,
      subject: result.subject,
      htmlBody: result.htmlBody,
      textBody: result.textBody,
      aiModel: model,
      aiPrompt: campaignConfig,
      aiRawResponse: result.rawResponse,
      status: 'generated',
      recipientEmail: lead.email,
      recipientName: lead.fullName,
      senderName: campaignConfig.senderName || null,
      senderEmail: body.senderEmail || null,
    });

    await db.leads.update(lead.id, { outreachStatus: 'draft' });
    await createActivity({ eventType: 'email.generated', leadId: lead.id, emailMessageId: email.id, userId: session.userId, metadata: { model, subject: result.subject } });

    return NextResponse.json({ success: true, data: email }, { status: 201 });
  } catch (error) {
    logger.error('POST /api/leads/[id]/generate-email failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
