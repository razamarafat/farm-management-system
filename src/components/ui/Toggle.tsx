import { cn } from '@/utils/cn';

interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

export const Toggle = ({ checked, onChange, disabled }: ToggleProps) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200',
        checked ? 'bg-[var(--c-primary)]' : 'bg-[var(--c-muted)]',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-[calc(3rem-1.55rem)]' : 'translate-x-[0.15rem]'
        )}
      />
    </button>
  );
};
