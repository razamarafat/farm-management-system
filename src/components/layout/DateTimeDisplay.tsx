import { useEffect, useState } from 'react';
import { getJalaliDateTime } from '@/utils/jalaliDate';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/utils/cn';

type DateTimeParts = { date: string; time: string };

const EMPTY_PARTS: DateTimeParts = { date: '', time: '' };

export const DateTimeDisplay = ({ className }: { className?: string }) => {
  const [parts, setParts] = useState<DateTimeParts>(EMPTY_PARTS);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    const updateTime = () => {
      // getJalaliDateTime produces e.g. "۱۴۰۵/۰۳/۳۰ ۱۴:۳۵"
      const full = getJalaliDateTime(new Date());
      const [date, time] = full.split(' ');
      setParts({ date: date ?? '', time: time ?? '' });
    };

    updateTime();
    const timer = setInterval(updateTime, 1000 * 60); // every minute

    return () => clearInterval(timer);
  }, []);

  return (
    <div
      aria-label="تاریخ و ساعت"
      className={cn(
        // Modern subtle container: soft card, rounded, light shadow.
        // Works in both light + dark via bg-card/70 + theme tokens.
        'flex flex-col items-center justify-center gap-0.5 rounded-xl border border-border/60 bg-card/70 px-3 py-1.5 shadow-[0_1px_2px_color-mix(in_srgb,var(--c-fg)_8%,transparent)] backdrop-blur-sm leading-tight',
        'min-w-[64px]',
        className,
      )}
    >
      {/* Time: primary line */}
      <span className="text-[15px] font-bold text-foreground tabular-nums">
        {parts.time || '—'}
      </span>
      {/* Date: secondary line, shown on desktop only */}
      {isDesktop && parts.date && (
        <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
          {parts.date}
        </span>
      )}
    </div>
  );
};
