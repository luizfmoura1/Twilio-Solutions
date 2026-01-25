import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { CallHistoryRow } from './CallHistoryRow';
import { CallHistoryFilters, CallHistoryFiltersState } from './CallHistoryFilters';
import { History, RefreshCw, Search, ChevronLeft, ChevronRight, X, Loader2, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CallRecord } from '@/types';
import { callHistoryService, recordingService } from '@/services/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';

interface CallHistoryProps {
  onCallNumber: (number: string) => void;
  onViewLead?: (phoneNumber: string) => void;
  className?: string;
  refreshTrigger?: number;
  onCallsLoaded?: (calls: CallRecord[]) => void;
}

const ITEMS_PER_PAGE = 10;

const initialFilters: CallHistoryFiltersState = {
  direction: 'all',
  disposition: 'all',
  worker: 'all',
  state: 'all',
};

// Helper to get worker display name
const getWorkerDisplayName = (record: CallRecord): string => {
  if (record.worker_name) {
    return record.worker_name.charAt(0).toUpperCase() + record.worker_name.slice(1);
  }
  if (record.worker_email) {
    const name = record.worker_email.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return '';
};

export function CallHistory({ onCallNumber, onViewLead, className, refreshTrigger, onCallsLoaded }: CallHistoryProps) {
  const [allCalls, setAllCalls] = useState<CallRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState<CallHistoryFiltersState>(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const currentBlobUrlRef = useRef<string | null>(null);

  // Extract unique workers and states from calls for filter options
  const { availableWorkers, availableStates } = useMemo(() => {
    const workers = new Set<string>();
    const states = new Set<string>();

    allCalls.forEach((call) => {
      const workerName = getWorkerDisplayName(call);
      if (workerName) workers.add(workerName);
      if (call.lead_state) states.add(call.lead_state);
    });

    return {
      availableWorkers: Array.from(workers).sort(),
      availableStates: Array.from(states).sort(),
    };
  }, [allCalls]);

  const fetchCalls = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await callHistoryService.getCalls({ limit: 200 });
      
      // Transform API response to CallRecord format
      const records: CallRecord[] = response.calls.map((call) => ({
        ...call,
        phoneNumber: call.direction === 'outbound' ? call.to_number : call.from_number,
        timestamp: new Date(call.started_at),
      }));
      
      setAllCalls(records);
      setCurrentPage(1);
    } catch (err: any) {
      console.error('Error fetching call history:', err);
      const errorMessage = err?.message?.includes('500') || err?.message?.includes('Internal') 
        ? 'Erro no servidor. Tente novamente em alguns instantes.'
        : 'Erro ao carregar histórico';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  // Notify parent when calls are loaded
  useEffect(() => {
    if (onCallsLoaded && allCalls.length >= 0 && !isLoading) {
      onCallsLoaded(allCalls);
    }
  }, [allCalls, isLoading, onCallsLoaded]);

  // Refresh when trigger changes (after call ends)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchCalls();
    }
  }, [refreshTrigger, fetchCalls]);

  const handleRowClick = (record: CallRecord) => {
    onCallNumber(record.phoneNumber);
  };

  const handlePlayRecording = async (url: string) => {
    // Cleanup previous blob URL if exists
    if (currentBlobUrlRef.current) {
      recordingService.revokeUrl(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    
    setIsLoadingAudio(true);
    setAudioUrl(null);
    
    const blobUrl = await recordingService.getRecordingBlobUrl(url);
    
    if (blobUrl) {
      currentBlobUrlRef.current = blobUrl;
      setAudioUrl(blobUrl);
    } else {
      setError('Erro ao carregar gravação');
      setTimeout(() => setError(null), 3000);
    }
    
    setIsLoadingAudio(false);
  };

  const handleCloseAudio = () => {
    // Cleanup blob URL when closing
    if (currentBlobUrlRef.current) {
      recordingService.revokeUrl(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    setAudioUrl(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current) {
        recordingService.revokeUrl(currentBlobUrlRef.current);
      }
    };
  }, []);

  // Filter calls by search query and filters
  const filteredCalls = useMemo(() => {
    return allCalls.filter((call) => {
      // Search query filter
      if (searchQuery.trim()) {
        const normalizedQuery = searchQuery.replace(/[^\d+]/g, '');
        const matchesSearch =
          call.phoneNumber.includes(normalizedQuery) ||
          call.from_number.includes(normalizedQuery) ||
          call.to_number.includes(normalizedQuery);
        if (!matchesSearch) return false;
      }

      // Direction filter
      if (filters.direction !== 'all' && call.direction !== filters.direction) {
        return false;
      }

      // Disposition filter
      if (filters.disposition !== 'all' && call.disposition !== filters.disposition) {
        return false;
      }

      // Worker filter
      if (filters.worker !== 'all') {
        const workerName = getWorkerDisplayName(call);
        if (workerName !== filters.worker) return false;
      }

      // State filter
      if (filters.state !== 'all') {
        if (call.lead_state !== filters.state) return false;
      }

      return true;
    });
  }, [allCalls, searchQuery, filters]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.direction !== 'all') count++;
    if (filters.disposition !== 'all') count++;
    if (filters.worker !== 'all') count++;
    if (filters.state !== 'all') count++;
    return count;
  }, [filters]);

  // Pagination
  const totalPages = Math.ceil(filteredCalls.length / ITEMS_PER_PAGE);
  const paginatedCalls = filteredCalls.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filters]);

  return (
    <div className={cn('modern-card overflow-hidden', className)}>
      <div className="px-5 py-4 border-b border-border/30">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
              <History className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Historico de Chamadas</h3>
              {!isLoading && (
                <span className="text-xs text-muted-foreground">
                  {filteredCalls.length} chamadas
                </span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 hover:bg-primary/10"
            onClick={fetchCalls}
            disabled={isLoading}
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </Button>
        </div>

        {/* Search bar with filter toggle */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
            <Input
              type="text"
              placeholder="Buscar por numero..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 h-10 bg-muted/20 border-border/30 rounded-lg focus:border-primary/30 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted/50 rounded-md transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button
            variant={filtersOpen || activeFilterCount > 0 ? 'secondary' : 'ghost'}
            size="icon"
            className="h-10 w-10 shrink-0 relative border border-border/30 hover:border-primary/30 transition-colors"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-background">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Collapsible Filters */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleContent className="pt-3">
            <CallHistoryFilters
              filters={filters}
              onFiltersChange={setFilters}
              availableWorkers={availableWorkers}
              availableStates={availableStates}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Audio player / loading state */}
      {isLoadingAudio && (
        <div className="px-4 py-3 bg-primary/5 border-b border-border/30 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Carregando gravacao...</span>
        </div>
      )}

      {audioUrl && !isLoadingAudio && (
        <div className="px-4 py-3 bg-primary/5 border-b border-border/30 flex items-center gap-3">
          <audio controls autoPlay src={audioUrl} className="flex-1 h-8" />
          <Button variant="ghost" size="sm" onClick={handleCloseAudio} className="hover:bg-primary/10">
            Fechar
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Carregando...</p>
        </div>
      ) : error ? (
        <div className="py-16 text-center">
          <p className="text-destructive mb-2">{error}</p>
          <Button variant="link" onClick={fetchCalls} className="text-primary">
            Tentar novamente
          </Button>
        </div>
      ) : filteredCalls.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <div className="w-14 h-14 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-3 border border-border/30">
            <History className="w-6 h-6 opacity-50" />
          </div>
          <p className="text-sm">{searchQuery ? 'Nenhuma chamada encontrada' : 'Nenhuma chamada registrada'}</p>
        </div>
      ) : (
        <>
          {/* Call list */}
          <div>
            {paginatedCalls.map((record) => (
              <CallHistoryRow
                key={record.id}
                record={record}
                onClick={handleRowClick}
                onPlayRecording={handlePlayRecording}
                onViewLead={onViewLead}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? 'default' : 'ghost'}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => goToPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
