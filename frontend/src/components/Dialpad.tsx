import { useState, useEffect, useCallback } from 'react';
import { DialpadButton } from './DialpadButton';
import { Phone, Delete, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DialpadProps {
  onCall: (number: string) => void;
  onNumberChange?: (fullNumber: string) => void;
  disabled?: boolean;
  className?: string;
}

const dialpadKeys = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];

const countryCodes = [
  { code: '+1', country: 'EUA', flag: '🇺🇸' },
  { code: '+55', country: 'Brasil', flag: '🇧🇷' },
  { code: '+44', country: 'Reino Unido', flag: '🇬🇧' },
  { code: '+49', country: 'Alemanha', flag: '🇩🇪' },
  { code: '+33', country: 'França', flag: '🇫🇷' },
  { code: '+34', country: 'Espanha', flag: '🇪🇸' },
  { code: '+39', country: 'Itália', flag: '🇮🇹' },
  { code: '+351', country: 'Portugal', flag: '🇵🇹' },
  { code: '+52', country: 'México', flag: '🇲🇽' },
  { code: '+54', country: 'Argentina', flag: '🇦🇷' },
  { code: '+57', country: 'Colômbia', flag: '🇨🇴' },
  { code: '+56', country: 'Chile', flag: '🇨🇱' },
  { code: '+81', country: 'Japão', flag: '🇯🇵' },
  { code: '+86', country: 'China', flag: '🇨🇳' },
  { code: '+91', country: 'Índia', flag: '🇮🇳' },
  { code: '+61', country: 'Austrália', flag: '🇦🇺' },
];

export function Dialpad({ onCall, onNumberChange, disabled, className }: DialpadProps) {
  const [number, setNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+1');

  // Notify parent of number changes (debounced in parent)
  useEffect(() => {
    if (onNumberChange) {
      const fullNumber = number.startsWith('+') ? number : `${countryCode}${number}`;
      onNumberChange(fullNumber);
    }
  }, [number, countryCode, onNumberChange]);

  const handleDigit = (digit: string) => {
    setNumber((prev) => prev + digit);
  };

  const handleDelete = () => {
    setNumber((prev) => prev.slice(0, -1));
  };

  const handleCall = () => {
    if (number.trim()) {
      // If number already starts with +, use it as is
      // Otherwise, prepend the selected country code
      const fullNumber = number.startsWith('+') ? number : `${countryCode}${number}`;
      onCall(fullNumber);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^\d+*#]/g, '');
    setNumber((prev) => prev + pasted);
  };

  const selectedCountry = countryCodes.find((c) => c.code === countryCode);

  return (
    <div className={cn('glass-card rounded-lg p-6 w-full max-w-lg mx-auto', className)}>
      <div className="mb-5">
        <div className="flex gap-2 items-center bg-muted/30 rounded-lg p-1.5">
          <Select value={countryCode} onValueChange={setCountryCode}>
            <SelectTrigger className="w-[90px] h-10 bg-muted/50 border-0 focus:ring-1 focus:ring-primary/50">
              <SelectValue>
                <span className="flex items-center gap-1">
                  <span className="text-sm">{selectedCountry?.flag}</span>
                  <span className="font-mono text-xs text-muted-foreground">{countryCode}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-50">
              {countryCodes.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  <span className="flex items-center gap-2">
                    <span>{country.flag}</span>
                    <span className="font-mono">{country.code}</span>
                    <span className="text-muted-foreground text-sm">{country.country}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <input
              type="text"
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/[^\d+*#]/g, ''))}
              onPaste={handlePaste}
              placeholder="Digite o número"
              className="w-full h-10 bg-transparent border-0 px-3 text-lg font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
            {number && (
              <button
                type="button"
                onClick={handleDelete}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 hover:bg-muted/50 rounded-full transition-colors"
              >
                <Delete className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        {dialpadKeys.map((key) => (
          <DialpadButton
            key={key.digit}
            digit={key.digit}
            letters={key.letters}
            onClick={handleDigit}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleCall}
        disabled={disabled || !number.trim()}
        className={cn(
          'w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition-all',
          'bg-primary hover:bg-primary/90 text-primary-foreground shadow-glow',
          (disabled || !number.trim()) && 'opacity-50 cursor-not-allowed shadow-none'
        )}
      >
        <Phone className="w-5 h-5" />
        Ligar
      </button>
    </div>
  );
}
