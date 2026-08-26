'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Upload,
  Download,
  Search,
  Sparkles,
  Brain,
  Mail,
  Trash2,
  Users,
  X,
  FileSpreadsheet,
  Zap,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, Column } from '@/components/data-table';
import { StatusBadge } from '@/components/badge';
import { Modal } from '@/components/modal';
import {
  getLeads,
  createLead,
  bulkAction,
  importLeads,
  exportLeads,
  getAutoProcessingSettings,
  updateAutoProcessingSettings,
  processLeads,
} from '@/lib/api';

interface Lead {
  id: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  email: string | null;
  source: string | null;
  status: string;
  enrichmentStatus: string;
  outreachStatus: string;
  createdAt: string;
  leadTags?: { tag: { name: string } }[];
}

export default function LeadsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [enrichmentStatus, setEnrichmentStatus] = useState('');
  const [outreachStatus, setOutreachStatus] = useState('');
  const [industry, setIndustry] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAutoProcessConfirm, setShowAutoProcessConfirm] = useState(false);

  // Create lead form
  const [createForm, setCreateForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    jobTitle: '',
    companyName: '',
    phone: '',
    linkedinUrl: '',
    website: '',
    source: 'manual',
  });

  // Import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);

  const pageSize = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['leads', { search, status, source, enrichmentStatus, outreachStatus, industry, page, sortBy, sortOrder }],
    queryFn: async () => {
      const res = await getLeads({
        search: search || undefined,
        status: status || undefined,
        source: source || undefined,
        enrichmentStatus: enrichmentStatus || undefined,
        outreachStatus: outreachStatus || undefined,
        industry: industry || undefined,
        page,
        pageSize,
        sortBy,
        sortOrder,
      });
      return res as { data: Lead[]; pagination: { total: number; page: number; pageSize: number; totalPages: number } };
    },
  });

  const leads = data?.data || [];
  const pagination = data?.pagination;

  const createMutation = useMutation({
    mutationFn: async () => {
      await createLead(createForm);
    },
    onSuccess: () => {
      toast.success('Lead created');
      setShowCreateModal(false);
      setCreateForm({ firstName: '', lastName: '', email: '', jobTitle: '', companyName: '', phone: '', linkedinUrl: '', website: '', source: 'manual' });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create lead');
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ action, extra }: { action: string; extra?: Record<string, unknown> }) => {
      await bulkAction(action, Array.from(selectedIds), extra);
    },
    onSuccess: (_, { action }) => {
      toast.success(`Bulk ${action} started`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Bulk action failed');
    },
  });

  // Auto-processing
  const { data: autoProcessData } = useQuery({
    queryKey: ['auto-processing'],
    queryFn: async () => {
      const res = await getAutoProcessingSettings();
      return res.data as { enabled: boolean; updatedAt: string | null };
    },
  });

  const autoProcessEnabled = autoProcessData?.enabled ?? false;

  const toggleAutoProcessMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await updateAutoProcessingSettings(enabled);
      if (enabled) {
        // When turning ON, process all unprocessed leads
        await processLeads();
      }
    },
    onSuccess: (_, enabled) => {
      if (enabled) {
        toast.success('Auto-processing enabled. Unprocessed leads queued for processing.');
      } else {
        toast.success('Auto-processing disabled.');
      }
      queryClient.invalidateQueries({ queryKey: ['auto-processing'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update auto-processing');
    },
  });

  const handleAutoProcessToggle = () => {
    if (!autoProcessEnabled) {
      // Turning ON — show confirmation
      setShowAutoProcessConfirm(true);
    } else {
      // Turning OFF — just do it
      toggleAutoProcessMutation.mutate(false);
    }
  };

  const confirmAutoProcess = () => {
    setShowAutoProcessConfirm(false);
    toggleAutoProcessMutation.mutate(true);
  };

  const handleSort = useCallback((key: string, order: 'asc' | 'desc') => {
    setSortBy(key);
    setSortOrder(order);
  }, []);

  const handleExport = async () => {
    try {
      await exportLeads({ search, status, source, enrichmentStatus, outreachStatus, industry });
      toast.success('Export started');
    } catch {
      toast.error('Export failed');
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    try {
      const defaultMappings: Record<string, string> = {
        'first_name': 'firstName',
        'last_name': 'lastName',
        'email': 'email',
        'job_title': 'jobTitle',
        'company': 'companyName',
        'company_name': 'companyName',
        'phone': 'phone',
        'linkedin_url': 'linkedinUrl',
        'website': 'website',
        'industry': 'industry',
        'location': 'location',
      };
      await importLeads(importFile, defaultMappings);
      toast.success('Import started');
      setShowImportModal(false);
      setImportFile(null);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const getLeadName = (lead: Lead) => {
    if (lead.fullName) return lead.fullName;
    if (lead.firstName || lead.lastName) return `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
    return lead.email || 'Unknown';
  };

  const columns: Column<Lead>[] = [
    {
      key: 'fullName',
      header: 'Name',
      sortable: true,
      render: (lead) => (
        <div>
          <p className="font-medium text-white">{getLeadName(lead)}</p>
          {lead.email && <p className="text-xs text-surface-500">{lead.email}</p>}
        </div>
      ),
    },
    {
      key: 'companyName',
      header: 'Company',
      sortable: true,
      render: (lead) => (
        <div>
          <p className="text-surface-200">{lead.companyName || '-'}</p>
          {lead.jobTitle && <p className="text-xs text-surface-500">{lead.jobTitle}</p>}
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (lead) => (
        <span className="text-surface-300 capitalize">{lead.source || '-'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (lead) => <StatusBadge status={lead.status} />,
    },
    {
      key: 'enrichmentStatus',
      header: 'Enrichment',
      render: (lead) => <StatusBadge status={lead.enrichmentStatus} />,
    },
    {
      key: 'outreachStatus',
      header: 'Outreach',
      render: (lead) => <StatusBadge status={lead.outreachStatus} />,
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      render: (lead) => (
        <span className="text-surface-400 text-xs">
          {new Date(lead.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setSource('');
    setEnrichmentStatus('');
    setOutreachStatus('');
    setIndustry('');
    setPage(1);
  };

  const hasFilters = search || status || source || enrichmentStatus || outreachStatus || industry;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-surface-400 mt-1">
            Manage and enrich your lead database
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowImportModal(true)} className="btn-secondary btn-sm">
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button onClick={handleExport} className="btn-secondary btn-sm">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Auto-Processing Toggle */}
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${autoProcessEnabled ? 'bg-primary-500/15' : 'bg-surface-800'}`}>
            <Zap className={`w-5 h-5 ${autoProcessEnabled ? 'text-primary-400' : 'text-surface-500'}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Auto Processing</p>
            <p className="text-xs text-surface-500">
              {autoProcessEnabled
                ? 'New leads are automatically enriched, analyzed, and emailed'
                : 'Leads must be manually sent for processing'}
            </p>
          </div>
        </div>
        <button
          onClick={handleAutoProcessToggle}
          disabled={toggleAutoProcessMutation.isPending}
          className="relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-surface-900"
          style={{ backgroundColor: autoProcessEnabled ? 'var(--color-primary-500)' : 'var(--color-surface-600, #4b5563)' }}
          role="switch"
          aria-checked={autoProcessEnabled}
          aria-label="Toggle auto processing"
        >
          {toggleAutoProcessMutation.isPending ? (
            <span className="flex items-center justify-center w-full h-full">
              <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
            </span>
          ) : (
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-[1px] ${
                autoProcessEnabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          )}
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              type="text"
              placeholder="Search leads by name, email, company..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input pl-10"
            />
          </div>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="input w-auto"
          >
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="converted">Converted</option>
            <option value="lost">Lost</option>
          </select>
          <select
            value={source}
            onChange={(e) => { setSource(e.target.value); setPage(1); }}
            className="input w-auto"
          >
            <option value="">All Sources</option>
            <option value="apollo">Apollo</option>
            <option value="prospeo">Prospeo</option>
            <option value="deepenrich">Deepenrich</option>
            <option value="csv">CSV Import</option>
            <option value="manual">Manual</option>
          </select>
          <select
            value={enrichmentStatus}
            onChange={(e) => { setEnrichmentStatus(e.target.value); setPage(1); }}
            className="input w-auto"
          >
            <option value="">All Enrichment</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={outreachStatus}
            onChange={(e) => { setOutreachStatus(e.target.value); setPage(1); }}
            className="input w-auto"
          >
            <option value="">All Outreach</option>
            <option value="none">None</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="opened">Opened</option>
            <option value="replied">Replied</option>
            <option value="bounced">Bounced</option>
          </select>
          {hasFilters && (
            <button onClick={clearFilters} className="btn-ghost btn-sm">
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={leads}
        loading={isLoading}
        emptyIcon={<Users className="w-8 h-8" />}
        emptyTitle="No leads found"
        emptyDescription={hasFilters ? 'Try adjusting your filters' : 'Get started by adding or importing leads'}
        emptyAction={
          !hasFilters ? (
            <button onClick={() => setShowCreateModal(true)} className="btn-primary btn-sm">
              <Plus className="w-4 h-4" />
              Add your first lead
            </button>
          ) : undefined
        }
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        page={pagination?.page || page}
        pageSize={pageSize}
        total={pagination?.total || 0}
        onPageChange={setPage}
        onRowClick={(lead) => router.push(`/leads/${lead.id}`)}
        bulkActions={
          <>
            <button
              onClick={() => bulkMutation.mutate({ action: 'enrich' })}
              className="btn-secondary btn-sm"
              disabled={bulkMutation.isPending}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Enrich
            </button>
            <button
              onClick={() => bulkMutation.mutate({ action: 'analyze' })}
              className="btn-secondary btn-sm"
              disabled={bulkMutation.isPending}
            >
              <Brain className="w-3.5 h-3.5" />
              Analyze
            </button>
            <button
              onClick={() => bulkMutation.mutate({ action: 'generate_email' })}
              className="btn-secondary btn-sm"
              disabled={bulkMutation.isPending}
            >
              <Mail className="w-3.5 h-3.5" />
              Generate Email
            </button>
            <button
              onClick={() => bulkMutation.mutate({ action: 'delete' })}
              className="btn-danger btn-sm"
              disabled={bulkMutation.isPending}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </>
        }
      />

      {/* Create Lead Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Add New Lead"
        description="Create a lead manually"
        size="lg"
        footer={
          <>
            <button onClick={() => setShowCreateModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="btn-primary"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Lead'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">First Name</label>
            <input
              className="input"
              value={createForm.firstName}
              onChange={(e) => setCreateForm((f) => ({ ...f, firstName: e.target.value }))}
              placeholder="Jane"
            />
          </div>
          <div>
            <label className="label">Last Name</label>
            <input
              className="input"
              value={createForm.lastName}
              onChange={(e) => setCreateForm((f) => ({ ...f, lastName: e.target.value }))}
              placeholder="Smith"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="jane@company.com"
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              className="input"
              value={createForm.phone}
              onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+1 555 0123"
            />
          </div>
          <div>
            <label className="label">Job Title</label>
            <input
              className="input"
              value={createForm.jobTitle}
              onChange={(e) => setCreateForm((f) => ({ ...f, jobTitle: e.target.value }))}
              placeholder="VP of Sales"
            />
          </div>
          <div>
            <label className="label">Company</label>
            <input
              className="input"
              value={createForm.companyName}
              onChange={(e) => setCreateForm((f) => ({ ...f, companyName: e.target.value }))}
              placeholder="Acme Inc"
            />
          </div>
          <div>
            <label className="label">LinkedIn URL</label>
            <input
              className="input"
              value={createForm.linkedinUrl}
              onChange={(e) => setCreateForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
              placeholder="https://linkedin.com/in/janesmith"
            />
          </div>
          <div>
            <label className="label">Website</label>
            <input
              className="input"
              value={createForm.website}
              onChange={(e) => setCreateForm((f) => ({ ...f, website: e.target.value }))}
              placeholder="https://company.com"
            />
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal
        open={showImportModal}
        onClose={() => { setShowImportModal(false); setImportFile(null); }}
        title="Import Leads from CSV"
        description="Upload a CSV file with lead data. Columns will be automatically mapped."
        footer={
          <>
            <button onClick={() => { setShowImportModal(false); setImportFile(null); }} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!importFile}
              className="btn-primary"
            >
              Import Leads
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-surface-600 rounded-xl p-8 text-center hover:border-primary-500/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="w-10 h-10 text-surface-500 mx-auto mb-3" />
            {importFile ? (
              <div>
                <p className="text-sm text-white font-medium">{importFile.name}</p>
                <p className="text-xs text-surface-400 mt-1">
                  {(importFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-surface-300">Click to select a CSV file</p>
                <p className="text-xs text-surface-500 mt-1">
                  Supported columns: first_name, last_name, email, company, job_title, phone, linkedin_url, website
                </p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
          />
        </div>
      </Modal>

      {/* Auto-Processing Confirmation Modal */}
      <Modal
        open={showAutoProcessConfirm}
        onClose={() => setShowAutoProcessConfirm(false)}
        title="Enable Auto Processing"
        description="Are you sure you want to enable auto processing?"
        footer={
          <>
            <button onClick={() => setShowAutoProcessConfirm(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={confirmAutoProcess}
              disabled={toggleAutoProcessMutation.isPending}
              className="btn-primary"
            >
              <Zap className="w-4 h-4" />
              {toggleAutoProcessMutation.isPending ? 'Processing...' : 'Enable & Process All'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Zap className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-200 font-medium">
                All unprocessed leads will be sent for processing
              </p>
              <p className="text-xs text-amber-300/70 mt-1">
                This will trigger LinkedIn profile summarizing and email generation
                for every lead that hasn&apos;t been processed yet. New leads added
                in the future will also be automatically processed.
              </p>
            </div>
          </div>
          <div className="text-sm text-surface-400">
            <p>When auto processing is enabled:</p>
            <ul className="mt-2 space-y-1.5 ml-4">
              <li className="flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 text-primary-400 mt-0.5 flex-shrink-0" />
                <span>Leads are automatically enriched (LinkedIn scraping)</span>
              </li>
              <li className="flex items-start gap-2">
                <Brain className="w-3.5 h-3.5 text-purple-400 mt-0.5 flex-shrink-0" />
                <span>AI analysis runs on enriched data</span>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                <span>Personalized emails are generated and queued</span>
              </li>
            </ul>
          </div>
        </div>
      </Modal>
    </div>
  );
}
