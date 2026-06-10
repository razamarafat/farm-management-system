import { useEffect, useState } from 'react';
import { getJalaliDateTime } from '@/utils/jalaliDate';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/utils/cn';

export const DateTimeDisplay = ({ className }: { className?: string }) => {
  const [dateTime, setDateTime] = useState<string>('');
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // On desktop show full date time, on mobile just time? 
      // Prompt says: "DateTime (text-sm, muted, full format desktop, time only mobile)"
      // Let's rely on CSS/Media Query logic or the hook.
      // But getJalaliDateTime returns full string.
      // Let's just return full string and format it or handle inside.
      // For simplicity in this component, I'll use the utility.
      
      if (window.innerWidth >= 1024) {
         setDateTime(getJalaliDateTime(now));
      } else {
         // Just time for mobile. 
         // getJalaliDateTime is "yyyy/MM/dd HH:mm"
         // Let's just extract time or create a new util.
         // Or just use basic Date for time part since numbers are Persianized via util anyway?
         // Let's stick to getJalaliDateTime and maybe truncate or split.
         const full = getJalaliDateTime(now);
         // full is "۱۴۰۲/۱۰/۱۰ ۱۲:۳۰"
         // split by space
         const parts = full.split(' ');
         setDateTime(parts[1] || full);
      }
    };

    updateTime();
    const timer = setInterval(updateTime, 1000 * 60); // every minute

    return () => clearInterval(timer);
  }, [isDesktop]);

  return (
    <div
      className={cn(
        "text-sm font-semibold text-foreground border border-border rounded-full px-3 py-1 bg-card/80 shadow-sm",
        className
      )}
    >
      {dateTime}
    </div>
  );
};
