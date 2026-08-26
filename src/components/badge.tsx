'use client';

type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-surface-700 text-surface-300',
  primary: 'bg-primary-500/15 text-primary-400 border border-primary-500/20',
  success: 'bg-green-500/15 text-green-400 border border-green-500/20',
  warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  danger: 'bg-red-500/15 text-red-400 border border-red-500/20',
  info: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20',
  purple: 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-surface-400',
  primary: 'bg-primary-400',
  success: 'bg-green-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  info: 'bg-cyan-400',
  purple: 'bg-purple-400',
};

export function Badge({ children, variant = 'default', className = '', dot }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}

// Helper to map status strings to badge variants
export function getStatusVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    // Lead status
    new: 'info',
    contacted: 'primary',
    qualified: 'success',
    converted: 'success',
    lost: 'danger',
    // Enrichment status
    pending: 'default',
    in_progress: 'warning',
    completed: 'success',
    failed: 'danger',
    partial: 'warning',
    // Outreach status
    none: 'default',
    draft: 'default',
    ready: 'info',
    sent: 'primary',
    delivered: 'primary',
    opened: 'purple',
    replied: 'success',
    bounced: 'danger',
    // Campaign status
    running: 'success',
    paused: 'warning',
    // Email status
    generated: 'info',
    edited: 'info',
    approved: 'success',
    rejected: 'danger',
    queued: 'warning',
    sending: 'warning',
    // Credential status
    connected: 'success',
    untested: 'default',
  };
  return map[status] || 'default';
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={getStatusVariant(status)} dot>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
