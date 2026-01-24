// Attio CRM Integration Service
// Now integrated through the backend API at /attio/lead

import { Lead } from '@/types';
import { leadService } from './api';

class AttioService {
  async getLeadById(leadId: string): Promise<Lead | null> {
    // Lead by ID not implemented in backend yet
    return leadService.getById(leadId);
  }

  async getLeadByPhone(phone: string): Promise<Lead | null> {
    // Fetch lead from backend which connects to Attio
    return leadService.getByPhone(phone);
  }

  async updateLeadNotes(leadId: string, notes: string): Promise<void> {
    // TODO: Implement when backend supports it
    console.log(`Updating notes for lead ${leadId}: ${notes}`);
  }

  async logCall(leadId: string, callData: {
    duration: number;
    direction: 'inbound' | 'outbound';
    outcome: string;
  }): Promise<void> {
    // TODO: Implement when backend supports it
    console.log(`Logging call for lead ${leadId}:`, callData);
  }
}

export const attioService = new AttioService();
