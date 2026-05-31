import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGet, getPageMeta } from '~/utils/api';
import { PaginationBar } from '~/components/PaginationBar';

interface PublicFarm {
  id: string;
  name?: string;
  description?: string;
  location?: string;
  isPublic?: boolean;
  showName?: boolean;
  showDescription?: boolean;
  showLocation?: boolean;
}

export function meta() {
  return [
    { title: 'Public Farms - EFMS' },
    { name: 'description', content: 'Browse farms that opted into public listing.' },
  ];
}

export default function PublicFarmsPage() {
  const { t } = useTranslation();
  const [farms, setFarms] = useState<PublicFarm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const pageSize = 8;

  const loadFarms = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await apiGet(`/farm/public?page=${currentPage}&size=${pageSize}`, { requireAuth: false });
      if (!response.ok) {
        throw new Error('Failed to load public farms');
      }
      const data = await response.json();
      if (data && data.content) {
        const pm = getPageMeta(data);
        setFarms(data.content);
        setTotalPages(pm.totalPages);
        setTotalElements(pm.totalElements);
      } else {
        setFarms(data || []);
        setTotalPages(0);
        setTotalElements(0);
      }
    } catch (err) {
      console.error('Failed to fetch public farms', err);
      setError(t('publicFarms.error'));
      setFarms([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadFarms();
  }, [currentPage]);

  const getName = (farm: PublicFarm) => farm.name?.trim() || t('publicFarms.nameHidden');
  const getDescription = (farm: PublicFarm) => {
    if (farm.showDescription === false) return t('publicFarms.descriptionHidden');
    if (farm.description?.trim()) return farm.description.trim();
    return t('publicFarms.descriptionMissing');
  };
  const getLocation = (farm: PublicFarm) => {
    if (farm.showLocation === false) return t('publicFarms.locationHidden');
    if (farm.location?.trim()) return farm.location.trim();
    return t('publicFarms.locationMissing');
  };

  const SkeletonCard = () => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm animate-pulse">
      <div className="h-4 w-24 rounded bg-slate-200" />
      <div className="mt-3 h-6 w-3/4 rounded bg-slate-200" />
      <div className="mt-4 h-12 w-full rounded bg-slate-100" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700 border border-indigo-200">
              {t('publicFarms.publicBadge')}
            </span>
            <h1 className="text-3xl font-extrabold text-slate-900">{t('publicFarms.title')}</h1>
            <p className="text-sm text-slate-500 max-w-2xl">{t('publicFarms.subtitle')}</p>
            <p className="text-xs text-slate-400">{t('publicFarms.note')}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              {t('publicFarms.countLabel', { count: farms.length })}
            </span>
            <button
              type="button"
              onClick={loadFarms}
              disabled={isLoading}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
            >
              {isLoading ? t('publicFarms.loading') : t('publicFarms.refresh')}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonCard key={idx} />
            ))}
          </div>
        ) : farms.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{t('publicFarms.empty')}</h2>
            <p className="mt-2 text-sm text-slate-500">{t('publicFarms.emptyHint')}</p>
            <button
              type="button"
              onClick={loadFarms}
              className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              {t('publicFarms.refresh')}
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {farms.map((farm) => (
              <article key={farm.id} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-slate-900">{getName(farm)}</h2>
                    <p className="text-sm text-slate-500 leading-relaxed">{getDescription(farm)}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                    {t('publicFarms.publicBadge')}
                  </span>
                </div>

                <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">{t('manageFarms.locationLabel')}:</span> {getLocation(farm)}
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <PaginationBar
            page={currentPage}
            totalPages={totalPages}
            onPrev={() => setCurrentPage(p => Math.max(0, p - 1))}
            onNext={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
          />
        )}
      </div>
    </div>
  );
}
