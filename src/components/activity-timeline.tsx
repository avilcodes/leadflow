'use client';

import {
  UserPlus,
  Upload,
  Pencil,
  Trash2,
  Search,
  Globe,
  Brain,
  Mail,
  Send,
  Eye,
  MousePointerClick,
  MessageSquare,
  AlertTriangle,
  Ban,
  Megaphone,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityItem {
  id: string;
  eventType: string;
  leadName?: string;
  campaignName?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface ActivityTimelineProps {
  activities: ActivityItem[];
  showLead?: boolean;
  showCampaign?: boolean;
}

const eventConfig: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  'lead.created': { icon: UserPlus, color: 'text-green-400 bg-green-400/10', label: 'Lead created' },
  'lead.imported': { icon: Upload, color: 'text-blue-400 bg-blue-400/10', label: 'Lead imported' },
  'lead.updated': { icon: Pencil, color: 'text-surface-400 bg-surface-400/10', label: 'Lead updated' },
  'lead.deleted': { icon: Trash2, color: 'text-red-400 bg-red-400/10', label: 'Lead deleted' },
  'lead.enrichment.started': { icon: Search, color: 'text-amber-400 bg-amber-400/10', label: 'Enrichment started' },
  'lead.enrichment.completed': { icon: Search, color: 'text-green-400 bg-green-400/10', label: 'Enrichment completed' },
  'lead.enrichment.failed': { icon: Search, color: 'text-red-400 bg-red-400/10', label: 'Enrichment failed' },
  'lead.linkedin_scraped': { icon: Globe, color: 'text-blue-400 bg-blue-400/10', label: 'LinkedIn scraped' },
  'lead.website_scraped': { icon: Globe, color: 'text-cyan-400 bg-cyan-400/10', label: 'Website scraped' },
  'lead.ai_analysis.started': { icon: Brain, color: 'text-purple-400 bg-purple-400/10', label: 'AI analysis started' },
  'lead.ai_analysis.completed': { icon: Brain, color: 'text-green-400 bg-green-400/10', label: 'AI analysis completed' },
  'lead.ai_analysis.failed': { icon: Brain, color: 'text-red-400 bg-red-400/10', label: 'AI analysis failed' },
  'email.generated': { icon: Mail, color: 'text-blue-400 bg-blue-400/10', label: 'Email generated' },
  'email.edited': { icon: Pencil, color: 'text-surface-400 bg-surface-400/10', label: 'Email edited' },
  'email.approved': { icon: CheckCircle2, color: 'text-green-400 bg-green-400/10', label: 'Email approved' },
  'email.rejected': { icon: XCircle, color: 'text-red-400 bg-red-400/10', label: 'Email rejected' },
  'email.sent': { icon: Send, color: 'text-primary-400 bg-primary-400/10', label: 'Email sent' },
  'email.delivered': { icon: CheckCircle2, color: 'text-green-400 bg-green-400/10', label: 'Email delivered' },
  'email.opened': { icon: Eye, color: 'text-purple-400 bg-purple-400/10', label: 'Email opened' },
  'email.clicked': { icon: MousePointerClick, color: 'text-cyan-400 bg-cyan-400/10', label: 'Link clicked' },
  'email.replied': { icon: MessageSquare, color: 'text-green-400 bg-green-400/10', label: 'Reply received' },
  'email.bounced': { icon: AlertTriangle, color: 'text-red-400 bg-red-400/10', label: 'Email bounced' },
  'email.unsubscribed': { icon: Ban, color: 'text-amber-400 bg-amber-400/10', label: 'Unsubscribed' },
  'campaign.created': { icon: Megaphone, color: 'text-blue-400 bg-blue-400/10', label: 'Campaign created' },
  'campaign.started': { icon: Play, color: 'text-green-400 bg-green-400/10', label: 'Campaign started' },
  'campaign.paused': { icon: Pause, color: 'text-amber-400 bg-amber-400/10', label: 'Campaign paused' },
  'campaign.resumed': { icon: RotateCcw, color: 'text-blue-400 bg-blue-400/10', label: 'Campaign resumed' },
  'campaign.completed': { icon: CheckCircle2, color: 'text-green-400 bg-green-400/10', label: 'Campaign completed' },
  'campaign.failed': { icon: XCircle, color: 'text-red-400 bg-red-400/10', label: 'Campaign failed' },
};

const defaultEvent = { icon: Mail, color: 'text-surface-400 bg-surface-400/10', label: 'Event' };

export function ActivityTimeline({ activities, showLead = true, showCampaign = true }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <p className="text-sm text-surface-500 text-center py-8">No activity yet</p>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Timeline line */}
      <div className="absolute left-5 top-3 bottom-3 w-px bg-surface-800" />

      {activities.map((activity) => {
        const config = eventConfig[activity.eventType] || defaultEvent;
        const Icon = config.icon;
        const timeAgo = formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true });

        return (
          <div key={activity.id} className="relative flex gap-4 py-3 px-2">
            <div
              className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 ${config.color}`}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <p className="text-sm text-surface-200">
                <span className="font-medium">{config.label}</span>
                {showLead && activity.leadName && (
                  <>
                    {' '}
                    <span className="text-surface-400">for</span>{' '}
                    <span className="text-primary-400">{activity.leadName}</span>
                  </>
                )}
                {showCampaign && activity.campaignName && (
                  <>
                    {' '}
                    <span className="text-surface-400">in</span>{' '}
                    <span className="text-primary-400">{activity.campaignName}</span>
                  </>
                )}
              </p>
              <p className="text-xs text-surface-500 mt-0.5">{timeAgo}</p>
              {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                <div className="mt-1 text-xs text-surface-500">
                  {activity.metadata.error ? (
                    <span className="text-red-400">{String(activity.metadata.error)}</span>
                  ) : null}
                  {activity.metadata.provider ? (
                    <span>via {String(activity.metadata.provider)}</span>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
