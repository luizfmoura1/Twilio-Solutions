import { useState, useEffect } from 'react';
import { DialpadButton } from './DialpadButton';
import { Phone, Delete } from 'lucide-react';
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
  { code: '+33', country: 'Franca', flag: '🇫🇷' },
  { code: '+34', country: 'Espanha', flag: '🇪🇸' },
  { code: '+39', country: 'Italia', flag: '🇮🇹' },
  { code: '+351', country: 'Portugal', flag: '🇵🇹' },
  { code: '+52', country: 'Mexico', flag: '🇲🇽' },
  { code: '+54', country: 'Argentina', flag: '🇦🇷' },
  { code: '+57', country: 'Colombia', flag: '🇨🇴' },
  { code: '+56', country: 'Chile', flag: '🇨🇱' },
  { code: '+81', country: 'Japao', flag: '🇯🇵' },
  { code: '+86', country: 'China', flag: '🇨🇳' },
  { code: '+91', country: 'India', flag: '🇮🇳' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
];

export function Dialpad({ onCall, onNumberChange, disabled, className }: DialpadProps) {
  const [number, setNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+1');

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
    <div className={cn('modern-card p-5 w-full max-w-sm mx-auto', className)}>
      {/* Number Input */}
      <div className="mb-5">
        <div className="flex gap-2 items-center bg-muted/20 rounded-xl p-1.5 border border-border/30">
          <Select value={countryCode} onValueChange={setCountryCode}>
            <SelectTrigger className="w-[85px] h-11 bg-muted/30 border-0 rounded-lg focus:ring-1 focus:ring-primary/30 transition-all">
              <SelectValue>
                <span className="flex items-center gap-1.5">
                  <span className="text-base">{selectedCountry?.flag}</span>
                  <span className="font-mono text-xs text-muted-foreground">{countryCode}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-card/95 backdrop-blur-md border-border/50">
              {countryCodes.map((country) => (
                <SelectItem key={country.code} value={country.code} className="cursor-pointer">
                  <span className="flex items-center gap-2.5">
                    <span className="text-base">{country.flag}</span>
                    <span className="font-mono text-sm">{country.code}</span>
                    <span className="text-muted-foreground text-xs">{country.country}</span>
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
              placeholder="Digite o numero"
              className="w-full h-11 bg-transparent border-0 px-3 text-xl font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none tracking-wide"
            />
            {number && (
              <button
                type="button"
                onClick={handleDelete}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-muted/50 rounded-lg transition-all duration-200"
              >
                <Delete className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dialpad Grid */}
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        {dialpadKeys.map((key) => (
          <DialpadButton
            key={key.digit}
            digit={key.digit}
            letters={key.letters}
            onClick={handleDigit}
          />
        ))}
      </div>

      {/* Call Button */}
      <button
        type="button"
        onClick={handleCall}
        disabled={disabled || !number.trim()}
        className={cn(
          'w-full py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2.5',
          'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground',
          'shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30',
          'transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]',
          'border border-primary/20',
          (disabled || !number.trim()) && 'opacity-40 cursor-not-allowed shadow-none hover:scale-100'
        )}
      >
        <Phone className="w-5 h-5" />
        Ligar
      </button>
    </div>
  );
}
