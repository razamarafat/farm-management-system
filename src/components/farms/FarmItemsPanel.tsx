import { memo, useEffect, useMemo, useState } from 'react';
import { Box, Plus, Trash2, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { Farm } from '@/types/farm.types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Modal } from '@/components/ui/Modal';
import { DEFAULT_FARM_INGREDIENTS } from '@/utils/constants';
import { supabase } from '@/lib/supabase';

interface FarmItemsPanelProps {
  farm: Farm;
  type: 'feed' | 'packaging';
}

interface FarmItemRow {
  id: string;
  name: string;
  unit: string;
  priority: number;
  reorder_point: number;
  is_active: boolean;
}

const unitOptions = ['کیلوگرم', 'لیتر', 'گرم', 'تن', 'عدد', 'بسته', 'متر'];

const labels = {
  feed: {
    title: 'نهاده‌های اختصاص داده شده',
    empty: 'هیچ نهاده‌ای برای این فارم ثبت نشده است',
  },
  packaging: {
    title: 'اقلام بسته‌بندی اختصاص داده شده',
    empty: 'هیچ قلم بسته‌بندی برای این فارم ثبت نشده است',
  },
};

const FarmItemsPanelInner = ({ farm, type }: FarmItemsPanelProps) => {
  const [items, setItems] = useState<FarmItemRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [selectedDefaults, setSelectedDefaults] = useState<Record<string, boolean>>({});
  const [manualName, setManualName] = useState('');
  const [manualUnit, setManualUnit] = useState('کیلوگرم');
  const [manualPriority, setManualPriority] = useState('');
  const [manualReorder, setManualReorder] = useState('');

  const itemLabel = labels[type];

  // Items CRUD uses JWT-bound `supabase` (NOT `supabaseAdmin`) so the
  // request satisfies helper-based RLS policies introduced by migration
  // 012_fix_profiles_recursion.sql. Without this swap, the admin
  // "افزودن نهاده" / "افزودن قلم بسته‌بندی" flow silently fails to
  // load the current list and fails every insert/update/delete.
  const loadItems = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('farm_items')
      .select('id, name, unit, priority, reorder_point, is_active')
      .eq('farm_id', farm.id)
      .eq('category', type)
      .order('priority', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      toast.error('خطا در دریافت اطلاعات نهاده‌ها');
      setIsLoading(false);
      return;
    }

    setItems((data || []) as FarmItemRow[]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadItems();
  }, [farm.id, type]);

  const existingNames = useMemo(() => new Set(items.map((i) => i.name)), [items]);

  const availableDefaults = useMemo(() => {
    return DEFAULT_FARM_INGREDIENTS.filter((item) => !existingNames.has(item.name));
  }, [existingNames]);

  const handleAddDefaults = async () => {
    const selected = Object.entries(selectedDefaults)
      .filter(([, checked]) => checked)
      .map(([name]) => DEFAULT_FARM_INGREDIENTS.find((d) => d.name === name))
      .filter(Boolean);

    if (!selected.length) {
      toast.error('هیچ موردی انتخاب نشده است');
      return;
    }

    const payload = selected.map((item) => ({
      farm_id: farm.id,
      category: type,
      name: item!.name,
      unit: item!.unit,
      priority: item!.priority,
      reorder_point: 0,
      is_active: true,
    }));

    const { error } = await supabase.from('farm_items').insert(payload as any);
    if (error) {
      toast.error('خطا در افزودن نهاده‌های پیش‌فرض');
      return;
    }

    toast.success('نهاده‌های انتخاب شده اضافه شدند');
    setSelectedDefaults({});
    setDefaultOpen(false);
    loadItems();
  };

  const handleAddManual = async () => {
    if (!manualName.trim()) {
      toast.error('نام نهاده الزامی است');
      return;
    }

    const { error } = await supabase.from('farm_items').insert({
      farm_id: farm.id,
      category: type,
      name: manualName.trim(),
      unit: manualUnit,
      priority: manualPriority ? Number(manualPriority) : 100,
      reorder_point: manualReorder ? Number(manualReorder) : 0,
      is_active: true,
    } as any);

    if (error) {
      toast.error('خطا در افزودن آیتم جدید');
      return;
    }

    toast.success('آیتم جدید اضافه شد');
    setManualName('');
    setManualPriority('');
    setManualReorder('');
    loadItems();
  };

  const handleToggle = async (item: FarmItemRow) => {
    const { error } = await supabase
      .from('farm_items')
      .update({ is_active: !item.is_active })
      .eq('id', item.id);

    if (error) {
      toast.error('خطا در تغییر وضعیت');
      return;
    }

    loadItems();
  };

  const handleDelete = async (itemId: string) => {
    const { error } = await supabase.from('farm_items').delete().eq('id', itemId);
    if (error) {
      toast.error('خطا در حذف آیتم');
      return;
    }
    toast.success('آیتم حذف شد');
    loadItems();
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Box size={16} /> {itemLabel.title}
        </div>
        {type === 'feed' && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setDefaultOpen(true)}>
            <ListChecks size={14} /> افزودن از لیست پیش‌فرض
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Input
          label="نام آیتم"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          placeholder="نام نهاده یا قلم"
        />
        <Select label="واحد" value={manualUnit} onChange={(e) => setManualUnit(e.target.value)}>
          {unitOptions.map((unit) => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </Select>
        <Input
          label="اولویت"
          value={manualPriority}
          onChange={(e) => setManualPriority(e.target.value)}
          placeholder="مثال: ۱۰"
          dir="ltr"
        />
        <Input
          label="نقطه سفارش"
          value={manualReorder}
          onChange={(e) => setManualReorder(e.target.value)}
          placeholder="مثال: ۲۰۰"
          dir="ltr"
        />
      </div>

      <Button onClick={handleAddManual} className="gap-2">
        <Plus size={16} /> افزودن دستی
      </Button>

      {isLoading && <div className="text-sm text-muted-foreground">در حال دریافت اطلاعات...</div>}

      {!isLoading && items.length === 0 && (
        <div className="text-sm text-muted-foreground">{itemLabel.empty}</div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={item.id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2 text-sm">
              <div>
                <div className="font-semibold">{index + 1}. {item.name}</div>
                <div className="text-xs text-muted-foreground">واحد: {item.unit} | اولویت: {item.priority}</div>
                <div className="text-xs text-muted-foreground">نقطه سفارش: {item.reorder_point}</div>
              </div>
              <div className="flex items-center gap-2">
                <Toggle checked={item.is_active} onChange={() => handleToggle(item)} />
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(item.id)}>
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={defaultOpen}
        onClose={() => setDefaultOpen(false)}
        title="افزودن نهاده‌های پیش‌فرض"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setDefaultOpen(false)}>انصراف</Button>
            <Button onClick={handleAddDefaults}>افزودن انتخاب شده‌ها</Button>
          </div>
        }
      >
        <div className="space-y-2">
          {availableDefaults.length === 0 && (
            <div className="text-sm text-muted-foreground">همه نهاده‌های پیش‌فرض قبلاً افزوده شده‌اند.</div>
          )}
          {availableDefaults.map((item) => (
            <label key={item.name} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!selectedDefaults[item.name]}
                onChange={(e) =>
                  setSelectedDefaults((prev) => ({ ...prev, [item.name]: e.target.checked }))
                }
              />
              <span>{item.name} <span className="text-xs text-muted-foreground">({item.unit})</span></span>
            </label>
          ))}
        </div>
      </Modal>
    </Card>
  );
};

FarmItemsPanelInner.displayName = 'FarmItemsPanelInner';

const FarmItemsPanel = memo(FarmItemsPanelInner);
FarmItemsPanel.displayName = 'FarmItemsPanel';

export { FarmItemsPanel };
export default FarmItemsPanel;
