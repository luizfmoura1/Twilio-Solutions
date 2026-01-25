import { useState } from 'react';
import { CallRecord } from '@/types';
import { ArrowUpRight, ArrowDownLeft, Phone, PhoneMissed, PhoneOff, Voicemail, Clock, Play, PhoneCall, User, ChevronDown, ChevronUp, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Button } from './ui/button';
import { ContactHistoryBadge } from './ContactHistoryBadge';
import { CallHistoryNotes } from './CallHistoryNotes';

const dispositionConfig: Record<string, { icon: typeof Phone; label: string; className: string }> = {
  'answered': { icon: Phone, label: 'Atendida', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  'no-answer': { icon: PhoneMissed, label: 'Sem resposta', className: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  'busy': { icon: PhoneOff, label: 'Ocupado', className: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  'voicemail': { icon: Voicemail, label: 'Caixa postal', className: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  'failed': { icon: Clock, label: 'Falhou', className: 'text-red-400 bg-red-500/10 border-red-500/20' },
  'canceled': { icon: PhoneOff, label: 'Cancelada', className: 'text-muted-foreground bg-muted/50 border-border/30' },
};

const getDisposition = (disposition: string | null) => {
  return dispositionConfig[disposition || 'failed'] || dispositionConfig['failed'];
};

const getWorkerName = (record: CallRecord): string => {
  if (record.worker_name) {
    return record.worker_name.charAt(0).toUpperCase() + record.worker_name.slice(1);
  }
  if (record.worker_email) {
    const name = record.worker_email.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return '-';
};

interface CallHistoryRowProps {
  record: CallRecord;
  onClick?: (record: CallRecord) => void;
  onPlayRecording?: (url: string) => void;
  onViewLead?: (phoneNumber: string) => void;
}

export function CallHistoryRow({ record, onClick, onPlayRecording, onViewLead }: CallHistoryRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeToAnswer = (): string | null => {
    if (record.disposition !== 'answered' || !record.answered_at || !record.started_at) {
      return null;
    }
    const answeredAt = new Date(record.answered_at);
    const startedAt = new Date(record.started_at);
    const diffSeconds = Math.floor((answeredAt.getTime() - startedAt.getTime()) / 1000);
    if (diffSeconds < 0 || diffSeconds > 300) return null;
    return `${diffSeconds}s`;
  };

  const timeToAnswer = getTimeToAnswer();
  const disposition = getDisposition(record.disposition);
  const StatusIcon = disposition.icon;
  const hasNotes = !!record.resumo;

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (record.recording_url && onPlayRecording) {
      onPlayRecording(record.recording_url);
    }
  };

  const handleCallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(record);
  };

  const handlePhoneClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onViewLead) {
      onViewLead(record.phoneNumber);
    }
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="table-row-hover border-b border-border/30 last:border-0">
      <div className="px-4 py-3 grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto_auto_auto] gap-3 items-center">
        {/* Direction icon */}
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border',
          record.direction === 'outbound'
            ? 'bg-blue-500/10 border-blue-500/20'
            : 'bg-emerald-500/10 border-emerald-500/20'
        )}>
          {record.direction === 'outbound' ? (
            <ArrowUpRight className="w-4 h-4 text-blue-400" />
          ) : (
            <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
          )}
        </div>

        {/* Main info */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePhoneClick}
              className="font-medium text-sm truncate text-foreground hover:text-primary transition-colors focus:outline-none"
            >
              {record.phoneNumber}
            </button>
            {(record.caller_city || record.lead_state) && (
              <span className="text-[10px] text-muted-foreground/70 bg-muted/30 px-1.5 py-0.5 rounded hidden sm:inline border border-border/20">
                {record.caller_city && record.lead_state
                  ? `${record.caller_city}, ${record.lead_state}`
                  : record.lead_state || record.caller_city}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span className="font-mono">{format(record.timestamp, 'dd/MM HH:mm')}</span>
            <span className="hidden sm:inline text-border">|</span>
            <span className="hidden sm:inline">{record.direction === 'outbound' ? 'Saida' : 'Entrada'}</span>
          </div>
        </div>

        {/* Contact badge */}
        <div className="w-12 hidden sm:flex justify-center">
          <ContactHistoryBadge
            contactNumber={record.contact_number}
            contactNumberToday={record.contact_number_today}
            previouslyAnswered={record.previously_answered}
            variant="compact"
          />
        </div>

        {/* Status badge */}
        <div className="w-24 hidden sm:flex justify-center">
          <span className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border',
            disposition.className
          )}>
            <StatusIcon className="w-3 h-3" />
            {disposition.label}
          </span>
        </div>

        {/* Time to answer */}
        <div className="w-14 hidden sm:flex justify-center" title="Tempo para atender">
          {timeToAnswer ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono text-violet-400 bg-violet-500/10 border border-violet-500/20">
              <Timer className="w-3 h-3" />
              {timeToAnswer}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/40">-</span>
          )}
        </div>

        {/* Duration */}
        <div className="w-14 text-center">
          <span className="text-xs font-mono text-muted-foreground bg-muted/30 px-2 py-0.5 rounded">
            {formatDuration(record.duration)}
          </span>
        </div>

        {/* SDR */}
        <div className="w-20 hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center border border-border/30">
            <User className="w-3 h-3" />
          </div>
          <span className="truncate">{getWorkerName(record)}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {record.recording_url && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-primary/10"
              onClick={handlePlayClick}
              title="Ouvir gravacao"
            >
              <Play className="w-3.5 h-3.5 text-primary" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-emerald-500/10"
            onClick={handleCallClick}
            title="Ligar novamente"
          >
            <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
          </Button>
        </div>

        {/* Expand */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleExpandClick}
          title={isExpanded ? 'Ocultar notas' : 'Ver/adicionar notas'}
        >
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className={cn(
              'w-3.5 h-3.5',
              hasNotes ? 'text-primary' : 'text-muted-foreground/50'
            )} />
          )}
        </Button>
      </div>

      {/* Expanded notes */}
      {isExpanded && (
        <div className="px-4 pb-4 pl-16 animate-fade-in">
          <CallHistoryNotes
            callSid={record.call_sid}
            initialValue={record.resumo}
          />
        </div>
      )}
    </div>
  );
}
