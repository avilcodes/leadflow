'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Search,
  Send,
  Megaphone,
  Eye,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { StatsCard } from '@/components/stats-card';
import { StatsCardSkeleton } from '@/components/loading';
import { ActivityTimeline } from '@/components/activity-timeline';
import { getDashboard, getActivities } from '@/lib/api';
import type { DashboardStats, RecentActivity } from '@/types';

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function DashboardPage() {
  const { data: dashData, isLoading: dashLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await getDashboard();
      return res.data as {
        stats: DashboardStats;
        leadsOverTime: { date: string; count: number }[];
        emailPerformance: { name: string; sent: number; opened: number; replied: number }[];
        leadsBySource: { name: string; value: number }[];
      };
    },
  });

  const { data: activitiesData } = useQuery({
    queryKey: ['activities', 'recent'],
    queryFn: async () => {
      const res = await getActivities({ pageSize: 10 });
      return res.data as { activities: RecentActivity[] };
    },
  });

  const stats = dashData?.stats;
  const activities = activitiesData?.activities || [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-surface-400 mt-1">Overview of your lead intelligence pipeline</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {dashLoading ? (
          Array.from({ length: 6 }).map((_, i) => <StatsCardSkeleton key={i} />)
        ) : (
          <>
            <StatsCard
              label="Total Leads"
              value={stats?.totalLeads ?? 0}
              icon={<Users className="w-6 h-6" />}
            />
            <StatsCard
              label="Enriched"
              value={stats?.enrichedLeads ?? 0}
              icon={<Search className="w-6 h-6" />}
            />
            <StatsCard
              label="Emails Sent"
              value={stats?.emailsSent ?? 0}
              icon={<Send className="w-6 h-6" />}
            />
            <StatsCard
              label="Active Campaigns"
              value={stats?.activeCampaigns ?? 0}
              icon={<Megaphone className="w-6 h-6" />}
            />
            <StatsCard
              label="Open Rate"
              value={`${((stats?.openRate ?? 0) * 100).toFixed(1)}%`}
              icon={<Eye className="w-6 h-6" />}
            />
            <StatsCard
              label="Reply Rate"
              value={`${((stats?.replyRate ?? 0) * 100).toFixed(1)}%`}
              icon={<MessageSquare className="w-6 h-6" />}
            />
          </>
        )}
      </div>

      {/* Failed jobs alert */}
      {stats && stats.failedJobs > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-300">
            <span className="font-semibold">{stats.failedJobs} failed job{stats.failedJobs !== 1 ? 's' : ''}</span>{' '}
            need attention. Check the Activities page for details.
          </p>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads over time */}
        <div className="card">
          <h3 className="text-sm font-medium text-surface-300 mb-4">Leads Over Time</h3>
          {dashLoading ? (
            <div className="h-64 skeleton rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={264}>
              <LineChart data={dashData?.leadsOverTime || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="date"
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Leads"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Email performance */}
        <div className="card">
          <h3 className="text-sm font-medium text-surface-300 mb-4">Email Performance</h3>
          {dashLoading ? (
            <div className="h-64 skeleton rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={264}>
              <BarChart data={dashData?.emailPerformance || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="name"
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                <Bar dataKey="sent" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Sent" />
                <Bar dataKey="opened" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Opened" />
                <Bar dataKey="replied" fill="#22c55e" radius={[4, 4, 0, 0]} name="Replied" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leads by source */}
        <div className="card">
          <h3 className="text-sm font-medium text-surface-300 mb-4">Leads by Source</h3>
          {dashLoading ? (
            <div className="h-48 skeleton rounded-lg" />
          ) : (dashData?.leadsBySource || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={dashData?.leadsBySource}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {(dashData?.leadsBySource || []).map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '0.75rem' }}
                  formatter={(value) => <span className="text-surface-300">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-surface-500 text-center py-12">No source data yet</p>
          )}
        </div>

        {/* Recent activities */}
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-medium text-surface-300 mb-4">Recent Activity</h3>
          <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
            <ActivityTimeline activities={activities} />
          </div>
        </div>
      </div>
    </div>
  );
}
