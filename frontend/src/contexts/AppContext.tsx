import React, { createContext, useContext, useReducer, ReactNode, useEffect, useState } from 'react';
import { AppState, AgentStatus, CallState, CurrentCall, Lead, CallRecord, User } from '@/types';
import { setAuthToken, twilioTokenService, setOnUnauthorized } from '@/services/api';

type AppAction =
  | { type: 'SET_USER'; payload: { user: User; token: string } }
  | { type: 'LOGOUT' }
  | { type: 'SET_AGENT_STATUS'; payload: AgentStatus }
  | { type: 'SET_CALL_STATE'; payload: CallState }
  | { type: 'SET_CURRENT_CALL'; payload: CurrentCall | null }
  | { type: 'UPDATE_CALL'; payload: Partial<CurrentCall> }
  | { type: 'SET_CURRENT_LEAD'; payload: Lead | null }
  | { type: 'ADD_CALL_RECORD'; payload: CallRecord }
  | { type: 'SET_CALL_HISTORY'; payload: CallRecord[] }
  | { type: 'SET_TWILIO_INITIALIZED'; payload: boolean }
  | { type: 'SET_TWILIO_ERROR'; payload: string | null };

const initialState: AppState = {
  user: null,
  token: null,
  agentStatus: 'offline',
  callState: 'idle',
  currentCall: null,
  currentLead: null,
  callHistory: [],
  twilioInitialized: false,
  twilioError: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        agentStatus: 'available',
      };
    case 'LOGOUT':
      return {
        ...initialState,
      };
    case 'SET_AGENT_STATUS':
      return { ...state, agentStatus: action.payload };
    case 'SET_CALL_STATE':
      return { ...state, callState: action.payload };
    case 'SET_CURRENT_CALL':
      return { ...state, currentCall: action.payload };
    case 'UPDATE_CALL':
      return {
        ...state,
        currentCall: state.currentCall
          ? { ...state.currentCall, ...action.payload }
          : null,
      };
    case 'SET_CURRENT_LEAD':
      return { ...state, currentLead: action.payload };
    case 'ADD_CALL_RECORD':
      return {
        ...state,
        callHistory: [action.payload, ...state.callHistory].slice(0, 10),
      };
    case 'SET_CALL_HISTORY':
      return { ...state, callHistory: action.payload };
    case 'SET_TWILIO_INITIALIZED':
      return { ...state, twilioInitialized: action.payload };
    case 'SET_TWILIO_ERROR':
      return { ...state, twilioError: action.payload };
    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  isValidating: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  setAgentStatus: (status: AgentStatus) => void;
  startCall: (phoneNumber: string, direction: 'inbound' | 'outbound') => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [isValidating, setIsValidating] = useState(true);

  // Load and validate persisted auth on mount
  useEffect(() => {
    const validateAndRestoreSession = async () => {
      const savedToken = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');
      
      if (!savedToken || !savedUser) {
        setIsValidating(false);
        return;
      }
      
      // Set token first to allow API calls
      setAuthToken(savedToken);
      
      try {
        // Validate token by making an authenticated call
        await twilioTokenService.getAccessToken();

        // Token is valid, restore session
        dispatch({
          type: 'SET_USER',
          payload: { user: JSON.parse(savedUser), token: savedToken },
        });
      } catch (error: any) {
        // Only clear session if it's an authentication error (401/403 or "Session expired")
        const isAuthError = error?.message?.includes('Session expired') ||
                           error?.message?.includes('401') ||
                           error?.message?.includes('403') ||
                           error?.message?.includes('Unauthorized');

        if (isAuthError) {
          console.log('Token invalid, clearing session');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setAuthToken(null);
        } else {
          // For other errors (network, etc), keep the session and try to continue
          console.log('Token validation failed with non-auth error, keeping session:', error?.message);
          dispatch({
            type: 'SET_USER',
            payload: { user: JSON.parse(savedUser), token: savedToken },
          });
        }
      }
      
      setIsValidating(false);
    };
    
    validateAndRestoreSession();
  }, []);

  // Register 401 handler for automatic logout
  useEffect(() => {
    setOnUnauthorized(() => {
      console.log('Received 401, logging out');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setAuthToken(null);
      dispatch({ type: 'LOGOUT' });
    });
    
    return () => setOnUnauthorized(null);
  }, []);

  const login = (user: User, token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setAuthToken(token);
    dispatch({ type: 'SET_USER', payload: { user, token } });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuthToken(null);
    dispatch({ type: 'LOGOUT' });
  };

  const setAgentStatus = (status: AgentStatus) => {
    dispatch({ type: 'SET_AGENT_STATUS', payload: status });
  };

  const startCall = (phoneNumber: string, direction: 'inbound' | 'outbound') => {
    dispatch({ type: 'SET_CALL_STATE', payload: direction === 'outbound' ? 'dialing' : 'incoming' });
    dispatch({
      type: 'SET_CURRENT_CALL',
      payload: {
        direction,
        phoneNumber,
        startTime: null,
        isMuted: false,
        isOnHold: false,
      },
    });
  };

  const endCall = () => {
    // Call records are now fetched from backend, no local storage needed
    dispatch({ type: 'SET_CALL_STATE', payload: state.twilioInitialized ? 'ready' : 'idle' });
    dispatch({ type: 'SET_CURRENT_CALL', payload: null });
    dispatch({ type: 'SET_CURRENT_LEAD', payload: null });
  };

  const toggleMute = () => {
    dispatch({ type: 'UPDATE_CALL', payload: { isMuted: !state.currentCall?.isMuted } });
  };

  const toggleHold = () => {
    dispatch({ type: 'UPDATE_CALL', payload: { isOnHold: !state.currentCall?.isOnHold } });
  };

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        isValidating,
        login,
        logout,
        setAgentStatus,
        startCall,
        endCall,
        toggleMute,
        toggleHold,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
