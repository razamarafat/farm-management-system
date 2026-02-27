import { useEffect, useState } from 'react';
import { getJalaliDateTime } from '@/utils/jalaliDate';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/utils/cn';

export const DateTimeDisplay = ({ className }: { className?: string }) => {
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      
      if (window.innerWidth >= 1024) {
        const full = getJalaliDateTime(now);
        const parts = full.split(' ');
        setDate(parts[0] || full);
        setTime(parts[1] || '');
      } else {
        // Just time for mobile
        const full = getJalaliDateTime(now);
        const parts = full.split(' ');
        setDate('');
        setTime(parts[1] || full);
      }
    };

    updateTime();
    const timer = setInterval(updateTime, 1000 * 60); // every minute

    return () => clearInterval(timer);
  }, [isDesktop]);

  // Desktop: show vertical layout with date in box and gap
  if (isDesktop) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-1",
          className
        )}
      >
        {/* Date at top in a box */}
        <div
          className="text-sm font-semibold text-foreground border-2 border-primary rounded-lg px-3 py-1 bg-card/80 shadow-sm"
          style={{ borderColor: 'var(--c-primary)' }}
        >
          {date}
        </div>
        {/* Time below with small gap */}
        <div
          className="text-sm font-semibold text-foreground bg-card/80"
        >
          {time}
        </div>
      </div>
    );
  }

  // Mobile: show just time
  return (
    <div
      className={cn(
        "text-sm font-semibold text-foreground border border-border rounded-full px-3 py-1 bg-card/80 shadow-sm",
        className
      )}
    >
      {time}
    </div>
  );
};
