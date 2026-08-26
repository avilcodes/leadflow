'use client';

import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
    </div>
  );
}

export function LoadingPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-3" />
        <p className="text-sm text-surface-400">Loading...</p>
      </div>
    </div>
  );
}

export function LoadingSkeleton({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="skeleton h-4 rounded flex-1"
              style={{ animationDelay: `${(i * cols + j) * 50}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card space-y-4 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-surface-800" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-surface-800 rounded w-1/3" />
          <div className="h-5 bg-surface-800 rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="card flex items-start gap-4 animate-pulse">
      <div className="w-12 h-12 rounded-xl bg-surface-800" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-surface-800 rounded w-20" />
        <div className="h-7 bg-surface-800 rounded w-16" />
      </div>
    </div>
  );
}
