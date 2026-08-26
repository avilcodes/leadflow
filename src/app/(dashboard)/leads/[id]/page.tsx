'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Pencil,
  Sparkles,
  Brain,
  Mail,
  Send,
  Save,
  X,
  Check,
  XCircle,
  RotateCcw,
  ExternalLink,
  Linkedin,
  Globe,
  Phone,
  MapPin,
  Building2,
  Briefcase,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Loader2,
  Clock,
  Calendar,
  Hash,
  User,
  Tag,
  FileText,
  Activity,
  Zap,
  Copy,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { StatusBadge, Badge, getStatusVariant } from '@/components/badge';
import { LoadingPage } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import {
  getLead,
  updateLead,
  enrichLead,
  analyzeLead,
  generateEmail,
  updateEmail,
  sendEmail,
  getActivities,
} from '@/lib/api';
import { formatDistanceToNow, format } from 'date-fns';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Activity event config (inline for self-contained rendering) ───

const eventConfig: Record<string, { color: string; label: string; dotColor: string }> = {
  'lead.created': { color: 'text-green-400', label: 'Lead Created', dotColor: 'bg-green-400' },
  'lead.imported': { color: 'text-blue-400', label: 'Lead Imported', dotColor: 'bg-blue-400' },
  'lead.updated': { color: 'text-surface-300', label: 'Lead Updated', dotColor: 'bg-surface-400' },
  'lead.deleted': { color: 'text-red-400', label: 'Lead Deleted', dotColor: 'bg-red-400' },
  'lead.enrichment.started': { color: 'text-amber-400', label: 'Enrichment Started', dotColor: 'bg-amber-400' },
  'lead.enrichment.completed': { color: 'text-green-400', label: 'Enrichment Completed', dotColor: 'bg-green-400' },
  'lead.enrichment.failed': { color: 'text-red-400', label: 'Enrichment Failed', dotColor: 'bg-red-400' },
  'lead.linkedin_scraped': { color: 'text-blue-400', label: 'LinkedIn Scraped', dotColor: 'bg-blue-400' },
  'lead.website_scraped': { color: 'text-cyan-400', label: 'Website Scraped', dotColor: 'bg-cyan-400' },
  'lead.ai_analysis.started': { color: 'text-purple-400', label: 'AI Analysis Started', dotColor: 'bg-purple-400' },
  'lead.ai_analysis.completed': { color: 'text-green-400', label: 'AI Analysis Completed', dotColor: 'bg-green-400' },
  'lead.ai_analysis.failed': { color: 'text-red-400', label: 'AI Analysis Failed', dotColor: 'bg-red-400' },
  'email.generated': { color: 'text-blue-400', label: 'Email Generated', dotColor: 'bg-blue-400' },
  'email.edited': { color: 'text-surface-300', label: 'Email Edited', dotColor: 'bg-surface-400' },
  'email.approved': { color: 'text-green-400', label: 'Email Approved', dotColor: 'bg-green-400' },
  'email.rejected': { color: 'text-red-400', label: 'Email Rejected', dotColor: 'bg-red-400' },
  'email.sent': { color: 'text-primary-400', label: 'Email Sent', dotColor: 'bg-primary-400' },
  'email.delivered': { color: 'text-green-400', label: 'Email Delivered', dotColor: 'bg-green-400' },
  'email.opened': { color: 'text-purple-400', label: 'Email Opened', dotColor: 'bg-purple-400' },
  'email.clicked': { color: 'text-cyan-400', label: 'Link Clicked', dotColor: 'bg-cyan-400' },
  'email.replied': { color: 'text-green-400', label: 'Reply Received', dotColor: 'bg-green-400' },
  'email.bounced': { color: 'text-red-400', label: 'Email Bounced', dotColor: 'bg-red-400' },
  'email.unsubscribed': { color: 'text-amber-400', label: 'Unsubscribed', dotColor: 'bg-amber-400' },
  'campaign.created': { color: 'text-blue-400', label: 'Campaign Created', dotColor: 'bg-blue-400' },
  'campaign.started': { color: 'text-green-400', label: 'Campaign Started', dotColor: 'bg-green-400' },
  'campaign.paused': { color: 'text-amber-400', label: 'Campaign Paused', dotColor: 'bg-amber-400' },
  'campaign.resumed': { color: 'text-blue-400', label: 'Campaign Resumed', dotColor: 'bg-blue-400' },
  'campaign.completed': { color: 'text-green-400', label: 'Campaign Completed', dotColor: 'bg-green-400' },
  'campaign.failed': { color: 'text-red-400', label: 'Campaign Failed', dotColor: 'bg-red-400' },
};

function getEventConfig(eventType: string) {
  return eventConfig[eventType] || { color: 'text-surface-400', label: eventType, dotColor: 'bg-surface-500' };
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'overview' | 'research' | 'analysis' | 'emails' | 'activity'>('overview');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [expandedEnrichment, setExpandedEnrichment] = useState<string | null>(null);

  const { data: leadRes, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      const res = await getLead(id);
      return res.data as any;
    },
  });

  const { data: activitiesRes } = useQuery({
    queryKey: ['activities', 'lead', id],
    queryFn: async () => {
      const res = await getActivities({ leadId: id, pageSize: 100 });
      return res.data as {
        activities: Array<{
          id: string;
          eventType: string;
          createdAt: string;
          metadata?: Record<string, unknown>;
          leadName?: string;
          campaignName?: string;
        }>;
      };
    },
  });

  const enrichMutation = useMutation({
    mutationFn: () => enrichLead(id),
    onSuccess: () => {
      toast.success('Enrichment started');
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['activities', 'lead', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeLead(id),
    onSuccess: () => {
      toast.success('AI analysis started');
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['activities', 'lead', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateEmailMutation = useMutation({
    mutationFn: () => generateEmail(id),
    onSuccess: () => {
      toast.success('Email generation started');
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['activities', 'lead', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => updateLead(id, data),
    onSuccess: () => {
      toast.success('Lead updated');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['activities', 'lead', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emailActionMutation = useMutation({
    mutationFn: async ({ emailId, action }: { emailId: string; action: string }) => {
      if (action === 'send') {
        return sendEmail(emailId);
      }
      return updateEmail(emailId, { status: action });
    },
    onSuccess: () => {
      toast.success('Email updated');
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['activities', 'lead', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <LoadingPage />;
  if (!leadRes) return <EmptyState title="Lead not found" />;

  const lead: any = leadRes;
  const enrichmentJobs: any[] = lead.enrichmentJobs || [];
  const aiAnalyses: any[] = lead.aiAnalyses || [];
  const emailMessages: any[] = lead.emailMessages || [];
  const leadTags: any[] = lead.leadTags || [];
  const activities = activitiesRes?.activities || [];
  const campaignLeads: any[] = lead.campaignLeads || [];

  const latestAnalysis = aiAnalyses.find((a: any) => a.status === 'completed') || aiAnalyses[0];

  const leadName =
    (lead.fullName as string) ||
    `${lead.firstName || ''} ${lead.lastName || ''}`.trim() ||
    (lead.email as string) ||
    'Unknown';

  const startEditing = () => {
    setEditForm({
      firstName: (lead.firstName as string) || '',
      lastName: (lead.lastName as string) || '',
      email: (lead.email as string) || '',
      phone: (lead.phone as string) || '',
      jobTitle: (lead.jobTitle as string) || '',
      companyName: (lead.companyName as string) || '',
      linkedinUrl: (lead.linkedinUrl as string) || '',
      website: (lead.website as string) || '',
      location: (lead.location as string) || '',
    });
    setEditing(true);
  };

  const formatDate = (dateStr: string | Date | null | undefined) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr as string), 'MMM d, yyyy h:mm a');
    } catch {
      return '-';
    }
  };

  const formatRelative = (dateStr: string | Date | null | undefined) => {
    if (!dateStr) return '';
    try {
      return formatDistanceToNow(new Date(dateStr as string), { addSuffix: true });
    } catch {
      return '';
    }
  };

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'research' as const, label: 'Research' },
    { key: 'analysis' as const, label: 'AI Analysis' },
    { key: 'emails' as const, label: `Emails (${emailMessages.length})` },
    { key: 'activity' as const, label: `Activity (${activities.length})` },
  ];

  // ─── Processing status summary ───
  const processingSteps = [
    {
      label: 'Enrichment',
      status: lead.enrichmentStatus as string || 'none',
      icon: Sparkles,
    },
    {
      label: 'AI Analysis',
      status: aiAnalyses.length > 0 ? (latestAnalysis?.status as string || 'none') : 'none',
      icon: Brain,
    },
    {
      label: 'Email',
      status: emailMessages.length > 0 ? (emailMessages[0]?.status as string || 'none') : 'none',
      icon: Mail,
    },
    {
      label: 'Outreach',
      status: lead.outreachStatus as string || 'none',
      icon: Send,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.push('/leads')} className="btn-ghost p-2 mt-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{leadName}</h1>
            <StatusBadge status={lead.status as string} />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {lead.jobTitle && (
              <span className="text-surface-400 text-sm">{String(lead.jobTitle)}</span>
            )}
            {lead.companyName && (
              <>
                <span className="text-surface-600">at</span>
                <span className="text-surface-400 text-sm font-medium">{String(lead.companyName)}</span>
              </>
            )}
            {lead.location && (
              <>
                <span className="text-surface-600">·</span>
                <span className="text-surface-500 text-sm flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {String(lead.location)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── Processing Pipeline Status ─── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-surface-300 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary-400" />
            Processing Pipeline
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => enrichMutation.mutate()}
              disabled={enrichMutation.isPending}
              className="btn-secondary btn-sm"
            >
              {enrichMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Enrich
            </button>
            <button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              className="btn-secondary btn-sm"
            >
              {analyzeMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Brain className="w-3.5 h-3.5" />
              )}
              Analyze
            </button>
            <button
              onClick={() => generateEmailMutation.mutate()}
              disabled={generateEmailMutation.isPending}
              className="btn-secondary btn-sm"
            >
              {generateEmailMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Mail className="w-3.5 h-3.5" />
              )}
              Generate Email
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {processingSteps.map((step) => {
            const Icon = step.icon;
            const variant = getStatusVariant(step.status);
            return (
              <div
                key={step.label}
                className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/50 border border-surface-700/50"
              >
                <div className={`flex items-center justify-center w-9 h-9 rounded-lg bg-surface-800`}>
                  <Icon className="w-4 h-4 text-surface-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-surface-500">{step.label}</p>
                  <Badge variant={variant} dot>
                    {step.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className="border-b border-surface-800">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-surface-400 hover:text-white hover:border-surface-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── OVERVIEW TAB ─── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Information */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-surface-400" />
                  Contact Information
                </h3>
                {editing ? (
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(false)} className="btn-ghost btn-sm">
                      <X className="w-4 h-4" /> Cancel
                    </button>
                    <button
                      onClick={() => saveMutation.mutate(editForm)}
                      disabled={saveMutation.isPending}
                      className="btn-primary btn-sm"
                    >
                      <Save className="w-4 h-4" /> Save
                    </button>
                  </div>
                ) : (
                  <button onClick={startEditing} className="btn-ghost btn-sm">
                    <Pencil className="w-4 h-4" /> Edit
                  </button>
                )}
              </div>

              {editing ? (
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(editForm).map(([key, val]) => (
                    <div key={key}>
                      <label className="label capitalize">
                        {key.replace(/([A-Z])/g, ' $1')}
                      </label>
                      <input
                        className="input"
                        value={val}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, [key]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                  <InfoRow icon={<Mail className="w-4 h-4" />} label="Email" value={lead.email as string} copyable />
                  <InfoRow icon={<Phone className="w-4 h-4" />} label="Phone" value={lead.phone as string} copyable />
                  <InfoRow icon={<Briefcase className="w-4 h-4" />} label="Title" value={lead.jobTitle as string} />
                  <InfoRow icon={<Building2 className="w-4 h-4" />} label="Company" value={lead.companyName as string} />
                  <InfoRow icon={<MapPin className="w-4 h-4" />} label="Location" value={lead.location as string} />
                  <InfoRow icon={<Hash className="w-4 h-4" />} label="Source" value={lead.source as string} />
                  <InfoRow
                    icon={<Linkedin className="w-4 h-4" />}
                    label="LinkedIn"
                    value={lead.linkedinUrl as string}
                    link
                  />
                  <InfoRow
                    icon={<Globe className="w-4 h-4" />}
                    label="Website"
                    value={lead.website as string}
                    link
                  />
                </div>
              )}
            </div>

            {/* Company / Industry Details */}
            <div className="card">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <Building2 className="w-5 h-5 text-surface-400" />
                Company & Industry
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <DetailBox label="Industry" value={lead.industry as string} />
                <DetailBox label="Company Size" value={lead.companySize as string} />
                <DetailBox label="Revenue" value={lead.revenue as string} />
                <DetailBox label="Funding" value={lead.funding as string} />
                <DetailBox label="Company Domain" value={lead.companyDomain as string} />
                <DetailBox label="Company LinkedIn" value={lead.companyLinkedinUrl as string} link />
              </div>
            </div>

            {/* Custom Fields */}
            {lead.customFields && Object.keys(lead.customFields as object).length > 0 && (
              <div className="card">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-surface-400" />
                  Custom Fields
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {Object.entries(lead.customFields as Record<string, unknown>).map(
                    ([k, v]) => (
                      <DetailBox key={k} label={k} value={String(v)} />
                    )
                  )}
                </div>
              </div>
            )}

            {/* Campaigns */}
            {campaignLeads.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                  <Activity className="w-5 h-5 text-surface-400" />
                  Campaigns
                </h3>
                <div className="space-y-2">
                  {campaignLeads.map((cl: any) => (
                    <div
                      key={cl.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-surface-800/50 border border-surface-700/50"
                    >
                      <div>
                        <p className="text-sm font-medium text-surface-200">
                          {cl.campaign?.name || 'Unknown Campaign'}
                        </p>
                        <p className="text-xs text-surface-500 mt-0.5">
                          Added {formatRelative(cl.createdAt)}
                        </p>
                      </div>
                      {cl.campaign?.status && (
                        <StatusBadge status={cl.campaign.status as string} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── Sidebar ─── */}
          <div className="space-y-4">
            {/* Tags */}
            <div className="card">
              <h3 className="text-sm font-medium text-surface-300 mb-3 flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Tags
              </h3>
              {leadTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {leadTags.map((lt: any, i: number) => (
                    <Badge key={i} variant="primary">
                      {lt.tag?.name || 'Unknown'}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-surface-500">No tags</p>
              )}
            </div>

            {/* Timestamps */}
            <div className="card">
              <h3 className="text-sm font-medium text-surface-300 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Timestamps
              </h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-surface-500 text-xs uppercase tracking-wide">Created</dt>
                  <dd className="text-surface-200 mt-0.5">
                    {formatDate(lead.createdAt)}
                  </dd>
                  <dd className="text-surface-500 text-xs">{formatRelative(lead.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-surface-500 text-xs uppercase tracking-wide">Last Updated</dt>
                  <dd className="text-surface-200 mt-0.5">
                    {formatDate(lead.updatedAt)}
                  </dd>
                  <dd className="text-surface-500 text-xs">{formatRelative(lead.updatedAt)}</dd>
                </div>
              </dl>
            </div>

            {/* Quick Activity Feed (last 5) */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-surface-300 flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Recent Activity
                </h3>
                {activities.length > 5 && (
                  <button
                    onClick={() => setActiveTab('activity')}
                    className="text-xs text-primary-400 hover:text-primary-300"
                  >
                    View all
                  </button>
                )}
              </div>
              {activities.length === 0 ? (
                <p className="text-sm text-surface-500 text-center py-4">No activity yet</p>
              ) : (
                <div className="space-y-0 relative">
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-surface-800" />
                  {activities.slice(0, 5).map((a) => {
                    const config = getEventConfig(a.eventType);
                    return (
                      <div key={a.id} className="relative flex gap-3 py-2">
                        <div className={`relative z-10 mt-1 w-[15px] h-[15px] rounded-full flex-shrink-0 ${config.dotColor} ring-2 ring-surface-900`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${config.color}`}>
                            {config.label}
                          </p>
                          <p className="text-xs text-surface-500">{formatRelative(a.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── RESEARCH TAB ─── */}
      {activeTab === 'research' && (
        <div className="space-y-4">
          {enrichmentJobs.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="w-8 h-8" />}
              title="No enrichment data"
              description="Enrich this lead to gather LinkedIn, website, and company data."
              action={
                <button onClick={() => enrichMutation.mutate()} className="btn-primary btn-sm">
                  <Sparkles className="w-4 h-4" /> Start Enrichment
                </button>
              }
            />
          ) : (
            enrichmentJobs.map((job: any) => (
              <div key={job.id as string} className="card">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() =>
                    setExpandedEnrichment(
                      expandedEnrichment === (job.id as string) ? null : (job.id as string)
                    )
                  }
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-800">
                      {(job.type as string) === 'linkedin_scrape' ? (
                        <Linkedin className="w-5 h-5 text-blue-400" />
                      ) : (
                        <Globe className="w-5 h-5 text-cyan-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white capitalize">
                        {(job.type as string).replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-surface-500">
                        via {job.provider as string} &middot;{' '}
                        {formatDate(job.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={job.status as string} />
                    {expandedEnrichment === (job.id as string) ? (
                      <ChevronDown className="w-4 h-4 text-surface-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-surface-400" />
                    )}
                  </div>
                </div>
                {expandedEnrichment === (job.id as string) && job.normalizedOutput && (
                  <div className="mt-4 pt-4 border-t border-surface-800">
                    <pre className="text-xs text-surface-300 overflow-x-auto whitespace-pre-wrap bg-surface-950 rounded-lg p-4 max-h-96 scrollbar-thin">
                      {JSON.stringify(job.normalizedOutput, null, 2)}
                    </pre>
                  </div>
                )}
                {expandedEnrichment === (job.id as string) && job.errorMessage && (
                  <div className="mt-4 pt-4 border-t border-surface-800">
                    <div className="flex items-center gap-2 text-sm text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      {job.errorMessage as string}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── AI ANALYSIS TAB ─── */}
      {activeTab === 'analysis' && (
        <div className="space-y-6">
          {!latestAnalysis ? (
            <EmptyState
              icon={<Brain className="w-8 h-8" />}
              title="No AI analysis yet"
              description="Run AI analysis to get insights, pain points, and outreach recommendations."
              action={
                <button onClick={() => analyzeMutation.mutate()} className="btn-primary btn-sm">
                  <Brain className="w-4 h-4" /> Run Analysis
                </button>
              }
            />
          ) : (
            <>
              {latestAnalysis.status === 'running' && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-primary-500/10 border border-primary-500/20">
                  <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />
                  <p className="text-sm text-primary-300">Analysis in progress...</p>
                </div>
              )}
              {latestAnalysis.status === 'failed' && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <p className="text-sm text-red-300">
                    Analysis failed: {latestAnalysis.errorMessage as string}
                  </p>
                  <button onClick={() => analyzeMutation.mutate()} className="btn-secondary btn-sm ml-auto">
                    <RotateCcw className="w-3 h-3" /> Retry
                  </button>
                </div>
              )}
              {latestAnalysis.status === 'completed' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <AnalysisCard title="Person Summary" color="primary">
                      <p className="text-sm text-surface-200 leading-relaxed">
                        {latestAnalysis.personSummary as string}
                      </p>
                    </AnalysisCard>
                    <AnalysisCard title="Company Summary" color="blue">
                      <p className="text-sm text-surface-200 leading-relaxed">
                        {latestAnalysis.companySummary as string}
                      </p>
                    </AnalysisCard>
                    <AnalysisCard title="Key Signals" color="primary">
                      <BulletList items={latestAnalysis.signals as string[]} color="text-primary-400" />
                    </AnalysisCard>
                    <AnalysisCard title="Pain Points" color="amber">
                      <BulletList items={latestAnalysis.painPoints as string[]} color="text-amber-400" />
                    </AnalysisCard>
                    <AnalysisCard title="Priorities" color="green">
                      <BulletList items={latestAnalysis.priorities as string[]} color="text-green-400" />
                    </AnalysisCard>
                    <AnalysisCard title="Personalization Opportunities" color="purple">
                      <BulletList items={latestAnalysis.personalizations as string[]} color="text-purple-400" />
                    </AnalysisCard>
                  </div>

                  <div className="card">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-surface-300">
                        Recommended Outreach Angle
                      </h3>
                      {latestAnalysis.confidenceScore != null && (
                        <Badge variant="primary">
                          Confidence: {Math.round((latestAnalysis.confidenceScore as number) * 100)}%
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-surface-200 leading-relaxed">
                      {latestAnalysis.outreachAngle as string}
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <button onClick={() => analyzeMutation.mutate()} className="btn-secondary btn-sm">
                      <RotateCcw className="w-4 h-4" /> Re-analyze
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── EMAILS TAB ─── */}
      {activeTab === 'emails' && (
        <div className="space-y-4">
          {emailMessages.length === 0 ? (
            <EmptyState
              icon={<Mail className="w-8 h-8" />}
              title="No emails generated"
              description="Generate a personalized email for this lead based on AI analysis."
              action={
                <button onClick={() => generateEmailMutation.mutate()} className="btn-primary btn-sm">
                  <Mail className="w-4 h-4" /> Generate Email
                </button>
              }
            />
          ) : (
            emailMessages.map((email: any) => (
              <div key={email.id as string} className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-medium text-white">
                      {(email.subject as string) || 'No subject'}
                    </h4>
                    <p className="text-xs text-surface-500 mt-0.5">
                      Step {email.sequenceStep as number} &middot;{' '}
                      {email.aiModel && `${email.aiModel as string} · `}
                      {formatDate(email.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={email.status as string} />
                </div>

                <div className="bg-surface-950 rounded-lg p-4 mb-4 max-h-60 overflow-y-auto scrollbar-thin">
                  {email.htmlBody ? (
                    <div
                      className="text-sm text-surface-300 prose prose-invert prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: email.htmlBody as string }}
                    />
                  ) : (
                    <p className="text-sm text-surface-300 whitespace-pre-wrap">
                      {(email.textBody as string) || 'No content'}
                    </p>
                  )}
                </div>

                {/* Email tracking events */}
                {email.sentAt && (
                  <div className="flex items-center gap-3 mb-3 px-1">
                    <span className="text-xs text-surface-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Sent {formatDate(email.sentAt)}
                    </span>
                    {email.deliveredAt && (
                      <Badge variant="success" className="text-[10px]">Delivered</Badge>
                    )}
                    {email.openedAt && (
                      <Badge variant="purple" className="text-[10px]">Opened</Badge>
                    )}
                    {email.clickedAt && (
                      <Badge variant="info" className="text-[10px]">Clicked</Badge>
                    )}
                    {email.repliedAt && (
                      <Badge variant="success" className="text-[10px]">Replied</Badge>
                    )}
                    {email.bouncedAt && (
                      <Badge variant="danger" className="text-[10px]">Bounced</Badge>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {['draft', 'generated', 'edited'].includes(email.status as string) && (
                    <>
                      <button
                        onClick={() =>
                          emailActionMutation.mutate({
                            emailId: email.id as string,
                            action: 'approved',
                          })
                        }
                        className="btn-secondary btn-sm"
                        disabled={emailActionMutation.isPending}
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() =>
                          emailActionMutation.mutate({
                            emailId: email.id as string,
                            action: 'rejected',
                          })
                        }
                        className="btn-ghost btn-sm text-red-400"
                        disabled={emailActionMutation.isPending}
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </>
                  )}
                  {email.status === 'approved' && (
                    <button
                      onClick={() =>
                        emailActionMutation.mutate({
                          emailId: email.id as string,
                          action: 'send',
                        })
                      }
                      className="btn-primary btn-sm"
                      disabled={emailActionMutation.isPending}
                    >
                      <Send className="w-3.5 h-3.5" /> Send
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── ACTIVITY TAB ─── */}
      {activeTab === 'activity' && (
        <div className="card">
          {activities.length === 0 ? (
            <p className="text-sm text-surface-500 text-center py-8">No activity yet</p>
          ) : (
            <div className="relative">
              <div className="absolute left-5 top-3 bottom-3 w-px bg-surface-800" />
              <div className="space-y-0">
                {activities.map((a) => {
                  const config = getEventConfig(a.eventType);
                  return (
                    <div key={a.id} className="relative flex gap-4 py-3 px-2">
                      <div
                        className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 bg-surface-800`}
                      >
                        <div className={`w-3 h-3 rounded-full ${config.dotColor}`} />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm font-medium ${config.color}`}>
                            {config.label}
                          </p>
                          <div className="flex items-center gap-2">
                            {a.eventType.includes('completed') && (
                              <Badge variant="success">Completed</Badge>
                            )}
                            {a.eventType.includes('failed') && (
                              <Badge variant="danger">Failed</Badge>
                            )}
                            {a.eventType.includes('started') && (
                              <Badge variant="warning">In Progress</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-surface-400">
                            {formatDate(a.createdAt)}
                          </span>
                          <span className="text-xs text-surface-600">·</span>
                          <span className="text-xs text-surface-500">
                            {formatRelative(a.createdAt)}
                          </span>
                        </div>
                        {a.metadata && Object.keys(a.metadata).length > 0 && (
                          <div className="mt-1.5 text-xs text-surface-500 space-y-0.5">
                            {a.metadata.error ? (
                              <p className="text-red-400">Error: {String(a.metadata.error)}</p>
                            ) : null}
                            {a.metadata.provider ? (
                              <p>Provider: {String(a.metadata.provider)}</p>
                            ) : null}
                            {a.metadata.source ? (
                              <p>Source: {String(a.metadata.source)}</p>
                            ) : null}
                            {a.metadata.updatedFields ? (
                              <p>
                                Updated:{' '}
                                {(a.metadata.updatedFields as string[]).join(', ')}
                              </p>
                            ) : null}
                            {a.metadata.trigger ? (
                              <p>Trigger: {String(a.metadata.trigger)}</p>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function InfoRow({
  icon,
  label,
  value,
  link,
  copyable,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  link?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-1 group">
      <span className="text-surface-500">{icon}</span>
      <span className="text-sm text-surface-500 w-20 flex-shrink-0">{label}</span>
      {value ? (
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {link ? (
            <a
              href={value.startsWith('http') ? value : `https://${value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1 truncate"
            >
              <span className="truncate">{value}</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          ) : (
            <span className="text-sm text-surface-200 truncate">{value}</span>
          )}
          {copyable && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(value);
                toast.success('Copied');
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-surface-700"
            >
              <Copy className="w-3 h-3 text-surface-500" />
            </button>
          )}
        </div>
      ) : (
        <span className="text-sm text-surface-600">—</span>
      )}
    </div>
  );
}

function DetailBox({
  label,
  value,
  link,
}: {
  label: string;
  value?: string | null;
  link?: boolean;
}) {
  return (
    <div className="p-3 rounded-lg bg-surface-800/50 border border-surface-700/50">
      <p className="text-xs text-surface-500 mb-1">{label}</p>
      {value ? (
        link ? (
          <a
            href={value.startsWith('http') ? value : `https://${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1 truncate"
          >
            <span className="truncate">{value}</span>
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        ) : (
          <p className="text-sm text-surface-200 truncate">{value}</p>
        )
      ) : (
        <p className="text-sm text-surface-600">—</p>
      )}
    </div>
  );
}

function AnalysisCard({
  title,
  children,
}: {
  title: string;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <h3 className="text-sm font-medium text-surface-300 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function BulletList({ items, color }: { items?: string[]; color: string }) {
  if (!items || items.length === 0)
    return <p className="text-sm text-surface-500">None available</p>;

  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-surface-200">
          <span className={`${color} mt-0.5`}>&#8226;</span>
          {item}
        </li>
      ))}
    </ul>
  );
}
