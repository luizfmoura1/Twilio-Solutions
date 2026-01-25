// API Service for backend communication
import { User, Lead } from '@/types';

const API_BASE_URL = 'https://twilio-solutions-production.up.railway.app';

let authToken: string | null = null;

// Token management
export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = () => authToken;

// Callback for handling 401 responses (set by AppContext)
let onUnauthorized: (() => void) | null = null;

export const setOnUnauthorized = (callback: (() => void) | null) => {
  onUnauthorized = callback;
};

// Helper for API requests
const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (authToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // Handle 401 Unauthorized - token expired or invalid
    if (response.status === 401 && onUnauthorized) {
      onUnauthorized();
      throw new Error('Session expired');
    }
    
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
};

// Auth endpoints
export const authService = {
  login: async (email: string, password: string): Promise<{ user: User; token: string }> => {
    const url = `${API_BASE_URL}/auth/login`;
    const body = JSON.stringify({ email: email.trim(), password });
    
    console.log('=== LOGIN DEBUG ===');
    console.log('URL:', url);
    console.log('Email:', email.trim());
    console.log('Password length:', password.length);
    console.log('Body:', body);
    
    // Login request should NOT include Authorization header
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });

    console.log('Response status:', response.status);
    const responseText = await response.clone().text();
    console.log('Response body:', responseText);
    console.log('===================');

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Login failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const token = data.token;
    setAuthToken(token);
    
    // Extract name from email or use email as name
    const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    return {
      user: {
        id: email,
        name,
        email,
      },
      token,
    };
  },

  logout: async (): Promise<void> => {
    setAuthToken(null);
  },

  validateToken: async (token: string): Promise<User | null> => {
    // Token validation can be done by trying to get voice token
    try {
      setAuthToken(token);
      await twilioTokenService.getAccessToken();
      return null; // Return null but token is valid
    } catch {
      setAuthToken(null);
      return null;
    }
  },
};

// Lead endpoints
interface AttioLeadResponse {
  found: boolean;
  lead?: Lead;
  // Contact tracking info included in lead response
  contact_number?: number;
  contact_number_today?: number;
  previously_answered?: boolean;
  contact_period?: 'morning' | 'afternoon' | 'evening';
}

export interface LeadWithTracking {
  lead: Lead | null;
  tracking?: {
    contact_number?: number;
    contact_number_today?: number;
    previously_answered?: boolean;
    contact_period?: 'morning' | 'afternoon' | 'evening';
  };
}

// Contact type for contacts list
export interface Contact {
  id: string;
  name: string;
  phone: string;
  state?: string;
}

// Contacts service - search contacts from Attio
export const contactsService = {
  search: async (query?: string, limit: number = 100): Promise<Contact[]> => {
    try {
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      params.append('limit', limit.toString());

      const response = await apiRequest<{ contacts: Contact[]; count: number }>(
        `/attio/contacts?${params.toString()}`
      );

      return response.contacts || [];
    } catch (error) {
      console.error('Error fetching contacts:', error);
      return [];
    }
  },
};

export const leadService = {
  getByPhone: async (phone: string): Promise<Lead | null> => {
    try {
      // Clean the phone number
      const cleanPhone = phone.replace(/[^\d+]/g, '');
      const response = await apiRequest<AttioLeadResponse>(`/attio/lead?phone=${encodeURIComponent(cleanPhone)}`);
      
      // API returns { found: boolean, lead: {...} }
      if (response.found && response.lead) {
        return response.lead;
      }
      return null;
    } catch (error) {
      console.error('Error fetching lead:', error);
      return null;
    }
  },

  // New method that also returns contact tracking info
  getByPhoneWithTracking: async (phone: string): Promise<LeadWithTracking> => {
    try {
      const cleanPhone = phone.replace(/[^\d+]/g, '');
      const response = await apiRequest<AttioLeadResponse>(`/attio/lead?phone=${encodeURIComponent(cleanPhone)}`);
      
      return {
        lead: response.found && response.lead ? response.lead : null,
        tracking: {
          contact_number: response.contact_number,
          contact_number_today: response.contact_number_today,
          previously_answered: response.previously_answered,
          contact_period: response.contact_period,
        },
      };
    } catch (error) {
      console.error('Error fetching lead with tracking:', error);
      return { lead: null };
    }
  },

  getById: async (id: string): Promise<Lead | null> => {
    // Not implemented in backend yet
    return null;
  },

  addNote: async (recordId: string, note: string): Promise<boolean> => {
    try {
      const token = authToken || localStorage.getItem('token');
      
      if (!token) {
        console.error('No auth token available for adding note');
        return false;
      }

      const formData = new FormData();
      formData.append('record_id', recordId);
      formData.append('note', note);

      const response = await fetch(`${API_BASE_URL}/attio/lead/note`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      return response.ok;
    } catch (error) {
      console.error('Error adding note:', error);
      return false;
    }
  },
};

// Twilio token response type
interface TwilioTokenResponse {
  token: string;
  identity: string;
  email: string;
  ttl: number;
}

// Twilio token endpoint
export const twilioTokenService = {
  getAccessToken: async (): Promise<string> => {
    const response = await apiRequest<TwilioTokenResponse>('/token');
    // Save worker email for call attribution
    if (response.email) {
      localStorage.setItem('workerEmail', response.email);
    }
    return response.token;
  },
};

// Call history endpoints
export interface GetCallsParams {
  direction?: 'inbound' | 'outbound';
  limit?: number;
  state?: string;
  disposition?: string;
}

export interface GetCallsResponse {
  count: number;
  calls: Array<{
    id: number;
    call_sid: string;
    from_number: string;
    to_number: string;
    lead_state?: string;
    direction: 'inbound' | 'outbound';
    disposition: 'answered' | 'no-answer' | 'busy' | 'voicemail' | 'failed';
    duration: number;
    queue_time?: number;
    recording_url?: string;
    caller_city?: string;
    worker_name?: string;
    started_at: string;
    answered_at?: string;
    ended_at?: string;
    created_at: string;
    // Contact tracking fields
    contact_number?: number;
    contact_number_today?: number;
    previously_answered?: boolean;
    contact_period?: 'morning' | 'afternoon' | 'evening';
    // Notes/Summary field
    resumo?: string | null;
  }>;
}

// Contact tracking info for a phone number
export interface ContactTrackingInfo {
  contact_number: number;
  contact_number_today: number;
  previously_answered: boolean;
  contact_period: 'morning' | 'afternoon' | 'evening';
}

export const callHistoryService = {
  getCalls: async (params?: GetCallsParams): Promise<GetCallsResponse> => {
    const query = new URLSearchParams();
    if (params?.direction) query.append('direction', params.direction);
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.state) query.append('state', params.state);
    if (params?.disposition) query.append('disposition', params.disposition);
    
    const queryString = query.toString();
    const url = `/calls${queryString ? '?' + queryString : ''}`;
    
    return apiRequest<GetCallsResponse>(url);
  },
};

// Call resumo/notes service
export const callResumoService = {
  /**
   * Save or update the resumo/notes for a call
   * @param callSid - The call SID
   * @param resumo - The notes/summary text
   */
  saveResumo: async (callSid: string, resumo: string): Promise<boolean> => {
    try {
      await apiRequest(`/calls/${callSid}/resumo`, {
        method: 'PUT',
        body: JSON.stringify({ resumo }),
      });
      return true;
    } catch (error) {
      console.error('Error saving call resumo:', error);
      throw error;
    }
  },
};

// Hold service - server-side hold with music
export const holdService = {
  /**
   * Put a call on hold - plays music to the lead
   * @param callSid - The call SID of the lead's leg (not the agent's)
   */
  hold: async (callSid: string): Promise<boolean> => {
    try {
      await apiRequest('/hold', {
        method: 'POST',
        body: JSON.stringify({ call_sid: callSid }),
      });
      return true;
    } catch (error: any) {
      console.error('Error putting call on hold:', error);
      // Re-throw with message to allow caller to handle specific errors
      if (error?.message?.includes('Call is not active') || error?.message?.includes('not active')) {
        throw new Error('Call is not active');
      }
      throw error;
    }
  },

  /**
   * Resume a call from hold - reconnects lead to agent
   * @param callSid - The call SID of the lead's leg
   * @param agentIdentity - The agent's Twilio identity (e.g., "arthurfyntrainccom")
   */
  unhold: async (callSid: string, agentIdentity: string): Promise<boolean> => {
    try {
      await apiRequest('/unhold', {
        method: 'POST',
        body: JSON.stringify({ call_sid: callSid, agent_identity: agentIdentity }),
      });
      return true;
    } catch (error: any) {
      console.error('Error resuming call from hold:', error);
      // Re-throw with message to allow caller to handle specific errors
      if (error?.message?.includes('Call is not active') || error?.message?.includes('not active')) {
        throw new Error('Call is not active');
      }
      throw error;
    }
  },
};

// Recording service - fetches audio via authenticated proxy
export const recordingService = {
  /**
   * Extracts Recording SID from Twilio URL and fetches audio via proxy
   * Returns a blob URL that can be used as audio src
   */
  getRecordingBlobUrl: async (recordingUrl: string): Promise<string | null> => {
    if (!recordingUrl) return null;
    
    // Extract SID from Twilio URL (format: RExxxxxxxxx)
    const match = recordingUrl.match(/Recordings\/(RE[a-zA-Z0-9]+)/);
    if (!match) {
      console.error('Could not extract recording SID from URL:', recordingUrl);
      return null;
    }
    
    const recordingSid = match[1];
    const token = authToken || localStorage.getItem('token');
    
    if (!token) {
      console.error('No auth token available for recording fetch');
      return null;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/recording/${recordingSid}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        console.error('Failed to fetch recording:', response.status);
        return null;
      }
      
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Error fetching recording:', error);
      return null;
    }
  },
  
  /**
   * Revokes a blob URL to free memory
   */
  revokeUrl: (blobUrl: string) => {
    if (blobUrl && blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(blobUrl);
    }
  }
};
