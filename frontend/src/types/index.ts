export type AgentStatus = 'available' | 'busy' | 'offline';

export type CallState = 'idle' | 'ready' | 'dialing' | 'ringing' | 'in-call' | 'incoming';

export type CallDirection = 'inbound' | 'outbound';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface CurrentCall {
  direction: CallDirection;
  phoneNumber: string;
  startTime: Date | null;
  isMuted: boolean;
  isOnHold: boolean;
}

export interface Lead {
  id?: string;
  name: string;
  email?: string;
  phone: string;
  state: string;
  city?: string;
  company?: string;
  notes?: string;
  case_type?: string;
  classification?: string;
  description?: string;
  attorney_info?: string;
  has_attorney?: string;
  advance_seeking?: string;
  advance_value?: number;
  workers_comp?: string;
}

export type CallDisposition = 'answered' | 'no-answer' | 'busy' | 'voicemail' | 'failed' | 'canceled';

export type ContactPeriod = 'morning' | 'afternoon' | 'evening';

export interface CallRecord {
  id: number;
  call_sid: string;
  from_number: string;
  to_number: string;
  lead_state?: string;
  direction: CallDirection;
  disposition: CallDisposition;
  duration: number;
  queue_time?: number;
  recording_url?: string;
  caller_city?: string;
  worker_name?: string;
  worker_email?: string;
  started_at: string;
  answered_at?: string;
  ended_at?: string;
  created_at: string;
  // Contact tracking fields
  contact_number?: number;
  contact_number_today?: number;
  previously_answered?: boolean;
  contact_period?: ContactPeriod;
  // Notes/Summary field
  resumo?: string | null;
  // Computed for UI
  phoneNumber: string;
  timestamp: Date;
}

export interface AppState {
  user: User | null;
  token: string | null;
  agentStatus: AgentStatus;
  callState: CallState;
  currentCall: CurrentCall | null;
  currentLead: Lead | null;
  callHistory: CallRecord[];
  twilioInitialized: boolean;
  twilioError: string | null;
}
