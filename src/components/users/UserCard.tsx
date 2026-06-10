import { Pencil, Trash2 } from 'lucide-react';
import { ProfileWithFarm, ROLE_COLORS, ROLE_LABELS } from '@/types/user.types';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { toPersianDigits } from '@/utils/persianNumbers';
import { getJalaliDateTime } from '@/utils/jalaliDate';
import { formatUserFullName, getInitials } from '@/utils/userHelpers';

interface UserCardProps {
  user: ProfileWithFarm;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}

export const UserCard = ({ user, index, onEdit, onDelete, onToggleStatus }: UserCardProps) => {
  const roleColor = ROLE_COLORS[user.role];
  const fullName = formatUserFullName(user.first_name, user.last_name);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
            {getInitials(user.first_name, user.last_name)}
          </div>
          <div>
            <div className="text-sm font-semibold">{fullName}</div>
            <div className="text-xs text-muted-foreground">{user.username}</div>
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${roleColor.bg} ${roleColor.text}`}>
          {ROLE_LABELS[user.role]}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">شماره</span>
          <span>{toPersianDigits(index + 1)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">فارم</span>
          <span>{user.farm?.name ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">تلفن</span>
          <span className="font-mono" dir="ltr">{user.phone ? toPersianDigits(user.phone) : '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">آخرین ورود</span>
          <span className="text-xs text-muted-foreground">
            {user.last_login_at ? getJalaliDateTime(new Date(user.last_login_at)) : 'ورود نداشته'}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Toggle checked={user.is_active} onChange={onToggleStatus} />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Pencil size={16} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive">
            <Trash2 size={16} />
          </Button>
        </div>
      </div>
    </Card>
  );
};
