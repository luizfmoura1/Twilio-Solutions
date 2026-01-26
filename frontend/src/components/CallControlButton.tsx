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
  default: 'bg-secondary/80 hover:bg-secondary text-foreground border-border/50',
  success: 'bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white border-emerald-400/30 shadow-lg shadow-emerald-500/25',
  danger: 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white border-red-400/30 shadow-lg shadow-red-500/25',
  warning: 'bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white border-amber-400/30 shadow-lg shadow-amber-500/25',
  muted: 'bg-muted/50 hover:bg-muted text-muted-foreground border-border/30',
};

const activeClasses = {
  default: 'bg-primary text-primary-foreground border-primary/50 shadow-lg shadow-primary/25',
  success: 'ring-2 ring-emerald-400/50 ring-offset-2 ring-offset-background',
  danger: 'ring-2 ring-red-400/50 ring-offset-2 ring-offset-background',
  warning: 'ring-2 ring-amber-400/50 ring-offset-2 ring-offset-background',
  muted: 'bg-accent text-accent-foreground border-accent/50',
};

const sizeClasses = {
  sm: 'w-11 h-11',
  md: 'w-14 h-14',
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
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        title={label}
        className={cn(
          'rounded-full flex items-center justify-center transition-all duration-200 border',
          'hover:scale-105 active:scale-95',
          sizeClasses[size],
          variantClasses[variant],
          active && activeClasses[variant],
          (disabled || loading) && 'opacity-50 cursor-not-allowed hover:scale-100',
          className
        )}
      >
        {loading ? (
          <Loader2 className={cn(iconSizes[size], 'animate-spin')} />
        ) : (
          <Icon className={iconSizes[size]} />
        )}
      </button>
      <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">{label}</span>
    </div>
  );
}
