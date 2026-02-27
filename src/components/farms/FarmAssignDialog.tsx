import { useEffect, useState } from 'react';
import { Building2, Package, Wheat } from 'lucide-react';
import { Farm } from '@/types/farm.types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FarmItemsPanel } from '@/components/farms/FarmItemsPanel';
import { FarmHallsPanel } from '@/components/farms/FarmHallsPanel';

interface FarmAssignDialogProps {
  farm: Farm;
  isOpen: boolean;
  onClose: () => void;
}

export const FarmAssignDialog = ({ farm, isOpen, onClose }: FarmAssignDialogProps) => {
  const [tab, setTab] = useState<'feed' | 'packaging' | 'halls'>('feed');

  useEffect(() => {
    if (isOpen) setTab('feed');
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="تخصیص اقلام به فارم"
      className="max-w-[720px]"
      footer={
        <div className="flex items-center justify-end">
          <Button variant="ghost" onClick={onClose}>بستن</Button>
        </div>
      }
    >
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Button
          variant={tab === 'feed' ? 'primary' : 'outline'}
          onClick={() => setTab('feed')}
          className="gap-2"
        >
          <Wheat size={16} /> نهاده‌ها
        </Button>
        <Button
          variant={tab === 'packaging' ? 'primary' : 'outline'}
          onClick={() => setTab('packaging')}
          className="gap-2"
        >
          <Package size={16} /> اقلام بسته‌بندی
        </Button>
        <Button
          variant={tab === 'halls' ? 'primary' : 'outline'}
          onClick={() => setTab('halls')}
          className="gap-2"
        >
          <Building2 size={16} /> سالن‌ها
        </Button>
      </div>
      {tab === 'halls' ? (
        <FarmHallsPanel farm={farm} />
      ) : (
        <FarmItemsPanel farm={farm} type={tab} />
      )}
    </Modal>
  );
};
