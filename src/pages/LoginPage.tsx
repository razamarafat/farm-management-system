import { motion } from 'framer-motion';
import { LoginForm } from '@/components/auth/LoginForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/Card';
import { APP_VERSION } from '@/utils/constants';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

const LoginPage = () => {
  return (
    <div className="relative w-full max-w-[400px]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-12 flex flex-col items-center text-center">
          <h1
            className="text-6xl font-normal"
            style={{
              fontFamily: "'Lalezar', cursive",
              color: 'var(--c-fg)',
              textShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
          >
            مروارید فارم
          </h1>
        </div>

        <Card className="border-t-4 border-t-primary shadow-lg relative">
          {/* Theme toggle in top-right corner */}
          <div className="absolute top-4 left-4">
            <ThemeToggle />
          </div>
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
