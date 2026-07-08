import { memo } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

interface TileProps {
  icon: LucideIcon;
  label: string;
  color: 'blue' | 'green' | 'orange' | 'purple' | 'teal' | 'red' | 'indigo' | 'amber' | 'cyan' | 'slate' | 'rose';
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
}

// Hoisted to module scope so identity is stable across renders.
// Handing framer-motion fresh inline objects per render caused it to
// re-create animation variants on every parent render.
const TILE_HOVER = { scale: 1.02, y: -2 } as const;
const TILE_TAP = { scale: 0.98 } as const;

const TileInner = ({ icon: Icon, label, color, to, onClick, disabled }: TileProps) => {
  const content = (
    <div className="relative flex flex-col justify-between h-full">
      <div className={cn(
        "absolute top-0 right-0 p-2 rounded-full",
        // Using CSS variables from theme.css for dynamic colors
        "bg-[var(--tile-border)] bg-opacity-30"
      )}>
        <Icon className="w-6 h-6" style={{ color: `var(--tile-color)` }} />
      </div>
      <div className="mt-auto pt-10">
        <h3 className="text-sm font-semibold" style={{ color: `var(--tile-color)` }}>
          {label}
        </h3>
      </div>
    </div>
  );

  const containerClasses = cn(
    `tile-${color}`,
    "relative overflow-hidden rounded-xl border p-5 min-h-[120px] transition-all",
    "bg-[var(--tile-bg)] border-[var(--tile-border)]",
    disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:shadow-md"
  );

  if (disabled) {
    return <div className={containerClasses}>{content}</div>;
  }

  if (to) {
    return (
      <Link to={to} className="block h-full">
        <motion.div
          className={containerClasses}
          whileHover={TILE_HOVER}
          whileTap={TILE_TAP}
        >
          {content}
        </motion.div>
      </Link>
    );
  }

  return (
    <motion.div
      className={containerClasses}
      onClick={onClick}
      whileHover={TILE_HOVER}
      whileTap={TILE_TAP}
    >
      {content}
    </motion.div>
  );
};

TileInner.displayName = 'Tile';

// Wrap with React.memo: every prop compares by reference. Lucide icons
// are module-level imports so their identity is stable. `to`, `label`,
// `color`, `disabled` are primitives. Dashboard grids stay bouncy on
// only the rows whose props actually changed.
export const Tile = memo(TileInner);
