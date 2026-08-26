'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, RefreshCw, X } from 'lucide-react';
import { ActivityTimeline } from '@/components/activity-timeline';
import { EmptyState } from '@/components/empty-state';
import { LoadingPage } from '@/components/loading';
import { getActivities } from '@/lib/api';

const EVENT_TYPES = [
  { value: '', label: 'All Events' },
  { value: 'lead.created', label: 'Lead Created' },
  { value: 'lead.imported', label: 'Lead Imported' },
  { value: 'lead.updated', label: 'Lead Updated' },
  { value: 'lead.enrichment.started', label: 'Enrichment Started' },
  { value: 'lead.enrichment.completed', label: 'Enrichment Completed' },
  { value: 'lead.enrichment.failed', label: 'Enrichment Failed' },
  { value: 'lead.ai_analysis.completed', label: 'AI Analysis Completed' },
  { value: 'lead.ai_analysis.failed', label: 'AI Analysis Failed' },
  { value: 'email.generated', label: 'Email Generated' },
  { value: 'email.sent', label: 'Email Sent' },
  { value: 'email.opened', label: 'Email Opened' },
  { value: 'email.replied', label: 'Email Replied' },
  { value: 'email.bounced', label: 'Email Bounced' },
  { value: 'campaign.started', label: 'Campaign Started' },
  { value: 'campaign.paused', label: 'Campaign Paused' },
  { value: 'campaign.completed', label: 'Campaign Completed' },
];

export default function ActivitiesPage() {
  const [eventType, setEventType] = useState('');
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const pageSize = 50;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['activities', { eventType, page }],
    queryFn: async () => {
      const res = await getActivities({
        eventType: eventType || undefined,
        page,
        pageSize,
      });
      return res as {
        data: {
          activities: Array<{
            id: string;
            eventType: string;
            createdAt: string;
            leadName?: string;
            campaignName?: string;
            metadata?: Record<string, unknown>;
          }>;
        };
        pagination?: { total: number; totalPages: number };
      };
    },
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const activities = data?.data?.activities || [];
  const totalPages = data?.pagination?.totalPages || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Activity Log</h1>
          <p className="text-surface-400 mt-1">Track all events across your pipeline</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`btn-sm ${autoRefresh ? 'btn-primary' : 'btn-secondary'}`}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-refresh on' : 'Auto-refresh'}
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-secondary btn-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <select
            value={eventType}
            onChange={(e) => { setEventType(e.target.value); setPage(1); }}
            className="input w-auto"
          >
            {EVENT_TYPES.map((et) => (
              <option key={et.value} value={et.value}>
                {et.label}
              </option>
            ))}
          </select>
          {eventType && (
            <button
              onClick={() => { setEventType(''); setPage(1); }}
              className="btn-ghost btn-sm"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <LoadingPage />
      ) : activities.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Activity className="w-8 h-8" />}
            title="No activity yet"
            description={
              eventType
                ? 'No events match your filter. Try a different event type.'
                : 'Activities will appear here as you interact with leads and campaigns.'
            }
          />
        </div>
      ) : (
        <div className="card">
          <ActivityTimeline activities={activities} />
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="btn-secondary btn-sm"
          >
            Previous
          </button>
          <span className="text-sm text-surface-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="btn-secondary btn-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
