import { memo, useState, useEffect } from 'react';
import { Plus, Trash2, Hash, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Farm } from '@/types/farm.types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { toPersianDigits } from '@/utils/persianNumbers';

interface FarmHall {
  id: string;
  farm_id: string;
  hall_number: number;
  name: string | null;
  is_active: boolean;
  created_at: string;
}

interface FarmHallsPanelProps {
  farm: Farm;
}

const FarmHallsPanelInner = ({ farm }: FarmHallsPanelProps) => {
  const [halls, setHalls] = useState<FarmHall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newHallNumber, setNewHallNumber] = useState('');
  const [newHallName, setNewHallName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchHalls = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('farm_halls')
        .select('*')
        .eq('farm_id', farm.id)
        .order('hall_number', { ascending: true });

      if (err) throw err;
      setHalls((data as FarmHall[]) || []);
    } catch {
      setError('خطا در دریافت سالن‌ها');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHalls();
  }, [farm.id]);

  const handleAddHall = async () => {
    const num = parseInt(newHallNumber);
    if (!newHallNumber || isNaN(num) || num < 1) {
      toast.error('شماره سالن معتبر وارد کنید');
      return;
    }

    const exists = halls.some((h) => h.hall_number === num);
    if (exists) {
      toast.error(`سالن شماره ${toPersianDigits(num)} قبلاً ثبت شده`);
      return;
    }

    setIsAdding(true);
    try {
      const { error: err } = await supabase.from('farm_halls').insert({
        farm_id: farm.id,
        hall_number: num,
        name: newHallName.trim() || null,
        is_active: true,
      });

      if (err) throw err;

      toast.success(`سالن شماره ${toPersianDigits(num)} اضافه شد`);
      setNewHallNumber('');
      setNewHallName('');
      setShowAddForm(false);
      fetchHalls();
    } catch {
      toast.error('خطا در افزودن سالن');
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddBulk = async () => {
    const count = parseInt(newHallNumber);
    if (!count || count < 1 || count > 50) {
      toast.error('تعداد سالن باید بین ۱ تا ۵۰ باشد');
      return;
    }

    setIsAdding(true);
    try {
      const existingNums = halls.map((h) => h.hall_number);
      const toInsert = [] as { farm_id: string; hall_number: number; is_active: boolean }[];
      for (let i = 1; i <= count; i++) {
        if (!existingNums.includes(i)) {
          toInsert.push({ farm_id: farm.id, hall_number: i, is_active: true });
        }
      }

      if (toInsert.length === 0) {
        toast.info('همه سالن‌ها از قبل وجود دارند');
        return;
      }

      const { error: err } = await supabase.from('farm_halls').insert(toInsert);
      if (err) throw err;

      toast.success(`${toPersianDigits(toInsert.length)} سالن اضافه شد`);
      setNewHallNumber('');
      setShowAddForm(false);
      fetchHalls();
    } catch {
      toast.error('خطا در افزودن سالن‌ها');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteHall = async (hall: FarmHall) => {
    try {
      const { error: err } = await supabase
        .from('farm_halls')
        .delete()
        .eq('id', hall.id);

      if (err) throw err;
      toast.success(`سالمن شماره ${toPersianDigits(hall.hall_number)} حذف شد`);
      fetchHalls();
    } catch {
      toast.error('خطا در حذف سالن');
    }
  };

  const handleToggleHall = async (hall: FarmHall) => {
    try {
      const { error: err } = await supabase
        .from('farm_halls')
        .update({ is_active: !hall.is_active })
        .eq('id', hall.id);

      if (err) throw err;
      fetchHalls();
    } catch {
      toast.error('خطا در تغییر وضعیت سالن');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Hash size={16} className="text-primary" />
          <span>سالن‌ها / گله‌ها</span>
          <span className="text-xs text-muted-foreground">
            ({toPersianDigits(halls.length)} سالن)
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAddForm(!showAddForm)}
          className="gap-1"
        >
          <Plus size={14} />
          افزودن سالن
        </Button>
      </div>

      {showAddForm && (
        <Card className="p-4 space-y-3 border-primary/30">
          <div className="text-sm font-medium text-primary">افزودن سالن جدید</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">شماره سالن</label>
              <Input
                type="number"
                value={newHallNumber}
                onChange={(e) => setNewHallNumber(e.target.value)}
                placeholder="مثال: ۱"
                min={1}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">نام سالن (اختیاری)</label>
              <Input
                value={newHallName}
                onChange={(e) => setNewHallName(e.target.value)}
                placeholder="مثال: سالن جوجه‌های نر"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleAddHall}
              isLoading={isAdding}
              className="gap-1"
            >
              <Plus size={14} />
              افزودن یک سالن
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddBulk}
              isLoading={isAdding}
              title="افزودن سالن‌های ۱ تا N به صورت یکجا"
            >
              افزودن ۱ تا {newHallNumber || 'N'} (دسته‌ای)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowAddForm(false); setNewHallNumber(''); setNewHallName(''); }}
            >
              انصراف
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            برای افزودن دسته‌ای: شماره را وارد کنید و «افزودن دسته‌ای» را بزنید تا سالن‌های ۱ تا آن عدد اضافه شوند
          </p>
        </Card>
      )}

      {isLoading && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle size={14} />
          {error}
          <button onClick={fetchHalls} className="underline">تلاش مجدد</button>
        </div>
      )}

      {!isLoading && !error && halls.length === 0 && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          <Hash className="mx-auto mb-2 opacity-30" size={32} />
          <p>هنوز سالنی ثبت نشده</p>
          <p className="text-xs mt-1">برای ثبت حواله مصرف، ابتدا سالن‌های فارم را اضافه کنید</p>
        </div>
      )}

      {!isLoading && !error && halls.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {halls.map((hall) => (
            <div
              key={hall.id}
              className={`
                relative group rounded-lg border p-2 text-center transition-all duration-150
                ${hall.is_active
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-muted/30 opacity-60'
                }
              `}
            >
              <div
                className={`text-lg font-bold ${hall.is_active ? 'text-primary' : 'text-muted-foreground'}`}
              >
                {toPersianDigits(hall.hall_number)}
              </div>
              {hall.name && (
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {hall.name}
                </div>
              )}
              {!hall.name && (
                <div className="text-xs text-muted-foreground">سالن</div>
              )}

              {/* Actions on hover */}
              <div className="absolute inset-0 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <button
                  onClick={() => handleToggleHall(hall)}
                  title={hall.is_active ? 'غیرفعال' : 'فعال'}
                  className={`text-xs px-1 py-0.5 rounded ${hall.is_active ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white'}`}
                >
                  {hall.is_active ? 'غیرفعال' : 'فعال'}
                </button>
                <button
                  onClick={() => handleDeleteHall(hall)}
                  title="حذف"
                  className="text-white bg-red-500 rounded p-0.5"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {halls.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t">
          <span>فعال: <span className="text-primary font-medium">{toPersianDigits(halls.filter(h => h.is_active).length)}</span></span>
          <span>غیرفعال: <span className="font-medium">{toPersianDigits(halls.filter(h => !h.is_active).length)}</span></span>
          <span>مجموع: <span className="font-medium">{toPersianDigits(halls.length)}</span></span>
        </div>
      )}
    </div>
  );
};

FarmHallsPanelInner.displayName = 'FarmHallsPanelInner';

const FarmHallsPanel = memo(FarmHallsPanelInner);
FarmHallsPanel.displayName = 'FarmHallsPanel';

export { FarmHallsPanel };
export default FarmHallsPanel;
