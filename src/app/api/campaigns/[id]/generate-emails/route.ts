import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
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
    const campaign = await db.campaigns.findById(id);

    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    // Get pending campaign leads
    const campaignLeads = await db.campaignLeads.findMany({
      where: { campaignId: id, status: 'pending' },
    });

    const model = (campaign.aiModel as string) || process.env.OPENROUTER_DEFAULT_MODEL || 'anthropic/claude-sonnet-4';
    const aiProvider = getAIProvider();
    let generated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const cl of campaignLeads) {
      const lead = await db.leads.findById(cl.leadId as string);
      if (!lead) { failed++; continue; }

      // Get latest completed analysis
      const analyses = await db.aiAnalyses.findMany({
        where: { leadId: lead.id, status: 'completed' },
        orderBy: { field: 'createdAt', direction: 'desc' },
        limit: 1,
      });
      const analysis = analyses[0];

      if (!analysis) {
        errors.push(`${lead.fullName || lead.email}: No AI analysis`);
        failed++;
        continue;
      }

      if (lead.doNotContact || lead.unsubscribed || lead.bounced) {
        await db.campaignLeads.update(cl.id, { status: 'skipped' });
        continue;
      }

      try {
        const result = await aiProvider.generateEmail({
          leadData: {
            firstName: (lead.firstName as string) ?? undefined,
            lastName: (lead.lastName as string) ?? undefined,
            fullName: (lead.fullName as string) ?? undefined,
            jobTitle: (lead.jobTitle as string) ?? undefined,
            email: (lead.email as string) ?? undefined,
            companyName: (lead.companyName as string) ?? undefined,
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
          campaignConfig: {
            objective: (campaign.objective as string) || undefined,
            targetAudience: (campaign.targetAudience as string) || undefined,
            productDescription: (campaign.productDescription as string) || undefined,
            valueProposition: (campaign.valueProposition as string) || undefined,
            tone: (campaign.tone as string) || undefined,
            emailLength: (campaign.emailLength as string) || undefined,
            cta: (campaign.cta as string) || undefined,
            customInstructions: (campaign.customInstructions as string) || undefined,
            senderName: (campaign.senderName as string) || undefined,
          },
        });

        await db.emailMessages.create({
          leadId: lead.id,
          campaignId: campaign.id,
          subject: result.subject,
          htmlBody: result.htmlBody,
          textBody: result.textBody,
          aiModel: model,
          aiPrompt: { campaign: campaign.id },
          aiRawResponse: result.rawResponse,
          status: campaign.autoApprove ? 'approved' : 'generated',
          recipientEmail: lead.email,
          recipientName: lead.fullName,
          senderName: campaign.senderName,
          senderEmail: campaign.senderEmail,
          approvedAt: campaign.autoApprove ? new Date() : undefined,
        });

        await db.campaignLeads.update(cl.id, { status: 'email_generated' });
        await createActivity({ eventType: 'email.generated', leadId: lead.id, campaignId: campaign.id, userId: session.userId });
        generated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${lead.fullName || lead.email}: ${msg}`);
        failed++;
      }
    }

    if (generated > 0) {
      await db.campaigns.increment(id, 'emailsGenerated', generated);
    }

    return NextResponse.json({
      success: true,
      data: { generated, failed, errors: errors.slice(0, 10) },
    });
  } catch (error) {
    logger.error('POST /api/campaigns/[id]/generate-emails failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
