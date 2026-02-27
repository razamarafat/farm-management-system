import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const NotFoundPage = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="bg-muted p-4 rounded-full">
        <FileQuestion className="h-12 w-12 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-bold">صفحه مورد نظر یافت نشد</h1>
      <p className="text-muted-foreground max-w-sm">
        آدرس وارد شده اشتباه است یا صفحه حذف شده است.
      </p>
      <Link to="/">
        <Button>بازگشت به صفحه اصلی</Button>
      </Link>
    </div>
  );
};

export default NotFoundPage;
