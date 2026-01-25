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
  ChevronDown,
  ChevronUp,
  ExternalLink,
  PhoneCall
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

  const attioUrl = lead?.id ? `https://app.attio.com/fyntra/person/${lead.id}/overview` : null;
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
      <div className={cn('modern-card p-5 animate-fade-in h-full', className)}>
        <div className="flex flex-col items-center justify-center h-full py-8">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted-foreground">Buscando lead...</p>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className={cn('modern-card p-5 animate-fade-in h-full', className)}>
        <div className="flex flex-col items-center justify-center h-full py-8">
          <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4 border border-border/30">
            <User className="w-7 h-7 text-muted-foreground/50" />
          </div>
          {displayPhone && (
            <p className="font-mono font-medium text-foreground mb-1">{displayPhone}</p>
          )}
          <p className="text-sm text-muted-foreground mb-4">Lead nao encontrado no CRM</p>
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
    <div className={cn('modern-card p-5 animate-fade-in flex flex-col overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
            <User className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-medium text-muted-foreground">Lead Info</span>
          {attioUrl && (
            <a
              href={attioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
              title="Abrir no Attio"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
        {lead.classification && (
          <span className={cn(
            'px-2.5 py-1 rounded-md text-xs font-semibold border',
            lead.classification === 'SQL' && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            lead.classification === 'MQL' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            !['SQL', 'MQL'].includes(lead.classification) && 'bg-muted/50 text-foreground border-border/30'
          )}>
            {lead.classification}
          </span>
        )}
      </div>

      <ScrollArea className="flex-1 pr-3 min-h-0">
        <div className="space-y-4">
          {/* Name & Phone */}
          <div className="pb-3 border-b border-border/30">
            <h3 className="font-semibold text-lg mb-1">{lead.name}</h3>
            <p className="text-sm text-muted-foreground font-mono">{lead.phone}</p>
          </div>

          {/* Info Grid */}
          <div className="space-y-2.5">
            {(displayCity || displayState) && (
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-muted/30 flex items-center justify-center border border-border/20">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <span className="text-sm">
                  {displayCity && displayState
                    ? `${displayCity}, ${displayState}`
                    : displayCity || displayState}
                </span>
              </div>
            )}

            {lead.case_type && (
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-muted/30 flex items-center justify-center border border-border/20">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <span className="text-sm">{lead.case_type}</span>
              </div>
            )}

            {(lead.advance_value || lead.advance_seeking) && (
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <span className="text-sm font-medium text-emerald-400">
                  ${lead.advance_value
                    ? lead.advance_value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                    : lead.advance_seeking}
                </span>
              </div>
            )}

            {lead.email && (
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-muted/30 flex items-center justify-center border border-border/20">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground truncate">{lead.email}</span>
              </div>
            )}

            {lead.has_attorney && (
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-muted/30 flex items-center justify-center border border-border/20">
                  <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <span className="text-sm">
                  {lead.has_attorney.toLowerCase() === 'yes' ? 'Com advogado' : 'Sem advogado'}
                </span>
              </div>
            )}
          </div>

          {/* Attorney Info */}
          {lead.attorney_info && (
            <div className="pt-3 border-t border-border/30">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-md bg-muted/30 flex items-center justify-center border border-border/20 mt-0.5">
                  <Scale className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <span className="text-sm break-words">{lead.attorney_info}</span>
              </div>
            </div>
          )}

          {/* Description */}
          {lead.description && (
            <div className="pt-3 border-t border-border/30">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Descricao</p>
              <p className="text-sm leading-relaxed break-words">{displayDescription}</p>
              {shouldTruncateDescription && (
                <button
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-2 transition-colors"
                >
                  {isDescriptionExpanded ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      Ver menos
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      Ver mais
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Notes (legacy) */}
          {lead.notes && !lead.description && (
            <div className="pt-3 border-t border-border/30">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Notas</p>
              <p className="text-sm break-words">{lead.notes}</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Call Button */}
      {onCall && (
        <div className="pt-4 mt-4 border-t border-border/30 flex-shrink-0">
          <Button
            onClick={handleCall}
            className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 border border-emerald-400/30 shadow-lg shadow-emerald-500/20"
          >
            <PhoneCall className="w-4 h-4" />
            Ligar
          </Button>
        </div>
      )}
    </div>
  );
}
