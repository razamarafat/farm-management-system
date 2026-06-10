import { motion } from 'framer-motion';
import { Leaf } from 'lucide-react';
import { LoginForm } from '@/components/auth/LoginForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/Card';
import { APP_VERSION } from '@/utils/constants';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

const LoginPage = () => {
  return (
    <div className="relative w-full max-w-[400px]">
      {/* Theme toggle in top-left corner */}
      <div className="absolute -top-12 left-0">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8 flex flex-col items-center text-center space-y-2">
          <div className="bg-primary/10 p-4 rounded-full mb-2">
            <Leaf className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">مروارید فارم</h1>
          <p className="text-sm text-muted-foreground">
            پایش هوشمند دان و اقلام بسته‌بندی
          </p>
        </div>

        <Card className="border-t-4 border-t-primary shadow-lg">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">ورود به سیستم</CardTitle>
            <CardDescription>
              لطفا نام کاربری و رمز عبور خود را وارد کنید
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
          <CardFooter className="flex flex-col border-t pt-6 mt-2">
            <div className="text-xs text-muted-foreground">
              نسخه {APP_VERSION}
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
};

export default LoginPage;
