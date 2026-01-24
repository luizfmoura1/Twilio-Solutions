import { useState, useCallback, useRef, useEffect } from 'react';
import { twilioService, TwilioCallState } from '@/services/twilio';
import { twilioTokenService } from '@/services/api';
import { Call } from '@twilio/voice-sdk';
import { useRingtone } from './useRingtone';
import { toast } from 'sonner';

interface UseTwilioReturn {
  callState: TwilioCallState;
  incomingCall: { from: string } | null;
  isMuted: boolean;
  isOnHold: boolean;
  isHoldLoading: boolean;
  isHoldDisabled: boolean;
  isCallConnected: boolean;
  isAccepting: boolean;
  isInitialized: boolean;
  callStartTime: Date | null;
  callSid: string | null;
  error: string | null;
  initialize: () => Promise<void>;
  makeCall: (number: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  hangup: () => Promise<void>;
  toggleMute: () => void;
  toggleHold: () => Promise<void>;
}

export function useTwilio(): UseTwilioReturn {
  const [callState, setCallState] = useState<TwilioCallState>('idle');
  const [incomingCall, setIncomingCall] = useState<{ from: string } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [isHoldLoading, setIsHoldLoading] = useState(false);
  const [isHoldDisabled, setIsHoldDisabled] = useState(true);
  const [isCallConnected, setIsCallConnected] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [callSid, setCallSid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const initializingRef = useRef(false);
  const ringtone = useRingtone();

  const handleStateChange = useCallback((state: TwilioCallState) => {
    setCallState(state);
    
    // Check if call is truly connected from service
    const connected = twilioService.isCallConnected();
    setIsCallConnected(connected);
    
    if (state === 'ready') {
      setIsInitialized(true);
      setIncomingCall(null);
      setCallStartTime(null);
      setCallSid(null);
      setIsMuted(false);
      setIsOnHold(false);
      setIsAccepting(false);
      setIsHoldDisabled(true);
      setIsCallConnected(false);
    }
    
    if (state === 'in-call') {
      setCallStartTime(new Date());
      setIsAccepting(false);
      // Enable hold only when truly connected
      setIsHoldDisabled(!connected);
      setIsCallConnected(connected);
      // Capture call SID when connected
      const sid = twilioService.getLeadCallSid();
      if (sid) {
        setCallSid(sid);
      }
    }
  }, []);

  const handleIncoming = useCallback((call: Call, from: string) => {
    setIncomingCall({ from });
    ringtone.play();
  }, [ringtone]);

  const handleIncomingCancel = useCallback(() => {
    console.log('Incoming call cancelled');
    setIncomingCall(null);
    ringtone.stop();
  }, [ringtone]);

  const handleError = useCallback((err: Error) => {
    console.error('Twilio error:', err);
    setError(err.message);
  }, []);

  const handleDisconnect = useCallback(() => {
    console.log('Call disconnected - resetting all call state');
    setCallState('ready');
    setCallStartTime(null);
    setIsMuted(false);
    setIsOnHold(false);
    setIsHoldLoading(false);
    setIsHoldDisabled(true);
    setIsCallConnected(false);
    setIsAccepting(false);
    setIncomingCall(null);
    ringtone.stop();
  }, [ringtone]);

  const initialize = useCallback(async () => {
    if (initializingRef.current || isInitialized) {
      return;
    }

    initializingRef.current = true;
    setError(null);

    try {
      // Get Twilio access token from backend
      const token = await twilioTokenService.getAccessToken();
      
      // Initialize Twilio with token and callbacks
      await twilioService.initialize(token, {
        onStateChange: handleStateChange,
        onIncoming: handleIncoming,
        onIncomingCancel: handleIncomingCancel,
        onError: handleError,
        onDisconnect: handleDisconnect,
      });

      setIsInitialized(true);
      setCallState('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao conectar com Twilio';
      setError(message);
      setCallState('idle');
    } finally {
      initializingRef.current = false;
    }
  }, [isInitialized, handleStateChange, handleIncoming, handleIncomingCancel, handleError, handleDisconnect]);

  const makeCall = useCallback(async (number: string) => {
    try {
      setError(null);
      await twilioService.makeCall(number);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao iniciar chamada';
      setError(message);
      throw err;
    }
  }, []);

  const acceptCall = useCallback(async () => {
    if (isAccepting) return; // Prevent multiple clicks
    
    try {
      setIsAccepting(true);
      setError(null);
      ringtone.stop();
      await twilioService.acceptCall();
      setCallStartTime(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao atender chamada';
      setError(message);
      setIsAccepting(false);
      throw err;
    }
  }, [ringtone, isAccepting]);

  const rejectCall = useCallback(async () => {
    try {
      setError(null);
      ringtone.stop();
      await twilioService.rejectCall();
      setIncomingCall(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao rejeitar chamada';
      setError(message);
      throw err;
    }
  }, [ringtone]);

  const hangup = useCallback(async () => {
    try {
      setError(null);
      await twilioService.hangup();
      setCallStartTime(null);
      setIsMuted(false);
      setIsOnHold(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao desligar chamada';
      setError(message);
      throw err;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const newMuteState = twilioService.toggleMute();
    setIsMuted(newMuteState);
  }, []);

  const toggleHold = useCallback(async () => {
    if (isHoldLoading || isHoldDisabled) return; // Prevent multiple clicks or when disabled
    
    const newHoldState = !isOnHold;
    setIsHoldLoading(true);
    
    try {
      const result = await twilioService.setHold(newHoldState);
      setIsOnHold(result);
    } catch (error: any) {
      console.error('Failed to toggle hold:', error);
      
      // Handle specific error: call not active
      const errorMessage = error?.message || '';
      if (errorMessage.includes('Call is not active') || errorMessage.includes('not active')) {
        toast.error('Chamada já encerrada');
        setIsHoldDisabled(true);
        setIsOnHold(false);
      } else {
        toast.error('Erro ao colocar em espera');
      }
    } finally {
      setIsHoldLoading(false);
    }
  }, [isOnHold, isHoldLoading, isHoldDisabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      twilioService.destroy();
    };
  }, []);

  return {
    callState,
    incomingCall,
    isMuted,
    isOnHold,
    isHoldLoading,
    isHoldDisabled,
    isCallConnected,
    isAccepting,
    isInitialized,
    callStartTime,
    callSid,
    error,
    initialize,
    makeCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
    toggleHold,
  };
}
