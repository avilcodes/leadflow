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
} from 'lucide-react';
import toast from 'react-hot-toast';
import { StatusBadge, Badge } from '@/components/badge';
import { ActivityTimeline } from '@/components/activity-timeline';
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

type TabKey = 'overview' | 'research' | 'analysis' | 'emails' | 'activity';

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [expandedEnrichment, setExpandedEnrichment] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const res = await getActivities({ leadId: id, pageSize: 50 });
      return res.data as { activities: Array<{ id: string; eventType: string; createdAt: string; metadata?: Record<string, unknown>; leadName?: string; campaignName?: string }> };
    },
    enabled: activeTab === 'activity',
  });

  const enrichMutation = useMutation({
    mutationFn: () => enrichLead(id),
    onSuccess: () => {
      toast.success('Enrichment started');
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeLead(id),
    onSuccess: () => {
      toast.success('AI analysis started');
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateEmailMutation = useMutation({
    mutationFn: () => generateEmail(id),
    onSuccess: () => {
      toast.success('Email generation started');
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => updateLead(id, data),
    onSuccess: () => {
      toast.success('Lead updated');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
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
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <LoadingPage />;
  if (!leadRes) return <EmptyState title="Lead not found" />;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const lead: any = leadRes;
  const enrichmentJobs: any[] = lead.enrichmentJobs || [];
  const aiAnalyses: any[] = lead.aiAnalyses || [];
  const emailMessages: any[] = lead.emailMessages || [];
  const leadTags: any[] = lead.leadTags || [];
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const activities = activitiesRes?.activities || [];

  const latestAnalysis = aiAnalyses.find((a) => a.status === 'completed') || aiAnalyses[0];

  const leadName = (lead.fullName as string) ||
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

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'research', label: 'Research' },
    { key: 'analysis', label: 'AI Analysis' },
    { key: 'emails', label: `Emails (${emailMessages.length})` },
    { key: 'activity', label: 'Activity' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/leads')} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{leadName}</h1>
          <div className="flex items-center gap-2 mt-1">
            {lead.jobTitle ? <span className="text-surface-400 text-sm">{String(lead.jobTitle)}</span> : null}
            {lead.companyName ? (
              <>
                <span className="text-surface-600">at</span>
                <span className="text-surface-400 text-sm">{String(lead.companyName)}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={lead.status as string} />
          <StatusBadge status={lead.enrichmentStatus as string} />
          <StatusBadge status={lead.outreachStatus as string} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => enrichMutation.mutate()}
          disabled={enrichMutation.isPending}
          className="btn-secondary btn-sm"
        >
          <Sparkles className="w-4 h-4" />
          Enrich
        </button>
        <button
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending}
          className="btn-secondary btn-sm"
        >
          <Brain className="w-4 h-4" />
          Analyze
        </button>
        <button
          onClick={() => generateEmailMutation.mutate()}
          disabled={generateEmailMutation.isPending}
          className="btn-secondary btn-sm"
        >
          <Mail className="w-4 h-4" />
          Generate Email
        </button>
      </div>

      {/* Tabs */}
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

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lead info */}
          <div className="lg:col-span-2 card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Contact Information</h3>
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
                    <label className="label capitalize">{key.replace(/([A-Z])/g, ' $1')}</label>
                    <input
                      className="input"
                      value={val}
                      onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <InfoRow icon={<Mail className="w-4 h-4" />} label="Email" value={lead.email as string} />
                <InfoRow icon={<Phone className="w-4 h-4" />} label="Phone" value={lead.phone as string} />
                <InfoRow icon={<Briefcase className="w-4 h-4" />} label="Title" value={lead.jobTitle as string} />
                <InfoRow icon={<Building2 className="w-4 h-4" />} label="Company" value={lead.companyName as string} />
                <InfoRow icon={<MapPin className="w-4 h-4" />} label="Location" value={lead.location as string} />
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

          {/* Sidebar info */}
          <div className="space-y-4">
            {/* Tags */}
            <div className="card">
              <h3 className="text-sm font-medium text-surface-300 mb-3">Tags</h3>
              {leadTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {leadTags.map((lt, i) => (
                    <Badge key={i} variant="primary">
                      {lt.tag.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-surface-500">No tags</p>
              )}
            </div>

            {/* Details */}
            <div className="card">
              <h3 className="text-sm font-medium text-surface-300 mb-3">Details</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-surface-500">Source</dt>
                  <dd className="text-surface-200 capitalize">{(lead.source as string) || 'N/A'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-surface-500">Industry</dt>
                  <dd className="text-surface-200">{(lead.industry as string) || 'N/A'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-surface-500">Company Size</dt>
                  <dd className="text-surface-200">{(lead.companySize as string) || 'N/A'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-surface-500">Revenue</dt>
                  <dd className="text-surface-200">{(lead.revenue as string) || 'N/A'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-surface-500">Created</dt>
                  <dd className="text-surface-200">
                    {new Date(lead.createdAt as string).toLocaleDateString()}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Custom fields */}
            {lead.customFields && Object.keys(lead.customFields as object).length > 0 && (
              <div className="card">
                <h3 className="text-sm font-medium text-surface-300 mb-3">Custom Fields</h3>
                <dl className="space-y-2 text-sm">
                  {Object.entries(lead.customFields as Record<string, unknown>).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <dt className="text-surface-500">{k}</dt>
                      <dd className="text-surface-200 truncate max-w-[200px]">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      )}

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
            enrichmentJobs.map((job) => (
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
                        {new Date(job.createdAt as string).toLocaleDateString()}
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="card">
                    <h3 className="text-sm font-medium text-surface-300 mb-3">Person Summary</h3>
                    <p className="text-sm text-surface-200 leading-relaxed">
                      {latestAnalysis.personSummary as string}
                    </p>
                  </div>
                  <div className="card">
                    <h3 className="text-sm font-medium text-surface-300 mb-3">Company Summary</h3>
                    <p className="text-sm text-surface-200 leading-relaxed">
                      {latestAnalysis.companySummary as string}
                    </p>
                  </div>

                  <div className="card">
                    <h3 className="text-sm font-medium text-surface-300 mb-3">Key Signals</h3>
                    <ul className="space-y-2">
                      {((latestAnalysis.signals as string[]) || []).map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-surface-200">
                          <span className="text-primary-400 mt-0.5">&#8226;</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="card">
                    <h3 className="text-sm font-medium text-surface-300 mb-3">Pain Points</h3>
                    <ul className="space-y-2">
                      {((latestAnalysis.painPoints as string[]) || []).map((p, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-surface-200">
                          <span className="text-amber-400 mt-0.5">&#8226;</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="card">
                    <h3 className="text-sm font-medium text-surface-300 mb-3">Priorities</h3>
                    <ul className="space-y-2">
                      {((latestAnalysis.priorities as string[]) || []).map((p, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-surface-200">
                          <span className="text-green-400 mt-0.5">&#8226;</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="card">
                    <h3 className="text-sm font-medium text-surface-300 mb-3">
                      Personalization Opportunities
                    </h3>
                    <ul className="space-y-2">
                      {((latestAnalysis.personalizations as string[]) || []).map((p, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-surface-200">
                          <span className="text-purple-400 mt-0.5">&#8226;</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="lg:col-span-2 card">
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

                  <div className="lg:col-span-2 flex justify-end">
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
            emailMessages.map((email) => (
              <div key={email.id as string} className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-medium text-white">
                      {(email.subject as string) || 'No subject'}
                    </h4>
                    <p className="text-xs text-surface-500 mt-0.5">
                      Step {email.sequenceStep as number} &middot;{' '}
                      {email.aiModel && `Generated by ${email.aiModel as string} &middot; `}
                      {new Date(email.createdAt as string).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={email.status as string} />
                </div>

                {/* Email body preview */}
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

                {/* Email actions */}
                <div className="flex items-center gap-2">
                  {['draft', 'generated', 'edited'].includes(email.status as string) && (
                    <>
                      <button
                        onClick={() =>
                          emailActionMutation.mutate({ emailId: email.id as string, action: 'approved' })
                        }
                        className="btn-secondary btn-sm"
                        disabled={emailActionMutation.isPending}
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() =>
                          emailActionMutation.mutate({ emailId: email.id as string, action: 'rejected' })
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
                        emailActionMutation.mutate({ emailId: email.id as string, action: 'send' })
                      }
                      className="btn-primary btn-sm"
                      disabled={emailActionMutation.isPending}
                    >
                      <Send className="w-3.5 h-3.5" /> Send
                    </button>
                  )}
                  {email.sentAt && (
                    <div className="ml-auto flex items-center gap-3 text-xs text-surface-500">
                      {email.deliveredAt && <span>Delivered</span>}
                      {email.openedAt && <span>Opened</span>}
                      {email.clickedAt && <span>Clicked</span>}
                      {email.repliedAt && (
                        <span className="text-green-400 font-medium">Replied</span>
                      )}
                      {email.bouncedAt && (
                        <span className="text-red-400 font-medium">Bounced</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="card">
          <ActivityTimeline activities={activities} showLead={false} />
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  link,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  link?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-surface-500">{icon}</span>
      <span className="text-sm text-surface-500 w-20">{label}</span>
      {value ? (
        link ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1 truncate"
          >
            {value}
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        ) : (
          <span className="text-sm text-surface-200 truncate">{value}</span>
        )
      ) : (
        <span className="text-sm text-surface-600">-</span>
      )}
    </div>
  );
}
