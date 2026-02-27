import { motion } from 'framer-motion';
import { ClipboardList, Package, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { JalaliDatePicker } from '@/components/ui/JalaliDatePicker';
import { getJalaliToday, addDaysToJalali, jalaliToGregorian } from '@/utils/jalaliDate';
import { supabaseAdmin } from '@/lib/supabase-admin';

export default function ConsumptionPage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const [selectedDate, setSelectedDate] = useState(getJalaliToday());
  const [adminFarmId, setAdminFarmId] = useState<string>('');
  const [adminFarms, setAdminFarms] = useState<{ id: string; name: string; code: string }[]>([]);
  const [isLoadingFarms, setIsLoadingFarms] = useState(false);
  
  const isReadOnly = profile?.role === 'supervisor';
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    const loadFarms = async () => {
      if (!isAdmin) return;
      setIsLoadingFarms(true);
      const { data } = await supabaseAdmin
        .from('farms')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name');
      const farms = (data || []) as { id: string; name: string; code: string }[];
      setAdminFarms(farms);
      if (!adminFarmId && farms.length > 0) {
        setAdminFarmId(farms[0].id);
      }
      setIsLoadingFarms(false);
    };
    loadFarms();
  }, [isAdmin]);

  const goToPreviousDay = () => {
    setSelectedDate(addDaysToJalali(selectedDate, -1));
  };

  const goToNextDay = () => {
    setSelectedDate(addDaysToJalali(selectedDate, 1));
  };

  const goToToday = () => {
    setSelectedDate(getJalaliToday());
  };

  const openSheet = (category: 'feed' | 'packaging') => {
    const gregorianDate = jalaliToGregorian(selectedDate);
    const basePath = isAdmin ? '/admin' : isReadOnly ? '/supervisor' : '/operator';
    if (isAdmin && !adminFarmId) {
      return;
    }
    const farmQuery = isAdmin && adminFarmId ? `&farm=${adminFarmId}` : '';
    navigate(`${basePath}/consumption/${category}?date=${gregorianDate}${farmQuery}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-fg)]">
            {isReadOnly ? 'مشاهده حواله مصرف' : 'حواله مصرف روزانه'}
          </h1>
          <p className="text-sm text-[var(--c-muted-fg)] mt-1">
            {isReadOnly 
              ? 'مشاهده حواله‌های ثبت شده'
              : 'ثبت مصرف روزانه نهاده‌ها و اقلام بسته‌بندی'
            }
          </p>
        </div>
      </div>

      {/* Date Selector */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[var(--c-primary)]" />
            <span className="text-sm font-medium text-[var(--c-fg)]">تاریخ:</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPreviousDay}
              className="p-2"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>

            <JalaliDatePicker
              value={selectedDate}
              onChange={(val) => val && setSelectedDate(val)}
              placeholder="انتخاب تاریخ"
              className="min-w-[180px]"
            />

            <Button
              variant="outline"
              size="sm"
              onClick={goToNextDay}
              className="p-2"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={goToToday}
              className="mr-2"
            >
              امروز
            </Button>
          </div>

          {/* Farm context for admin */}
          {isAdmin && (
            <div className="flex items-center gap-2 text-sm text-[var(--c-muted-fg)]">
              <span>فارم:</span>
              <select
                value={adminFarmId}
                onChange={(e) => setAdminFarmId(e.target.value)}
                className="h-9 rounded-md border border-[var(--c-border)] bg-[var(--c-card)] px-2 text-sm text-[var(--c-fg)] min-w-[220px]"
                disabled={isLoadingFarms}
              >
                <option value="">انتخاب فارم</option>
                {adminFarms.map((farm) => (
                  <option key={farm.id} value={farm.id}>
                    {farm.name} ({farm.code})
                  </option>
                ))}
              </select>
              {isLoadingFarms && (
                <span className="text-xs">در حال بارگذاری...</span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isAdmin && !adminFarmId && (
          <Card className="p-4 md:col-span-2 border border-destructive/30 bg-destructive/5">
            <div className="text-sm text-destructive">برای ادامه ابتدا یک فارم انتخاب کنید.</div>
          </Card>
        )}
        {/* Feed Card */}
        <motion.div
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          transition={{ duration: 0.15 }}
        >
          <Card
            className="p-6 cursor-pointer hover:shadow-lg transition-all duration-200 border-2 border-transparent hover:border-green-500/30"
            onClick={() => openSheet('feed')}
            style={{ pointerEvents: isAdmin && !adminFarmId ? 'none' : 'auto', opacity: isAdmin && !adminFarmId ? 0.6 : 1 }}
          >
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                <ClipboardList className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-[var(--c-fg)] mb-2">
                  {isReadOnly ? 'مشاهده مصرف نهاده‌ها' : 'ثبت مصرف نهاده‌ها'}
                </h3>
                <p className="text-sm text-[var(--c-muted-fg)]">
                  {isReadOnly 
                    ? 'مشاهده حواله مصرف مواد خوراکی و نهاده‌های دامی'
                    : 'ثبت مصرف روزانه ذرت، سویا، گندم و سایر نهاده‌ها'
                  }
                </p>
                <div className="mt-4 flex items-center text-green-600 dark:text-green-400 text-sm font-medium">
                  <span>{isReadOnly ? 'مشاهده' : 'ورود به فرم'}</span>
                  <ChevronLeft className="w-4 h-4 mr-1" />
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Packaging Card */}
        <motion.div
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          transition={{ duration: 0.15 }}
        >
          <Card
            className="p-6 cursor-pointer hover:shadow-lg transition-all duration-200 border-2 border-transparent hover:border-blue-500/30"
            onClick={() => openSheet('packaging')}
            style={{ pointerEvents: isAdmin && !adminFarmId ? 'none' : 'auto', opacity: isAdmin && !adminFarmId ? 0.6 : 1 }}
          >
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Package className="w-7 h-7 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-[var(--c-fg)] mb-2">
                  {isReadOnly ? 'مشاهده مصرف بسته‌بندی' : 'ثبت مصرف اقلام بسته‌بندی'}
                </h3>
                <p className="text-sm text-[var(--c-muted-fg)]">
                  {isReadOnly 
                    ? 'مشاهده حواله مصرف کارتن، شانه و سایر اقلام'
                    : 'ثبت مصرف روزانه کارتن، شانه، نایلون و سایر اقلام'
                  }
                </p>
                <div className="mt-4 flex items-center text-blue-600 dark:text-blue-400 text-sm font-medium">
                  <span>{isReadOnly ? 'مشاهده' : 'ورود به فرم'}</span>
                  <ChevronLeft className="w-4 h-4 mr-1" />
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Info Box */}
      <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-600 dark:text-blue-400 text-lg">💡</span>
          </div>
          <div>
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
              راهنما
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {isReadOnly 
                ? 'شما فقط امکان مشاهده حواله‌ها را دارید. برای ویرایش با مدیر سیستم تماس بگیرید.'
                : 'پس از ثبت نهایی حواله، تا ۲۴ ساعت امکان ویرایش وجود دارد. پس از آن حواله قفل می‌شود.'
              }
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
