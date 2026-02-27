import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, getDay, parse, isSameDay } from 'date-fns-jalali';
import { toPersianDigits } from '@/utils/persianNumbers';
import { cn } from '@/utils/cn';

interface JalaliDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const WEEK_DAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

const parseJalali = (value: string) => {
  try {
    return parse(value, 'yyyy/MM/dd', new Date());
  } catch {
    return new Date();
  }
};

const getMonthLabel = (date: Date) => format(date, 'MMMM yyyy');

const buildJalaliDate = (view: Date, day: number) => {
  const jalaliMonth = format(view, 'MM');
  const jalaliYear = format(view, 'yyyy');
  const dayText = String(day).padStart(2, '0');
  return `${jalaliYear}/${jalaliMonth}/${dayText}`;
};

const convertJalaliToDate = (jalali: string) => {
  try {
    return parse(jalali, 'yyyy/MM/dd', new Date());
  } catch {
    return new Date();
  }
};

export const JalaliDatePicker = ({ value, onChange, placeholder = 'انتخاب تاریخ', className, disabled }: JalaliDatePickerProps) => {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(() => (value ? parseJalali(value) : new Date()));
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = value ? parseJalali(value) : null;

  useEffect(() => {
    if (value) {
      setViewDate(parseJalali(value));
    }
  }, [value]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
    }
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const days = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const dayCount = end.getDate();
    const startOffset = (getDay(start) + 1) % 7;

    const cells: Array<{ date: string | null; label: string }> = [];
    for (let i = 0; i < startOffset; i += 1) {
      cells.push({ date: null, label: '' });
    }
    for (let day = 1; day <= dayCount; day += 1) {
      const jalaliValue = buildJalaliDate(viewDate, day);
      cells.push({ date: jalaliValue, label: toPersianDigits(day) });
    }
    return cells;
  }, [viewDate]);

  const clearDate = () => {
    onChange('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'h-10 w-full rounded-md border border-input bg-background px-3 text-sm flex items-center justify-between gap-2',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span className={cn(value ? 'text-foreground' : 'text-muted-foreground')}>
          {value ? toPersianDigits(value) : placeholder}
        </span>
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-[fadeIn_120ms_ease-out]"
          aria-modal
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-lg w-[320px] p-4 animate-[scaleIn_140ms_ease-out]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center"
                  onClick={() => setViewDate(subMonths(viewDate, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="text-sm font-bold text-foreground">{toPersianDigits(getMonthLabel(viewDate))}</span>
                <button
                  type="button"
                  className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center"
                  onClick={() => setViewDate(addMonths(viewDate, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-2">
              {WEEK_DAYS.map((day) => (
                <div key={day} className="py-1">{day}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((cell, idx) => {
                if (!cell.date) {
                  return <div key={`empty-${idx}`} className="h-8" />;
                }
                const cellDate = cell.date ? convertJalaliToDate(cell.date) : null;
                const isSelected = cellDate && selectedDate ? isSameDay(cellDate, selectedDate) : false;
                const isToday = cellDate ? isSameDay(cellDate, new Date()) : false;
                return (
                  <button
                    key={cell.label + idx}
                    type="button"
                    className={cn(
                      'h-8 rounded-lg text-sm flex items-center justify-center transition-colors',
                      isSelected && 'bg-primary text-primary-foreground',
                      !isSelected && 'hover:bg-muted',
                      isToday && !isSelected && 'border border-primary text-primary'
                    )}
                    onClick={() => {
                      if (cell.date) {
                        onChange(cell.date);
                        setOpen(false);
                      }
                    }}
                  >
                    {cell.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => {
                  const todayJalali = format(new Date(), 'yyyy/MM/dd');
                  onChange(todayJalali);
                  setOpen(false);
                }}
              >
                امروز
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={clearDate}
              >
                پاک کردن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
