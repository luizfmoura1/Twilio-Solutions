import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Lead } from '@/types';
import { Loader2, Save, X, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CallNoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  phoneNumber?: string;
  callDuration?: string;
  onSave: (note: string) => Promise<void>;
  onSkip: () => void;
}

const quickNotes = [
  'Lead interessado',
  'Não atendeu',
  'Caixa postal',
  'Não qualificado',
  'Ligar outro dia',
  'Número inválido',
];

export function CallNoteModal({
  open,
  onOpenChange,
  lead,
  phoneNumber,
  callDuration,
  onSave,
  onSkip,
}: CallNoteModalProps) {
  const [noteText, setNoteText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!noteText.trim()) return;
    
    setIsSaving(true);
    try {
      await onSave(noteText);
      setNoteText('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    setNoteText('');
    onSkip();
  };

  const addQuickNote = (note: string) => {
    setNoteText(prev => prev ? `${prev}\n${note}` : note);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setNoteText('');
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Adicionar Nota
          </DialogTitle>
          <DialogDescription>
            Registre informações sobre a chamada no CRM.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Call info */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            {lead?.name ? (
              <p className="font-semibold text-foreground">{lead.name}</p>
            ) : (
              <p className="font-semibold text-foreground">Contato</p>
            )}
            <p className="text-sm text-muted-foreground font-mono">
              {phoneNumber || 'Número não disponível'}
            </p>
            {callDuration && (
              <p className="text-sm text-muted-foreground">
                Duração: {callDuration}
              </p>
            )}
          </div>

          {/* Note textarea */}
          <Textarea
            placeholder="Escreva suas anotações sobre a chamada..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="min-h-[120px] resize-none"
          />

          {/* Quick notes */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">
              Sugestões rápidas:
            </p>
            <div className="flex flex-wrap gap-2">
              {quickNotes.map((note) => (
                <button
                  key={note}
                  type="button"
                  onClick={() => addQuickNote(note)}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-full",
                    "bg-secondary text-secondary-foreground",
                    "hover:bg-secondary/80 transition-colors",
                    "border border-border"
                  )}
                >
                  {note}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleSkip}
            disabled={isSaving}
            className="flex-1 sm:flex-none"
          >
            <X className="w-4 h-4 mr-2" />
            Pular
          </Button>
          <Button
            onClick={handleSave}
            disabled={!noteText.trim() || isSaving}
            className="flex-1 sm:flex-none"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
