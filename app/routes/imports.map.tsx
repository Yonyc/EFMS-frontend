import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "~/components/ProtectedRoute";
import { apiGet, apiPatch, apiPost } from "~/utils/api";
import { buildLocalizedPath } from "~/utils/locale";
import { useCurrentLocale } from "~/hooks/useCurrentLocale";
import { useFarm } from "~/contexts/FarmContext";
import { PeriodPicker } from "~/components/map/components/PeriodPicker";
import type { PeriodDto } from "~/components/map/types";

interface ImportGroupDetail {
    id: string;
    name: string;
    createdAt?: string;
    approvedAt?: string;
    polygonsCount?: number;
    status?: string;
}

type MapComponentType = ComponentType<any> | null;

interface ParcelSelection { id: string; name: string; }

function PickField({
    label, value, isPickingThis, onPick, onClear,
}: {
    label: string;
    value: string | undefined;
    isPickingThis: boolean;
    onPick: () => void;
    onClear?: () => void;
}) {
    return (
        <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${isPickingThis ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 bg-slate-50'}`}>
                <span className={`flex-1 truncate ${value ? 'text-slate-800 font-medium' : 'text-slate-400 italic'}`}>
                    {isPickingThis ? 'Click a parcel on the map…' : (value ?? 'Not selected')}
                </span>
                {!isPickingThis && onClear && value && (
                    <button type="button" onClick={onClear} className="shrink-0 text-slate-300 hover:text-slate-500 text-xs">✕</button>
                )}
                <button
                    type="button"
                    onClick={onPick}
                    title={isPickingThis ? 'Cancel pick' : 'Click a parcel on the map to select it'}
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold transition ${isPickingThis ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'}`}
                >
                    {isPickingThis ? 'Cancel' : '⊕ Pick'}
                </button>
            </div>
        </div>
    );
}

function SetParentPanel({
    importId, onClose,
    pickMode, onPickChild, onPickParent,
    child, parent, onClearChild, onClearParent,
}: {
    importId: string;
    onClose: () => void;
    pickMode: 'child' | 'parent' | null;
    onPickChild: () => void;
    onPickParent: () => void;
    child: ParcelSelection | null;
    parent: ParcelSelection | null;
    onClearChild: () => void;
    onClearParent: () => void;
}) {
    const { t } = useTranslation();
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const handleSet = async () => {
        if (!child) return;
        setSaving(true);
        setFeedback(null);
        try {
            const body: Record<string, unknown> = { parentParcelId: parent ? Number(parent.id) : 0 };
            const r = await apiPatch(`/imports/parcels/${child.id}`, body);
            if (!r.ok) throw new Error('Failed');
            setFeedback({
                type: 'success',
                message: parent
                    ? t('imports.map.parentSet', { defaultValue: 'Parent set successfully.' })
                    : t('imports.map.parentCleared', { defaultValue: 'Parent cleared.' }),
            });
        } catch (_) {
            setFeedback({ type: 'error', message: t('imports.map.parentError', { defaultValue: 'Failed to update parent.' }) });
        } finally { setSaving(false); }
    };

    return (
        <div className="absolute right-0 top-0 z-[1000] flex h-full w-80 flex-col border-l border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-800">
                    {t('imports.map.setParentTitle', { defaultValue: 'Set parcel hierarchy' })}
                </h2>
                <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
            </div>

            {pickMode && (
                <div className="bg-indigo-600 px-4 py-2 text-xs font-medium text-white">
                    {pickMode === 'child' ? '⊕ Click a parcel on the map to set it as child' : '⊕ Click a parcel on the map to set it as parent'}
                    <span className="ml-1 opacity-70">· Esc to cancel</span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">
                <PickField
                    label={t('imports.map.childParcel', { defaultValue: 'Child parcel' })}
                    value={child?.name}
                    isPickingThis={pickMode === 'child'}
                    onPick={onPickChild}
                    onClear={onClearChild}
                />

                <PickField
                    label={t('imports.map.parentParcel', { defaultValue: 'Parent parcel (optional)' })}
                    value={parent?.name}
                    isPickingThis={pickMode === 'parent'}
                    onPick={onPickParent}
                    onClear={parent ? onClearParent : undefined}
                />

                <button
                    type="button"
                    onClick={handleSet}
                    disabled={saving || !child}
                    className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saving ? '…' : !child ? t('imports.map.selectChildFirst', { defaultValue: 'Select a child first' }) : parent ? t('imports.map.setParentBtn', { defaultValue: 'Set parent' }) : t('imports.map.clearParentBtn', { defaultValue: 'Clear parent' })}
                </button>

                {feedback && (
                    <p className={`text-xs font-medium ${feedback.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {feedback.message}
                    </p>
                )}

                <p className="text-xs text-slate-400">
                    {t('imports.map.parentHint', { defaultValue: 'Parent–child relationships are applied when the import is approved.' })}
                </p>
            </div>
        </div>
    );
}

export default function ImportMapPage() {
    const { t } = useTranslation();
    const { selectedFarm } = useFarm();
    const [MapComponent, setMapComponent] = useState<MapComponentType>(null);
    const [params] = useSearchParams();
    const [importInfo, setImportInfo] = useState<ImportGroupDetail | null>(null);
    const [loadingInfo, setLoadingInfo] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isApproving, setIsApproving] = useState(false);
    const [approveFeedback, setApproveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [showParentPanel, setShowParentPanel] = useState(false);
    const [pickMode, setPickMode] = useState<'child' | 'parent' | null>(null);
    const [panelChild, setPanelChild] = useState<ParcelSelection | null>(null);
    const [panelParent, setPanelParent] = useState<ParcelSelection | null>(null);
    const [availablePeriods, setAvailablePeriods] = useState<PeriodDto[]>([]);
    const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
    const locale = useCurrentLocale();

    const importId = useMemo(() => params.get('list') || '', [params]);
    const isAlreadyApproved = Boolean(importInfo?.approvedAt);

    useEffect(() => {
        let active = true;
        import("../components/map/MapWithPolygons.client").then((mod) => {
            if (active) setMapComponent(() => mod.default);
        });
        return () => { active = false; };
    }, []);
    
    useEffect(() => {
        if (!importId) return;
        let active = true;
        (async () => {
            try {
                const r = await apiGet(`/imports/${importId}/preview/parcels?page=0&size=500`);
                if (!r.ok || !active) return;
                const data = await r.json();
                const namesById = new Map<string, PeriodDto>();
                const namesNoId = new Map<string, PeriodDto>();
                let pseudo = 0;
                for (const p of (data.content as Array<{ parcelPeriods?: Array<{ periodId?: number | null; periodName?: string | null; startValidity?: string | null }> }>)) {
                    const pp = p.parcelPeriods?.[0];
                    if (!pp || !pp.periodName) continue;
                    if (pp.periodId != null) {
                        const key = String(pp.periodId);
                        if (!namesById.has(key)) namesById.set(key, { id: pp.periodId!, name: pp.periodName, startDate: pp.startValidity ?? undefined });
                    } else if (!namesNoId.has(pp.periodName)) {
                        namesNoId.set(pp.periodName, { id: --pseudo, name: pp.periodName });
                    }
                }
                setAvailablePeriods([...Array.from(namesById.values()), ...Array.from(namesNoId.values())]);
            } catch (_) {}
        })();
        return () => { active = false; };
    }, [importId]);

    // Seed selectedPeriodId to the most recent campaign on first load.
    useEffect(() => {
        if (selectedPeriodId !== '') return;
        if (availablePeriods.length === 0) return;
        const sorted = [...availablePeriods].sort((a, b) => {
            const da = a.startDate ? new Date(a.startDate).getTime() : 0;
            const db = b.startDate ? new Date(b.startDate).getTime() : 0;
            return db - da;
        });
        if (sorted[0]) setSelectedPeriodId(String(sorted[0].id));
    }, [availablePeriods, selectedPeriodId]);

    const selectedPeriodName = useMemo(() => {
        if (!selectedPeriodId) return null;
        return availablePeriods.find(p => String(p.id) === selectedPeriodId)?.name ?? null;
    }, [availablePeriods, selectedPeriodId]);

    const handleParcelPicked = useCallback((id: string, name: string) => {
        if (pickMode === 'child') {
            setPanelChild({ id, name });
            setPanelParent(null);
        } else if (pickMode === 'parent') {
            setPanelParent({ id, name });
        }
        setPickMode(null);
    }, [pickMode]);

    const enterPickMode = useCallback((mode: 'child' | 'parent') => {
        setPickMode(prev => prev === mode ? null : mode);
    }, []);

    // Escape cancels pick mode
    useEffect(() => {
        if (!pickMode) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickMode(null); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [pickMode]);

    useEffect(() => {
        if (!importId) return;
        let active = true;
        setLoadingInfo(true);
        (async () => {
            try {
                const response = await apiGet(`/imports/${importId}`);
                if (!response.ok) throw new Error(`Failed to fetch import batch: ${response.statusText}`);
                const payload = await response.json();
                if (active) {
                    setImportInfo(payload ? {
                        ...payload,
                        polygonsCount: payload.polygonsCount ?? payload.totalParcels,
                    } : null);
                    setError(null);
                }
            } catch (err) {
                console.error(err);
                if (active) setError(t('imports.map.loadError', { defaultValue: 'Failed to load import details' }));
            } finally {
                active && setLoadingInfo(false);
            }
        })();
        return () => { active = false; };
    }, [importId, t]);

    const handleApproveAll = useCallback(async () => {
        if (!importId || isAlreadyApproved) return;
        setIsApproving(true);
        setApproveFeedback(null);
        try {
            const payload = selectedFarm?.id ? { farmId: Number(selectedFarm.id) } : undefined;
            const response = await apiPost(`/imports/${importId}/approve`, payload);
            if (!response.ok) throw new Error('Approve request failed');
            setImportInfo(prev => prev ? { ...prev, approvedAt: prev.approvedAt || new Date().toISOString() } : prev);
            setApproveFeedback({ type: 'success', message: t('imports.map.approveSuccess', { defaultValue: 'Import list approved successfully.' }) });
        } catch (err) {
            console.error(err);
            setApproveFeedback({ type: 'error', message: t('imports.map.approveError', { defaultValue: 'Unable to approve import list.' }) });
        } finally {
            setIsApproving(false);
        }
    }, [importId, isAlreadyApproved, selectedFarm, t]);

    if (!importId) {
        return (
            <ProtectedRoute>
                <div className="mx-auto max-w-3xl px-4 py-16 text-center">
                    <p className="text-2xl font-semibold text-slate-900">{t('imports.map.noSelectionTitle', { defaultValue: 'Select an import batch' })}</p>
                    <p className="mt-2 text-slate-500">{t('imports.map.noSelectionDescription', { defaultValue: 'Choose a batch from the imports list to start validating polygons.' })}</p>
                    <div className="mt-6">
                        <Link to={buildLocalizedPath(locale, '/imports')}
                            className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500">
                            {t('imports.map.returnToList', { defaultValue: 'Back to imports' })}
                        </Link>
                    </div>
                </div>
            </ProtectedRoute>
        );
    }

    return (
        <ProtectedRoute>
            <div className="flex h-[calc(100vh-4rem)] flex-col">
                {/* Header bar */}
                <div className="border-b border-slate-200 bg-white/90 px-6 py-4 shadow-sm">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-wide text-indigo-600">{t('imports.map.title', { defaultValue: 'Import validation' })}</p>
                            <h1 className="text-2xl font-semibold text-slate-900">
                                {importInfo?.name || t('imports.list.untitled', { defaultValue: 'Untitled batch' })}
                            </h1>
                            <p className="text-sm text-slate-500">
                                {loadingInfo
                                    ? t('imports.map.loadingDetails', { defaultValue: 'Loading batch details...' })
                                    : importInfo?.polygonsCount != null
                                        ? t('imports.map.polygonsCount', { count: importInfo.polygonsCount, defaultValue: '{{count}} parcels ready for review' })
                                        : t('imports.map.instructions', { defaultValue: 'Adjust parcels, then approve the list to import it.' })}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Set parent toggle (pre-approval only) */}
                            {!isAlreadyApproved && (
                                <button type="button" onClick={() => setShowParentPanel(p => !p)}
                                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${showParentPanel ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                    {t('imports.map.setParent', { defaultValue: 'Set parent' })}
                                </button>
                            )}
                            <div className="flex flex-col items-end gap-1">
                                <button type="button" onClick={handleApproveAll}
                                    disabled={isApproving || isAlreadyApproved}
                                    className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow transition ${isApproving || isAlreadyApproved ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
                                    {isAlreadyApproved
                                        ? t('imports.map.approvedLabel', { defaultValue: 'Already approved' })
                                        : t('imports.map.approveButton', { defaultValue: 'Approve import list' })}
                                </button>
                                {approveFeedback && (
                                    <span className={`text-xs font-medium ${approveFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {approveFeedback.message}
                                    </span>
                                )}
                            </div>
                            <Link to={buildLocalizedPath(locale, `/imports/${importId}/review`)}
                                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100">
                                {t('imports.map.openReview', { defaultValue: 'Open list view' })}
                            </Link>
                            <Link to={buildLocalizedPath(locale, '/imports')}
                                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300">
                                {t('imports.map.returnToList', { defaultValue: 'Back to imports' })}
                            </Link>
                        </div>
                    </div>
                    {error && (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
                    )}

                    {/* Period picker */}
                    {availablePeriods.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                {t('imports.map.periods', { defaultValue: 'Periods' })}
                            </span>
                            <PeriodPicker
                                periods={availablePeriods}
                                value={selectedPeriodId}
                                onChange={setSelectedPeriodId}
                                size="compact"
                            />
                        </div>
                    )}
                </div>

                {/* Map area + optional parent panel */}
                <div className="relative flex min-h-0 flex-1 w-full">
                    {/* Map */}
                    <div className={`relative flex min-h-0 flex-1 ${showParentPanel ? 'w-[calc(100%-20rem)]' : 'w-full'}${pickMode ? ' cursor-crosshair' : ''}`}>
                        {MapComponent ? (
                            <MapComponent
                                key={importId}
                                contextId={importId}
                                contextType="import"
                                allowCreate
                                filterPeriodNames={selectedPeriodName ? [selectedPeriodName] : undefined}
                                pickMode={showParentPanel ? pickMode : null}
                                onParcelPicked={showParentPanel ? handleParcelPicked : undefined}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-slate-500">
                                {t('imports.map.loadingMap', { defaultValue: 'Loading map...' })}
                            </div>
                        )}
                    </div>

                    {/* Set-parent side panel */}
                    {showParentPanel && (
                        <SetParentPanel
                            importId={importId}
                            onClose={() => { setShowParentPanel(false); setPickMode(null); }}
                            pickMode={pickMode}
                            onPickChild={() => enterPickMode('child')}
                            onPickParent={() => enterPickMode('parent')}
                            child={panelChild}
                            parent={panelParent}
                            onClearChild={() => { setPanelChild(null); setPanelParent(null); }}
                            onClearParent={() => setPanelParent(null)}
                        />
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}
