import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const AccessDenied = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="bg-destructive/10 p-4 rounded-full">
        <ShieldAlert className="h-12 w-12 text-destructive" />
      </div>
      <h1 className="text-2xl font-bold text-destructive">دسترسی غیرمجاز</h1>
      <p className="text-muted-foreground max-w-sm">
        شما اجازه دسترسی به این صفحه را ندارید.
      </p>
      <Link to="/">
        <Button variant="outline">بازگشت به داشبورد</Button>
      </Link>
    </div>
  );
};

export default AccessDenied;
