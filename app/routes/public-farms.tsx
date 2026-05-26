import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGet, getPageMeta } from '~/utils/api';

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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/20 animate-pulse">
      <div className="h-4 w-24 rounded bg-white/10" />
      <div className="mt-3 h-6 w-3/4 rounded bg-white/10" />
      <div className="mt-4 h-12 w-full rounded bg-white/5" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 py-12 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <span className="inline-flex items-center rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-100 border border-indigo-400/30">
              {t('publicFarms.publicBadge')}
            </span>
            <h1 className="text-3xl font-extrabold text-white">{t('publicFarms.title')}</h1>
            <p className="text-sm text-slate-300 max-w-2xl">{t('publicFarms.subtitle')}</p>
            <p className="text-xs text-slate-400">{t('publicFarms.note')}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              {t('publicFarms.countLabel', { count: farms.length })}
            </span>
            <button
              type="button"
              onClick={loadFarms}
              disabled={isLoading}
              className="rounded-lg border border-indigo-400/40 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-50 hover:bg-indigo-500/30 disabled:opacity-60"
            >
              {isLoading ? t('publicFarms.loading') : t('publicFarms.refresh')}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
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
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-xl shadow-black/20">
            <h2 className="text-lg font-semibold text-white">{t('publicFarms.empty')}</h2>
            <p className="mt-2 text-sm text-slate-300">{t('publicFarms.emptyHint')}</p>
            <button
              type="button"
              onClick={loadFarms}
              className="mt-4 rounded-lg border border-indigo-400/40 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-50 hover:bg-indigo-500/30"
            >
              {t('publicFarms.refresh')}
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {farms.map((farm) => (
              <article key={farm.id} className="group rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/20 transition hover:border-indigo-400/40 hover:shadow-indigo-500/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-white">{getName(farm)}</h2>
                    <p className="text-sm text-slate-300 leading-relaxed">{getDescription(farm)}</p>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-100 border border-emerald-400/30">
                    {t('publicFarms.publicBadge')}
                  </span>
                </div>

                <div className="mt-4 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-slate-200">
                  <span className="font-semibold text-slate-100">{t('manageFarms.locationLabel')}:</span> {getLocation(farm)}
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 sm:px-6 mt-6">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                disabled={currentPage === 0}
                className="relative inline-flex items-center rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                disabled={currentPage === totalPages - 1}
                className="relative ml-3 inline-flex items-center rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-400">
                  Showing page <span className="font-semibold text-slate-200">{currentPage + 1}</span> of <span className="font-semibold text-slate-200">{totalPages}</span> (<span className="font-semibold text-slate-200">{totalElements}</span> total elements)
                </p>
              </div>
              <div>
                <nav className="isolate inline-flex -space-x-px rounded-xl shadow-sm" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                    disabled={currentPage === 0}
                    className="relative inline-flex items-center rounded-l-xl px-3 py-2 text-slate-400 bg-slate-900 border border-white/10 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i).map((p) => (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold border border-white/10 transition-all ${
                        p === currentPage
                          ? "bg-indigo-600 text-white border-indigo-600 z-10"
                          : "text-slate-400 bg-slate-900 hover:bg-slate-800"
                      }`}
                    >
                      {p + 1}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                    disabled={currentPage === totalPages - 1}
                    className="relative inline-flex items-center rounded-r-xl px-3 py-2 text-slate-400 bg-slate-900 border border-white/10 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
