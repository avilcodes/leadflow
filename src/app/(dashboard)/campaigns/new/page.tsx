'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { createCampaign } from '@/lib/api';

export default function NewCampaignPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    description: '',
    senderName: '',
    senderEmail: '',
    replyToEmail: '',
    objective: '',
    targetAudience: '',
    productDescription: '',
    valueProposition: '',
    tone: 'professional',
    emailLength: 'medium',
    cta: '',
    customInstructions: '',
    aiModel: '',
    sendingWindow: '09:00-17:00',
    timezone: 'UTC',
    maxPerHour: '',
    maxPerDay: '',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { ...form };
      if (form.maxPerHour) payload.maxPerHour = parseInt(form.maxPerHour);
      else delete payload.maxPerHour;
      if (form.maxPerDay) payload.maxPerDay = parseInt(form.maxPerDay);
      else delete payload.maxPerDay;
      return createCampaign(payload);
    },
    onSuccess: (res) => {
      toast.success('Campaign created');
      const data = res.data as { id: string } | undefined;
      router.push(data?.id ? `/campaigns/${data.id}` : '/campaigns');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create campaign');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Campaign name is required');
      return;
    }
    mutation.mutate();
  };

  const updateField = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/campaigns')} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Create Campaign</h1>
          <p className="text-surface-400 mt-1">
            Set up a new outreach campaign with AI-generated emails
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic info */}
        <section className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">Campaign Details</h2>
          <div>
            <label className="label">Campaign Name *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Q1 2025 Outbound - Series A Startups"
              required
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input min-h-[80px] resize-y"
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Brief description of this campaign's purpose"
              rows={3}
            />
          </div>
        </section>

        {/* Sender config */}
        <section className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">Sender Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Sender Name</label>
              <input
                className="input"
                value={form.senderName}
                onChange={(e) => updateField('senderName', e.target.value)}
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="label">Sender Email</label>
              <input
                className="input"
                type="email"
                value={form.senderEmail}
                onChange={(e) => updateField('senderEmail', e.target.value)}
                placeholder="jane@company.com"
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Reply-To Email</label>
              <input
                className="input"
                type="email"
                value={form.replyToEmail}
                onChange={(e) => updateField('replyToEmail', e.target.value)}
                placeholder="replies@company.com (optional, defaults to sender)"
              />
            </div>
          </div>
        </section>

        {/* AI configuration */}
        <section className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">AI Email Configuration</h2>
          <div>
            <label className="label">Campaign Objective</label>
            <textarea
              className="input min-h-[80px] resize-y"
              value={form.objective}
              onChange={(e) => updateField('objective', e.target.value)}
              placeholder="Book a 15-minute discovery call to discuss how our platform can help..."
              rows={2}
            />
          </div>
          <div>
            <label className="label">Target Audience</label>
            <textarea
              className="input min-h-[60px] resize-y"
              value={form.targetAudience}
              onChange={(e) => updateField('targetAudience', e.target.value)}
              placeholder="VP/Director-level decision makers at B2B SaaS companies (50-500 employees)"
              rows={2}
            />
          </div>
          <div>
            <label className="label">Product / Service Description</label>
            <textarea
              className="input min-h-[80px] resize-y"
              value={form.productDescription}
              onChange={(e) => updateField('productDescription', e.target.value)}
              placeholder="Describe what you're selling and its key features..."
              rows={3}
            />
          </div>
          <div>
            <label className="label">Value Proposition</label>
            <textarea
              className="input min-h-[60px] resize-y"
              value={form.valueProposition}
              onChange={(e) => updateField('valueProposition', e.target.value)}
              placeholder="How does your product uniquely solve the target audience's problem?"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Tone</label>
              <select
                className="input"
                value={form.tone}
                onChange={(e) => updateField('tone', e.target.value)}
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="friendly">Friendly</option>
                <option value="formal">Formal</option>
                <option value="witty">Witty</option>
                <option value="empathetic">Empathetic</option>
              </select>
            </div>
            <div>
              <label className="label">Email Length</label>
              <select
                className="input"
                value={form.emailLength}
                onChange={(e) => updateField('emailLength', e.target.value)}
              >
                <option value="short">Short (~50-80 words)</option>
                <option value="medium">Medium (~100-150 words)</option>
                <option value="long">Long (~200+ words)</option>
              </select>
            </div>
            <div>
              <label className="label">AI Model</label>
              <select
                className="input"
                value={form.aiModel}
                onChange={(e) => updateField('aiModel', e.target.value)}
              >
                <option value="">Default</option>
                <option value="anthropic/claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                <option value="openai/gpt-4o">GPT-4o</option>
                <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                <option value="google/gemini-pro-1.5">Gemini Pro 1.5</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Call to Action</label>
            <input
              className="input"
              value={form.cta}
              onChange={(e) => updateField('cta', e.target.value)}
              placeholder="Would you be open to a quick 15-minute chat this week?"
            />
          </div>
          <div>
            <label className="label">Custom AI Instructions</label>
            <textarea
              className="input min-h-[80px] resize-y"
              value={form.customInstructions}
              onChange={(e) => updateField('customInstructions', e.target.value)}
              placeholder="Any additional instructions for the AI when generating emails..."
              rows={3}
            />
          </div>
        </section>

        {/* Sending configuration */}
        <section className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">Sending Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Sending Window</label>
              <input
                className="input"
                value={form.sendingWindow}
                onChange={(e) => updateField('sendingWindow', e.target.value)}
                placeholder="09:00-17:00"
              />
              <p className="text-xs text-surface-500 mt-1">Hours during which emails can be sent</p>
            </div>
            <div>
              <label className="label">Timezone</label>
              <select
                className="input"
                value={form.timezone}
                onChange={(e) => updateField('timezone', e.target.value)}
              >
                <option value="UTC">UTC</option>
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
                <option value="Europe/London">London (GMT)</option>
                <option value="Europe/Paris">Paris (CET)</option>
                <option value="Asia/Kolkata">India (IST)</option>
              </select>
            </div>
            <div>
              <label className="label">Max Emails per Hour</label>
              <input
                className="input"
                type="number"
                value={form.maxPerHour}
                onChange={(e) => updateField('maxPerHour', e.target.value)}
                placeholder="20"
                min="1"
              />
            </div>
            <div>
              <label className="label">Max Emails per Day</label>
              <input
                className="input"
                type="number"
                value={form.maxPerDay}
                onChange={(e) => updateField('maxPerDay', e.target.value)}
                placeholder="100"
                min="1"
              />
            </div>
          </div>
        </section>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/campaigns')}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save as Draft
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
