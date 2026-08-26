'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Megaphone, Users, Send, Eye, MessageSquare } from 'lucide-react';
import { StatusBadge } from '@/components/badge';
import { EmptyState } from '@/components/empty-state';
import { CardSkeleton } from '@/components/loading';
import { getCampaigns } from '@/lib/api';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  totalLeads: number;
  emailsGenerated: number;
  emailsSent: number;
  emailsOpened: number;
  emailsReplied: number;
  emailsBounced: number;
  createdAt: string;
}

export default function CampaignsPage() {
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const res = await getCampaigns();
      return res.data as Campaign[];
    },
  });

  const campaigns = data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaigns</h1>
          <p className="text-surface-400 mt-1">Manage your outreach campaigns</p>
        </div>
        <button onClick={() => router.push('/campaigns/new')} className="btn-primary">
          <Plus className="w-4 h-4" />
          Create Campaign
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Megaphone className="w-8 h-8" />}
            title="No campaigns yet"
            description="Create your first campaign to start personalised outreach at scale."
            action={
              <button onClick={() => router.push('/campaigns/new')} className="btn-primary btn-sm">
                <Plus className="w-4 h-4" />
                Create Campaign
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="card-hover"
              onClick={() => router.push(`/campaigns/${campaign.id}`)}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-white">{campaign.name}</h3>
                  {campaign.description && (
                    <p className="text-sm text-surface-400 mt-0.5 line-clamp-1">
                      {campaign.description}
                    </p>
                  )}
                </div>
                <StatusBadge status={campaign.status} />
              </div>

              <div className="grid grid-cols-4 gap-3">
                <StatMini icon={<Users className="w-3.5 h-3.5" />} label="Leads" value={campaign.totalLeads} />
                <StatMini icon={<Send className="w-3.5 h-3.5" />} label="Sent" value={campaign.emailsSent} />
                <StatMini icon={<Eye className="w-3.5 h-3.5" />} label="Opened" value={campaign.emailsOpened} />
                <StatMini icon={<MessageSquare className="w-3.5 h-3.5" />} label="Replied" value={campaign.emailsReplied} />
              </div>

              <p className="text-xs text-surface-600 mt-4">
                Created {new Date(campaign.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatMini({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-surface-400 mb-1">{icon}</div>
      <p className="text-lg font-semibold text-white">{value}</p>
      <p className="text-[11px] text-surface-500">{label}</p>
    </div>
  );
}
