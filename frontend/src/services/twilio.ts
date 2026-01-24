// Twilio Voice SDK Service
import { Device, Call } from '@twilio/voice-sdk';
import { holdService } from './api';

export type TwilioCallState = 'idle' | 'ready' | 'dialing' | 'ringing' | 'in-call' | 'incoming';

export interface TwilioCallbacks {
  onIncoming?: (call: Call, from: string) => void;
  onIncomingCancel?: () => void;
  onStateChange?: (state: TwilioCallState) => void;
  onError?: (error: Error) => void;
  onDisconnect?: () => void;
}

class TwilioService {
  private device: Device | null = null;
  private currentCall: Call | null = null;
  private callbacks: TwilioCallbacks = {};
  private isInitialized = false;
  private agentIdentity: string = '';
  private leadCallSid: string | null = null;
  private holdState: boolean = false;
  private callConnected: boolean = false;

  async initialize(token: string, callbacks: TwilioCallbacks): Promise<void> {
    this.callbacks = callbacks;

    try {
      // Destroy existing device if any
      if (this.device) {
        this.device.destroy();
      }

      // Create new Twilio Device
      this.device = new Device(token, {
        logLevel: 1,
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      });

      // Register event handlers
      this.device.on('registered', () => {
        console.log('Twilio Device registered and ready');
        this.isInitialized = true;
        // Store agent identity from the token response (stored in localStorage)
        const workerEmail = localStorage.getItem('workerEmail') || '';
        this.agentIdentity = workerEmail.replace(/[@.]/g, '');
        console.log('Agent identity:', this.agentIdentity);
        this.callbacks.onStateChange?.('ready');
      });

      this.device.on('unregistered', () => {
        console.log('Twilio Device unregistered');
        this.isInitialized = false;
        this.callbacks.onStateChange?.('idle');
      });

      this.device.on('error', (error) => {
        console.error('Twilio Device error:', error);
        this.callbacks.onError?.(error);
      });

      this.device.on('incoming', (call: Call) => {
        console.log('Incoming call from:', call.parameters.From);
        this.currentCall = call;
        
        // Set up incoming-specific cancel handler
        call.on('cancel', () => {
          console.log('Incoming call cancelled by caller');
          this.currentCall = null;
          this.callbacks.onIncomingCancel?.();
          this.callbacks.onStateChange?.('ready');
        });
        
        // Set up call event handlers
        this.setupCallHandlers(call);
        
        // Notify about incoming call
        this.callbacks.onIncoming?.(call, call.parameters.From || 'Unknown');
        this.callbacks.onStateChange?.('incoming');
      });

      // Register the device
      await this.device.register();
      console.log('Twilio service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Twilio:', error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  private setupCallHandlers(call: Call): void {
    call.on('accept', () => {
      console.log('Call accepted');
      // Try to get the lead's call SID from call parameters
      // For outbound: DialCallSid or ParentCallSid
      // For inbound: the call.parameters.CallSid is the lead's leg
      const params = call.parameters as Record<string, string>;
      this.leadCallSid = params.DialCallSid || params.ParentCallSid || params.CallSid || null;
      console.log('Lead call SID:', this.leadCallSid);
      console.log('Call parameters:', params);
      this.holdState = false;
      this.callConnected = true;
      this.callbacks.onStateChange?.('in-call');
    });

    call.on('disconnect', () => {
      console.log('Call disconnected');
      this.currentCall = null;
      this.leadCallSid = null;
      this.holdState = false;
      this.callConnected = false;
      this.callbacks.onDisconnect?.();
      this.callbacks.onStateChange?.('ready');
    });

    call.on('cancel', () => {
      console.log('Call cancelled');
      this.currentCall = null;
      this.leadCallSid = null;
      this.holdState = false;
      this.callConnected = false;
      this.callbacks.onStateChange?.('ready');
    });

    call.on('reject', () => {
      console.log('Call rejected');
      this.currentCall = null;
      this.leadCallSid = null;
      this.holdState = false;
      this.callConnected = false;
      this.callbacks.onStateChange?.('ready');
    });

    call.on('error', (error) => {
      console.error('Call error:', error);
      this.callbacks.onError?.(error);
    });

    call.on('ringing', () => {
      console.log('Call is ringing');
      this.callbacks.onStateChange?.('ringing');
    });
  }

  async makeCall(phoneNumber: string): Promise<void> {
    if (!this.device) {
      throw new Error('Twilio device not initialized');
    }

    try {
      console.log(`Making call to ${phoneNumber}`);
      this.callbacks.onStateChange?.('dialing');

      // Get worker info for call attribution
      const workerEmail = localStorage.getItem('workerEmail') || '';
      const workerName = workerEmail ? workerEmail.split('@')[0] : '';

      // Make the outbound call with worker parameters
      this.currentCall = await this.device.connect({
        params: {
          To: phoneNumber,
          workerEmail,
          workerName,
        },
      });

      // Set up call handlers
      this.setupCallHandlers(this.currentCall);
    } catch (error) {
      console.error('Failed to make call:', error);
      this.callbacks.onError?.(error as Error);
      this.callbacks.onStateChange?.('ready');
      throw error;
    }
  }

  async acceptCall(): Promise<void> {
    if (!this.currentCall) {
      throw new Error('No incoming call to accept');
    }

    try {
      this.currentCall.accept();
      console.log('Call accepted');
    } catch (error) {
      console.error('Failed to accept call:', error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  async rejectCall(): Promise<void> {
    if (!this.currentCall) {
      throw new Error('No incoming call to reject');
    }

    try {
      this.currentCall.reject();
      this.currentCall = null;
      console.log('Call rejected');
      this.callbacks.onStateChange?.('ready');
    } catch (error) {
      console.error('Failed to reject call:', error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  async hangup(): Promise<void> {
    if (!this.currentCall) {
      console.log('No active call to hangup');
      return;
    }

    try {
      this.currentCall.disconnect();
      this.currentCall = null;
      console.log('Call disconnected');
      this.callbacks.onStateChange?.('ready');
    } catch (error) {
      console.error('Failed to hangup:', error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  toggleMute(): boolean {
    if (!this.currentCall) {
      return false;
    }

    const newMuteState = !this.currentCall.isMuted();
    this.currentCall.mute(newMuteState);
    console.log(`Mute set to ${newMuteState}`);
    return newMuteState;
  }

  isMuted(): boolean {
    return this.currentCall?.isMuted() ?? false;
  }

  // Real hold implementation using server-side endpoints
  // This plays hold music to the lead
  async setHold(hold: boolean): Promise<boolean> {
    if (!this.currentCall) {
      console.log('No active call to hold');
      throw new Error('Call is not active');
    }

    if (!this.leadCallSid) {
      console.error('No lead call SID available for hold');
      // Fall back to client-side mute
      this.currentCall.mute(hold);
      this.holdState = hold;
      return hold;
    }

    try {
      let success: boolean;
      
      if (hold) {
        console.log('Putting call on hold, lead SID:', this.leadCallSid);
        success = await holdService.hold(this.leadCallSid);
      } else {
        console.log('Resuming call from hold, lead SID:', this.leadCallSid, 'agent:', this.agentIdentity);
        success = await holdService.unhold(this.leadCallSid, this.agentIdentity);
      }

      if (success) {
        this.holdState = hold;
        console.log(`Call ${hold ? 'put on hold' : 'resumed'} successfully`);
      } else {
        console.error('Hold/unhold API call failed');
      }
      
      return success ? hold : this.holdState;
    } catch (error) {
      console.error('Failed to set hold:', error);
      // Re-throw to allow caller to handle specific errors
      throw error;
    }
  }

  isOnHold(): boolean {
    return this.holdState;
  }

  isCallConnected(): boolean {
    return this.callConnected;
  }

  getLeadCallSid(): string | null {
    return this.leadCallSid;
  }

  getAgentIdentity(): string {
    return this.agentIdentity;
  }

  // Allow manually setting the lead call SID (e.g., from call events)
  setLeadCallSid(sid: string): void {
    this.leadCallSid = sid;
    console.log('Lead call SID set manually:', sid);
  }

  sendDigits(digits: string): void {
    if (!this.currentCall) {
      console.log('No active call to send digits');
      return;
    }

    this.currentCall.sendDigits(digits);
    console.log(`Sent digits: ${digits}`);
  }

  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  getCurrentCall(): Call | null {
    return this.currentCall;
  }

  destroy(): void {
    if (this.currentCall) {
      this.currentCall.disconnect();
      this.currentCall = null;
    }
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
    this.isInitialized = false;
    console.log('Twilio service destroyed');
  }
}

export const twilioService = new TwilioService();
