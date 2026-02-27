import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Hash,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  Warehouse,
  Wheat,
  Package,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { useFarms, useToggleFarmStatus } from '@/hooks/useFarms';
import { Farm, FarmWithStats } from '@/types/farm.types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Toggle } from '@/components/ui/Toggle';
import { FarmForm } from '@/components/farms/FarmForm';
import { FarmDeleteDialog } from '@/components/farms/FarmDeleteDialog';
import { FarmAssignDialog } from '@/components/farms/FarmAssignDialog';
import { FarmStaffPanel } from '@/components/farms/FarmStaffPanel';
import { FarmHallsPanel } from '@/components/farms/FarmHallsPanel';
import { toPersianDigits } from '@/utils/persianNumbers';

const defaultFilters: { search: string; status: 'all' | 'active' | 'inactive' } = {
  search: '',
  status: 'all',
};

type ExpandedSection = 'staff' | 'halls' | 'items' | null;

interface ExpandedState {
  farmId: string;
  section: ExpandedSection;
}

export const FarmList = () => {
  const [filters, setFilters] = useState(defaultFilters);
  const [createOpen, setCreateOpen] = useState(false);
  const [editFarm, setEditFarm] = useState<Farm | null>(null);
  const [deleteFarm, setDeleteFarm] = useState<Farm | null>(null);
  const [assignFarm, setAssignFarm] = useState<Farm | null>(null);
  const [expanded, setExpanded] = useState<ExpandedState | null>(null);

  const { farms, isLoading, error, refetch } = useFarms(filters);
  const { toggleStatus } = useToggleFarmStatus();

  const stats = useMemo(() => {
    const total = farms.length;
    const active = farms.filter((f) => f.is_active).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [farms]);

  const handleToggleStatus = async (farm: Farm) => {
    const ok = await toggleStatus(farm.id, farm.is_active);
    if (ok) refetch();
  };

  const farmsWithStats: FarmWithStats[] = farms.map((farm) => ({ ...farm }));
  const isFiltersActive = filters.search.trim() || filters.status !== 'all';

  const toggleSection = (farmId: string, section: ExpandedSection) => {
    if (expanded?.farmId === farmId && expanded?.section === section) {
      setExpanded(null);
    } else {
      setExpanded({ farmId, section });
    }
  };

  const isExpanded = (farmId: string, section: ExpandedSection) =>
    expanded?.farmId === farmId && expanded?.section === section;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">مدیریت فارم‌ها</h2>
          <p className="text-sm text-muted-foreground">ثبت، ویرایش و تخصیص اقلام به فارم‌ها</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus size={18} /> ایجاد فارم
        </Button>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <Card className="px-4 py-3 text-sm flex items-center gap-2">
          <Warehouse size={16} /> کل فارم‌ها: {toPersianDigits(stats.total)}
        </Card>
        <Card className="px-4 py-3 text-sm text-green-600">فعال: {toPersianDigits(stats.active)}</Card>
        <Card className="px-4 py-3 text-sm text-red-500">غیرفعال: {toPersianDigits(stats.inactive)}</Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="w-full lg:max-w-sm relative">
          <Input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="جستجوی نام یا کد فارم..."
            className="pr-10"
          />
          <Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} />
        </div>
        <Select
          label="وضعیت"
          value={filters.status}
          onChange={(e) =>
            setFilters({ ...filters, status: e.target.value as 'all' | 'active' | 'inactive' })
          }
        >
          <option value="all">همه</option>
          <option value="active">فعال</option>
          <option value="inactive">غیرفعال</option>
        </Select>
        {isFiltersActive && (
          <Button variant="ghost" onClick={() => setFilters(defaultFilters)} className="gap-2">
            پاک کردن فیلترها
          </Button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <Card className="p-6 text-center space-y-3">
          <AlertTriangle className="mx-auto text-destructive" />
          <div className="text-sm">خطا در دریافت اطلاعات فارم‌ها</div>
          <Button onClick={refetch}>تلاش مجدد</Button>
        </Card>
      )}

      {/* Empty */}
      {!isLoading && !error && farmsWithStats.length === 0 && (
        <Card className="p-8 text-center space-y-3">
          <Warehouse className="mx-auto text-muted-foreground" size={48} />
          <div className="text-lg font-bold">فارمی یافت نشد</div>
          <p className="text-sm text-muted-foreground">فارم جدید اضافه کنید</p>
          <Button onClick={() => setCreateOpen(true)}>ایجاد فارم</Button>
        </Card>
      )}

      {/* Farm Cards */}
      {!isLoading && !error && farmsWithStats.length > 0 && (
        <div className="space-y-4">
          {farmsWithStats.map((farm) => (
            <Card key={farm.id} className="overflow-hidden">
              {/* Farm header row */}
              <div className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <div className="font-semibold text-lg flex items-center gap-2">
                      {farm.name}
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {farm.code}
                      </span>
                    </div>
                    {farm.address && (
                      <div className="text-xs text-muted-foreground mt-0.5">{farm.address}</div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <Toggle checked={farm.is_active} onChange={() => handleToggleStatus(farm)} />

                  <Button variant="ghost" size="icon" onClick={() => setEditFarm(farm)} title="ویرایش">
                    <Pencil size={16} />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteFarm(farm)}
                    title="حذف"
                  >
                    <Trash2 size={16} />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAssignFarm(farm)}
                    className="gap-1"
                  >
                    <Wheat size={14} />
                    نهاده‌ها
                  </Button>

                  {/* Expandable sections */}
                  <Button
                    variant={isExpanded(farm.id, 'halls') ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => toggleSection(farm.id, 'halls')}
                    className="gap-1"
                  >
                    <Hash size={14} />
                    سالن‌ها
                    {isExpanded(farm.id, 'halls') ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </Button>

                  <Button
                    variant={isExpanded(farm.id, 'staff') ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => toggleSection(farm.id, 'staff')}
                    className="gap-1"
                  >
                    <Users size={14} />
                    مسئولان
                    {isExpanded(farm.id, 'staff') ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </Button>
                </div>
              </div>

              {/* Farm info row */}
              <div
                className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-muted-foreground border-t pt-3"
                style={{ borderColor: 'var(--c-border)' }}
              >
                <div className="flex items-center gap-1">
                  <MapPin size={12} />
                  <span>{farm.address || 'آدرس ثبت نشده'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Package size={12} />
                  <span>تخصیص اقلام از منوی نهاده‌ها</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${farm.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                  <span>{farm.is_active ? 'فعال' : 'غیرفعال'}</span>
                </div>
              </div>

              {/* Expanded: Halls Panel */}
              {isExpanded(farm.id, 'halls') && (
                <div
                  className="border-t px-4 py-4"
                  style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-muted)' }}
                >
                  <FarmHallsPanel farm={farm} />
                </div>
              )}

              {/* Expanded: Staff Panel */}
              {isExpanded(farm.id, 'staff') && (
                <div
                  className="border-t px-4 py-4"
                  style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-muted)' }}
                >
                  <FarmStaffPanel farm={farm} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modals */}
      <FarmForm
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false);
          refetch();
          toast.success('فارم جدید ایجاد شد');
        }}
      />

      <FarmForm
        isOpen={!!editFarm}
        onClose={() => setEditFarm(null)}
        onSuccess={() => {
          setEditFarm(null);
          refetch();
          toast.success('اطلاعات فارم بروزرسانی شد');
        }}
        farm={editFarm}
      />

      {deleteFarm && (
        <FarmDeleteDialog
          farm={deleteFarm}
          isOpen={!!deleteFarm}
          onClose={() => setDeleteFarm(null)}
          onSuccess={() => {
            setDeleteFarm(null);
            refetch();
          }}
        />
      )}

      {assignFarm && (
        <FarmAssignDialog
          farm={assignFarm}
          isOpen={!!assignFarm}
          onClose={() => setAssignFarm(null)}
        />
      )}
    </div>
  );
};
