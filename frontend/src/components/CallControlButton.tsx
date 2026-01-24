import { cn } from '@/lib/utils';
import { LucideIcon, Loader2 } from 'lucide-react';

interface CallControlButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'muted';
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const variantClasses = {
  default: 'bg-secondary hover:bg-secondary/80 text-foreground',
  success: 'bg-success hover:bg-success/90 text-success-foreground shadow-glow-success',
  danger: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-glow-destructive',
  warning: 'bg-warning hover:bg-warning/90 text-warning-foreground',
  muted: 'bg-muted hover:bg-muted/80 text-muted-foreground',
};

const activeClasses = {
  default: 'bg-primary text-primary-foreground shadow-glow',
  success: 'bg-success/50 ring-2 ring-success',
  danger: 'bg-destructive/50 ring-2 ring-destructive',
  warning: 'bg-warning/50 ring-2 ring-warning',
  muted: 'bg-accent text-accent-foreground',
};

const sizeClasses = {
  sm: 'w-10 h-10',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
};

const iconSizes = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export function CallControlButton({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
  active = false,
  disabled = false,
  loading = false,
  size = 'md',
  className,
}: CallControlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={label}
      className={cn(
        'call-button rounded-full flex items-center justify-center transition-all',
        sizeClasses[size],
        active ? activeClasses[variant] : variantClasses[variant],
        (disabled || loading) && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {loading ? (
        <Loader2 className={cn(iconSizes[size], 'animate-spin')} />
      ) : (
        <Icon className={iconSizes[size]} />
      )}
    </button>
  );
}
