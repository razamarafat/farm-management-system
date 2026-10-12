import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Box, Plus, Trash2, Pencil, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { Farm } from '@/types/farm.types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DEFAULT_FARM_INGREDIENTS } from '@/utils/constants';
import { normalizeName } from '@/utils/helpers';
import { PACKAGING_UNITS } from '@/types/input.types';
import { supabase } from '@/lib/supabase';
import { rpcError } from '@/utils/rpcError';
import { assertMutationAffected } from '@/utils/mutationGuard';
import { bumpCatalog, useCatalogVersion } from '@/lib/catalogBus';

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

const FEED_UNIT_OPTIONS = ['کیلوگرم', 'لیتر', 'گرم', 'تن', 'عدد', 'بسته', 'متر'];

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
  const [manualUnit, setManualUnit] = useState(type === 'packaging' ? 'عدد' : 'کیلوگرم');
  const [manualPriority, setManualPriority] = useState('');
  const [manualReorder, setManualReorder] = useState('');
  const [deletingItem, setDeletingItem] = useState<FarmItemRow | null>(null);
  const [editingItem, setEditingItem] = useState<FarmItemRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editReorder, setEditReorder] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const itemLabel = labels[type];

  // Reactive sync: re-pull this panel whenever farm items change anywhere
  // (own mutations bump explicitly below; other tabs/views bump via the
  // same bus) — see src/lib/catalogBus.ts.
  const catalogVersion = useCatalogVersion('farm-items');

  // Items CRUD uses JWT-bound `supabase` (NOT `supabaseAdmin`) so the
  // request satisfies helper-based RLS policies introduced by migration
  // 012_fix_profiles_recursion.sql. Without this swap, the admin
  // "افزودن نهاده" / "افزودن قلم بسته‌بندی" flow silently fails to
  // load the current list and fails every insert/update/delete.
  const loadItems = useCallback(async () => {
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
  }, [farm.id, type, catalogVersion]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Reset manual unit when type changes (packaging → count-based only)
  useEffect(() => {
    setManualUnit(type === 'packaging' ? 'عدد' : 'کیلوگرم');
  }, [type]);

  const existingNames = useMemo(() => new Set(items.map((i) => i.name)), [items]);

  const availableDefaults = useMemo(() => {
    return DEFAULT_FARM_INGREDIENTS.filter((item) => !existingNames.has(item.name));
  }, [existingNames]);

  // Sync an item name+unit into the global inputs catalogue so it appears
  // in the Inputs management page. Uses rpc_admin_create_input which is
  // SECURITY DEFINER and handles unique-violation via server-side check.
  const ensureInputCatalogueEntry = useCallback(async (name: string, unit: string) => {
    const normalized = normalizeName(name);
    if (!normalized) return;
    // Check if already exists in catalogue (avoid unnecessary RPC calls)
    const { data: existing } = await supabase
      .from('inputs').select('id').eq('name', normalized).maybeSingle();
    if (existing) return;

    // Insert into global catalogue via admin RPC
    const { error } = await supabase.rpc('rpc_admin_create_input', {
      p_name: normalized,
      p_category: type,
      p_default_unit: unit,
      p_description: '',
      p_is_active: true,
    });
    if (error) {
      // Log but don't block — farm_items insert already succeeded
      console.warn(`Sync to inputs catalogue failed for "${normalized}":`, rpcError(error));
    } else {
      // The global catalogue gained an entry — notify its consumers.
      bumpCatalog('inputs');
    }
  }, [type]);

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from('farm_items').insert(payload as any);
    if (error) {
      toast.error('خطا در افزودن نهاده‌های پیش‌فرض');
      return;
    }

    // Sync each item into the global inputs catalogue
    await Promise.allSettled(selected.map((item) =>
      ensureInputCatalogueEntry(item!.name, item!.unit)
    ));

    toast.success('نهاده‌های انتخاب شده اضافه شدند');
    bumpCatalog('farm-items');
    setSelectedDefaults({});
    setDefaultOpen(false);
    loadItems();
  };

  const handleAddManual = async () => {
    if (!manualName.trim()) {
      toast.error('نام نهاده الزامی است');
      return;
    }

    const name = normalizeName(manualName);
    const { error } = await supabase.from('farm_items').insert({
      farm_id: farm.id,
      category: type,
      name,
      unit: manualUnit,
      priority: manualPriority ? Number(manualPriority) : 100,
      reorder_point: manualReorder ? Number(manualReorder) : 0,
      is_active: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    if (error) {
      toast.error('خطا در افزودن آیتم جدید');
      return;
    }

    // Sync to global inputs catalogue
    await ensureInputCatalogueEntry(name, manualUnit);

    toast.success('آیتم جدید اضافه شد');
    bumpCatalog('farm-items');
    setManualName('');
    setManualPriority('');
    setManualReorder('');
    loadItems();
  };

  const handleToggle = async (item: FarmItemRow) => {
    // `.select('id')` + row-count guard: an RLS-denied UPDATE returns
    // zero rows with NO error — the guard turns it into a real error
    // instead of a false silent success.
    const { data, error } = await supabase
      .from('farm_items')
      .update({ is_active: !item.is_active })
      .eq('id', item.id)
      .select('id');

    try {
      assertMutationAffected(data, error);
    } catch {
      toast.error('خطا در تغییر وضعیت');
      return;
    }

    bumpCatalog('farm-items');
    loadItems();
  };

  const handleDelete = async (itemId: string) => {
    const { data, error } = await supabase
      .from('farm_items')
      .delete()
      .eq('id', itemId)
      .select('id');
    try {
      assertMutationAffected(data, error);
    } catch {
      toast.error('خطا در حذف آیتم');
      return;
    }
    toast.success('آیتم حذف شد');
    bumpCatalog('farm-items');
    loadItems();
  };

  const handleStartEdit = (item: FarmItemRow) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditUnit(item.unit);
    setEditPriority(String(item.priority));
    setEditReorder(String(item.reorder_point));
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    if (!editName.trim()) {
      toast.error('نام آیتم الزامی است');
      return;
    }

    setIsEditing(true);
    const name = normalizeName(editName);
    const { data, error } = await supabase
      .from('farm_items')
      .update({
        name,
        unit: editUnit,
        priority: editPriority ? Number(editPriority) : 100,
        reorder_point: editReorder ? Number(editReorder) : 0,
      })
      .eq('id', editingItem.id)
      .select('id');

    try {
      assertMutationAffected(data, error);
    } catch {
      toast.error('خطا در ویرایش آیتم');
      setIsEditing(false);
      return;
    }

    await ensureInputCatalogueEntry(name, editUnit);
    toast.success('آیتم با موفقیت ویرایش شد');
    bumpCatalog('farm-items');
    setEditingItem(null);
    setIsEditing(false);
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
          {(type === 'packaging' ? PACKAGING_UNITS : FEED_UNIT_OPTIONS).map((unit) => (
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
                <Button variant="ghost" size="icon" className="text-[var(--c-primary)]" onClick={() => handleStartEdit(item)} title="ویرایش آیتم">
                  <Pencil size={16} />
                </Button>
                <Button variant="ghost" size="icon" className="text-[var(--c-error)]" onClick={() => setDeletingItem(item)} title="حذف آیتم">
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

      {/* Edit Item Modal */}
      <Modal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        title={editingItem ? `ویرایش ${editingItem.name}` : 'ویرایش آیتم'}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditingItem(null)}>انصراف</Button>
            <Button onClick={handleSaveEdit} isLoading={isEditing}>ذخیره تغییرات</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="نام آیتم *"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="نام نهاده یا قلم"
          />
          <Select label="واحد *" value={editUnit} onChange={(e) => setEditUnit(e.target.value)}>
            {(type === 'packaging' ? PACKAGING_UNITS : FEED_UNIT_OPTIONS).map((unit) => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </Select>
          <Input
            label="اولویت"
            value={editPriority}
            onChange={(e) => setEditPriority(e.target.value)}
            placeholder="مثال: ۱۰"
            dir="ltr"
          />
          <Input
            label="نقطه سفارش"
            value={editReorder}
            onChange={(e) => setEditReorder(e.target.value)}
            placeholder="مثال: ۲۰۰"
            dir="ltr"
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deletingItem}
        onClose={() => setDeletingItem(null)}
        title="حذف آیتم از فارم"
        message={deletingItem ? `آیا از حذف "${deletingItem.name}" از این فارم اطمینان دارید؟ این عمل قابل بازگشت نیست.` : ''}
        confirmLabel="حذف"
        cancelLabel="انصراف"
        variant="destructive"
        onConfirm={async () => {
          if (deletingItem) {
            await handleDelete(deletingItem.id);
            setDeletingItem(null);
          }
        }}
      />
    </Card>
  );
};

FarmItemsPanelInner.displayName = 'FarmItemsPanelInner';

const FarmItemsPanel = memo(FarmItemsPanelInner);
FarmItemsPanel.displayName = 'FarmItemsPanel';

export { FarmItemsPanel };
export default FarmItemsPanel;
