import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { useTwilio } from '@/hooks/useTwilio';
import type { TwilioCallState } from '@/services/twilio';
import { Header } from '@/components/Header';
import { Dialpad } from '@/components/Dialpad';
import { ActiveCall } from '@/components/ActiveCall';
import { LeadCard } from '@/components/LeadCard';
import { CallHistory } from '@/components/CallHistory';
import { CallNoteModal } from '@/components/CallNoteModal';
import { MetricsDashboard } from '@/components/MetricsDashboard';
import { leadService, LeadWithTracking } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle2, Loader2, Phone } from 'lucide-react';
import { Lead, ContactPeriod, CallRecord } from '@/types';

export default function Dashboard() {
  const { state, dispatch, endCall } = useApp();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [autoDialProcessed, setAutoDialProcessed] = useState(false);
  const [isLoadingLead, setIsLoadingLead] = useState(false);
  const [callHistoryRefresh, setCallHistoryRefresh] = useState(0);
  const [allCalls, setAllCalls] = useState<CallRecord[]>([]);
  const [isLoadingCalls, setIsLoadingCalls] = useState(true);
  const [autoCallNumber, setAutoCallNumber] = useState<string | null>(null);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | null>(null);
  const [dialpadNumber, setDialpadNumber] = useState<string>('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const prevTwilioStateRef = useRef<TwilioCallState>('idle');
  
  // Contact tracking state
  const [contactNumber, setContactNumber] = useState<number | undefined>();
  const [contactNumberToday, setContactNumberToday] = useState<number | undefined>();
  const [previouslyAnswered, setPreviouslyAnswered] = useState<boolean | undefined>();
  const [contactPeriod, setContactPeriod] = useState<ContactPeriod | undefined>();
  
  // Note modal state
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [callEndLead, setCallEndLead] = useState<Lead | null>(null);
  const [callEndPhoneNumber, setCallEndPhoneNumber] = useState<string | null>(null);
  const [callEndDuration, setCallEndDuration] = useState<string | null>(null);

  // Clear contact tracking when call ends (local-only UI state)
  const clearContactTracking = useCallback(() => {
    setContactNumber(undefined);
    setContactNumberToday(undefined);
    setPreviouslyAnswered(undefined);
    setContactPeriod(undefined);
  }, []);
  
  const {
    callState: twilioCallState,
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
    error: twilioError,
    initialize,
    makeCall: twilioMakeCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute: twilioToggleMute,
    toggleHold: twilioToggleHold,
  } = useTwilio();

  // Initialize Twilio after login
  useEffect(() => {
    if (state.token && !isInitialized) {
      initialize();
    }
  }, [state.token, isInitialized, initialize]);

  // Sync Twilio state with App state
  useEffect(() => {
    dispatch({ type: 'SET_TWILIO_INITIALIZED', payload: isInitialized });
    if (isInitialized) {
      dispatch({ type: 'SET_CALL_STATE', payload: 'ready' });
    }
  }, [isInitialized, dispatch]);

  useEffect(() => {
    if (twilioError) {
      dispatch({ type: 'SET_TWILIO_ERROR', payload: twilioError });
    }
  }, [twilioError, dispatch]);

  // Sync call state from Twilio
  useEffect(() => {
    const prevTwilioState = prevTwilioStateRef.current;

    if (twilioCallState !== 'idle') {
      dispatch({ type: 'SET_CALL_STATE', payload: twilioCallState });
    }

    // If Twilio reports we're back to 'ready' but the app still has a currentCall,
    // it means the call ended remotely (lead hung up) and we must clear the UI.
    // IMPORTANT: only do this on a transition INTO 'ready' to avoid clearing a call
    // that was just created while Twilio state is still 'ready' (race during call start).
    if (twilioCallState === 'ready' && prevTwilioState !== 'ready' && state.currentCall) {
      dispatch({ type: 'SET_CURRENT_CALL', payload: null });
      dispatch({ type: 'SET_CURRENT_LEAD', payload: null });
      clearContactTracking();
    }
    
    if (callStartTime && state.currentCall) {
      dispatch({ type: 'UPDATE_CALL', payload: { startTime: callStartTime } });
    }
    
    if (isMuted !== state.currentCall?.isMuted) {
      dispatch({ type: 'UPDATE_CALL', payload: { isMuted } });
    }

    prevTwilioStateRef.current = twilioCallState;
  }, [twilioCallState, callStartTime, isMuted, dispatch, clearContactTracking, state.currentCall]);

  // Handle incoming calls
  useEffect(() => {
    if (incomingCall && twilioCallState === 'incoming') {
      const phoneNumber = incomingCall.from;
      
      dispatch({
        type: 'SET_CURRENT_CALL',
        payload: {
          direction: 'inbound',
          phoneNumber,
          startTime: null,
          isMuted: false,
          isOnHold: false,
        },
      });
      
      // Fetch lead info for incoming call
      fetchLeadByPhone(phoneNumber);
    }
  }, [incomingCall, twilioCallState]);

  // Handle click-to-call URL params (supports both 'call' and 'to' parameters)
  useEffect(() => {
    if (autoDialProcessed || !isInitialized) return;

    const toNumber = searchParams.get('to');
    const callNumber = searchParams.get('call');
    const leadId = searchParams.get('lead_id');
    const pendingCall = localStorage.getItem('pendingCall');
    
    // Prioritize: pending call from login > URL params
    const phoneToCall = pendingCall || callNumber || toNumber;

    const processParams = async () => {
      // Clear pending call from localStorage
      if (pendingCall) {
        localStorage.removeItem('pendingCall');
      }

      // Load lead info if provided
      if (leadId) {
        console.log('Lead ID:', leadId);
      }

      // Auto-dial if number provided
      if (phoneToCall) {
        // Show visual indicator
        setAutoCallNumber(phoneToCall);
        
        // Clear URL params to avoid re-dial on refresh
        if (callNumber || toNumber) {
          navigate('/dashboard', { replace: true });
        }
        
        // Wait 1 second before initiating call
        setTimeout(async () => {
          await handleCall(phoneToCall);
          setAutoCallNumber(null);
        }, 1000);
      }

      setAutoDialProcessed(true);
    };

    if (phoneToCall || leadId) {
      processParams();
    } else {
      setAutoDialProcessed(true);
    }
  }, [searchParams, autoDialProcessed, isInitialized, navigate]);

  const fetchLeadByPhone = async (phone: string) => {
    setIsLoadingLead(true);
    try {
      const result = await leadService.getByPhoneWithTracking(phone);
      if (result.lead) {
        dispatch({ type: 'SET_CURRENT_LEAD', payload: result.lead });
      }
      // Update contact tracking state
      setContactNumber(result.tracking?.contact_number);
      setContactNumberToday(result.tracking?.contact_number_today);
      setPreviouslyAnswered(result.tracking?.previously_answered);
      setContactPeriod(result.tracking?.contact_period);
    } catch (error) {
      console.error('Error fetching lead:', error);
    } finally {
      setIsLoadingLead(false);
    }
  };

  const handleCall = async (number: string) => {
    // Clean number
    const cleanNumber = number.replace(/[^\d+]/g, '');
    
    // Set up call in state
    dispatch({
      type: 'SET_CURRENT_CALL',
      payload: {
        direction: 'outbound',
        phoneNumber: cleanNumber,
        startTime: null,
        isMuted: false,
        isOnHold: false,
      },
    });

    // Fetch lead info
    await fetchLeadByPhone(cleanNumber);

    try {
      // Make the actual call via Twilio
      await twilioMakeCall(cleanNumber);
    } catch (error) {
      console.error('Failed to make call:', error);
      dispatch({ type: 'SET_CALL_STATE', payload: 'ready' });
      dispatch({ type: 'SET_CURRENT_CALL', payload: null });
    }
  };

  const handleAnswer = useCallback(async () => {
    try {
      await acceptCall();
    } catch (error) {
      console.error('Failed to accept call:', error);
    }
  }, [acceptCall]);

  const handleReject = useCallback(async () => {
    try {
      await rejectCall();
      dispatch({ type: 'SET_CURRENT_CALL', payload: null });
      dispatch({ type: 'SET_CURRENT_LEAD', payload: null });
    } catch (error) {
      console.error('Failed to reject call:', error);
    }
  }, [rejectCall, dispatch]);

  // Helper to format duration
  const formatCallDuration = (startTime: Date | null): string => {
    if (!startTime) return '';
    const now = new Date();
    const diffMs = now.getTime() - startTime.getTime();
    const totalSeconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleHangup = useCallback(async () => {
    // Capture call info before ending
    const leadForNote = state.currentLead;
    const phoneForNote = state.currentCall?.phoneNumber;
    const durationForNote = callStartTime ? formatCallDuration(callStartTime) : null;

    try {
      await hangup();
      endCall();
      // Clear contact tracking
      clearContactTracking();
      // Trigger refresh of call history after call ends
      setCallHistoryRefresh(prev => prev + 1);
      
      // Show note modal if we have lead info
      if (leadForNote?.id) {
        setCallEndLead(leadForNote);
        setCallEndPhoneNumber(phoneForNote || null);
        setCallEndDuration(durationForNote);
        setShowNoteModal(true);
      }
    } catch (error) {
      console.error('Failed to hangup:', error);
    }
  }, [hangup, endCall, clearContactTracking, state.currentLead, state.currentCall?.phoneNumber, callStartTime]);

  const handleToggleMute = useCallback(() => {
    twilioToggleMute();
  }, [twilioToggleMute]);

  const handleToggleHold = useCallback(() => {
    twilioToggleHold();
  }, [twilioToggleHold]);

  const handleCallFromHistory = (number: string) => {
    handleCall(number);
  };

  const handleViewLeadFromHistory = async (phoneNumber: string) => {
    // Track the selected phone number for the LeadCard
    setSelectedPhoneNumber(phoneNumber);
    // Clear current lead and fetch new one
    dispatch({ type: 'SET_CURRENT_LEAD', payload: null });
    await fetchLeadByPhone(phoneNumber);
  };

  const handleCallsLoaded = useCallback((calls: CallRecord[]) => {
    setAllCalls(calls);
    setIsLoadingCalls(false);
  }, []);

  const handleCallFromLeadCard = (phoneNumber: string) => {
    handleCall(phoneNumber);
  };

  const isInCall = state.callState !== 'idle' && state.callState !== 'ready';

  // Handle dialpad number change with debounce for lead lookup
  const handleDialpadNumberChange = useCallback((fullNumber: string) => {
    setDialpadNumber(fullNumber);
    
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Only search if number has at least 10 digits (excluding country code formatting)
    const digitsOnly = fullNumber.replace(/\D/g, '');
    if (digitsOnly.length >= 10 && !isInCall) {
      debounceRef.current = setTimeout(async () => {
        setSelectedPhoneNumber(fullNumber);
        dispatch({ type: 'SET_CURRENT_LEAD', payload: null });
        await fetchLeadByPhone(fullNumber);
      }, 500); // 500ms debounce
    }
  }, [isInCall, dispatch]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Note modal handlers
  const handleSaveNote = async (note: string) => {
    if (!callEndLead?.id) return;
    
    const success = await leadService.addNote(callEndLead.id, note);
    
    if (success) {
      toast({
        title: 'Nota salva!',
        description: 'A nota foi adicionada ao Attio com sucesso.',
      });
      setShowNoteModal(false);
      setCallEndLead(null);
      setCallEndPhoneNumber(null);
      setCallEndDuration(null);
    } else {
      toast({
        title: 'Erro ao salvar nota',
        description: 'Não foi possível salvar a nota. Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const handleSkipNote = () => {
    setShowNoteModal(false);
    setCallEndLead(null);
    setCallEndPhoneNumber(null);
    setCallEndDuration(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      {/* Twilio Status Banner */}
      {!isInitialized && !twilioError && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          <span className="text-sm text-amber-400">Conectando ao Twilio...</span>
        </div>
      )}

      {twilioError && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2.5 flex items-center justify-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-sm text-red-400">Erro Twilio: {twilioError}</span>
        </div>
      )}

      {isInitialized && !twilioError && state.callState === 'ready' && !autoCallNumber && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2.5 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-emerald-400">Conectado - Pronto para fazer e receber chamadas</span>
        </div>
      )}

      {/* Auto-call indicator */}
      {autoCallNumber && (
        <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-2.5 flex items-center justify-center gap-2">
          <Phone className="w-4 h-4 animate-pulse text-blue-400" />
          <span className="text-sm text-blue-400">Iniciando ligacao para {autoCallNumber}...</span>
        </div>
      )}

      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Metrics Dashboard */}
          <MetricsDashboard calls={allCalls} isLoading={isLoadingCalls} />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left - Dialpad */}
          <div className="lg:col-span-3">
            <Dialpad 
              onCall={handleCall} 
              onNumberChange={handleDialpadNumberChange}
              disabled={isInCall || !isInitialized} 
            />
          </div>

          {/* Center - Active Call */}
          <div className="lg:col-span-5">
            <ActiveCall 
              className="h-full min-h-[400px]"
              onAnswer={handleAnswer}
              onReject={handleReject}
              onHangup={handleHangup}
              onToggleMute={handleToggleMute}
              onToggleHold={handleToggleHold}
              isAccepting={isAccepting}
              isMuted={isMuted}
              isOnHold={isOnHold}
              isHoldLoading={isHoldLoading}
              isHoldDisabled={isHoldDisabled}
              isCallConnected={isCallConnected}
              contactNumber={contactNumber}
              contactNumberToday={contactNumberToday}
              previouslyAnswered={previouslyAnswered}
              contactPeriod={contactPeriod}
              callSid={callSid}
            />
          </div>

          {/* Right - Lead Info */}
          <div className="lg:col-span-4">
            <LeadCard 
              lead={state.currentLead} 
              className="h-full min-h-[400px]"
              isLoading={isLoadingLead}
              phoneNumber={selectedPhoneNumber || state.currentCall?.phoneNumber}
              onCall={handleCallFromLeadCard}
            />
          </div>

          {/* Bottom - Call History */}
          <div className="lg:col-span-12">
            <CallHistory
              onCallNumber={handleCallFromHistory}
              onViewLead={handleViewLeadFromHistory}
              refreshTrigger={callHistoryRefresh}
              onCallsLoaded={handleCallsLoaded}
            />
          </div>
          </div>
        </div>
      </main>

      {/* Call Note Modal */}
      <CallNoteModal
        open={showNoteModal}
        onOpenChange={setShowNoteModal}
        lead={callEndLead}
        phoneNumber={callEndPhoneNumber || undefined}
        callDuration={callEndDuration || undefined}
        onSave={handleSaveNote}
        onSkip={handleSkipNote}
      />
    </div>
  );
}
