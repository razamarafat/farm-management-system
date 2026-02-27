import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { Farm, FarmStaffProfile } from '@/types/farm.types';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { formatUserFullName } from '@/utils/userHelpers';
import { ROLE_COLORS, ROLE_LABELS } from '@/types/user.types';

interface FarmStaffPanelProps {
  farm: Farm;
}

export const FarmStaffPanel = ({ farm }: FarmStaffPanelProps) => {
  const [staff, setStaff] = useState<FarmStaffProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStaff = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('id, username, role, first_name, last_name, phone, is_active')
        .eq('farm_id', farm.id)
        .order('role', { ascending: true });
      setStaff((data || []) as FarmStaffProfile[]);
      setIsLoading(false);
    };
    loadStaff();
  }, [farm.id]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Users size={16} /> مسئولان فارم
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      )}

      {!isLoading && staff.length === 0 && (
        <div className="text-sm text-muted-foreground">هنوز کاربری برای این فارم ثبت نشده است</div>
      )}

      {!isLoading && staff.length > 0 && (
        <div className="space-y-2">
          {staff.map((user) => {
            const colors = ROLE_COLORS[user.role];
            return (
              <div key={user.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <div className="font-semibold">{formatUserFullName(user.first_name, user.last_name)}</div>
                  <div className="text-xs text-muted-foreground">{user.username}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${colors.bg} ${colors.text}`}>
                  {ROLE_LABELS[user.role]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
