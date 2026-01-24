import { useState } from 'react';
import { CallRecord } from '@/types';
import { ArrowUpRight, ArrowDownLeft, Phone, PhoneMissed, PhoneOff, Voicemail, Clock, Play, PhoneCall, User, ChevronDown, ChevronUp, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Button } from './ui/button';
import { ContactHistoryBadge } from './ContactHistoryBadge';
import { CallHistoryNotes } from './CallHistoryNotes';
// Disposition configuration with Portuguese labels and colors
const dispositionConfig: Record<string, { icon: typeof Phone; label: string; className: string }> = {
  'answered': { icon: Phone, label: 'Atendida', className: 'text-success bg-success/10' },
  'no-answer': { icon: PhoneMissed, label: 'Não atendeu', className: 'text-yellow-500 bg-yellow-500/10' },
  'busy': { icon: PhoneOff, label: 'Ocupado', className: 'text-orange-500 bg-orange-500/10' },
  'voicemail': { icon: Voicemail, label: 'Caixa postal', className: 'text-purple-500 bg-purple-500/10' },
  'failed': { icon: Clock, label: 'Falhou', className: 'text-destructive bg-destructive/10' },
  'canceled': { icon: PhoneOff, label: 'Cancelada', className: 'text-muted-foreground bg-muted' },
};

const getDisposition = (disposition: string | null) => {
  return dispositionConfig[disposition || 'failed'] || dispositionConfig['failed'];
};

// Helper to get worker display name
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

  // Calculate time to answer (difference between answered_at and started_at)
  const getTimeToAnswer = (): string | null => {
    if (record.disposition !== 'answered' || !record.answered_at || !record.started_at) {
      return null;
    }
    const answeredAt = new Date(record.answered_at);
    const startedAt = new Date(record.started_at);
    const diffSeconds = Math.floor((answeredAt.getTime() - startedAt.getTime()) / 1000);
    if (diffSeconds < 0 || diffSeconds > 300) return null; // Sanity check: max 5 minutes
    return `${diffSeconds}s`;
  };

  const timeToAnswer = getTimeToAnswer();

  const disposition = getDisposition(record.disposition);
  const StatusIcon = disposition.icon;
  
  // Check if this row has notes or should show notes
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
    <div className="hover:bg-muted/50 transition-colors">
      {/* Main row */}
      <div className="px-4 py-3 grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto_auto_auto] gap-3 items-center">
        {/* Direction icon */}
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          record.direction === 'outbound' ? 'bg-primary/10' : 'bg-success/10'
        )}>
          {record.direction === 'outbound' ? (
            <ArrowUpRight className="w-4 h-4 text-primary" />
          ) : (
            <ArrowDownLeft className="w-4 h-4 text-success" />
          )}
        </div>

        {/* Main info - Phone, Date, Direction */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePhoneClick}
              className="font-medium text-sm truncate text-primary hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 rounded"
            >
              {record.phoneNumber}
            </button>
            {/* Location: city, state or just state */}
            {(record.caller_city || record.lead_state) && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded hidden sm:inline">
                {record.caller_city && record.lead_state 
                  ? `${record.caller_city}, ${record.lead_state}`
                  : record.lead_state || record.caller_city}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>{format(record.timestamp, 'dd/MM HH:mm')}</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">{record.direction === 'outbound' ? 'Saída' : 'Entrada'}</span>
          </div>
        </div>

        {/* Contact number column */}
        <div className="w-12 hidden sm:flex justify-center">
          <ContactHistoryBadge
            contactNumber={record.contact_number}
            contactNumberToday={record.contact_number_today}
            previouslyAnswered={record.previously_answered}
            variant="compact"
          />
        </div>

        {/* Status badge - Fixed width column */}
        <div className="w-24 hidden sm:flex justify-center">
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap',
            disposition.className
          )}>
            <StatusIcon className="w-3 h-3" />
            {disposition.label}
          </span>
        </div>

        {/* Time to answer - Fixed width column */}
        <div className="w-14 hidden sm:flex justify-center" title="Tempo para atender">
          {timeToAnswer ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono text-blue-500 bg-blue-500/10">
              <Timer className="w-3 h-3" />
              {timeToAnswer}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>

        {/* Duration - Fixed width column */}
        <div className="w-12 text-center">
          <span className="text-xs font-mono text-muted-foreground">
            {formatDuration(record.duration)}
          </span>
        </div>

        {/* SDR - Fixed width column */}
        <div className="w-20 hidden md:flex items-center gap-1 text-xs text-muted-foreground">
          <User className="w-3 h-3 shrink-0" />
          <span className="truncate">{getWorkerName(record)}</span>
        </div>

        {/* Actions - Fixed width column */}
        <div className="flex items-center gap-1 shrink-0">
          {record.recording_url && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handlePlayClick}
              title="Ouvir gravação"
            >
              <Play className="w-3.5 h-3.5 text-primary" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCallClick}
            title="Ligar novamente"
          >
            <PhoneCall className="w-3.5 h-3.5 text-success" />
          </Button>
        </div>

        {/* Expand/collapse for notes */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleExpandClick}
          title={isExpanded ? 'Ocultar notas' : 'Ver/adicionar notas'}
        >
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className={cn(
              'w-3.5 h-3.5',
              hasNotes ? 'text-primary' : 'text-muted-foreground'
            )} />
          )}
        </Button>
      </div>

      {/* Expanded notes section */}
      {isExpanded && (
        <div className="px-4 pb-3 pl-14">
          <CallHistoryNotes
            callSid={record.call_sid}
            initialValue={record.resumo}
          />
        </div>
      )}
    </div>
  );
}
