import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export const Spinner = ({ className, size = 24 }: { className?: string; size?: number }) => {
  return (
    <span role="status" aria-label="در حال بارگذاری" className="inline-flex">
      <Loader2
        aria-hidden="true"
        focusable="false"
        className={cn("animate-spin text-primary", className)}
        size={size}
      />
    </span>
  );
};
