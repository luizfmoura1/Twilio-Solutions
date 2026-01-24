import { cn } from '@/lib/utils';
import { Phone, CheckCircle, Circle, Sun, CloudSun, Moon, Sparkles } from 'lucide-react';
import { ContactPeriod } from '@/types';

interface ContactHistoryBadgeProps {
  contactNumber?: number;
  contactNumberToday?: number;
  previouslyAnswered?: boolean;
  contactPeriod?: ContactPeriod;
  variant?: 'compact' | 'full' | 'inline';
  className?: string;
}

const periodConfig: Record<ContactPeriod, { icon: typeof Sun; label: string; emoji: string }> = {
  morning: { icon: Sun, label: 'Manhã', emoji: '☀️' },
  afternoon: { icon: CloudSun, label: 'Tarde', emoji: '🌤️' },
  evening: { icon: Moon, label: 'Noite', emoji: '🌙' },
};

export function ContactHistoryBadge({
  contactNumber,
  contactNumberToday,
  previouslyAnswered,
  contactPeriod,
  variant = 'full',
  className,
}: ContactHistoryBadgeProps) {
  const isFirstContact = contactNumber === 1;
  const period = contactPeriod ? periodConfig[contactPeriod] : null;

  // Compact variant - just shows contact number badge
  if (variant === 'compact') {
    if (!contactNumber) return null;
    
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-medium',
          isFirstContact 
            ? 'bg-primary/10 text-primary' 
            : 'bg-muted text-muted-foreground',
          className
        )}
        title={`Ligação #${contactNumber}${contactNumberToday ? ` (${contactNumberToday}ª de hoje)` : ''}`}
      >
        #{contactNumber}
      </span>
    );
  }

  // Inline variant - single line summary
  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-2 flex-wrap text-xs', className)}>
        {contactNumber && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium',
              isFirstContact
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Phone className="w-3 h-3" />
            #{contactNumber}
            {contactNumberToday && contactNumberToday > 0 && (
              <span className="opacity-70">({contactNumberToday}ª hoje)</span>
            )}
          </span>
        )}
        
        {previouslyAnswered !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium',
              previouslyAnswered
                ? 'bg-success/10 text-success'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {previouslyAnswered ? (
              <>
                <CheckCircle className="w-3 h-3" />
                Já atendeu
              </>
            ) : (
              <>
                <Circle className="w-3 h-3" />
                Nunca atendeu
              </>
            )}
          </span>
        )}

        {period && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-muted-foreground font-medium">
            <span>{period.emoji}</span>
            {period.label}
          </span>
        )}
      </div>
    );
  }

  // Full variant - detailed display
  return (
    <div className={cn('space-y-2', className)}>
      {/* Contact number info */}
      {contactNumber && (
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium',
              isFirstContact
                ? 'bg-primary/10 text-primary'
                : 'bg-muted'
            )}
          >
            <Phone className="w-4 h-4" />
            <span>Ligação #{contactNumber}</span>
            {contactNumberToday !== undefined && contactNumberToday > 0 && (
              <span className="text-muted-foreground">
                ({contactNumberToday}ª de hoje)
              </span>
            )}
          </div>
          {isFirstContact && (
            <span className="inline-flex items-center gap-1 text-xs text-primary font-medium animate-pulse">
              <Sparkles className="w-3.5 h-3.5" />
              Primeiro contato!
            </span>
          )}
        </div>
      )}

      {/* Previously answered badge */}
      {previouslyAnswered !== undefined && (
        <div
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium',
            previouslyAnswered
              ? 'bg-success/10 text-success'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {previouslyAnswered ? (
            <>
              <CheckCircle className="w-4 h-4" />
              <span>Já atendeu anteriormente</span>
            </>
          ) : (
            <>
              <Circle className="w-4 h-4" />
              <span>Nunca atendeu</span>
            </>
          )}
        </div>
      )}

      {/* Period info */}
      {period && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted text-sm">
          <span className="text-base">{period.emoji}</span>
          <span>{period.label} (horário do lead)</span>
        </div>
      )}
    </div>
  );
}
