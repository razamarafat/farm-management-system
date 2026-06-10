import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'انتخاب کنید',
  label,
  disabled,
  className,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpen = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [disabled]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch('');
  }, []);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    handleClose();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, handleClose]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleClose]);

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      {label && (
        <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={isOpen ? handleClose : handleOpen}
        disabled={disabled}
        className={cn(
          'w-full px-3 py-2 rounded-md border text-left flex items-center justify-between',
          'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-fg)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--c-primary)] focus:ring-offset-2',
          disabled && 'opacity-50 cursor-not-allowed',
          isOpen && 'ring-2 ring-[var(--c-primary)]'
        )}
      >
        <span className={selectedOption ? '' : 'text-[var(--c-muted-fg)]'}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-[var(--c-card)] border border-[var(--c-border)] rounded-md shadow-lg max-h-[300px] overflow-hidden">
          <div className="p-2 border-b border-[var(--c-border)]">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted-fg)]" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجو..."
                className="w-full pr-8 pl-2 py-1.5 text-sm rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--c-primary)]"
              />
            </div>
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-sm text-[var(--c-muted-fg)]">
                موردی یافت نشد
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  disabled={option.disabled}
                  className={cn(
                    'w-full px-3 py-2 text-right text-sm hover:bg-[var(--c-muted)] transition-colors',
                    option.value === value && 'bg-[var(--c-primary)] text-white hover:bg-[var(--c-primary)]',
                    option.disabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
