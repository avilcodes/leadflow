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
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        campaignLeads: {
          where: { status: 'pending' },
          include: {
            lead: {
              include: {
                aiAnalyses: { where: { status: 'completed' }, orderBy: { createdAt: 'desc' }, take: 1 },
              },
            },
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    const model = campaign.aiModel || process.env.OPENROUTER_DEFAULT_MODEL || 'anthropic/claude-sonnet-4';
    const aiProvider = getAIProvider();
    let generated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const cl of campaign.campaignLeads) {
      const lead = cl.lead;
      const analysis = lead.aiAnalyses[0];

      if (!analysis) {
        errors.push(`${lead.fullName || lead.email}: No AI analysis`);
        failed++;
        continue;
      }

      if (lead.doNotContact || lead.unsubscribed || lead.bounced) {
        await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'skipped' } });
        continue;
      }

      try {
        const result = await aiProvider.generateEmail({
          leadData: {
            firstName: lead.firstName ?? undefined,
            lastName: lead.lastName ?? undefined,
            fullName: lead.fullName ?? undefined,
            jobTitle: lead.jobTitle ?? undefined,
            email: lead.email ?? undefined,
            companyName: lead.companyName ?? undefined,
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
          campaignConfig: {
            objective: campaign.objective || undefined,
            targetAudience: campaign.targetAudience || undefined,
            productDescription: campaign.productDescription || undefined,
            valueProposition: campaign.valueProposition || undefined,
            tone: campaign.tone || undefined,
            emailLength: campaign.emailLength || undefined,
            cta: campaign.cta || undefined,
            customInstructions: campaign.customInstructions || undefined,
            senderName: campaign.senderName || undefined,
          },
        });

        await prisma.emailMessage.create({
          data: {
            leadId: lead.id,
            campaignId: campaign.id,
            subject: result.subject,
            htmlBody: result.htmlBody,
            textBody: result.textBody,
            aiModel: model,
            aiPrompt: { campaign: campaign.id } as object,
            aiRawResponse: result.rawResponse as object,
            status: campaign.autoApprove ? 'approved' : 'generated',
            recipientEmail: lead.email,
            recipientName: lead.fullName,
            senderName: campaign.senderName,
            senderEmail: campaign.senderEmail,
            approvedAt: campaign.autoApprove ? new Date() : undefined,
          },
        });

        await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'email_generated' } });
        await createActivity({ eventType: 'email.generated', leadId: lead.id, campaignId: campaign.id, userId: session.userId });
        generated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${lead.fullName || lead.email}: ${msg}`);
        failed++;
      }
    }

    await prisma.campaign.update({
      where: { id },
      data: { emailsGenerated: { increment: generated } },
    });

    return NextResponse.json({
      success: true,
      data: { generated, failed, errors: errors.slice(0, 10) },
    });
  } catch (error) {
    logger.error('POST /api/campaigns/[id]/generate-emails failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
