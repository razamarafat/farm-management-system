import { useNavigate } from 'react-router-dom';
import { Hammer } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const UnderDevelopment = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="bg-amber-100 p-4 rounded-full dark:bg-amber-900/30">
        <Hammer className="h-12 w-12 text-amber-600 dark:text-amber-500" />
      </div>
      <h1 className="text-2xl font-bold text-amber-600 dark:text-amber-500">در حال توسعه</h1>
      <p className="text-muted-foreground max-w-sm">
        این بخش در حال حاضر در دست ساخت است و به زودی فعال خواهد شد.
      </p>
      <Button onClick={() => navigate(-1)} variant="outline">بازگشت</Button>
    </div>
  );
};

export default UnderDevelopment;
