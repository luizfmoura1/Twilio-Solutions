import { cn } from '@/lib/utils';

type StatusType = 'available' | 'busy' | 'offline' | 'ringing' | 'in-call';

interface StatusBadgeProps {
  status: StatusType;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; dotClass: string; bgClass: string; borderClass: string }> = {
  available: {
    label: 'Disponivel',
    dotClass: 'bg-emerald-400',
    bgClass: 'bg-emerald-500/10 text-emerald-400',
    borderClass: 'border-emerald-500/20',
  },
  busy: {
    label: 'Ocupado',
    dotClass: 'bg-amber-400',
    bgClass: 'bg-amber-500/10 text-amber-400',
    borderClass: 'border-amber-500/20',
  },
  offline: {
    label: 'Offline',
    dotClass: 'bg-slate-400',
    bgClass: 'bg-slate-500/10 text-slate-400',
    borderClass: 'border-slate-500/20',
  },
  ringing: {
    label: 'Tocando',
    dotClass: 'bg-blue-400',
    bgClass: 'bg-blue-500/10 text-blue-400',
    borderClass: 'border-blue-500/20',
  },
  'in-call': {
    label: 'Em chamada',
    dotClass: 'bg-emerald-400',
    bgClass: 'bg-emerald-500/10 text-emerald-400',
    borderClass: 'border-emerald-500/20',
  },
};

const sizeClasses = {
  sm: 'text-xs px-2.5 py-1',
  md: 'text-sm px-3 py-1.5',
  lg: 'text-base px-4 py-2',
};

const dotSizes = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
};

export function StatusBadge({ status, showLabel = true, size = 'md', className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-lg font-medium border',
        config.bgClass,
        config.borderClass,
        sizeClasses[size],
        className
      )}
    >
      <span className="relative flex">
        <span
          className={cn('rounded-full', config.dotClass, dotSizes[size])}
          style={{ boxShadow: `0 0 6px currentColor` }}
        />
        {(status === 'ringing' || status === 'in-call') && (
          <span className={cn('absolute inset-0 rounded-full animate-ping', config.dotClass, 'opacity-50')} />
        )}
      </span>
      {showLabel && <span>{config.label}</span>}
    </div>
  );
}
