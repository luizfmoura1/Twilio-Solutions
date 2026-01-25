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
        'dialpad-key aspect-square w-full max-w-[72px]',
        className
      )}
    >
      <span className="text-xl sm:text-2xl font-bold">{digit}</span>
      {letters && (
        <span className="text-[9px] sm:text-[10px] tracking-[0.15em] text-muted-foreground/70 mt-0.5 font-medium">
          {letters}
        </span>
      )}
    </button>
  );
}
