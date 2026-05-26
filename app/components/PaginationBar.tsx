import { useTranslation } from "react-i18next";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}

export function PaginationBar({ page, totalPages, onPrev, onNext }: PaginationBarProps) {
  const { t } = useTranslation();
  if (totalPages <= 0) return null;
  return (
    <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
      <button
        type="button"
        onClick={onPrev}
        disabled={page === 0}
        className="rounded bg-slate-100 px-2.5 py-1 text-xs text-slate-700 disabled:opacity-40 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        {t("common.previous", { defaultValue: "Prev" })}
      </button>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {t("assets.pagination", { defaultValue: "Page {{page}} of {{total}}", page: page + 1, total: totalPages })}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={page === totalPages - 1}
        className="rounded bg-slate-100 px-2.5 py-1 text-xs text-slate-700 disabled:opacity-40 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        {t("common.next", { defaultValue: "Next" })}
      </button>
    </div>
  );
}
