import type {
  AIProvider,
  AIAnalysisInput,
  AIAnalysisResult,
  EmailGenerationInput,
  EmailGenerationResult,
} from '@/types';
import logger from '@/lib/logger';

interface OpenRouterConfig {
  defaultModel?: string;
  analysisModel?: string;
  emailModel?: string;
  siteUrl?: string;
  siteName?: string;
}

export class OpenRouterProvider implements AIProvider {
  name = 'openrouter';
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private config: OpenRouterConfig;

  constructor(apiKey: string, config?: OpenRouterConfig) {
    this.apiKey = apiKey;
    this.config = config || {};
  }

  async analyze(input: AIAnalysisInput): Promise<AIAnalysisResult> {
    const model = this.config.analysisModel || this.config.defaultModel || 'anthropic/claude-sonnet-4';

    const systemPrompt = `You are an expert B2B sales intelligence analyst. Your task is to analyze a lead (person and their company) and produce a comprehensive, actionable intelligence report for sales outreach.

You must return ONLY valid JSON with no additional text or markdown formatting. The JSON must follow this exact schema:

{
  "personSummary": "A 2-3 sentence summary of who this person is, their career trajectory, expertise areas, and what makes them notable in their field.",
  "companySummary": "A 2-3 sentence summary of what the company does, their market position, recent developments, and stage/size.",
  "currentContext": "What is this person likely focused on right now based on their role, company stage, and industry trends? What challenges or opportunities are they probably dealing with?",
  "signals": ["List of 3-5 buying signals or trigger events that suggest this person/company might be open to a conversation. These should be specific and actionable, not generic."],
  "painPoints": ["List of 3-5 specific pain points this person likely experiences given their role and company. Be concrete, not generic."],
  "priorities": ["List of 3-5 business priorities this person is likely focused on based on their title, company stage, and industry."],
  "personalizations": ["List of 3-5 specific personalization hooks for outreach. These should reference concrete details about the person, their background, achievements, company news, or shared connections."],
  "outreachAngle": "The single best angle for reaching out to this person. This should be a specific, compelling reason to connect that ties their pain points to a potential solution. 2-3 sentences.",
  "relevanceReasons": ["List of 3-5 reasons why this lead is relevant and worth pursuing. Consider role authority, company fit, timing, and budget indicators."],
  "confidenceScore": 0.75
}

The confidenceScore should be a number between 0 and 1 reflecting how confident you are in the analysis given the available data. Lower scores when data is sparse.

Be specific and insightful. Avoid generic statements like "they might be interested in improving efficiency." Instead, reference specific aspects of their role, company, or industry.`;

    const userPrompt = this.buildAnalysisUserPrompt(input);

    try {
      const response = await this.callOpenRouter(model, systemPrompt, userPrompt);
      const content = response.choices?.[0]?.message?.content || '';
      const usage = response.usage || {};

      // Parse the JSON response
      const parsed = this.parseJsonResponse(content);

      return {
        personSummary: parsed.personSummary || 'Analysis unavailable',
        companySummary: parsed.companySummary || 'Analysis unavailable',
        currentContext: parsed.currentContext || 'Context unavailable',
        signals: parsed.signals || [],
        painPoints: parsed.painPoints || parsed.pain_points || [],
        priorities: parsed.priorities || [],
        personalizations: parsed.personalizations || [],
        outreachAngle: parsed.outreachAngle || parsed.outreach_angle || 'No angle identified',
        relevanceReasons: parsed.relevanceReasons || parsed.relevance_reasons || [],
        confidenceScore: typeof parsed.confidenceScore === 'number'
          ? parsed.confidenceScore
          : typeof parsed.confidence_score === 'number'
            ? parsed.confidence_score
            : 0.5,
        rawResponse: response,
        tokensUsed: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
        model,
      };
    } catch (error) {
      logger.error('OpenRouter analyze failed', { error, model });
      throw error;
    }
  }

  async generateEmail(input: EmailGenerationInput): Promise<EmailGenerationResult> {
    const model = this.config.emailModel || this.config.defaultModel || 'anthropic/claude-sonnet-4';

    const systemPrompt = `You are an expert B2B email copywriter who crafts highly personalized, one-to-one sales emails. Your emails should feel like they were written by a thoughtful human who genuinely researched the recipient, NOT like a template with variables filled in.

You must return ONLY valid JSON with no additional text or markdown formatting:

{
  "subject": "A compelling, personalized subject line. No clickbait. Should reference something specific about the recipient or their company. Keep it under 60 characters. Do NOT use brackets or template variables.",
  "htmlBody": "The email body in clean HTML. Use <p> tags for paragraphs. No heavy formatting, no images, no complex HTML. Should feel like a real email, not a marketing blast. Include a clear but natural CTA.",
  "textBody": "Plain text version of the email. Same content, no HTML tags."
}

Writing guidelines:
- NEVER use template-style language like "I noticed that {{company}}" or "[Your Name]"
- Open with something specific to the recipient, not a generic intro
- Keep the tone conversational and human - write as one professional to another
- Reference specific, real details from the analysis (their role, company news, challenges)
- The value proposition should be woven in naturally, not presented as a sales pitch
- One clear call-to-action, framed as a genuine offer to help
- Keep it concise - busy executives skim emails
- No fluff, no filler phrases like "I hope this email finds you well"
- Sound like a knowledgeable peer, not a salesperson
- The email should make the recipient feel understood, not targeted`;

    const userPrompt = this.buildEmailUserPrompt(input);

    try {
      const response = await this.callOpenRouter(model, systemPrompt, userPrompt);
      const content = response.choices?.[0]?.message?.content || '';
      const usage = response.usage || {};

      const parsed = this.parseJsonResponse(content);

      if (!parsed.subject || (!parsed.htmlBody && !parsed.html_body)) {
        throw new Error('AI response missing required email fields (subject, htmlBody)');
      }

      return {
        subject: parsed.subject,
        htmlBody: parsed.htmlBody || parsed.html_body,
        textBody: parsed.textBody || parsed.text_body || this.stripHtml(parsed.htmlBody || parsed.html_body),
        rawResponse: response,
        tokensUsed: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
        model,
      };
    } catch (error) {
      logger.error('OpenRouter generateEmail failed', { error, model });
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (response.ok) {
        return { success: true, message: 'Connected to OpenRouter successfully' };
      }

      if (response.status === 401) {
        return { success: false, message: 'OpenRouter authentication failed: invalid API key' };
      }

      return { success: false, message: `OpenRouter connection failed: ${response.status}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `OpenRouter connection failed: ${message}` };
    }
  }

  private async callOpenRouter(
    model: string,
    systemPrompt: string,
    userPrompt: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    if (this.config.siteUrl) {
      headers['HTTP-Referer'] = this.config.siteUrl;
    }
    if (this.config.siteName) {
      headers['X-Title'] = this.config.siteName;
    }

    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('OpenRouter API error', { status: response.status, error: errorText, model });
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  private buildAnalysisUserPrompt(input: AIAnalysisInput): string {
    const sections: string[] = [];

    sections.push('=== LEAD DATA ===');
    sections.push(JSON.stringify(input.leadData, null, 2));

    if (input.enrichmentData && Object.keys(input.enrichmentData).length > 0) {
      sections.push('\n=== ENRICHMENT DATA ===');
      sections.push(JSON.stringify(input.enrichmentData, null, 2));
    }

    if (input.linkedinData && Object.keys(input.linkedinData).length > 0) {
      sections.push('\n=== LINKEDIN PROFILE DATA ===');
      sections.push(JSON.stringify(input.linkedinData, null, 2));
    }

    if (input.websiteData && Object.keys(input.websiteData).length > 0) {
      sections.push('\n=== COMPANY WEBSITE DATA ===');
      sections.push(JSON.stringify(input.websiteData, null, 2));
    }

    if (input.companyData && Object.keys(input.companyData).length > 0) {
      sections.push('\n=== COMPANY DATA ===');
      sections.push(JSON.stringify(input.companyData, null, 2));
    }

    sections.push('\nAnalyze this lead and return a comprehensive intelligence report as JSON.');

    return sections.join('\n');
  }

  private buildEmailUserPrompt(input: EmailGenerationInput): string {
    const { leadData, analysis, campaignConfig } = input;
    const sections: string[] = [];

    sections.push('=== RECIPIENT ===');
    sections.push(`Name: ${leadData.fullName || [leadData.firstName, leadData.lastName].filter(Boolean).join(' ') || 'Unknown'}`);
    if (leadData.jobTitle) sections.push(`Title: ${leadData.jobTitle}`);
    if (leadData.companyName) sections.push(`Company: ${leadData.companyName}`);
    if (leadData.industry) sections.push(`Industry: ${leadData.industry}`);
    if (leadData.location) sections.push(`Location: ${leadData.location}`);
    if (leadData.companySize) sections.push(`Company Size: ${leadData.companySize}`);

    sections.push('\n=== INTELLIGENCE ANALYSIS ===');
    sections.push(`Person Summary: ${analysis.personSummary}`);
    sections.push(`Company Summary: ${analysis.companySummary}`);
    sections.push(`Current Context: ${analysis.currentContext}`);
    sections.push(`Best Outreach Angle: ${analysis.outreachAngle}`);
    if (analysis.signals.length > 0) {
      sections.push(`Key Signals: ${analysis.signals.join('; ')}`);
    }
    if (analysis.painPoints.length > 0) {
      sections.push(`Pain Points: ${analysis.painPoints.join('; ')}`);
    }
    if (analysis.personalizations.length > 0) {
      sections.push(`Personalization Hooks: ${analysis.personalizations.join('; ')}`);
    }

    sections.push('\n=== CAMPAIGN PARAMETERS ===');
    if (campaignConfig.objective) sections.push(`Objective: ${campaignConfig.objective}`);
    if (campaignConfig.targetAudience) sections.push(`Target Audience: ${campaignConfig.targetAudience}`);
    if (campaignConfig.productDescription) sections.push(`Product/Service: ${campaignConfig.productDescription}`);
    if (campaignConfig.valueProposition) sections.push(`Value Proposition: ${campaignConfig.valueProposition}`);
    if (campaignConfig.tone) sections.push(`Tone: ${campaignConfig.tone}`);
    if (campaignConfig.emailLength) sections.push(`Length: ${campaignConfig.emailLength}`);
    if (campaignConfig.cta) sections.push(`Call to Action: ${campaignConfig.cta}`);
    if (campaignConfig.senderName) sections.push(`Sender Name: ${campaignConfig.senderName}`);
    if (campaignConfig.senderCompany) sections.push(`Sender Company: ${campaignConfig.senderCompany}`);
    if (campaignConfig.customInstructions) {
      sections.push(`\nAdditional Instructions: ${campaignConfig.customInstructions}`);
    }

    sections.push('\nWrite a highly personalized email for this specific recipient based on the intelligence analysis. Return as JSON.');

    return sections.join('\n');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseJsonResponse(content: string): any {
    // Try direct parse first
    try {
      return JSON.parse(content);
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch {
          // Continue to fallback
        }
      }

      // Try to find JSON object in the response
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch {
          // Continue to fallback
        }
      }

      logger.error('Failed to parse AI JSON response', { content: content.substring(0, 500) });
      throw new Error('Failed to parse AI response as JSON');
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
