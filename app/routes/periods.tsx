import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "~/components/ProtectedRoute";
import { useFarm } from "~/contexts/FarmContext";
import { apiGet, apiPost, apiPut } from "~/utils/api";

interface PeriodDto { id: number; name?: string; startDate?: string; endDate?: string; }

export default function PeriodsPage() {
    const { t } = useTranslation();
    const { selectedFarm } = useFarm();
    const [periods, setPeriods] = useState<PeriodDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [draft, setDraft] = useState({ name: "", startDate: "", endDate: "" });

    const farmId = selectedFarm?.id;

    const loadPeriods = useCallback(async () => {
        if (!farmId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await apiGet(`/farm/${farmId}/periods`);
            if (!res.ok) throw new Error("failed");
            setPeriods(await res.json());
        } catch (err) {
            console.error(err);
            setError(t('periods.errorLoad', { defaultValue: 'Unable to load periods' }));
        } finally {
            setLoading(false);
        }
    }, [farmId, t]);

    useEffect(() => {
        loadPeriods();
    }, [loadPeriods]);

    const handleCreate = useCallback(async () => {
        if (!farmId) return;
        setError(null);
        try {
            const payload = {
                name: draft.name || undefined,
                startDate: draft.startDate ? new Date(draft.startDate).toISOString() : null,
                endDate: draft.endDate ? new Date(draft.endDate).toISOString() : null,
            };
            const res = await apiPost(`/farm/${farmId}/periods`, payload);
            if (!res.ok) throw new Error("failed");
            setDraft({ name: "", startDate: "", endDate: "" });
            await loadPeriods();
        } catch (err) {
            console.error(err);
            setError(t('periods.errorCreate', { defaultValue: 'Unable to create period' }));
        }
    }, [draft, farmId, loadPeriods, t]);

    const handleUpdate = useCallback(async (periodId: number, next: PeriodDto) => {
        if (!farmId) return;
        setError(null);
        try {
            const payload = {
                name: next.name || undefined,
                startDate: next.startDate ? new Date(next.startDate).toISOString() : null,
                endDate: next.endDate ? new Date(next.endDate).toISOString() : null,
            };
            const res = await apiPut(`/farm/${farmId}/periods/${periodId}`, payload);
            if (!res.ok) throw new Error("failed");
            await loadPeriods();
        } catch (err) {
            console.error(err);
            setError(t('periods.errorUpdate', { defaultValue: 'Unable to update period' }));
        }
    }, [farmId, loadPeriods, t]);

    const sortedPeriods = useMemo(() => (
        [...periods].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
    ), [periods]);

    return (
        <ProtectedRoute>
            <div className="mx-auto w-full max-w-5xl px-4 py-8 text-slate-900 dark:text-slate-100">
                <div className="mb-6 flex flex-col gap-2">
                    <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t('periods.title', { defaultValue: 'Manage periods' })}</h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{t('periods.subtitle', { defaultValue: 'Create and update yearly parcel periods for the selected farm.' })}</p>
                </div>

                {!farmId && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-200">
                        {t('periods.selectFarm', { defaultValue: 'Select a farm to manage its periods.' })}
                    </div>
                )}

                {farmId && (
                    <div className="space-y-6">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t('periods.createTitle', { defaultValue: 'New period' })}</h2>
                            <div className="mt-4 grid gap-4 md:grid-cols-3">
                                <input
                                    value={draft.name}
                                    onChange={(e) => setDraft(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder={t('periods.namePlaceholder', { defaultValue: 'Name (optional)' })}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                                />
                                <input
                                    type="date"
                                    value={draft.startDate}
                                    onChange={(e) => setDraft(prev => ({ ...prev, startDate: e.target.value }))}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                />
                                <input
                                    type="date"
                                    value={draft.endDate}
                                    onChange={(e) => setDraft(prev => ({ ...prev, endDate: e.target.value }))}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                />
                            </div>
                            <div className="mt-4 flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleCreate}
                                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                                >
                                    {t('periods.createAction', { defaultValue: 'Create period' })}
                                </button>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t('periods.listTitle', { defaultValue: 'Existing periods' })}</h2>
                            {loading && <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>}
                            {error && <p className="mt-4 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
                            {!loading && !sortedPeriods.length && (
                                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t('periods.empty', { defaultValue: 'No periods created yet.' })}</p>
                            )}
                            <div className="mt-4 space-y-3">
                                {sortedPeriods.map((period) => (
                                    <div key={period.id} className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4 md:grid-cols-4 md:items-center dark:border-slate-800 dark:bg-slate-900/40">
                                        <input
                                            value={period.name || ''}
                                            onChange={(e) => setPeriods(prev => prev.map(p => p.id === period.id ? { ...p, name: e.target.value } : p))}
                                            placeholder={t('periods.namePlaceholder', { defaultValue: 'Name (optional)' })}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                                        />
                                        <input
                                            type="date"
                                            value={period.startDate ? period.startDate.slice(0, 10) : ''}
                                            onChange={(e) => setPeriods(prev => prev.map(p => p.id === period.id ? { ...p, startDate: e.target.value } : p))}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                        />
                                        <input
                                            type="date"
                                            value={period.endDate ? period.endDate.slice(0, 10) : ''}
                                            onChange={(e) => setPeriods(prev => prev.map(p => p.id === period.id ? { ...p, endDate: e.target.value } : p))}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleUpdate(period.id, period)}
                                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                                        >
                                            {t('periods.saveAction', { defaultValue: 'Save changes' })}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </ProtectedRoute>
    );
}