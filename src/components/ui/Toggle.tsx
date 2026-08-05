import { cn } from '@/utils/cn';

interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label?: string;
}

export const Toggle = ({ checked, onChange, disabled, label }: ToggleProps) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
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
