import { useNavigate } from 'react-router-dom';
import { Hammer, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type UnderDevelopmentProps = {
  /** Optional Persian title of the report this placeholder represents. */
  reportName?: string;
  /**
   * Optional list of planned feature bullets shown to the user so they
   * know what this report will eventually contain instead of just "TBD".
   */
  plannedFeatures?: string[];
};

const UnderDevelopment = ({
  reportName,
  plannedFeatures,
}: UnderDevelopmentProps = {}) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-5 max-w-2xl mx-auto px-4">
      <div className="bg-[color-mix(in_srgb,var(--c-warning)_16%,transparent)] p-4 rounded-full">
        <Hammer className="h-12 w-12 text-[var(--c-warning)]" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-[var(--c-warning)]">
          {reportName ?? 'در حال توسعه'}
        </h1>
        <p className="text-sm text-muted-foreground">
          این گزارش در حال حاضر در دست ساخت است و به زودی فعال خواهد شد.
        </p>
      </div>

      {plannedFeatures && plannedFeatures.length > 0 ? (
        <div
          className="w-full max-w-lg rounded-2xl border border-[color-mix(in_srgb,var(--c-warning)_30%,transparent)]
                     bg-[color-mix(in_srgb,var(--c-warning)_8%,transparent)] p-4 text-right"
          dir="rtl"
        >
          <div className="flex items-center gap-2 mb-3 justify-end">
            <span className="text-sm font-semibold text-[var(--c-warning)]">
              قابلیت‌های برنامه‌ریزی‌شده
            </span>
            <Sparkles className="h-4 w-4 text-[var(--c-warning)]" />
          </div>
          <ul className="space-y-2 text-sm text-[var(--c-warning)]">
            {plannedFeatures.map((feat, idx) => (
              <li key={idx} className="leading-7">
                <span aria-hidden="true" className="ml-2">•</span>
                {feat}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button onClick={() => navigate(-1)} variant="outline">
        بازگشت
      </Button>
    </div>
  );
};

export default UnderDevelopment;
