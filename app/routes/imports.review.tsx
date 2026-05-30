import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "~/components/ProtectedRoute";
import { apiDelete, apiGet, apiPatch, apiPost } from "~/utils/api";
import { apiUrl } from "~/config";
import { buildLocalizedPath } from "~/utils/locale";
import { useCurrentLocale } from "~/hooks/useCurrentLocale";
import { useFarm } from "~/contexts/FarmContext";
import { useDateTimeFormatter } from "~/utils/datetime";

interface SourceFile { id: number; filename: string; importedAt: string | null; parcelCount: number; toolCount: number; productCount: number; operationCount: number; }
interface ImportPreviewMeta {
    importId: number; importName: string; createdAt: string | null; approvedAt: string | null;
    hasActionData: boolean; parcelCount: number; equipmentCount: number; productCount: number; activityCount: number;
    files: SourceFile[];
}
interface Paged<T> { content: T[]; totalElements: number; totalPages: number; page: number; size: number; }
interface ImportedParcel {
    id: number;
    sourceName: string | null; sourceCode: string | null; sourceBlockCode: string | null;
    sourceGuid: string | null;
    cultureLabel: string | null; cultureCode: string | null;
    campaignYear: number | null; periodName: string | null;
    measuredAreaHa: number | null; declaredAreaHa: number | null;
    variety: string | null;
    sowingDate: string | null; harvestDate: string | null;
    targetYieldTha: number | null; sowingDensityKgha: number | null; rowSpacingCm: number | null;
    municipality: string | null; cadastralRef: string | null;
    exploitantCode: string | null; exploitantName: string | null;
    eligibilityStatus: string | null;
    validationStatus: string | null; validationNotes: string | null;
    willMergeWithParcelId: number | null; willMergeWithParcelName: string | null;
    parentImportedParcelId: number | null; forcedPeriodId: number | null;
    periodNameOverride: string | null; periodStartOverride: string | null; periodEndOverride: string | null;
}
interface Equipment { id: number; sourceGuid: string | null; name: string; }
interface PreviewProduct { id: number; sourceGuid: string | null; name: string; code: string | null; unitSymbol: string | null; botanicalSpecies: string | null; }
interface ParcelRef { plotId: string | null; parcelName: string | null; workedSurfaceHa: number | null; }
interface ProductUsage { supplyId: string | null; supplyName: string | null; quantity: number | null; unitSymbol: string | null; }
interface Activity { id: number; operationName: string | null; operationCategory: string | null; startingDate: string | null; durationMinutes: number | null; comment: string | null; periodName: string | null; parcels: ParcelRef[]; productUsages: ProductUsage[]; }
interface FarmPeriod { id: number; name: string; startDate: string | null; endDate: string | null; }
interface UploadProgress { current: number; total: number; message: string; }
type Tab = 'parcels' | 'equipments' | 'products' | 'operations';

function Badge({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition ${active ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {label}
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-300 text-slate-700'}`}>{count}</span>
        </button>
    );
}
function StatusBadge({ status }: { status: string | null }) {
    const colour = status === 'APPROVED' ? 'bg-green-100 text-green-700'
        : status === 'REJECTED' ? 'bg-red-100 text-red-700'
        : status === 'CONVERTED' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700';
    return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colour}`}>{status ?? 'PENDING'}</span>;
}
function PeriodChip({ name }: { name: string | null }) {
    if (!name) return null;
    return <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">{name}</span>;
}
function Cell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <td className={`px-3 py-2 text-sm text-slate-700 ${className}`}>{children}</td>;
}
function Th({ children }: { children: React.ReactNode }) {
    return <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</th>;
}


function PeriodCell({ parcel, farmPeriods, onSaved }: {
    parcel: ImportedParcel;
    farmPeriods: FarmPeriod[];
    onSaved: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [mode, setMode] = useState<'auto' | 'custom' | 'existing'>('auto');
    const [customName, setCustomName] = useState('');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [selectedPeriodId, setSelectedPeriodId] = useState('');
    const [saving, setSaving] = useState(false);

    const displayName = parcel.periodNameOverride ?? parcel.periodName;

    const handleOpen = () => {
        setMode(parcel.forcedPeriodId ? 'existing' : parcel.periodNameOverride ? 'custom' : 'auto');
        setCustomName(parcel.periodNameOverride ?? parcel.periodName ?? '');
        setCustomStart(parcel.periodStartOverride ? parcel.periodStartOverride.substring(0, 10) : '');
        setCustomEnd(parcel.periodEndOverride ? parcel.periodEndOverride.substring(0, 10) : '');
        setSelectedPeriodId(parcel.forcedPeriodId ? String(parcel.forcedPeriodId) : '');
        setEditing(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const body: Record<string, unknown> = {};
            if (mode === 'existing' && selectedPeriodId) {
                body.forcedPeriodId = Number(selectedPeriodId);
            } else if (mode === 'custom') {
                body.periodNameOverride = customName;
                if (customStart) body.periodStartOverride = customStart + 'T00:00:00';
                if (customEnd) body.periodEndOverride = customEnd + 'T00:00:00';
                body.forcedPeriodId = null;
            } else {
                body.periodNameOverride = null;
                body.forcedPeriodId = null;
            }
            await apiPatch(`/imports/parcels/${parcel.id}`, body);
            onSaved();
        } catch (_) {}
        setSaving(false);
        setEditing(false);
    };

    if (!editing) {
        return (
            <div className="flex items-center gap-1.5">
                <PeriodChip name={displayName} />
                {parcel.validationStatus !== 'CONVERTED' && parcel.validationStatus !== 'APPROVED' && (
                    <button type="button" onClick={handleOpen}
                        className="rounded p-0.5 text-slate-300 hover:text-indigo-500" title="Edit period">✎</button>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs">
            <div className="flex gap-2">
                {(['auto', 'custom', 'existing'] as const).map(m => (
                    <button key={m} type="button" onClick={() => setMode(m)}
                        className={`rounded-full px-2 py-0.5 font-medium capitalize ${mode === m ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
                        {m === 'auto' ? 'Auto' : m === 'custom' ? 'Custom' : 'Existing'}
                    </button>
                ))}
            </div>
            {mode === 'custom' && (
                <div className="space-y-1">
                    <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Period name"
                        className="w-full rounded border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                    <div className="flex gap-1">
                        <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                            className="flex-1 rounded border border-slate-200 px-2 py-1 focus:outline-none" />
                        <span className="self-center text-slate-400">→</span>
                        <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                            className="flex-1 rounded border border-slate-200 px-2 py-1 focus:outline-none" />
                    </div>
                </div>
            )}
            {mode === 'existing' && (
                <select value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400">
                    <option value="">Select a period…</option>
                    {farmPeriods.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
            )}
            <div className="flex gap-1.5">
                <button type="button" onClick={handleSave} disabled={saving}
                    className="rounded bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
                    {saving ? '…' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditing(false)}
                    className="rounded bg-white px-2.5 py-1 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">Cancel</button>
            </div>
        </div>
    );
}

interface ParcelGroup {
    sourceGuid: string | null;
    rows: ImportedParcel[];
}

function fmt(v: number | null | undefined, decimals = 2) {
    return v != null ? v.toFixed(decimals) : null;
}

function PeriodCard({ p, farmPeriods, onSaved }: {
    p: ImportedParcel; farmPeriods: FarmPeriod[]; onSaved: () => void;
}) {
    return (
        <div className="rounded-lg border border-slate-100 bg-white p-3 space-y-2">
            {/* Period + status header */}
            <div className="flex items-center justify-between gap-2">
                <PeriodCell parcel={p} farmPeriods={farmPeriods} onSaved={onSaved} />
                <StatusBadge status={p.validationStatus} />
            </div>

            {/* Culture */}
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {(p.cultureLabel || p.cultureCode) ? (
                    <span className="text-sm font-medium text-slate-800">
                        {p.cultureLabel}
                        {p.cultureCode && <span className="ml-1 font-mono text-xs text-slate-400">({p.cultureCode})</span>}
                    </span>
                ) : null}
                {p.variety && (
                    <span className="text-xs italic text-slate-500">{p.variety}</span>
                )}
            </div>

            {/* Metrics grid */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3">
                {p.measuredAreaHa != null && (
                    <>
                        <dt className="text-slate-400">Measured area</dt>
                        <dd className="font-mono text-slate-700">{fmt(p.measuredAreaHa, 4)} ha</dd>
                    </>
                )}
                {p.declaredAreaHa != null && p.measuredAreaHa == null && (
                    <>
                        <dt className="text-slate-400">Declared area</dt>
                        <dd className="font-mono text-slate-700">{fmt(p.declaredAreaHa, 4)} ha</dd>
                    </>
                )}
                {p.sowingDate && (
                    <>
                        <dt className="text-slate-400">Sowing</dt>
                        <dd className="text-slate-700">{p.sowingDate}</dd>
                    </>
                )}
                {p.harvestDate && (
                    <>
                        <dt className="text-slate-400">Harvest</dt>
                        <dd className="text-slate-700">{p.harvestDate}</dd>
                    </>
                )}
                {p.targetYieldTha != null && (
                    <>
                        <dt className="text-slate-400">Target yield</dt>
                        <dd className="font-mono text-slate-700">{fmt(p.targetYieldTha)} t/ha</dd>
                    </>
                )}
                {p.sowingDensityKgha != null && (
                    <>
                        <dt className="text-slate-400">Sowing density</dt>
                        <dd className="font-mono text-slate-700">{fmt(p.sowingDensityKgha)} kg/ha</dd>
                    </>
                )}
                {p.rowSpacingCm != null && (
                    <>
                        <dt className="text-slate-400">Row spacing</dt>
                        <dd className="font-mono text-slate-700">{fmt(p.rowSpacingCm, 0)} cm</dd>
                    </>
                )}
                {p.eligibilityStatus && (
                    <>
                        <dt className="text-slate-400">Eligibility</dt>
                        <dd className="text-slate-700">{p.eligibilityStatus}</dd>
                    </>
                )}
            </dl>

            {/* Merge hint */}
            {p.willMergeWithParcelId && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                    ↩ updates {p.willMergeWithParcelName || `#${p.willMergeWithParcelId}`}
                </span>
            )}
        </div>
    );
}

function ParcelGroupRow({
    group, farmPeriods, onSaved
}: {
    group: ParcelGroup; farmPeriods: FarmPeriod[]; onSaved: () => void;
}) {
    const [open, setOpen] = useState(true);
    const isMulti = group.rows.length > 1;
    const first = group.rows[0];

    // Common location info from any row
    const municipality = first.municipality;
    const cadastralRef = first.cadastralRef;
    const exploitant = first.exploitantName || first.exploitantCode;

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
            {/* Physical parcel header */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/70 transition"
            >
                <span className="mt-0.5 shrink-0 text-slate-400 text-xs w-4">{open ? '▼' : '▶'}</span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">
                            {first.sourceName || <span className="italic font-normal text-slate-400">Unnamed parcel</span>}
                        </p>
                        {first.sourceCode && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500">{first.sourceCode}</span>
                        )}
                        {first.sourceBlockCode && (
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600">Îlot {first.sourceBlockCode}</span>
                        )}
                    </div>
                    {(municipality || cadastralRef || exploitant) && (
                        <p className="mt-0.5 text-xs text-slate-400">
                            {[municipality, cadastralRef, exploitant].filter(Boolean).join(' · ')}
                        </p>
                    )}
                    {/* Period chips summary when collapsed */}
                    {!open && (
                        <div className="mt-1 flex flex-wrap gap-1">
                            {group.rows.map(r => (
                                <PeriodChip key={r.id} name={r.periodNameOverride ?? r.periodName} />
                            ))}
                        </div>
                    )}
                </div>
                <div className="shrink-0 flex items-center gap-2 mt-0.5">
                    {isMulti && (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                            {group.rows.length} {group.rows.length === 1 ? 'period' : 'periods'}
                        </span>
                    )}
                </div>
            </button>

            {/* Period cards */}
            {open && (
                <div className={`border-t border-slate-200 px-4 pb-4 pt-3 ${isMulti ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : ''}`}>
                    {group.rows.map(p => (
                        <PeriodCard key={p.id} p={p} farmPeriods={farmPeriods} onSaved={onSaved} />
                    ))}
                </div>
            )}
        </div>
    );
}

function ParcelsTab({ importId, selectedFarmId, farmPeriods, onYearChange }: {
    importId: string; selectedFarmId: string; farmPeriods: FarmPeriod[]; onYearChange: () => void;
}) {
    const { t } = useTranslation();
    const [data, setData] = useState<Paged<ImportedParcel> | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 2000;

    const load = useCallback(async (p: number) => {
        setLoading(true);
        try {
            const farmParam = selectedFarmId ? `&farmId=${selectedFarmId}` : '';
            const r = await apiGet(`/imports/${importId}/preview/parcels?page=${p}&size=${PAGE_SIZE}${farmParam}`);
            if (r.ok) {
                const raw = await r.json();
                const normalized = {
                    ...raw,
                    content: (raw.content as Array<any>).map((p: any) => {
                        const pp = Array.isArray(p.parcelPeriods) && p.parcelPeriods.length > 0 ? p.parcelPeriods[0] : null;
                        const statusToLegacy = (s: string | null) => {
                            if (s === 'LIVE') return 'CONVERTED';
                            if (s === 'REJECTED') return 'REJECTED';
                            return 'PENDING';
                        };
                        return {
                            ...p,
                            cultureCode: pp?.cultureCode ?? null,
                            cultureLabel: pp?.cultureLabel ?? null,
                            campaignYear: pp?.campaignYear ?? null,
                            periodName: pp?.periodName ?? null,
                            measuredAreaHa: pp?.measuredAreaHa ?? null,
                            declaredAreaHa: pp?.declaredAreaHa ?? null,
                            variety: pp?.variety ?? null,
                            sowingDate: pp?.sowingDate ?? null,
                            harvestDate: pp?.harvestDate ?? null,
                            targetYieldTha: pp?.targetYieldTha ?? null,
                            sowingDensityKgha: pp?.sowingDensityKgha ?? null,
                            rowSpacingCm: pp?.rowSpacingCm ?? null,
                            eligibilityStatus: pp?.eligibilityStatus ?? null,
                            forcedPeriodId: pp?.forcedPeriodId ?? null,
                            periodNameOverride: pp?.periodNameOverride ?? null,
                            periodStartOverride: pp?.periodStartOverride ?? null,
                            periodEndOverride: pp?.periodEndOverride ?? null,
                            validationStatus: statusToLegacy(p.status ?? null),
                            parentImportedParcelId: p.parentParcelId ?? null,
                            willMergeWithParcelId: p.willMergeWithParcelId ?? null,
                            willMergeWithParcelName: p.willMergeWithParcelName ?? null,
                        };
                    }),
                };
                setData(normalized);
            }
        } finally { setLoading(false); }
    }, [importId, selectedFarmId]);

    useEffect(() => { load(page); }, [page, load]);

    const groups = useMemo((): ParcelGroup[] => {
        if (!data) return [];
        const parcels = data.content;

        const byId = new Map<number, ImportedParcel>();
        for (const p of parcels) byId.set(p.id, p);

        const isParentOf = new Set<number>();
        for (const p of parcels) {
            if (p.parentImportedParcelId != null) isParentOf.add(p.parentImportedParcelId);
        }

        const chainRootId = (p: ImportedParcel): number | null => {
            const inChain = p.parentImportedParcelId != null || isParentOf.has(p.id);
            if (!inChain) return null;
            const visited = new Set<number>();
            let cur = p;
            while (cur.parentImportedParcelId != null && !visited.has(cur.id)) {
                visited.add(cur.id);
                const parent = byId.get(cur.parentImportedParcelId);
                if (!parent) break;
                cur = parent;
            }
            return cur.id;
        };

        const codeKey = (p: ImportedParcel): string | null => {
            if (p.sourceGuid) return `guid:${p.sourceGuid}`;
            if (p.sourceCode && p.sourceBlockCode) return `cb:${p.sourceBlockCode}|${p.sourceCode}`;
            if (p.sourceCode) return `c:${p.sourceCode}`;
            return null;
        };

        const chainMap = new Map<number, ImportedParcel[]>();
        const codeMap = new Map<string, ImportedParcel[]>();
        const singles: ImportedParcel[] = [];

        for (const p of parcels) {
            const root = chainRootId(p);
            if (root !== null) {
                const arr = chainMap.get(root) ?? [];
                arr.push(p);
                chainMap.set(root, arr);
            } else {
                const key = codeKey(p);
                if (key) {
                    const arr = codeMap.get(key) ?? [];
                    arr.push(p);
                    codeMap.set(key, arr);
                } else {
                    singles.push(p);
                }
            }
        }

        const byYear = (rows: ImportedParcel[]) =>
            [...rows].sort((a, b) => (a.campaignYear ?? 0) - (b.campaignYear ?? 0));

        const result: ParcelGroup[] = [];
        for (const rows of chainMap.values())
            result.push({ sourceGuid: rows[0].sourceGuid, rows: byYear(rows) });
        for (const rows of codeMap.values())
            result.push({ sourceGuid: rows[0].sourceGuid, rows: byYear(rows) });
        singles.forEach(p => result.push({ sourceGuid: null, rows: [p] }));
        return result;
    }, [data]);

    if (loading) return <div className="py-12 text-center text-slate-400">{t('common.loading', { defaultValue: 'Loading…' })}</div>;
    if (!data) return null;

    return (
        <div className="space-y-3">
            <p className="text-xs text-slate-400">
                {data.totalElements} parcel record(s) → {groups.length} physical parcel(s)
            </p>
            <div className="space-y-2">
                {groups.map((group, gi) => (
                    <ParcelGroupRow
                        key={group.sourceGuid ?? `no-guid-${gi}`}
                        group={group}
                        farmPeriods={farmPeriods}
                        onSaved={onYearChange}
                    />
                ))}
            </div>
            {data.totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 text-sm text-slate-500">
                    <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)}
                        className="rounded border border-slate-200 px-3 py-1 hover:bg-slate-50 disabled:opacity-40">← Prev</button>
                    <span>{page + 1} / {data.totalPages}</span>
                    <button type="button" disabled={page + 1 >= data.totalPages} onClick={() => setPage(p => p + 1)}
                        className="rounded border border-slate-200 px-3 py-1 hover:bg-slate-50 disabled:opacity-40">Next →</button>
                </div>
            )}
        </div>
    );
}

function EquipmentsTab({ importId }: { importId: string }) {
    const { t } = useTranslation();
    const [data, setData] = useState<Paged<Equipment> | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);

    const load = useCallback(async (p: number) => {
        setLoading(true);
        try {
            const r = await apiGet(`/imports/${importId}/preview/equipments?page=${p}&size=50`);
            if (r.ok) setData(await r.json());
        } finally { setLoading(false); }
    }, [importId]);

    useEffect(() => { load(page); }, [page, load]);

    if (loading) return <div className="py-12 text-center text-slate-400">{t('common.loading', { defaultValue: 'Loading…' })}</div>;
    if (!data || data.totalElements === 0) return (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-slate-500">
            {t('imports.review.noEquipments', { defaultValue: 'No equipment data in this import.' })}
        </div>
    );
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50"><tr><Th>{t('imports.review.col.name', { defaultValue: 'Name' })}</Th><Th>Source ID</Th></tr></thead>
                <tbody className="divide-y divide-slate-50">
                    {data.content.map(e => (
                        <tr key={e.id} className="hover:bg-slate-50/60">
                            <Cell className="font-medium text-slate-900">{e.name}</Cell>
                            <Cell className="font-mono text-xs text-slate-400">{e.sourceGuid}</Cell>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ProductsTab({ importId }: { importId: string }) {
    const { t } = useTranslation();
    const [data, setData] = useState<Paged<PreviewProduct> | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);

    const load = useCallback(async (p: number) => {
        setLoading(true);
        try {
            const r = await apiGet(`/imports/${importId}/preview/products?page=${p}&size=50`);
            if (r.ok) setData(await r.json());
        } finally { setLoading(false); }
    }, [importId]);

    useEffect(() => { load(page); }, [page, load]);

    if (loading) return <div className="py-12 text-center text-slate-400">{t('common.loading', { defaultValue: 'Loading…' })}</div>;
    if (!data || data.totalElements === 0) return (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-slate-500">
            {t('imports.review.noProducts', { defaultValue: 'No product data in this import.' })}
        </div>
    );
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50"><tr>
                    <Th>{t('imports.review.col.name', { defaultValue: 'Name' })}</Th>
                    <Th>Species</Th><Th>Code</Th><Th>Unit</Th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                    {data.content.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50/60">
                            <Cell className="font-medium text-slate-900">{p.name}</Cell>
                            <Cell className="italic text-slate-500">{p.botanicalSpecies || <span className="text-slate-300 not-italic">—</span>}</Cell>
                            <Cell>{p.code || <span className="text-slate-400">—</span>}</Cell>
                            <Cell>{p.unitSymbol ? <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{p.unitSymbol}</span> : <span className="text-slate-400">—</span>}</Cell>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function OperationsTab({ importId }: { importId: string }) {
    const { t } = useTranslation();
    const [data, setData] = useState<Paged<Activity> | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    const load = useCallback(async (p: number) => {
        setLoading(true);
        try {
            const r = await apiGet(`/imports/${importId}/preview/activities?page=${p}&size=50`);
            if (r.ok) setData(await r.json());
        } finally { setLoading(false); }
    }, [importId]);

    useEffect(() => { load(page); }, [page, load]);

    if (loading) return <div className="py-12 text-center text-slate-400">{t('common.loading', { defaultValue: 'Loading…' })}</div>;
    if (!data || data.totalElements === 0) return (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-slate-500">
            {t('imports.review.noOperations', { defaultValue: 'No operation data in this import.' })}
        </div>
    );

    const toggle = (id: number) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    return (
        <div className="space-y-2">
            {data.content.map(act => {
                const open = expanded.has(act.id);
                const date = act.startingDate ? act.startingDate.substring(0, 10) : null;
                return (
                    <div key={act.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                        <button type="button" className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left" onClick={() => toggle(act.id)}>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-slate-900">{act.operationName}</span>
                                    {act.operationCategory && (
                                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">{act.operationCategory}</span>
                                    )}
                                    {act.periodName && <PeriodChip name={act.periodName} />}
                                    {date && <span className="text-xs text-slate-400">{date}</span>}
                                    {act.durationMinutes != null && (
                                        <span className="text-xs text-slate-400">{act.durationMinutes} min</span>
                                    )}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {act.parcels.map((p, pi) => (
                                        <span key={pi} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                            {p.parcelName || p.plotId || '?'}
                                            {p.workedSurfaceHa != null && ` (${p.workedSurfaceHa.toFixed(2)} ha)`}
                                        </span>
                                    ))}
                                    {act.productUsages.length > 0 && (
                                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-200">
                                            {act.productUsages.length} product{act.productUsages.length > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <span className="mt-0.5 shrink-0 text-slate-400">{open ? '▲' : '▼'}</span>
                        </button>
                        {open && (
                            <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                                {act.comment && (
                                    <p className="text-sm text-slate-500 italic">"{act.comment}"</p>
                                )}
                                {act.productUsages.length > 0 && (
                                    <div>
                                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Products used</p>
                                        <div className="space-y-1">
                                            {act.productUsages.map((pu, pi) => (
                                                <div key={pi} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                                                    <span className="font-medium text-slate-800">{pu.supplyName}</span>
                                                    {pu.quantity != null && <span className="font-mono text-slate-500">{pu.quantity.toFixed(3)} {pu.unitSymbol || ''}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
            {(data.totalPages > 1) && (
                <div className="flex items-center justify-end gap-2 text-sm text-slate-500">
                    <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded border border-slate-200 px-3 py-1 hover:bg-slate-50 disabled:opacity-40">← Prev</button>
                    <span>{page + 1} / {data.totalPages}</span>
                    <button type="button" disabled={page + 1 >= data.totalPages} onClick={() => setPage(p => p + 1)} className="rounded border border-slate-200 px-3 py-1 hover:bg-slate-50 disabled:opacity-40">Next →</button>
                </div>
            )}
        </div>
    );
}

function SourceFilesPanel({ files, importId, onRemoved }: {
    files: SourceFile[]; importId: string; onRemoved: () => void;
}) {
    const { t } = useTranslation();
    const { formatDate } = useDateTimeFormatter();
    const [removing, setRemoving] = useState<number | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);

    const handleRemove = async (file: SourceFile) => {
        const confirmed = window.confirm(
            t('imports.removeFile.confirm', { filename: file.filename, defaultValue: `Remove "${file.filename}" and all its data from this import?` })
        );
        if (!confirmed) return;
        setRemoving(file.id);
        setFeedback(null);
        try {
            const r = await apiDelete(`/imports/${importId}/files/${file.id}`);
            if (!r.ok) throw new Error('Failed');
            onRemoved();
            setFeedback(t('imports.removeFile.success', { defaultValue: 'File removed.' }));
        } catch (_) {
            setFeedback(t('imports.removeFile.error', { defaultValue: 'Failed to remove file.' }));
        } finally { setRemoving(null); }
    };

    if (!files.length) return null;

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-slate-700">
                {t('imports.files.title', { defaultValue: 'Source files' })}
            </p>
            <div className="space-y-2">
                {files.map(f => (
                    <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-800">{f.filename}</p>
                            <p className="text-xs text-slate-400">
                                {f.importedAt ? formatDate(f.importedAt) : ''}
                                {' · '}
                                {[
                                    f.parcelCount ? `${f.parcelCount} parcel(s)` : '',
                                    f.toolCount ? `${f.toolCount} tool(s)` : '',
                                    f.productCount ? `${f.productCount} product(s)` : '',
                                    f.operationCount ? `${f.operationCount} operation(s)` : '',
                                ].filter(Boolean).join(', ') || 'no data'}
                            </p>
                        </div>
                        <button type="button" disabled={removing === f.id}
                            onClick={() => handleRemove(f)}
                            className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50">
                            {removing === f.id ? '…' : t('imports.files.remove', { defaultValue: 'Remove' })}
                        </button>
                    </div>
                ))}
            </div>
            {feedback && <p className="mt-2 text-xs font-medium text-emerald-600">{feedback}</p>}
        </div>
    );
}

function AddFilesPanel({ importId, onDone }: { importId: string; onDone: () => void }) {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState<UploadProgress | null>(null);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const handleFiles = useCallback(async (files: FileList) => {
        setUploading(true);
        setFeedback(null);
        setProgress({ current: 0, total: 1, message: t('imports.upload.uploading', { defaultValue: 'Uploading…' }) });
        try {
            const formData = new FormData();
            for (let i = 0; i < files.length; i++) formData.append('files', files[i]);
            const token = typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : null;
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const response = await fetch(`${apiUrl}/imports/${importId}/add-files`, { method: 'POST', headers, body: formData });
            if (!response.ok || !response.body) throw new Error('Upload failed');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop() ?? '';
                for (const part of parts) {
                    for (const line of part.split('\n')) {
                        if (!line.startsWith('data:')) continue;
                        try {
                            const payload = JSON.parse(line.slice(5).trim());
                            if (payload.type === 'progress') {
                                setProgress({ current: payload.current, total: payload.total, message: payload.message });
                            } else if (payload.type === 'done') {
                                setFeedback({ type: 'success', message: t('imports.addFiles.success', { defaultValue: 'Files added.' }) });
                                onDone();
                            } else if (payload.type === 'error') throw new Error(payload.message || 'Failed');
                        } catch (_) {}
                    }
                }
            }
        } catch (err: any) {
            setFeedback({ type: 'error', message: err?.message || t('imports.addFiles.error', { defaultValue: 'Failed to add files.' }) });
        } finally { setUploading(false); setProgress(null); if (fileInputRef.current) fileInputRef.current.value = ''; }
    }, [importId, onDone, t]);

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-1 text-sm font-semibold text-slate-700">{t('imports.addFiles.title', { defaultValue: 'Add more files' })}</p>
            <p className="mb-3 text-xs text-slate-400">{t('imports.addFiles.hint', { defaultValue: 'Upload additional Geofolia ZIP exports to merge into this batch.' })}</p>
            <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow transition ${uploading ? 'cursor-not-allowed bg-slate-400' : 'bg-slate-700 hover:bg-slate-600'}`}>
                    {uploading ? t('imports.upload.importing', { defaultValue: 'Importing…' }) : t('imports.addFiles.button', { defaultValue: 'Add ZIP(s)' })}
                </button>
                {!uploading && feedback && (
                    <span className={`text-sm font-medium ${feedback.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>{feedback.message}</span>
                )}
            </div>
            {uploading && progress && (
                <div className="mt-3 max-w-lg rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>{progress.message}</span>
                        {progress.total > 1 && <span>{progress.current}/{progress.total}</span>}
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className="h-2 rounded-full bg-slate-500 transition-all duration-200"
                            style={{ width: progress.total > 1 ? `${Math.round((progress.current / progress.total) * 100)}%` : '40%' }} />
                    </div>
                </div>
            )}
            <input ref={fileInputRef} type="file" accept=".zip" multiple className="hidden"
                onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); }} />
        </div>
    );
}

export default function ImportReviewPage() {
    const { t } = useTranslation();
    const locale = useCurrentLocale();
    const { importId } = useParams<{ importId: string }>();
    const { farms } = useFarm();
    const { formatDate } = useDateTimeFormatter();

    const [meta, setMeta] = useState<ImportPreviewMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('parcels');
    const [selectedFarmId, setSelectedFarmId] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importFeedback, setImportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [farmPeriods, setFarmPeriods] = useState<FarmPeriod[]>([]);
    const [tabKey, setTabKey] = useState(0); // bump to force tab reload

    const loadMeta = useCallback(async (farmId?: string) => {
        if (!importId) return;
        setLoading(true);
        try {
            const farmParam = farmId ? `?farmId=${farmId}` : '';
            const r = await apiGet(`/imports/${importId}/preview${farmParam}`);
            if (!r.ok) throw new Error(r.statusText);
            setMeta(await r.json());
            setError(null);
        } catch {
            setError(t('imports.review.loadError', { defaultValue: 'Failed to load import preview.' }));
        } finally { setLoading(false); }
    }, [importId, t]);

    const loadFarmPeriods = useCallback(async (farmId: string) => {
        if (!farmId) { setFarmPeriods([]); return; }
        try {
            const r = await apiGet(`/farms/${farmId}/periods`);
            if (r.ok) setFarmPeriods(await r.json());
        } catch (_) {}
    }, []);

    useEffect(() => { loadMeta(); }, [loadMeta]);

    useEffect(() => {
        if (farms.length > 0 && !selectedFarmId) {
            const id = String(farms[0].id);
            setSelectedFarmId(id);
            loadMeta(id);
            loadFarmPeriods(id);
        }
    }, [farms, selectedFarmId, loadMeta, loadFarmPeriods]);

    const handleFarmChange = (id: string) => {
        setSelectedFarmId(id);
        loadMeta(id);
        loadFarmPeriods(id);
        setTabKey(k => k + 1);
    };

    const handleImport = useCallback(async () => {
        if (!importId || !selectedFarmId) return;
        setIsImporting(true);
        setImportFeedback(null);
        try {
            const r = await apiPost(`/imports/${importId}/approve`, { farmId: Number(selectedFarmId) });
            if (!r.ok) { const txt = await r.text().catch(() => ''); throw new Error(txt || r.statusText); }
            setImportFeedback({ type: 'success', message: t('imports.review.importSuccess', { defaultValue: 'Import successful!' }) });
            loadMeta(selectedFarmId);
            setTabKey(k => k + 1);
        } catch (err: any) {
            setImportFeedback({ type: 'error', message: err?.message || t('imports.review.importError', { defaultValue: 'Import failed.' }) });
        } finally { setIsImporting(false); }
    }, [importId, selectedFarmId, t, loadMeta]);

    const alreadyApproved = meta?.approvedAt != null;

    const tabs = meta ? [
        { id: 'parcels' as Tab, label: t('imports.review.tab.parcels', { defaultValue: 'Parcels' }), count: meta.parcelCount },
        { id: 'equipments' as Tab, label: t('imports.review.tab.equipments', { defaultValue: 'Equipments' }), count: meta.equipmentCount },
        { id: 'products' as Tab, label: t('imports.review.tab.products', { defaultValue: 'Products' }), count: meta.productCount },
        { id: 'operations' as Tab, label: t('imports.review.tab.operations', { defaultValue: 'Operations' }), count: meta.activityCount },
    ] : [];

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-slate-50">
                <div className="mx-auto max-w-6xl px-4 py-8">
                    <div className="mb-5">
                        <Link to={buildLocalizedPath(locale, '/imports')} className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline">
                            ← {t('imports.review.back', { defaultValue: 'Back to imports' })}
                        </Link>
                    </div>

                    {loading && <div className="flex items-center justify-center py-24 text-slate-400">{t('common.loading', { defaultValue: 'Loading…' })}</div>}
                    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}

                    {meta && (
                        <div className="space-y-6">
                            {/* Header */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{t('imports.review.title', { defaultValue: 'Import review' })}</p>
                                        <h1 className="mt-1 text-2xl font-bold text-slate-900">{meta.importName}</h1>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                                            {meta.createdAt && <span>{t('imports.review.createdAt', { defaultValue: 'Uploaded {{date}}', date: formatDate(meta.createdAt) })}</span>}
                                            {alreadyApproved && meta.approvedAt && (
                                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                                                    {t('imports.review.alreadyImported', { defaultValue: '✓ Imported {{date}}', date: formatDate(meta.approvedAt) })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {meta.hasActionData && (
                                            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                                                {t('imports.review.hasActions', { defaultValue: 'Includes operations & products' })}
                                            </span>
                                        )}
                                        <Link to={buildLocalizedPath(locale, `/imports/map?list=${importId}`)}
                                            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700">
                                            {t('imports.review.viewOnMap', { defaultValue: 'View on map' })}
                                        </Link>
                                    </div>
                                </div>
                            </div>

                            {/* Source files (pre-approval only) */}
                            {!alreadyApproved && (meta.files?.length > 0) && (
                                <SourceFilesPanel
                                    files={meta.files}
                                    importId={importId!}
                                    onRemoved={() => { loadMeta(selectedFarmId || undefined); setTabKey(k => k + 1); }}
                                />
                            )}

                            {/* Add files (pre-approval only) */}
                            {!alreadyApproved && importId && (
                                <AddFilesPanel importId={importId} onDone={() => { loadMeta(selectedFarmId || undefined); setTabKey(k => k + 1); }} />
                            )}

                            {/* Farm selector + import */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <p className="mb-3 text-sm font-semibold text-slate-700">{t('imports.review.targetFarm', { defaultValue: 'Target farm' })}</p>
                                <div className="flex flex-wrap items-end gap-3">
                                    <div className="flex-1 min-w-48">
                                        {farms.length === 0 ? (
                                            <p className="text-sm text-slate-400">{t('imports.review.noFarms', { defaultValue: 'No farms available.' })}</p>
                                        ) : (
                                            <select value={selectedFarmId} onChange={e => handleFarmChange(e.target.value)}
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200">
                                                {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                            </select>
                                        )}
                                    </div>
                                    <button type="button" onClick={handleImport}
                                        disabled={isImporting || !selectedFarmId || farms.length === 0}
                                        className={`rounded-xl px-5 py-2 text-sm font-semibold text-white shadow transition ${isImporting || !selectedFarmId || farms.length === 0 ? 'cursor-not-allowed bg-slate-300' : alreadyApproved ? 'bg-amber-500 hover:bg-amber-400' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
                                        {isImporting ? t('imports.review.importing', { defaultValue: 'Importing…' })
                                            : alreadyApproved ? t('imports.review.reimport', { defaultValue: 'Re-import' })
                                            : t('imports.review.import', { defaultValue: 'Import to farm' })}
                                    </button>
                                </div>
                                {importFeedback && (
                                    <p className={`mt-3 text-sm font-medium ${importFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {importFeedback.message}
                                    </p>
                                )}
                            </div>

                            {/* Tabs */}
                            <div>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {tabs.map(tab => (
                                        <Badge key={tab.id} label={tab.label} count={tab.count}
                                            active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />
                                    ))}
                                </div>
                                {importId && (
                                    <>
                                        {activeTab === 'parcels' && (
                                            <ParcelsTab key={`parcels-${tabKey}`} importId={importId}
                                                selectedFarmId={selectedFarmId}
                                                farmPeriods={farmPeriods}
                                                onYearChange={() => { loadMeta(selectedFarmId || undefined); setTabKey(k => k + 1); }} />
                                        )}
                                        {activeTab === 'equipments' && <EquipmentsTab key={`eq-${tabKey}`} importId={importId} />}
                                        {activeTab === 'products' && <ProductsTab key={`pr-${tabKey}`} importId={importId} />}
                                        {activeTab === 'operations' && <OperationsTab key={`op-${tabKey}`} importId={importId} />}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}
