import { cn } from '@/lib/utils';

type StatusType = 'available' | 'busy' | 'offline' | 'ringing' | 'in-call';

interface StatusBadgeProps {
  status: StatusType;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; dotClass: string; bgClass: string }> = {
  available: {
    label: 'Disponível',
    dotClass: 'bg-status-available',
    bgClass: 'bg-status-available/20 text-status-available',
  },
  busy: {
    label: 'Ocupado',
    dotClass: 'bg-status-busy',
    bgClass: 'bg-status-busy/20 text-status-busy',
  },
  offline: {
    label: 'Offline',
    dotClass: 'bg-status-offline',
    bgClass: 'bg-status-offline/20 text-status-offline',
  },
  ringing: {
    label: 'Tocando',
    dotClass: 'bg-status-ringing',
    bgClass: 'bg-status-ringing/20 text-status-ringing',
  },
  'in-call': {
    label: 'Em chamada',
    dotClass: 'bg-status-in-call',
    bgClass: 'bg-status-in-call/20 text-status-in-call',
  },
};

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
  lg: 'text-base px-3 py-1.5',
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
        'inline-flex items-center gap-2 rounded-full font-medium',
        config.bgClass,
        sizeClasses[size],
        className
      )}
    >
      <span className="relative flex">
        <span className={cn('rounded-full', config.dotClass, dotSizes[size])} />
        {(status === 'ringing' || status === 'in-call') && (
          <span className={cn('absolute inset-0 rounded-full animate-ping', config.dotClass, 'opacity-75')} />
        )}
      </span>
      {showLabel && <span>{config.label}</span>}
    </div>
  );
}
