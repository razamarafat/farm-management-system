import { Tile } from '@/components/ui/Tile';
import { useAuthStore } from '@/store/authStore';
import { getJalaliDate } from '@/utils/jalaliDate';
import { getNavLabel, navItemsForRole, roleBase } from '@/navigation/manifest';

const OperatorDashboard = () => {
  const { profile } = useAuthStore();
  const role = 'operator' as const;
  const basePath = roleBase(role);

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col space-y-2 text-center sm:text-right">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--c-fg)]">
          سلام، {profile?.first_name || profile?.username}
        </h2>
        <p className="text-[var(--c-muted-fg)]">
          امروز {getJalaliDate()}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {navItemsForRole(role).map((item) => (
          <Tile
            key={item.path}
            icon={item.icon}
            label={getNavLabel(item, role)}
            color={item.color}
            to={`${basePath}/${item.path}`}
          />
        ))}
      </div>
    </div>
  );
};

export default OperatorDashboard;
