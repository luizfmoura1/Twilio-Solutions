import { Filter, X } from 'lucide-react';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { cn } from '@/lib/utils';

export interface CallHistoryFiltersState {
  direction: string;
  disposition: string;
  worker: string;
  state: string;
}

interface CallHistoryFiltersProps {
  filters: CallHistoryFiltersState;
  onFiltersChange: (filters: CallHistoryFiltersState) => void;
  availableWorkers: string[];
  availableStates: string[];
  className?: string;
}

const directionOptions = [
  { value: 'all', label: 'Todas as direções' },
  { value: 'outbound', label: 'Saída' },
  { value: 'inbound', label: 'Entrada' },
];

const dispositionOptions = [
  { value: 'all', label: 'Todos os status' },
  { value: 'answered', label: 'Atendida' },
  { value: 'no-answer', label: 'Não Atendeu' },
  { value: 'busy', label: 'Ocupado' },
  { value: 'voicemail', label: 'Caixa postal' },
  { value: 'failed', label: 'Falhou' },
  { value: 'canceled', label: 'Cancelada' },
];

export function CallHistoryFilters({
  filters,
  onFiltersChange,
  availableWorkers,
  availableStates,
  className,
}: CallHistoryFiltersProps) {
  const updateFilter = (key: keyof CallHistoryFiltersState, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      direction: 'all',
      disposition: 'all',
      worker: 'all',
      state: 'all',
    });
  };

  const hasActiveFilters =
    filters.direction !== 'all' ||
    filters.disposition !== 'all' ||
    filters.worker !== 'all' ||
    filters.state !== 'all';

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="w-4 h-4" />
          <span>Filtros</span>
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-7 text-xs gap-1"
          >
            <X className="w-3 h-3" />
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Direction filter */}
        <Select
          value={filters.direction}
          onValueChange={(value) => updateFilter('direction', value)}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Direção" />
          </SelectTrigger>
          <SelectContent>
            {directionOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Disposition filter */}
        <Select
          value={filters.disposition}
          onValueChange={(value) => updateFilter('disposition', value)}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {dispositionOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Worker filter */}
        <Select
          value={filters.worker}
          onValueChange={(value) => updateFilter('worker', value)}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="SDR" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              Todos os SDRs
            </SelectItem>
            {availableWorkers.map((worker) => (
              <SelectItem key={worker} value={worker} className="text-xs">
                {worker}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* State filter */}
        <Select
          value={filters.state}
          onValueChange={(value) => updateFilter('state', value)}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              Todos os estados
            </SelectItem>
            {availableStates.map((state) => (
              <SelectItem key={state} value={state} className="text-xs">
                {state}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
