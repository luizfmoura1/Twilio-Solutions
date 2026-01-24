import { useState, useEffect, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { useDebouncedCallback } from '@/hooks/useDebounce';
import { callResumoService } from '@/services/api';
import { FileText, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CallNotesProps {
  callSid: string | null;
  className?: string;
  initialValue?: string;
}

type SaveState = 'idle' | 'saving' | 'saved';

export function CallNotes({ callSid, className, initialValue = '' }: CallNotesProps) {
  const [notes, setNotes] = useState(initialValue);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Reset notes when call changes
  useEffect(() => {
    setNotes(initialValue);
    setSaveState('idle');
  }, [callSid, initialValue]);

  // Auto-save function
  const saveNotes = useCallback(async (callSidToSave: string, resumo: string) => {
    if (!callSidToSave) return;
    
    setSaveState('saving');
    try {
      await callResumoService.saveResumo(callSidToSave, resumo);
      setSaveState('saved');
      // Reset to idle after 2 seconds
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (error) {
      console.error('Error saving notes:', error);
      setSaveState('idle');
    }
  }, []);

  // Debounced save - 3 seconds after stop typing
  const debouncedSave = useDebouncedCallback(
    (sid: string, resumo: string) => saveNotes(sid, resumo),
    3000
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNotes(value);
    setSaveState('idle'); // Reset to idle when typing
    
    if (callSid) {
      debouncedSave(callSid, value);
    }
  };

  if (!callSid) return null;

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="w-4 h-4" />
          Notas da ligação
        </label>
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
        </div>
      </div>
      <Textarea
        value={notes}
        onChange={handleChange}
        placeholder="Digite suas anotações sobre a ligação..."
        className="min-h-[100px] max-h-[200px] resize-y bg-muted/30 border-border text-sm"
      />
    </div>
  );
}
