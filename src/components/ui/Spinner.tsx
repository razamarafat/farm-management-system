import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export const Spinner = ({ className, size = 24 }: { className?: string; size?: number }) => {
  return (
    <Loader2 
      className={cn("animate-spin text-primary", className)} 
      size={size} 
    />
  );
};
