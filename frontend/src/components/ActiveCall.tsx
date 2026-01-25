import { useApp } from '@/contexts/AppContext';
import { CallTimer } from './CallTimer';
import { CallControlButton } from './CallControlButton';
import { StatusBadge } from './StatusBadge';
import { ContactHistoryBadge } from './ContactHistoryBadge';
import { CallNotes } from './CallNotes';
import { Mic, MicOff, Pause, Play, PhoneOff, Phone, PhoneIncoming } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContactPeriod } from '@/types';

interface ActiveCallProps {
  className?: string;
  onAnswer?: () => void;
  onReject?: () => void;
  onHangup?: () => void;
  onToggleMute?: () => void;
  onToggleHold?: () => void;
  isAccepting?: boolean;
  isMuted?: boolean;
  isOnHold?: boolean;
  isHoldLoading?: boolean;
  isHoldDisabled?: boolean;
  isCallConnected?: boolean;
  contactNumber?: number;
  contactNumberToday?: number;
  previouslyAnswered?: boolean;
  contactPeriod?: ContactPeriod;
  callSid?: string | null;
}

export function ActiveCall({
  className,
  onAnswer,
  onReject,
  onHangup,
  onToggleMute,
  onToggleHold,
  isAccepting = false,
  isMuted: isMutedProp,
  isOnHold: isOnHoldProp,
  isHoldLoading = false,
  isHoldDisabled = true,
  isCallConnected = false,
  contactNumber,
  contactNumberToday,
  previouslyAnswered,
  contactPeriod,
  callSid,
}: ActiveCallProps) {
  const { state, endCall } = useApp();
  const { callState, currentCall, currentLead } = state;

  const isMuted = isMutedProp ?? currentCall?.isMuted ?? false;
  const isOnHold = isOnHoldProp ?? currentCall?.isOnHold ?? false;
  const showHoldButton = isCallConnected && !isHoldDisabled;

  const handleAnswer = () => onAnswer?.();
  const handleReject = () => {
    onReject?.();
    endCall();
  };
  const handleHangup = () => onHangup?.();
  const handleMute = () => onToggleMute?.();
  const handleHold = () => onToggleHold?.();

  // Incoming call
  if (callState === 'incoming' && currentCall) {
    return (
      <div className={cn('modern-card p-6 animate-fade-in', className)}>
        <div className="flex flex-col items-center text-center py-6">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500/30 to-emerald-600/20 flex items-center justify-center border border-emerald-500/30">
              <PhoneIncoming className="w-9 h-9 text-emerald-400" />
            </div>
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
            <div className="absolute inset-[-8px] rounded-full border-2 border-emerald-500/30 animate-pulse" />
          </div>

          <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-2">
            Chamada Recebida
          </p>
          <p className="text-2xl font-mono font-bold mb-1">{currentCall.phoneNumber}</p>
          {currentLead && (
            <p className="text-muted-foreground">{currentLead.name}</p>
          )}

          <div className="flex gap-4 mt-8">
            <CallControlButton
              icon={PhoneOff}
              label="Rejeitar"
              variant="danger"
              size="lg"
              onClick={handleReject}
              disabled={isAccepting}
            />
            <CallControlButton
              icon={Phone}
              label={isAccepting ? 'Conectando...' : 'Atender'}
              variant="success"
              size="lg"
              onClick={handleAnswer}
              loading={isAccepting}
              disabled={isAccepting}
            />
          </div>
        </div>
      </div>
    );
  }

  // No active call
  if ((callState === 'idle' || callState === 'ready') && !currentCall) {
    return (
      <div className={cn('modern-card p-6', className)}>
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
          <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mb-4 border border-border/30">
            <Phone className="w-9 h-9 opacity-40" />
          </div>
          <p className="text-lg font-medium text-foreground/70">Nenhuma chamada ativa</p>
          <p className="text-sm mt-1 text-muted-foreground/70">
            {callState === 'ready'
              ? 'Use o teclado para iniciar uma chamada'
              : 'Aguardando conexao com Twilio...'}
          </p>
        </div>
      </div>
    );
  }

  // Active call states
  const getStatusLabel = () => {
    switch (callState) {
      case 'dialing':
        return 'Discando...';
      case 'ringing':
        return 'Chamando...';
      case 'in-call':
        return isOnHold ? 'Em espera' : 'Em chamada';
      default:
        return '';
    }
  };

  const getStatusType = () => {
    if (isOnHold) return 'busy';
    if (callState === 'in-call') return 'in-call';
    return 'ringing';
  };

  const hasContactInfo = contactNumber !== undefined || previouslyAnswered !== undefined;

  return (
    <div className={cn('modern-card p-6 animate-fade-in', className)}>
      <div className="flex flex-col items-center text-center">
        <StatusBadge status={getStatusType()} className="mb-4" />

        <div className="mb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            {currentCall?.direction === 'outbound' ? 'Ligando para' : 'Recebendo de'}
          </p>
          {currentLead ? (
            <>
              <h2 className="text-2xl font-bold">{currentLead.name}</h2>
              <p className="text-lg font-mono text-muted-foreground">{currentCall?.phoneNumber}</p>
            </>
          ) : (
            <h2 className="text-2xl font-bold font-mono">{currentCall?.phoneNumber}</h2>
          )}
        </div>

        {hasContactInfo && (
          <div className="mb-4 w-full">
            <ContactHistoryBadge
              contactNumber={contactNumber}
              contactNumberToday={contactNumberToday}
              previouslyAnswered={previouslyAnswered}
              contactPeriod={contactPeriod}
              variant="inline"
              className="justify-center"
            />
          </div>
        )}

        <div className="my-6">
          {callState === 'in-call' && currentCall?.startTime ? (
            <div className="relative">
              <CallTimer
                startTime={currentCall.startTime}
                className="text-4xl font-mono font-bold text-primary"
              />
              <div className="absolute -inset-4 bg-primary/5 rounded-xl -z-10" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <p className="text-lg text-muted-foreground">{getStatusLabel()}</p>
            </div>
          )}
        </div>

        {callState === 'in-call' && (
          <div className="flex items-center gap-3 mt-4">
            <CallControlButton
              icon={isMuted ? MicOff : Mic}
              label={isMuted ? 'Ativar' : 'Mudo'}
              variant={isMuted ? 'warning' : 'default'}
              active={isMuted}
              onClick={handleMute}
            />
            {showHoldButton && (
              <CallControlButton
                icon={isOnHold ? Play : Pause}
                label={isHoldLoading ? '...' : isOnHold ? 'Retomar' : 'Espera'}
                variant={isOnHold ? 'warning' : 'default'}
                active={isOnHold}
                onClick={handleHold}
                loading={isHoldLoading}
                disabled={isHoldLoading}
              />
            )}
            <CallControlButton
              icon={PhoneOff}
              label="Desligar"
              variant="danger"
              size="lg"
              onClick={handleHangup}
            />
          </div>
        )}

        {callState === 'in-call' && callSid && (
          <CallNotes callSid={callSid} className="mt-6 w-full max-w-md" />
        )}

        {(callState === 'dialing' || callState === 'ringing') && (
          <CallControlButton
            icon={PhoneOff}
            label="Cancelar"
            variant="danger"
            size="lg"
            onClick={handleHangup}
            className="mt-4"
          />
        )}
      </div>
    </div>
  );
}
