'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Users,
  Mail,
  Send,
  Eye,
  MousePointerClick,
  MessageSquare,
  AlertTriangle,
  UserPlus,
  UserMinus,
  Sparkles,
  Check,
  XCircle,
  Loader2,
  Save,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { StatusBadge, Badge } from '@/components/badge';
import { ActivityTimeline } from '@/components/activity-timeline';
import { LoadingPage } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { Modal } from '@/components/modal';
import {
  getCampaign,
  updateCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  deleteCampaign,
  addLeadsToCampaign,
  removeLeadsFromCampaign,
  generateCampaignEmails,
  updateEmail,
  sendEmail as sendEmailApi,
  getLeads,
  getActivities,
} from '@/lib/api';

type TabKey = 'leads' | 'emails' | 'settings' | 'activity';

interface CampaignData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  senderName: string | null;
  senderEmail: string | null;
  replyToEmail: string | null;
  objective: string | null;
  targetAudience: string | null;
  productDescription: string | null;
  valueProposition: string | null;
  tone: string | null;
  emailLength: string | null;
  cta: string | null;
  customInstructions: string | null;
  aiModel: string | null;
  sendingWindow: string | null;
  timezone: string | null;
  maxPerHour: number | null;
  maxPerDay: number | null;
  totalLeads: number;
  emailsGenerated: number;
  emailsSent: number;
  emailsDelivered: number;
  emailsOpened: number;
  emailsClicked: number;
  emailsReplied: number;
  emailsBounced: number;
  createdAt: string;
  campaignLeads: Array<{
    id: string;
    status: string;
    lead: {
      id: string;
      fullName: string | null;
      email: string | null;
      companyName: string | null;
    };
  }>;
  emailMessages: Array<{
    id: string;
    subject: string | null;
    htmlBody: string | null;
    textBody: string | null;
    status: string;
    sequenceStep: number;
    lead: { id: string; fullName: string | null; email: string | null };
    createdAt: string;
  }>;
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>('leads');
  const [showAddLeadsModal, setShowAddLeadsModal] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: async () => {
      const res = await getCampaign(id);
      return res.data as CampaignData;
    },
  });

  const { data: searchLeadsData } = useQuery({
    queryKey: ['leads', 'search', leadSearch],
    queryFn: async () => {
      const res = await getLeads({ search: leadSearch, pageSize: 20 });
      return res.data as Array<{ id: string; fullName: string | null; email: string | null; companyName: string | null }>;
    },
    enabled: showAddLeadsModal && leadSearch.length > 0,
  });

  const { data: activitiesRes } = useQuery({
    queryKey: ['activities', 'campaign', id],
    queryFn: async () => {
      const res = await getActivities({ campaignId: id, pageSize: 50 });
      return res.data as { activities: Array<{ id: string; eventType: string; createdAt: string; metadata?: Record<string, unknown>; leadName?: string; campaignName?: string }> };
    },
    enabled: activeTab === 'activity',
  });

  const startMutation = useMutation({
    mutationFn: () => startCampaign(id),
    onSuccess: () => { toast.success('Campaign started'); queryClient.invalidateQueries({ queryKey: ['campaign', id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const pauseMutation = useMutation({
    mutationFn: () => pauseCampaign(id),
    onSuccess: () => { toast.success('Campaign paused'); queryClient.invalidateQueries({ queryKey: ['campaign', id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeCampaign(id),
    onSuccess: () => { toast.success('Campaign resumed'); queryClient.invalidateQueries({ queryKey: ['campaign', id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addLeadsMutation = useMutation({
    mutationFn: (leadIds: string[]) => addLeadsToCampaign(id, leadIds),
    onSuccess: () => {
      toast.success('Leads added');
      setShowAddLeadsModal(false);
      setSelectedLeadIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeLeadsMutation = useMutation({
    mutationFn: (leadIds: string[]) => removeLeadsFromCampaign(id, leadIds),
    onSuccess: () => {
      toast.success('Lead removed');
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateEmailsMutation = useMutation({
    mutationFn: () => generateCampaignEmails(id),
    onSuccess: () => {
      toast.success('Email generation started');
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emailActionMutation = useMutation({
    mutationFn: async ({ emailId, action }: { emailId: string; action: string }) => {
      if (action === 'send') return sendEmailApi(emailId);
      return updateEmail(emailId, { status: action });
    },
    onSuccess: () => {
      toast.success('Email updated');
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCampaignMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => updateCampaign(id, data),
    onSuccess: () => {
      toast.success('Campaign updated');
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <LoadingPage />;
  if (!campaign) return <EmptyState title="Campaign not found" />;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'leads', label: `Leads (${campaign.totalLeads})` },
    { key: 'emails', label: `Emails (${campaign.emailMessages?.length || 0})` },
    { key: 'settings', label: 'Settings' },
    { key: 'activity', label: 'Activity' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/campaigns')} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          {campaign.description && (
            <p className="text-surface-400 mt-1 text-sm">{campaign.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === 'draft' && (
            <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending} className="btn-primary btn-sm">
              <Play className="w-4 h-4" /> Start
            </button>
          )}
          {campaign.status === 'running' && (
            <button onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending} className="btn-secondary btn-sm">
              <Pause className="w-4 h-4" /> Pause
            </button>
          )}
          {campaign.status === 'paused' && (
            <button onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending} className="btn-primary btn-sm">
              <RotateCcw className="w-4 h-4" /> Resume
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatBox icon={<Users className="w-4 h-4" />} label="Leads" value={campaign.totalLeads} />
        <StatBox icon={<Mail className="w-4 h-4" />} label="Generated" value={campaign.emailsGenerated} />
        <StatBox icon={<Send className="w-4 h-4" />} label="Sent" value={campaign.emailsSent} />
        <StatBox icon={<Check className="w-4 h-4" />} label="Delivered" value={campaign.emailsDelivered} />
        <StatBox icon={<Eye className="w-4 h-4" />} label="Opened" value={campaign.emailsOpened} />
        <StatBox icon={<MousePointerClick className="w-4 h-4" />} label="Clicked" value={campaign.emailsClicked} />
        <StatBox icon={<MessageSquare className="w-4 h-4" />} label="Replied" value={campaign.emailsReplied} />
        <StatBox icon={<AlertTriangle className="w-4 h-4" />} label="Bounced" value={campaign.emailsBounced} color="text-red-400" />
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

      {/* Leads tab */}
      {activeTab === 'leads' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-surface-300">Campaign Leads</h3>
            <div className="flex gap-2">
              <button
                onClick={() => generateEmailsMutation.mutate()}
                disabled={generateEmailsMutation.isPending}
                className="btn-secondary btn-sm"
              >
                <Sparkles className="w-4 h-4" /> Generate Emails
              </button>
              <button onClick={() => setShowAddLeadsModal(true)} className="btn-primary btn-sm">
                <UserPlus className="w-4 h-4" /> Add Leads
              </button>
            </div>
          </div>

          {(campaign.campaignLeads || []).length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<Users className="w-8 h-8" />}
                title="No leads in this campaign"
                description="Add leads to get started with email generation."
                action={
                  <button onClick={() => setShowAddLeadsModal(true)} className="btn-primary btn-sm">
                    <UserPlus className="w-4 h-4" /> Add Leads
                  </button>
                }
              />
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-800 bg-surface-900/50">
                    <th className="table-header">Name</th>
                    <th className="table-header">Email</th>
                    <th className="table-header">Company</th>
                    <th className="table-header">Status</th>
                    <th className="table-header w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {campaign.campaignLeads.map((cl) => (
                    <tr key={cl.id} className="table-row">
                      <td className="table-cell font-medium text-white">
                        {cl.lead.fullName || cl.lead.email || 'Unknown'}
                      </td>
                      <td className="table-cell">{cl.lead.email || '-'}</td>
                      <td className="table-cell">{cl.lead.companyName || '-'}</td>
                      <td className="table-cell">
                        <StatusBadge status={cl.status} />
                      </td>
                      <td className="table-cell">
                        <button
                          onClick={() => removeLeadsMutation.mutate([cl.lead.id])}
                          className="btn-ghost btn-sm text-red-400"
                          title="Remove lead"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Emails tab */}
      {activeTab === 'emails' && (
        <div className="space-y-4">
          {(campaign.emailMessages || []).length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<Mail className="w-8 h-8" />}
                title="No emails generated"
                description="Add leads and generate emails for this campaign."
              />
            </div>
          ) : (
            campaign.emailMessages.map((email) => (
              <div key={email.id} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-white">{email.subject || 'No subject'}</p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      To: {email.lead.fullName || email.lead.email || 'Unknown'} &middot; Step {email.sequenceStep}
                    </p>
                  </div>
                  <StatusBadge status={email.status} />
                </div>

                <div className="bg-surface-950 rounded-lg p-4 mb-3 max-h-40 overflow-y-auto scrollbar-thin">
                  {email.htmlBody ? (
                    <div
                      className="text-sm text-surface-300 prose prose-invert prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: email.htmlBody }}
                    />
                  ) : (
                    <p className="text-sm text-surface-300 whitespace-pre-wrap">
                      {email.textBody || 'No content'}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {['draft', 'generated', 'edited'].includes(email.status) && (
                    <>
                      <button
                        onClick={() => emailActionMutation.mutate({ emailId: email.id, action: 'approved' })}
                        className="btn-secondary btn-sm"
                        disabled={emailActionMutation.isPending}
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => emailActionMutation.mutate({ emailId: email.id, action: 'rejected' })}
                        className="btn-ghost btn-sm text-red-400"
                        disabled={emailActionMutation.isPending}
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </>
                  )}
                  {email.status === 'approved' && (
                    <button
                      onClick={() => emailActionMutation.mutate({ emailId: email.id, action: 'send' })}
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

      {/* Settings tab */}
      {activeTab === 'settings' && (
        <CampaignSettings campaign={campaign} onSave={(data) => saveCampaignMutation.mutate(data)} saving={saveCampaignMutation.isPending} />
      )}

      {/* Activity tab */}
      {activeTab === 'activity' && (
        <div className="card">
          <ActivityTimeline activities={activitiesRes?.activities || []} showCampaign={false} />
        </div>
      )}

      {/* Add leads modal */}
      <Modal
        open={showAddLeadsModal}
        onClose={() => { setShowAddLeadsModal(false); setSelectedLeadIds(new Set()); setLeadSearch(''); }}
        title="Add Leads to Campaign"
        size="lg"
        footer={
          <>
            <button onClick={() => setShowAddLeadsModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => addLeadsMutation.mutate(Array.from(selectedLeadIds))}
              disabled={selectedLeadIds.size === 0 || addLeadsMutation.isPending}
              className="btn-primary"
            >
              Add {selectedLeadIds.size} Lead{selectedLeadIds.size !== 1 ? 's' : ''}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <input
            className="input"
            placeholder="Search leads by name or email..."
            value={leadSearch}
            onChange={(e) => setLeadSearch(e.target.value)}
          />
          {selectedLeadIds.size > 0 && (
            <p className="text-sm text-primary-400">{selectedLeadIds.size} lead{selectedLeadIds.size !== 1 ? 's' : ''} selected</p>
          )}
          <div className="max-h-64 overflow-y-auto scrollbar-thin space-y-1">
            {(searchLeadsData || []).map((lead) => {
              const isSelected = selectedLeadIds.has(lead.id);
              return (
                <label
                  key={lead.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary-600/10' : 'hover:bg-surface-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      const next = new Set(selectedLeadIds);
                      if (isSelected) next.delete(lead.id);
                      else next.add(lead.id);
                      setSelectedLeadIds(next);
                    }}
                    className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-600"
                  />
                  <div>
                    <p className="text-sm text-white">{lead.fullName || lead.email || 'Unknown'}</p>
                    <p className="text-xs text-surface-500">{lead.companyName || ''} {lead.email || ''}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatBox({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <div className="card p-3 text-center">
      <div className={`flex justify-center mb-1 ${color || 'text-surface-400'}`}>{icon}</div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-[11px] text-surface-500">{label}</p>
    </div>
  );
}

function CampaignSettings({
  campaign,
  onSave,
  saving,
}: {
  campaign: CampaignData;
  onSave: (data: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    name: campaign.name,
    description: campaign.description || '',
    senderName: campaign.senderName || '',
    senderEmail: campaign.senderEmail || '',
    replyToEmail: campaign.replyToEmail || '',
    objective: campaign.objective || '',
    targetAudience: campaign.targetAudience || '',
    productDescription: campaign.productDescription || '',
    valueProposition: campaign.valueProposition || '',
    tone: campaign.tone || 'professional',
    emailLength: campaign.emailLength || 'medium',
    cta: campaign.cta || '',
    customInstructions: campaign.customInstructions || '',
    aiModel: campaign.aiModel || '',
    sendingWindow: campaign.sendingWindow || '09:00-17:00',
    timezone: campaign.timezone || 'UTC',
    maxPerHour: campaign.maxPerHour?.toString() || '',
    maxPerDay: campaign.maxPerDay?.toString() || '',
  });

  const updateField = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = () => {
    const payload: Record<string, unknown> = { ...form };
    if (form.maxPerHour) payload.maxPerHour = parseInt(form.maxPerHour);
    else delete payload.maxPerHour;
    if (form.maxPerDay) payload.maxPerDay = parseInt(form.maxPerDay);
    else delete payload.maxPerDay;
    onSave(payload);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-white">Campaign Details</h3>
        <div>
          <label className="label">Name</label>
          <input className="input" value={form.name} onChange={(e) => updateField('name', e.target.value)} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input min-h-[80px] resize-y" value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={2} />
        </div>
      </section>

      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-white">Sender</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Sender Name</label>
            <input className="input" value={form.senderName} onChange={(e) => updateField('senderName', e.target.value)} />
          </div>
          <div>
            <label className="label">Sender Email</label>
            <input className="input" value={form.senderEmail} onChange={(e) => updateField('senderEmail', e.target.value)} />
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-white">AI Configuration</h3>
        <div>
          <label className="label">Objective</label>
          <textarea className="input min-h-[60px] resize-y" value={form.objective} onChange={(e) => updateField('objective', e.target.value)} rows={2} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Tone</label>
            <select className="input" value={form.tone} onChange={(e) => updateField('tone', e.target.value)}>
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="friendly">Friendly</option>
              <option value="formal">Formal</option>
              <option value="witty">Witty</option>
            </select>
          </div>
          <div>
            <label className="label">Length</label>
            <select className="input" value={form.emailLength} onChange={(e) => updateField('emailLength', e.target.value)}>
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </div>
          <div>
            <label className="label">AI Model</label>
            <select className="input" value={form.aiModel} onChange={(e) => updateField('aiModel', e.target.value)}>
              <option value="">Default</option>
              <option value="anthropic/claude-sonnet-4-20250514">Claude Sonnet 4</option>
              <option value="openai/gpt-4o">GPT-4o</option>
            </select>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </div>
    </div>
  );
}
