'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    label?: string;
  };
  className?: string;
}

export function StatsCard({ label, value, icon, trend, className = '' }: StatsCardProps) {
  const isPositive = trend && trend.value >= 0;

  return (
    <div className={`card flex items-start gap-4 ${className}`}>
      <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary-600/10 text-primary-400 flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-surface-400 mb-1">{label}</p>
        <p className="text-2xl font-bold text-white tracking-tight">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {trend && (
          <div className="flex items-center gap-1 mt-1">
            {isPositive ? (
              <TrendingUp className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-red-400" />
            )}
            <span
              className={`text-xs font-medium ${
                isPositive ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {isPositive ? '+' : ''}
              {trend.value}%
            </span>
            {trend.label && (
              <span className="text-xs text-surface-500">{trend.label}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
