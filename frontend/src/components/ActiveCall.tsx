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
  // State from parent
  isAccepting?: boolean;
  isMuted?: boolean;
  isOnHold?: boolean;
  isHoldLoading?: boolean;
  isHoldDisabled?: boolean;
  isCallConnected?: boolean;
  // Contact tracking info
  contactNumber?: number;
  contactNumberToday?: number;
  previouslyAnswered?: boolean;
  contactPeriod?: ContactPeriod;
  // Call SID for notes
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
  
  // Use props if provided, otherwise fall back to currentCall state
  const isMuted = isMutedProp ?? currentCall?.isMuted ?? false;
  const isOnHold = isOnHoldProp ?? currentCall?.isOnHold ?? false;
  
  // Hold button should only be visible when call is truly connected
  const showHoldButton = isCallConnected && !isHoldDisabled;

  const handleAnswer = () => {
    onAnswer?.();
  };

  const handleReject = () => {
    onReject?.();
    endCall();
  };

  const handleHangup = () => {
    onHangup?.();
  };

  const handleMute = () => {
    onToggleMute?.();
  };

  const handleHold = () => {
    onToggleHold?.();
  };

  // Incoming call modal
  if (callState === 'incoming' && currentCall) {
    return (
      <div className={cn('glass-card rounded-lg p-6 animate-fade-in', className)}>
        <div className="flex flex-col items-center text-center py-8">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center">
              <PhoneIncoming className="w-10 h-10 text-success" />
            </div>
            <div className="absolute inset-0 rounded-full bg-success/30 animate-pulse-ring" />
          </div>

          <h3 className="text-xl font-semibold mb-1">Chamada Recebida</h3>
          <p className="text-2xl font-mono mb-2">{currentCall.phoneNumber}</p>
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

  // No active call - show ready state or idle
  if ((callState === 'idle' || callState === 'ready') && !currentCall) {
    return (
      <div className={cn('glass-card rounded-lg p-6', className)}>
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
          <Phone className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg">Nenhuma chamada ativa</p>
          <p className="text-sm mt-1">
            {callState === 'ready' 
              ? 'Use o teclado para iniciar uma chamada' 
              : 'Aguardando conexão com Twilio...'}
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
    <div className={cn('glass-card rounded-lg p-6 animate-fade-in', className)}>
      <div className="flex flex-col items-center text-center">
        <StatusBadge status={getStatusType()} className="mb-4" />

        <div className="mb-2">
          <p className="text-sm text-muted-foreground mb-1">
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

        {/* Contact tracking info - shown during active calls */}
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
            <CallTimer
              startTime={currentCall.startTime}
              className="text-4xl font-mono font-bold text-primary"
            />
          ) : (
            <p className="text-lg text-muted-foreground animate-pulse">{getStatusLabel()}</p>
          )}
        </div>

        {callState === 'in-call' && (
          <div className="flex items-center gap-4 mt-4">
            <CallControlButton
              icon={isMuted ? MicOff : Mic}
              label={isMuted ? 'Ativar microfone' : 'Silenciar'}
              variant={isMuted ? 'warning' : 'default'}
              active={isMuted}
              onClick={handleMute}
            />
            {showHoldButton && (
              <CallControlButton
                icon={isOnHold ? Play : Pause}
                label={isHoldLoading ? 'Aguarde...' : isOnHold ? 'Retomar' : 'Pausar'}
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

        {/* Notes section during call */}
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
