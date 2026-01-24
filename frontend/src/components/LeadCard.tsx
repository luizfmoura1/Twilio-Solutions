import { useState } from 'react';
import { Lead } from '@/types';
import { 
  Phone, 
  MapPin, 
  User, 
  Mail,
  FileText,
  Scale,
  DollarSign,
  Briefcase,
  Tag,
  AlertCircle,
  PhoneCall,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

interface LeadCardProps {
  lead: Lead | null;
  className?: string;
  isLoading?: boolean;
  phoneNumber?: string;
  callerCity?: string;
  onCall?: (phoneNumber: string) => void;
}

const DESCRIPTION_MAX_LENGTH = 150;

export function LeadCard({ lead, className, isLoading, phoneNumber, callerCity, onCall }: LeadCardProps) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const displayPhone = lead?.phone || phoneNumber;

  // Build Attio URL if we have a record_id
  const attioUrl = lead?.id ? `https://app.attio.com/fyntra/person/${lead.id}/overview` : null;

  // Location display: prioritize Attio data, fallback to callerCity
  const displayCity = lead?.city || callerCity;
  const displayState = lead?.state;

  const handleCall = () => {
    if (displayPhone && onCall) {
      onCall(displayPhone);
    }
  };

  const shouldTruncateDescription = lead?.description && lead.description.length > DESCRIPTION_MAX_LENGTH;
  const displayDescription = shouldTruncateDescription && !isDescriptionExpanded
    ? lead.description.slice(0, DESCRIPTION_MAX_LENGTH) + '...'
    : lead?.description;

  if (isLoading) {
    return (
      <div className={cn('glass-card rounded-lg p-6 animate-fade-in h-full', className)}>
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Buscando lead...</p>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className={cn('glass-card rounded-lg p-6 animate-fade-in h-full', className)}>
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
          <User className="w-12 h-12 mb-3 opacity-50" />
          {displayPhone && (
            <p className="font-medium text-foreground mb-1">{displayPhone}</p>
          )}
          <p className="text-sm mb-4">Lead não encontrado no CRM</p>
          {displayPhone && onCall && (
            <Button onClick={handleCall} className="gap-2">
              <PhoneCall className="w-4 h-4" />
              Ligar
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('glass-card rounded-lg p-5 animate-fade-in flex flex-col overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">Informações do Lead</h3>
          {attioUrl && (
            <a
              href={attioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
              title="Abrir no Attio"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
        {lead.classification && (
          <span className={cn(
            'px-2.5 py-1 rounded text-xs font-semibold',
            lead.classification === 'SQL' && 'bg-success/20 text-success',
            lead.classification === 'MQL' && 'bg-warning/20 text-warning',
            !['SQL', 'MQL'].includes(lead.classification) && 'bg-muted text-foreground'
          )}>
            {lead.classification}
          </span>
        )}
      </div>
      
      <ScrollArea className="flex-1 pr-3 min-h-0">
        <div className="space-y-4">
          {/* Name & Phone Row */}
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <User className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="font-semibold text-base truncate">{lead.name}</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground truncate">{lead.phone}</span>
          </div>

          {/* Info Grid */}
          <div className="space-y-2.5">
            {/* Row 1: Location + Workers Comp */}
            <div className="grid grid-cols-2 gap-x-4">
              {/* Location - prioritize Attio, fallback to callerCity */}
              {(displayCity || displayState) && (
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span 
                    className="truncate text-sm" 
                    title={displayCity && displayState ? `${displayCity}, ${displayState}` : displayCity || displayState}
                  >
                    {displayCity && displayState 
                      ? `${displayCity}, ${displayState}` 
                      : displayCity || displayState}
                  </span>
                </div>
              )}

              {/* Workers Comp */}
              {lead.workers_comp && (
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className={cn('text-sm', lead.workers_comp.toLowerCase() === 'yes' ? 'text-warning' : '')}>
                    WC: {lead.workers_comp.toLowerCase() === 'yes' ? 'Sim' : 'Não'}
                  </span>
                </div>
              )}
            </div>

            {/* Row 2: Case Type - full width */}
            {lead.case_type && (
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm" title={lead.case_type}>{lead.case_type}</span>
              </div>
            )}

            {/* Row 3: Advance Value */}
            {(lead.advance_value || lead.advance_seeking) && (
              <div className="flex items-center gap-2 min-w-0">
                <DollarSign className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium text-sm">
                  ${lead.advance_value 
                    ? lead.advance_value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                    : lead.advance_seeking}
                </span>
              </div>
            )}

            {/* Email - full width */}
            {lead.email && (
              <div className="flex items-center gap-2 min-w-0">
                <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate text-muted-foreground text-sm" title={lead.email}>{lead.email}</span>
              </div>
            )}
          </div>

          {/* Has Attorney - separate row for better visibility */}
          {lead.has_attorney && (
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm">{lead.has_attorney.toLowerCase() === 'yes' ? 'Com advogado' : 'Sem advogado'}</span>
            </div>
          )}

          {/* Attorney Info */}
          {lead.attorney_info && (
            <div className="pt-3 border-t border-border">
              <div className="flex items-start gap-2">
                <Scale className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <span className="break-words">{lead.attorney_info}</span>
              </div>
            </div>
          )}

          {/* Description - Collapsible */}
          {lead.description && (
            <div className="pt-3 border-t border-border">
              <p className="text-sm text-muted-foreground mb-2">Descrição</p>
              <p className="leading-relaxed break-words">{displayDescription}</p>
              {shouldTruncateDescription && (
                <button
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                  className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 mt-2 transition-colors"
                >
                  {isDescriptionExpanded ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      Ver menos
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Ver mais
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Notes (legacy) */}
          {lead.notes && !lead.description && (
            <div className="pt-3 border-t border-border">
              <p className="text-sm text-muted-foreground mb-2">Notas</p>
              <p className="break-words">{lead.notes}</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Call Button */}
      {onCall && (
        <div className="pt-4 mt-4 border-t border-border flex-shrink-0">
          <Button onClick={handleCall} className="w-full gap-2">
            <PhoneCall className="w-4 h-4" />
            Ligar
          </Button>
        </div>
      )}
    </div>
  );
}
