// =====================================================================
// ReportSavedViews — modal dialog for managing a user's Saved Views
// for a given report. Loads existing views, deletes, renames,
// and saves the current view-as-named.
//
// The store handles the actual persistence; this component is purely
// a UI surface over the per-user-id scope.
// =====================================================================

import { memo, useState, useMemo } from 'react';
import { Bookmark, Trash2, Edit2, Check, X as XIcon, Play } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/utils/cn';
import { toPersianDigits } from '@/utils/persianNumbers';
import type { SavedReportView } from '@/types/report.types';

interface ReportSavedViewsProps {
  isOpen: boolean;
  onClose: () => void;
  views: SavedReportView[];
  onLoad: (view: SavedReportView) => void;
  onDelete: (viewId: string) => void;
  onRename: (viewId: string, name: string) => void;
  onSaveAs: (name: string) => void;
  reportTitle?: string;
}

function formatJalaliLike(iso: string): string {
  try {
    const d = new Date(iso);
    const datePart = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    const timePart = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${toPersianDigits(datePart)} ${toPersianDigits(timePart)}`;
  } catch {
    return iso;
  }
}

function ReportSavedViewsInner({
  isOpen,
  onClose,
  views,
  onLoad,
  onDelete,
  onRename,
  onSaveAs,
  reportTitle,
}: ReportSavedViewsProps) {
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [newName, setNewName] = useState('');

  const sortedViews = useMemo(
    () => [...views].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [views],
  );

  const submitSave = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onSaveAs(trimmed);
    setNewName('');
  };

  const submitRename = () => {
    if (!renaming) return;
    const trimmed = renaming.value.trim();
    if (!trimmed) return;
    onRename(renaming.id, trimmed);
    setRenaming(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={reportTitle ? `نماهای ذخیره‌شده — ${reportTitle}` : 'نماهای ذخیره‌شده'}
      className="max-w-[640px]"
    >
      <div className="space-y-4">
        {/* Save current */}
        <div className="rounded-[10px] border border-[var(--c-border)] p-3 bg-[var(--c-muted)]/40">
          <div className="flex items-center gap-2 mb-2">
            <Bookmark className="w-4 h-4 text-[var(--c-primary)]" />
            <span className="text-sm font-bold text-[var(--c-fg)]">ذخیرهٔ نمای فعلی</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="نام نما — مثلاً «موجودی روزانهٔ ماه جاری»"
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitSave();
              }}
            />
            <Button onClick={submitSave} disabled={!newName.trim()}>
              ذخیره
            </Button>
          </div>
        </div>

        {/* List of saved views */}
        {sortedViews.length === 0 ? (
          <div className="text-center py-8 text-sm text-[var(--c-muted-fg)]">
            نمای ذخیره‌شده‌ای برای این گزارش ندارید.
          </div>
        ) : (
          <ul className="space-y-2">
            {sortedViews.map((view) => {
              const isRenaming = renaming?.id === view.id;
              return (
                <li
                  key={view.id}
                  className={cn(
                    'flex items-center gap-2 rounded-[10px] border border-[var(--c-border)] px-3 py-2.5',
                    'hover:bg-[var(--c-muted)] transition-colors',
                  )}
                >
                  <Bookmark className="w-4 h-4 text-[var(--c-muted-fg)] shrink-0" />
                  {isRenaming ? (
                    <>
                      <Input
                        value={renaming!.value}
                        onChange={(e) =>
                          setRenaming({ id: view.id, value: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitRename();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        className="flex-1"
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" onClick={submitRename} aria-label="تأیید">
                        <Check className="w-4 h-4 text-[var(--c-primary)]" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setRenaming(null)} aria-label="لغو">
                        <XIcon className="w-4 h-4 text-[var(--c-muted-fg)]" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-[var(--c-fg)] truncate">{view.name}</p>
                        <p className="text-xs text-[var(--c-muted-fg)] truncate" dir="ltr">
                          {formatJalaliLike(view.createdAt)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          onLoad(view);
                          onClose();
                        }}
                        aria-label="بارگذاری نما"
                      >
                        <Play className="w-3.5 h-3.5 ml-1" />
                        بارگذاری
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setRenaming({ id: view.id, value: view.name })}
                        aria-label="تغییر نام"
                      >
                        <Edit2 className="w-4 h-4 text-[var(--c-muted-fg)]" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm(`آیا از حذف «${view.name}» مطمئن هستید؟`)) {
                            onDelete(view.id);
                          }
                        }}
                        aria-label="حذف نما"
                      >
                        <Trash2 className="w-4 h-4 text-[var(--c-destructive)]" />
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export const ReportSavedViews = memo(ReportSavedViewsInner);
ReportSavedViews.displayName = 'ReportSavedViews';
