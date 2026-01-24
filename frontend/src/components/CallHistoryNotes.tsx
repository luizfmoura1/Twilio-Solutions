import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useDebouncedCallback } from '@/hooks/useDebounce';
import { callResumoService } from '@/services/api';
import { Pencil, X, Check, Loader2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CallHistoryNotesProps {
  callSid: string;
  initialValue?: string | null;
  className?: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function CallHistoryNotes({ callSid, initialValue, className }: CallHistoryNotesProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState(initialValue || '');
  const [originalNotes, setOriginalNotes] = useState(initialValue || '');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [isExpanded, setIsExpanded] = useState(false);

  // Sync with prop changes
  useEffect(() => {
    setNotes(initialValue || '');
    setOriginalNotes(initialValue || '');
  }, [initialValue]);

  const saveNotes = async (resumo: string) => {
    setSaveState('saving');
    try {
      await callResumoService.saveResumo(callSid, resumo);
      setSaveState('saved');
      setOriginalNotes(resumo);
      setTimeout(() => {
        setSaveState('idle');
        setIsEditing(false);
      }, 1500);
    } catch (error) {
      console.error('Error saving notes:', error);
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 2000);
    }
  };

  // Debounced save
  const debouncedSave = useDebouncedCallback(
    (resumo: string) => saveNotes(resumo),
    3000
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNotes(value);
    setSaveState('idle');
    debouncedSave(value);
  };

  const handleSave = async () => {
    await saveNotes(notes);
  };

  const handleCancel = () => {
    setNotes(originalNotes);
    setIsEditing(false);
    setSaveState('idle');
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  // Truncate text for display
  const displayText = notes || '';
  const shouldTruncate = displayText.length > 100 && !isExpanded && !isEditing;
  const truncatedText = shouldTruncate ? displayText.slice(0, 100) + '...' : displayText;

  if (isEditing) {
    return (
      <div className={cn('mt-2 space-y-2', className)} onClick={(e) => e.stopPropagation()}>
        <Textarea
          value={notes}
          onChange={handleChange}
          placeholder="Adicionar notas..."
          className="min-h-[80px] text-sm bg-muted/30 border-border resize-y"
          autoFocus
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs">
            {saveState === 'saving' && (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Salvando...</span>
              </>
            )}
            {saveState === 'saved' && (
              <>
                <Check className="w-3 h-3 text-success" />
                <span className="text-success">Salvo!</span>
              </>
            )}
            {saveState === 'error' && (
              <span className="text-destructive">Erro ao salvar</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={handleCancel}
            >
              <X className="w-3 h-3 mr-1" />
              Cancelar
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-7 px-2"
              onClick={handleSave}
              disabled={saveState === 'saving'}
            >
              {saveState === 'saving' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <Check className="w-3 h-3 mr-1" />
                  Salvar
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Display mode
  if (!notes) {
    return (
      <button
        onClick={handleStartEdit}
        className={cn(
          'mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer',
          className
        )}
      >
        <FileText className="w-3 h-3" />
        <span>Adicionar nota...</span>
        <Pencil className="w-3 h-3" />
      </button>
    );
  }

  return (
    <div className={cn('mt-2', className)} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-2">
        <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
            {truncatedText}
          </p>
          {shouldTruncate && (
            <button
              onClick={() => setIsExpanded(true)}
              className="text-xs text-primary hover:underline mt-0.5"
            >
              ver mais
            </button>
          )}
          {isExpanded && displayText.length > 100 && (
            <button
              onClick={() => setIsExpanded(false)}
              className="text-xs text-primary hover:underline mt-0.5 ml-2"
            >
              ver menos
            </button>
          )}
        </div>
        <button
          onClick={handleStartEdit}
          className="p-1 hover:bg-muted rounded transition-colors shrink-0"
          title="Editar nota"
        >
          <Pencil className="w-3 h-3 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
    </div>
  );
}
