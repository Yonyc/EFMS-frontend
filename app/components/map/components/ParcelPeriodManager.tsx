import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiDelete, apiGet, apiPatch, apiPost } from "~/utils/api";
import type { ParcelPeriodInfo, PeriodDto } from "../types";
import ParcelSharePanel, { type ParcelShareData } from "./ParcelSharePanel";

interface ParcelPeriodManagerProps {
    parcelId: string;
    parcelName: string;
    farmId: number;
    parcelPeriods: ParcelPeriodInfo[];
    onClose: () => void;
    
    
    onChanged: () => void;
    
    currentColor?: string;
    
    customColor?: string | null;
    
    cultureColor?: string | null;
    
    onColorChange?: (color: string) => void | Promise<void>;
    
    onRename?: (name: string) => void | Promise<void>;
    
    share?: ParcelShareData;
}

const COLOR_PALETTE = ['#3388ff', '#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf', '#ff8b94', '#b4a7d6', '#ffa07a'];

interface DraftFields {
    cultureCode: string;
    cultureLabel: string;
    variety: string;
    declaredAreaHa: string;
    measuredAreaHa: string;
    targetYieldTha: string;
    sowingDensityKgha: string;
    rowSpacingCm: string;
    sowingDate: string;
    harvestDate: string;
    yieldRealizedTha: string;
    eligibilityStatus: string;
    comment: string;
    active: boolean;
}

const blankDraft = (): DraftFields => ({
    cultureCode: '', cultureLabel: '', variety: '',
    declaredAreaHa: '', measuredAreaHa: '',
    targetYieldTha: '', sowingDensityKgha: '', rowSpacingCm: '',
    sowingDate: '', harvestDate: '', yieldRealizedTha: '',
    eligibilityStatus: '', comment: '', active: true,
});

const draftFromPeriod = (pp: ParcelPeriodInfo): DraftFields => ({
    cultureCode: pp.cultureCode ?? '',
    cultureLabel: pp.cultureLabel ?? '',
    variety: pp.variety ?? '',
    declaredAreaHa: pp.declaredAreaHa != null ? String(pp.declaredAreaHa) : '',
    measuredAreaHa: pp.measuredAreaHa != null ? String(pp.measuredAreaHa) : '',
    targetYieldTha: pp.targetYieldTha != null ? String(pp.targetYieldTha) : '',
    sowingDensityKgha: pp.sowingDensityKgha != null ? String(pp.sowingDensityKgha) : '',
    rowSpacingCm: pp.rowSpacingCm != null ? String(pp.rowSpacingCm) : '',
    sowingDate: pp.sowingDate ?? '',
    harvestDate: pp.harvestDate ?? '',
    yieldRealizedTha: pp.yieldRealizedTha != null ? String(pp.yieldRealizedTha) : '',
    eligibilityStatus: pp.eligibilityStatus ?? '',
    comment: pp.comment ?? '',
    active: pp.active,
});

const draftToBody = (d: DraftFields): Record<string, unknown> => {
    const num = (s: string): number | null => s.trim() === '' ? null : Number(s);
    return {
        cultureCode: d.cultureCode,
        cultureLabel: d.cultureLabel || null,
        variety: d.variety || null,
        declaredAreaHa: num(d.declaredAreaHa),
        measuredAreaHa: num(d.measuredAreaHa),
        targetYieldTha: num(d.targetYieldTha),
        sowingDensityKgha: num(d.sowingDensityKgha),
        rowSpacingCm: num(d.rowSpacingCm),
        sowingDate: d.sowingDate || null,
        harvestDate: d.harvestDate || null,
        yieldRealizedTha: num(d.yieldRealizedTha),
        eligibilityStatus: d.eligibilityStatus || null,
        comment: d.comment || null,
        active: d.active,
    };
};

interface FieldProps {
    label: string;
    value: string;
    onChange: (next: string) => void;
    type?: 'text' | 'number' | 'date';
    placeholder?: string;
}

function Field({ label, value, onChange, type = 'text', placeholder }: FieldProps) {
    return (
        <label className="flex flex-col gap-0.5 text-xs text-slate-700">
            <span className="font-medium text-slate-600">{label}</span>
            <input
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
            />
        </label>
    );
}

/** Collapsible section */
function Collapsible({ title, badge, defaultOpen = false, children }: {
    title: ReactNode; badge?: ReactNode; defaultOpen?: boolean; children: ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                aria-expanded={open}
            >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <span className="text-slate-400" aria-hidden>{open ? '▾' : '▸'}</span>
                    {title}
                </span>
                {badge}
            </button>
            {open && <div className="border-t border-slate-200 px-3 py-3">{children}</div>}
        </div>
    );
}

export default function ParcelPeriodManager(props: ParcelPeriodManagerProps) {
    const { parcelId, parcelName, farmId, parcelPeriods, onClose, onChanged, currentColor, customColor, cultureColor, onColorChange, onRename, share } = props;
    const { t } = useTranslation();

    const [availablePeriods, setAvailablePeriods] = useState<PeriodDto[]>([]);
    const [drafts, setDrafts] = useState<Record<number, DraftFields>>({});
    const [addPeriodId, setAddPeriodId] = useState<string>('');
    const [addDraft, setAddDraft] = useState<DraftFields>(blankDraft());
    const [nameDraft, setNameDraft] = useState<string>(parcelName);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    
    
    const [localPeriods, setLocalPeriods] = useState<ParcelPeriodInfo[]>(parcelPeriods);

    useEffect(() => { setNameDraft(parcelName); }, [parcelName]);
    useEffect(() => { setLocalPeriods(parcelPeriods); }, [parcelPeriods]);

    const reload = useCallback(async () => {
        try {
            const r = await apiGet(`/parcels/${parcelId}`);
            if (!r.ok) return;
            const dto = await r.json();
            const mapped: ParcelPeriodInfo[] = (dto.parcelPeriods ?? []).map((pp: any) => ({
                id: pp.id, parcelId: String(parcelId), periodId: pp.periodId, periodName: pp.periodName ?? null,
                active: pp.active ?? true, startValidity: pp.startValidity ?? null, endValidity: pp.endValidity ?? null,
                cultureCode: pp.cultureCode ?? null, cultureLabel: pp.cultureLabel ?? null, variety: pp.variety ?? null,
                declaredAreaHa: pp.declaredAreaHa ?? null, measuredAreaHa: pp.measuredAreaHa ?? null,
                targetYieldTha: pp.targetYieldTha ?? null, sowingDensityKgha: pp.sowingDensityKgha ?? null,
                rowSpacingCm: pp.rowSpacingCm ?? null, sowingDate: pp.sowingDate ?? null, harvestDate: pp.harvestDate ?? null,
                yieldRealizedTha: pp.yieldRealizedTha ?? null, campaignYear: pp.campaignYear ?? null,
                eligibilityStatus: pp.eligibilityStatus ?? null, comment: pp.comment ?? null,
            }));
            setLocalPeriods(mapped);
        } catch (_) {}
    }, [parcelId]);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const r = await apiGet(`/farm/${farmId}/periods`);
                if (r.ok && active) setAvailablePeriods(await r.json());
            } catch (_) {}
        })();
        return () => { active = false; };
    }, [farmId]);

    // Seed drafts from the current period rows.
    useEffect(() => {
        const next: Record<number, DraftFields> = {};
        for (const pp of localPeriods) next[pp.id] = draftFromPeriod(pp);
        setDrafts(next);
    }, [localPeriods]);

    const usedPeriodIds = useMemo(() => new Set(localPeriods.map(pp => pp.periodId)), [localPeriods]);
    const addablePeriods = availablePeriods.filter(p => !usedPeriodIds.has(p.id));

    const handleSave = useCallback(async (parcelPeriodId: number) => {
        const draft = drafts[parcelPeriodId];
        if (!draft) return;
        setBusy(true); setError(null);
        try {
            const r = await apiPatch(`/parcels/${parcelId}/periods/${parcelPeriodId}`, draftToBody(draft));
            if (!r.ok) throw new Error('Save failed');
            await reload();
            onChanged();
        } catch (e: any) {
            setError(e?.message ?? 'Save failed');
        } finally { setBusy(false); }
    }, [drafts, parcelId, reload, onChanged]);

    const handleDelete = useCallback(async (parcelPeriodId: number) => {
        if (!confirm(t('map.periodManager.confirmDelete', { defaultValue: 'Remove this period from the parcel?' }))) return;
        setBusy(true); setError(null);
        try {
            const r = await apiDelete(`/parcels/${parcelId}/periods/${parcelPeriodId}`);
            if (!r.ok) throw new Error('Delete failed');
            await reload();
            onChanged();
        } catch (e: any) {
            setError(e?.message ?? 'Delete failed');
        } finally { setBusy(false); }
    }, [parcelId, reload, onChanged, t]);

    const handleAdd = useCallback(async () => {
        if (!addPeriodId) return;
        setBusy(true); setError(null);
        try {
            const body = { ...draftToBody(addDraft), periodId: Number(addPeriodId) };
            const r = await apiPost(`/parcels/${parcelId}/periods`, body);
            if (!r.ok) throw new Error('Add failed');
            setAddPeriodId('');
            setAddDraft(blankDraft());
            await reload();
            onChanged();
        } catch (e: any) {
            setError(e?.message ?? 'Add failed');
        } finally { setBusy(false); }
    }, [addDraft, addPeriodId, parcelId, onChanged]);

    const updateDraft = (id: number, patch: Partial<DraftFields>) => {
        setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal>
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-indigo-600">
                            {t('map.parcelManager.title', { defaultValue: 'Manage parcel' })}
                        </p>
                        <h2 className="text-lg font-semibold text-slate-900">{parcelName}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        aria-label={t('map.periodManager.close', { defaultValue: 'Close' })}
                    >
                        ✕
                    </button>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
                    {error && (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
                    )}

                    {/* Parcel settings (name + colour) */}
                    {(onRename || onColorChange) && (
                        <Collapsible title={t('map.parcelManager.settingsTitle', { defaultValue: 'Parcel settings' })} defaultOpen>
                            {onRename && (
                                <div className="mb-3">
                                    <div className="mb-1 text-xs font-medium text-slate-600">{t('map.parcelManager.nameLabel', { defaultValue: 'Name' })}</div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={nameDraft}
                                            onChange={(e) => setNameDraft(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') onRename(nameDraft); }}
                                            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                            placeholder={t('map.polygonList.placeholder', { defaultValue: 'Parcel name' })}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => onRename(nameDraft)}
                                            disabled={busy || !nameDraft.trim()}
                                            className="shrink-0 rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                                        >
                                            {t('map.parcelManager.applyName', { defaultValue: 'Apply' })}
                                        </button>
                                    </div>
                                </div>
                            )}
                            {onColorChange && (
                                <>
                                    <div className="text-xs font-medium text-slate-600">{t('map.polygonMenu.color', { defaultValue: 'Colour' })}</div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        {/* Default = inherit the culture-type colour. Selecting it clears the parcel's own colour. */}
                                        {(() => {
                                            const isDefault = customColor == null || customColor === '';
                                            const swatch = cultureColor || '#cbd5e1';
                                            return (
                                                <button
                                                    type="button"
                                                    onClick={() => onColorChange('')}
                                                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold transition hover:bg-slate-50 ${isDefault ? 'border-indigo-400 ring-2 ring-indigo-200 text-indigo-700' : 'border-slate-300 text-slate-600'}`}
                                                    title={cultureColor
                                                        ? t('map.parcelManager.defaultColorHint', { defaultValue: 'Use the culture type colour' })
                                                        : t('map.parcelManager.defaultColorNone', { defaultValue: 'No culture-type colour defined yet' })}
                                                >
                                                    <span className="h-4 w-4 rounded-full border border-white shadow" style={{ background: swatch }} aria-hidden />
                                                    {t('map.parcelManager.defaultColor', { defaultValue: 'Default (culture)' })}
                                                </button>
                                            );
                                        })()}
                                        {COLOR_PALETTE.map(color => {
                                            const isCurrent = (customColor || '').toLowerCase() === color.toLowerCase();
                                            return (
                                                <button
                                                    key={color}
                                                    type="button"
                                                    onClick={() => onColorChange(color)}
                                                    className={`h-7 w-7 rounded-full border-2 border-white shadow-md transition hover:scale-110 ${isCurrent ? 'ring-2 ring-indigo-400' : ''}`}
                                                    style={{ background: color }}
                                                    aria-label={color}
                                                />
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </Collapsible>
                    )}

                    {/* Share */}
                    {share && (
                        <Collapsible title={t('map.parcelManager.shareTitle', { defaultValue: 'Sharing' })}>
                            <p className="mb-2 text-xs text-slate-500">
                                {t('map.parcelManager.shareHint', { defaultValue: 'Share this parcel with another user or via a research link.' })}
                            </p>
                            <ParcelSharePanel share={share} />
                        </Collapsible>
                    )}

                    {/* Existing periods */}
                    <div>
                        <h3 className="mb-2 text-sm font-semibold text-slate-700">
                            {t('map.periodManager.existingTitle', { defaultValue: 'Current periods' })}
                        </h3>
                        {localPeriods.length === 0 && (
                            <p className="text-sm text-slate-500">
                                {t('map.periodManager.empty', { defaultValue: 'No periods attached to this parcel yet.' })}
                            </p>
                        )}
                        <div className="flex flex-col gap-2">
                            {localPeriods.map(pp => {
                                const draft = drafts[pp.id] ?? draftFromPeriod(pp);
                                const badge = (
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${draft.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                        {draft.active ? t('map.periodManager.active', { defaultValue: 'Active' }) : t('parcels.inactive', { defaultValue: 'Inactive' })}
                                    </span>
                                );
                                return (
                                    <Collapsible key={pp.id} title={pp.periodName ?? `#${pp.periodId}`} badge={badge}>
                                        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                                            <label className="col-span-2 inline-flex items-center gap-2 text-xs text-slate-600 md:col-span-3">
                                                <input
                                                    type="checkbox"
                                                    checked={draft.active}
                                                    onChange={(e) => updateDraft(pp.id, { active: e.target.checked })}
                                                />
                                                {t('map.periodManager.active', { defaultValue: 'Active' })}
                                            </label>
                                            <Field label={t('map.periodManager.cultureCode', { defaultValue: 'Culture code' })}
                                                value={draft.cultureCode} onChange={(v) => updateDraft(pp.id, { cultureCode: v })} />
                                            <Field label={t('map.periodManager.cultureLabel', { defaultValue: 'Culture label' })}
                                                value={draft.cultureLabel} onChange={(v) => updateDraft(pp.id, { cultureLabel: v })} />
                                            <Field label={t('map.periodManager.variety', { defaultValue: 'Variety' })}
                                                value={draft.variety} onChange={(v) => updateDraft(pp.id, { variety: v })} />
                                            <Field label={t('map.periodManager.declaredAreaHa', { defaultValue: 'Declared area (ha)' })}
                                                type="number" value={draft.declaredAreaHa} onChange={(v) => updateDraft(pp.id, { declaredAreaHa: v })} />
                                            <Field label={t('map.periodManager.measuredAreaHa', { defaultValue: 'Measured area (ha)' })}
                                                type="number" value={draft.measuredAreaHa} onChange={(v) => updateDraft(pp.id, { measuredAreaHa: v })} />
                                            <Field label={t('map.periodManager.targetYieldTha', { defaultValue: 'Target yield (t/ha)' })}
                                                type="number" value={draft.targetYieldTha} onChange={(v) => updateDraft(pp.id, { targetYieldTha: v })} />
                                            <Field label={t('map.periodManager.sowingDate', { defaultValue: 'Sowing date' })}
                                                type="date" value={draft.sowingDate} onChange={(v) => updateDraft(pp.id, { sowingDate: v })} />
                                            <Field label={t('map.periodManager.harvestDate', { defaultValue: 'Harvest date' })}
                                                type="date" value={draft.harvestDate} onChange={(v) => updateDraft(pp.id, { harvestDate: v })} />
                                            <Field label={t('map.periodManager.yieldRealizedTha', { defaultValue: 'Realized yield (t/ha)' })}
                                                type="number" value={draft.yieldRealizedTha} onChange={(v) => updateDraft(pp.id, { yieldRealizedTha: v })} />
                                            <label className="col-span-2 flex flex-col gap-0.5 text-xs text-slate-700 md:col-span-3">
                                                <span className="font-medium text-slate-600">{t('map.periodManager.comment', { defaultValue: 'Comment' })}</span>
                                                <textarea
                                                    value={draft.comment}
                                                    onChange={(e) => updateDraft(pp.id, { comment: e.target.value })}
                                                    rows={2}
                                                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                                />
                                            </label>
                                        </div>
                                        <div className="mt-3 flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(pp.id)}
                                                disabled={busy}
                                                className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                                            >
                                                {t('map.periodManager.delete', { defaultValue: 'Remove' })}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleSave(pp.id)}
                                                disabled={busy}
                                                className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                                            >
                                                {t('map.periodManager.save', { defaultValue: 'Save' })}
                                            </button>
                                        </div>
                                    </Collapsible>
                                );
                            })}
                        </div>
                    </div>

                    {/* Add a period */}
                    {addablePeriods.length > 0 && (
                        <Collapsible title={t('map.periodManager.addTitle', { defaultValue: 'Add a period' })}>
                            <div className="flex flex-wrap items-end gap-3">
                                <label className="flex flex-col gap-0.5 text-xs text-slate-700">
                                    <span className="font-medium text-slate-600">{t('map.periodManager.pickPeriod', { defaultValue: 'Period' })}</span>
                                    <select
                                        value={addPeriodId}
                                        onChange={(e) => setAddPeriodId(e.target.value)}
                                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                                    >
                                        <option value="">{t('map.periodManager.pickPlaceholder', { defaultValue: 'Choose a period…' })}</option>
                                        {addablePeriods.map(p => (
                                            <option key={p.id} value={String(p.id)}>{p.name ?? `#${p.id}`}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
                                <Field label={t('map.periodManager.cultureCode', { defaultValue: 'Culture code' })}
                                    value={addDraft.cultureCode} onChange={(v) => setAddDraft(s => ({ ...s, cultureCode: v }))} />
                                <Field label={t('map.periodManager.cultureLabel', { defaultValue: 'Culture label' })}
                                    value={addDraft.cultureLabel} onChange={(v) => setAddDraft(s => ({ ...s, cultureLabel: v }))} />
                                <Field label={t('map.periodManager.variety', { defaultValue: 'Variety' })}
                                    value={addDraft.variety} onChange={(v) => setAddDraft(s => ({ ...s, variety: v }))} />
                                <Field label={t('map.periodManager.declaredAreaHa', { defaultValue: 'Declared area (ha)' })}
                                    type="number" value={addDraft.declaredAreaHa} onChange={(v) => setAddDraft(s => ({ ...s, declaredAreaHa: v }))} />
                                <Field label={t('map.periodManager.measuredAreaHa', { defaultValue: 'Measured area (ha)' })}
                                    type="number" value={addDraft.measuredAreaHa} onChange={(v) => setAddDraft(s => ({ ...s, measuredAreaHa: v }))} />
                                <Field label={t('map.periodManager.sowingDate', { defaultValue: 'Sowing date' })}
                                    type="date" value={addDraft.sowingDate} onChange={(v) => setAddDraft(s => ({ ...s, sowingDate: v }))} />
                            </div>
                            <div className="mt-3">
                                <button
                                    type="button"
                                    onClick={handleAdd}
                                    disabled={!addPeriodId || busy}
                                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                                >
                                    {t('map.periodManager.addAction', { defaultValue: 'Attach period' })}
                                </button>
                            </div>
                        </Collapsible>
                    )}
                </div>

                <div className="border-t border-slate-200 px-6 py-3 text-right">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                        {t('map.periodManager.done', { defaultValue: 'Done' })}
                    </button>
                </div>
            </div>
        </div>
    );
}
