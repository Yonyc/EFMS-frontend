import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "~/components/ProtectedRoute";
import { apiGet } from "~/utils/api";
import { buildLocalizedPath } from "~/utils/locale";
import { useCurrentLocale } from "~/hooks/useCurrentLocale";
import { useFarm } from "~/contexts/FarmContext";
import ParcelPeriodManager from "~/components/map/components/ParcelPeriodManager";
import { SearchableSelect } from "~/components/map/components/SearchableSelect";
import type { SelectOption } from "~/components/map/components/SearchableSelect";
import type { ParcelPeriodInfo, PeriodDto } from "~/components/map/types";

interface ParcelRow {
    id: number;
    name: string | null;
    color: string | null;
    farmId: number | null;
    // Parcel-level metadata
    sourceName: string | null;
    sourceCode: string | null;
    sourceBlockCode: string | null;
    exploitantCode: string | null;
    exploitantName: string | null;
    municipality: string | null;
    cadastralRef: string | null;
    sourceGuid: string | null;

    parcelPeriods: ParcelPeriodInfo[];
}

export default function ParcelsPage() {
    const { t } = useTranslation();
    const locale = useCurrentLocale();
    const { selectedFarm } = useFarm();
    const PAGE_SIZE = 50;
    const [parcels, setParcels] = useState<ParcelRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [total, setTotal] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [farmPeriods, setFarmPeriods] = useState<PeriodDto[]>([]);
    const [rowPeriods, setRowPeriods] = useState<Record<number, string>>({});
    const [managingParcelId, setManagingParcelId] = useState<number | null>(null);
    const [refreshNonce, setRefreshNonce] = useState(0);

    // Debounce the search box so each keystroke doesn't fire a request.
    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(id);
    }, [search]);

    const loadPage = useCallback(async (farmId: number | string, query: string, page: number) => {
        const params = new URLSearchParams({ search: query, page: String(page), size: String(PAGE_SIZE) });
        const res = await apiGet(`/farm/${farmId}/parcels/page?${params.toString()}`);
        if (!res.ok) throw new Error("failed to load parcels");
        const data = await res.json();
        const content: ParcelRow[] = data.content ?? [];
        // Tolerate both the legacy (top-level) and newer (nested "page") Page JSON shapes, and derive
        // "more available" from the running count rather than the `last` flag in case it isn't present.
        const totalEl: number = data.totalElements ?? data.page?.totalElements ?? 0;
        const loaded = page * PAGE_SIZE + content.length;
        setParcels(prev => page === 0 ? content : [...prev, ...content]);
        setHasMore(content.length > 0 && loaded < totalEl);
        setTotal(totalEl);
    }, []);

    // Reset to the first page whenever the farm, search query, or a refresh changes.
    useEffect(() => {
        if (!selectedFarm?.id) { setParcels([]); setHasMore(false); setTotal(0); return; }
        const farmId = selectedFarm.id;
        let active = true;
        setLoading(true);
        setError(null);
        loadPage(farmId, debouncedSearch, 0)
            .catch(() => { if (active) setError(t('parcels.loadError', { defaultValue: 'Failed to load parcels' })); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [selectedFarm?.id, debouncedSearch, refreshNonce, loadPage, t]);

    // Load the next page when the sentinel at the bottom of the scroll area comes into view.
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || !hasMore || loading || !selectedFarm?.id) return;
        const farmId = selectedFarm.id;
        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && !loadingMore) {
                setLoadingMore(true);
                const nextPage = Math.ceil(parcels.length / PAGE_SIZE);
                loadPage(farmId, debouncedSearch, nextPage)
                    .catch(() => {})
                    .finally(() => setLoadingMore(false));
            }
        }, { root: scrollRef.current, rootMargin: "200px" });
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMore, loading, loadingMore, parcels.length, selectedFarm?.id, debouncedSearch, loadPage]);

    useEffect(() => {
        if (!selectedFarm?.id) { setFarmPeriods([]); return; }
        let active = true;
        apiGet(`/farm/${selectedFarm.id}/periods`)
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (active) setFarmPeriods(data); })
            .catch(() => { if (active) setFarmPeriods([]); });
        return () => { active = false; };
    }, [selectedFarm?.id]);

    // Seed each multi-period parcel's "shown period" to the farm's defaultPeriodId
    // (or the parcel's most recent period if the default isn't present on that parcel).
    useEffect(() => {
        setRowPeriods(prev => {
            const next = { ...prev };
            for (const p of parcels) {
                if (next[p.id] !== undefined) continue;
                const pps = p.parcelPeriods ?? [];
                if (pps.length === 0) continue;
                const preferredId = selectedFarm?.defaultPeriodId != null ? String(selectedFarm.defaultPeriodId) : null;
                const preferred = preferredId && pps.find(pp => String(pp.periodId) === preferredId);
                if (preferred) { next[p.id] = String(preferred.periodId); continue; }
                const sorted = [...pps].sort((a, b) => {
                    const da = a.startValidity ? new Date(a.startValidity).getTime() : 0;
                    const db = b.startValidity ? new Date(b.startValidity).getTime() : 0;
                    return db - da;
                });
                next[p.id] = String(sorted[0].periodId);
            }
            return next;
        });
    }, [parcels, selectedFarm?.defaultPeriodId]);

    /** Pick the ParcelPeriod row to surface in the table for a given parcel. */
    const activeParcelPeriod = (p: ParcelRow): ParcelPeriodInfo | null => {
        const pps = p.parcelPeriods ?? [];
        if (pps.length === 0) return null;
        const selected = rowPeriods[p.id];
        if (selected) {
            const found = pps.find(pp => String(pp.periodId) === selected);
            if (found) return found;
        }
        return pps[0];
    };

    const managingParcel = managingParcelId != null ? parcels.find(p => p.id === managingParcelId) ?? null : null;

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-50">
                <div className="mx-auto max-w-7xl px-4 py-8">
                    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">
                                {t('parcels.title', { defaultValue: 'Parcels' })}
                            </p>
                            {selectedFarm && (
                                <h1 className="text-2xl font-bold text-white">{selectedFarm.name}</h1>
                            )}
                        </div>
                        <input
                            type="search"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={t('parcels.searchPlaceholder', { defaultValue: 'Search by name, code, culture...' })}
                            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white outline-none focus:border-indigo-400 sm:w-72"
                        />
                    </div>

                    {!selectedFarm && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-200">
                            {t('parcels.noFarmSelected', { defaultValue: 'Select a farm to view its parcels.' })}
                        </div>
                    )}

                    {error && (
                        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-300">
                            {error}
                        </div>
                    )}

                    {loading && (
                        <div className="flex items-center justify-center py-20 text-slate-400">
                            {t('common.loading', { defaultValue: 'Loading...' })}
                        </div>
                    )}

                    {!loading && selectedFarm && parcels.length === 0 && !error && (
                        <div className="flex items-center justify-center py-20 text-slate-400">
                            {debouncedSearch
                                ? t('parcels.noResults', { defaultValue: 'No parcels match your search.' })
                                : t('parcels.empty', { defaultValue: 'No parcels found for this farm.' })}
                        </div>
                    )}

                    {!loading && parcels.length > 0 && (
                        <div className="rounded-2xl border border-white/10 bg-white/5 shadow shadow-black/20">
                            <div ref={scrollRef} className="max-h-[calc(100vh-13rem)] overflow-auto rounded-2xl">
                            <table className="w-full min-w-[900px] text-sm">
                                <thead className="sticky top-0 z-10">
                                    <tr className="border-b border-white/10 bg-slate-800 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                                        <th className="px-4 py-3">{t('parcels.col.name', { defaultValue: 'Name' })}</th>
                                        <th className="px-4 py-3">{t('parcels.col.code', { defaultValue: 'Code' })}</th>
                                        <th className="px-4 py-3">{t('parcels.col.block', { defaultValue: 'Block' })}</th>
                                        <th className="px-4 py-3">{t('parcels.col.period', { defaultValue: 'Period' })}</th>
                                        <th className="px-4 py-3">{t('parcels.col.culture', { defaultValue: 'Culture' })}</th>
                                        <th className="px-4 py-3">{t('parcels.col.declaredArea', { defaultValue: 'Decl. area (ha)' })}</th>
                                        <th className="px-4 py-3">{t('parcels.col.measuredArea', { defaultValue: 'Meas. area (ha)' })}</th>
                                        <th className="px-4 py-3">{t('parcels.col.sowing', { defaultValue: 'Sowing' })}</th>
                                        <th className="px-4 py-3">{t('parcels.col.harvest', { defaultValue: 'Harvest' })}</th>
                                        <th className="px-4 py-3">{t('parcels.col.municipality', { defaultValue: 'Municipality' })}</th>
                                        <th className="px-4 py-3">{t('parcels.col.status', { defaultValue: 'Status' })}</th>
                                        <th className="px-4 py-3">{t('parcels.col.active', { defaultValue: 'Active' })}</th>
                                        <th className="px-4 py-3 text-right">{t('parcels.col.actions', { defaultValue: 'Actions' })}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {parcels.map(p => {
                                        const pp = activeParcelPeriod(p);
                                        const periodOpts: SelectOption[] = (p.parcelPeriods ?? [])
                                            .map(pp2 => ({ value: String(pp2.periodId), label: pp2.periodName ?? `#${pp2.periodId}` }));
                                        return (
                                            <tr key={p.id} className="transition-colors hover:bg-white/[0.03]">
                                                <td className="px-4 py-3 font-medium text-white">
                                                    <Link
                                                        to={buildLocalizedPath(locale, `/parcels/${p.id}`)}
                                                        className="text-indigo-300 hover:text-indigo-200 hover:underline"
                                                    >
                                                        {p.sourceName || p.name || `#${p.id}`}
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3 text-slate-300">{p.sourceCode ?? '—'}</td>
                                                <td className="px-4 py-3 text-slate-300">{p.sourceBlockCode ?? '—'}</td>
                                                <td className="px-4 py-3 text-slate-300">
                                                    {periodOpts.length > 1 ? (
                                                        <SearchableSelect
                                                            options={periodOpts}
                                                            value={rowPeriods[p.id] ?? ''}
                                                            onChange={(next) => setRowPeriods(prev => ({ ...prev, [p.id]: next }))}
                                                            placeholder={t('map.periodPicker.label', { defaultValue: 'Period' })}
                                                            className="min-w-[8rem]"
                                                        />
                                                    ) : (
                                                        <span>{pp?.periodName ?? '—'}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-300">
                                                    {pp?.cultureLabel
                                                        ? <span title={pp.cultureCode ?? ''}>{pp.cultureLabel}</span>
                                                        : (pp?.cultureCode ?? '—')}
                                                </td>
                                                <td className="px-4 py-3 text-slate-300">
                                                    {pp?.declaredAreaHa != null ? pp.declaredAreaHa.toFixed(2) : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-slate-300">
                                                    {pp?.measuredAreaHa != null ? pp.measuredAreaHa.toFixed(2) : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-slate-300">{pp?.sowingDate ?? '—'}</td>
                                                <td className="px-4 py-3 text-slate-300">{pp?.harvestDate ?? '—'}</td>
                                                <td className="px-4 py-3 text-slate-300">{p.municipality ?? '—'}</td>
                                                <td className="px-4 py-3">
                                                    {pp?.eligibilityStatus
                                                        ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">{pp.eligibilityStatus}</span>
                                                        : <span className="text-slate-500">—</span>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pp?.active !== false ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-slate-400'}`}>
                                                        {pp?.active !== false
                                                            ? t('parcels.active', { defaultValue: 'Active' })
                                                            : t('parcels.inactive', { defaultValue: 'Inactive' })}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => setManagingParcelId(p.id)}
                                                        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-white/10"
                                                    >
                                                        {t('map.polygonList.managePeriods', { defaultValue: 'Manage periods' })}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <div ref={sentinelRef} className="border-t border-white/5 px-4 py-2 text-center text-xs text-slate-500">
                                {loadingMore ? (
                                    t('common.loading', { defaultValue: 'Loading...' })
                                ) : hasMore ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!selectedFarm?.id) return;
                                            setLoadingMore(true);
                                            loadPage(selectedFarm.id, debouncedSearch, Math.ceil(parcels.length / PAGE_SIZE))
                                                .catch(() => {})
                                                .finally(() => setLoadingMore(false));
                                        }}
                                        className="font-medium text-indigo-300 hover:text-indigo-200"
                                    >
                                        {t('parcels.loadMore', { defaultValue: 'Load more' })} ({parcels.length} / {total})
                                    </button>
                                ) : (
                                    t('parcels.shownOfTotal', { shown: parcels.length, total, defaultValue: '{{shown}} of {{total}} parcel(s)' })
                                )}
                            </div>
                            </div>
                        </div>
                    )}
                </div>
                {managingParcel && managingParcel.farmId != null && (
                    <ParcelPeriodManager
                        parcelId={String(managingParcel.id)}
                        parcelName={managingParcel.sourceName || managingParcel.name || `#${managingParcel.id}`}
                        farmId={managingParcel.farmId}
                        parcelPeriods={managingParcel.parcelPeriods ?? []}
                        onClose={() => setManagingParcelId(null)}
                        onChanged={() => setRefreshNonce(n => n + 1)}
                    />
                )}
            </div>
        </ProtectedRoute>
    );
}
