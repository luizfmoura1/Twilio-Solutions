import { cn } from '@/lib/utils';

interface DialpadButtonProps {
  digit: string;
  letters?: string;
  onClick: (digit: string) => void;
  className?: string;
}

export function DialpadButton({ digit, letters, onClick, className }: DialpadButtonProps) {
  const handleClick = () => {
    onClick(digit);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'dialpad-key w-16 h-16 md:w-20 md:h-20',
        className
      )}
    >
      <span className="text-2xl md:text-3xl font-bold">{digit}</span>
      {letters && (
        <span className="text-[10px] md:text-xs tracking-widest text-muted-foreground mt-0.5">
          {letters}
        </span>
      )}
    </button>
  );
}
