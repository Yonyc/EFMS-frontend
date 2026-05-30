import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "~/components/ProtectedRoute";
import { apiGet } from "~/utils/api";
import { buildLocalizedPath } from "~/utils/locale";
import { useCurrentLocale } from "~/hooks/useCurrentLocale";
import { useFarm } from "~/contexts/FarmContext";
import ParcelPeriodManager from "~/components/map/components/ParcelPeriodManager";
import { PeriodPicker } from "~/components/map/components/PeriodPicker";
import type { ParcelPeriodInfo, PeriodDto } from "~/components/map/types";

interface ParcelDetail {
    id: number;
    name: string | null;
    color: string | null;
    farmId: number | null;
    parentParcelId: number | null;
    status: string | null;
    importRecordId: number | null;
    sourceFileId: number | null;
    validationNotes: string | null;
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

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
    return (
        <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-0.5 text-sm text-slate-800">{value ?? <span className="text-slate-400">—</span>}</dd>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">{children}</dl>
        </div>
    );
}

export default function ParcelDetailPage() {
    const { t } = useTranslation();
    const locale = useCurrentLocale();
    const { selectedFarm } = useFarm();
    const { parcelId } = useParams<{ parcelId: string }>();
    const [parcel, setParcel] = useState<ParcelDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
    const [managing, setManaging] = useState(false);
    const [refreshNonce, setRefreshNonce] = useState(0);

    useEffect(() => {
        if (!parcelId) return;
        let active = true;
        setLoading(true);
        setError(null);
        apiGet(`/parcels/${parcelId}`)
            .then(r => {
                if (!r.ok) throw new Error(r.statusText);
                return r.json();
            })
            .then(data => { if (active) setParcel(data); })
            .catch(() => { if (active) setError(t('parcels.detail.loadError', { defaultValue: 'Failed to load parcel details.' })); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [parcelId, t, refreshNonce]);

    useEffect(() => {
        if (selectedPeriodId !== '') return;
        const pps = parcel?.parcelPeriods ?? [];
        if (pps.length === 0) return;
        const preferredId = selectedFarm?.defaultPeriodId != null ? String(selectedFarm.defaultPeriodId) : null;
        const preferred = preferredId && pps.find(pp => String(pp.periodId) === preferredId);
        if (preferred) { setSelectedPeriodId(String(preferred.periodId)); return; }
        const sorted = [...pps].sort((a, b) => {
            const da = a.startValidity ? new Date(a.startValidity).getTime() : 0;
            const db = b.startValidity ? new Date(b.startValidity).getTime() : 0;
            return db - da;
        });
        setSelectedPeriodId(String(sorted[0].periodId));
    }, [parcel, selectedFarm?.defaultPeriodId, selectedPeriodId]);

    const activePeriod = useMemo<ParcelPeriodInfo | null>(() => {
        const pps = parcel?.parcelPeriods ?? [];
        if (pps.length === 0) return null;
        if (selectedPeriodId) {
            const found = pps.find(pp => String(pp.periodId) === selectedPeriodId);
            if (found) return found;
        }
        return pps[0];
    }, [parcel, selectedPeriodId]);

    const periodOptions = useMemo<PeriodDto[]>(() => {
        const pps = parcel?.parcelPeriods ?? [];
        return pps.map(pp => ({ id: pp.periodId, name: pp.periodName ?? `#${pp.periodId}`, startDate: pp.startValidity ?? undefined }));
    }, [parcel]);

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-slate-50">
                <div className="mx-auto max-w-4xl px-4 py-8">
                    {/* Back link */}
                    <div className="mb-5">
                        <Link
                            to={buildLocalizedPath(locale, '/parcels')}
                            className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                            ← {t('parcels.backToList', { defaultValue: 'Back to parcels' })}
                        </Link>
                    </div>

                    {loading && (
                        <div className="flex items-center justify-center py-20 text-slate-400">
                            {t('common.loading', { defaultValue: 'Loading...' })}
                        </div>
                    )}

                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    {parcel && (
                        <div className="space-y-5">
                            {/* Header */}
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                                    {t('parcels.detail.title', { defaultValue: 'Parcel details' })}
                                </p>
                                <h1 className="mt-1 text-2xl font-bold text-slate-900">
                                    {parcel.sourceName || parcel.name || `Parcel #${parcel.id}`}
                                </h1>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                                    <span>ID: {parcel.id}</span>
                                    {activePeriod
                                        ? (activePeriod.active !== false
                                            ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">{t('parcels.active', { defaultValue: 'Active' })}</span>
                                            : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{t('parcels.inactive', { defaultValue: 'Inactive' })}</span>)
                                        : null}
                                    {parcel.status && (
                                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{parcel.status}</span>
                                    )}
                                    {activePeriod?.eligibilityStatus && (
                                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{activePeriod.eligibilityStatus}</span>
                                    )}
                                    {parcel.color && (
                                        <span className="inline-flex items-center gap-1">
                                            <span className="h-3 w-3 rounded-full border border-white shadow-sm" style={{ background: parcel.color }} />
                                            {parcel.color}
                                        </span>
                                    )}
                                </div>
                                {/* Actions */}
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    {parcel.farmId && (
                                        <Link
                                            to={buildLocalizedPath(locale, '/map')}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                                        >
                                            {t('parcels.detail.viewOnMap', { defaultValue: 'View on map' })}
                                        </Link>
                                    )}
                                    {parcel.farmId && (
                                        <button
                                            type="button"
                                            onClick={() => setManaging(true)}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                        >
                                            {t('map.polygonList.managePeriods', { defaultValue: 'Manage periods' })}
                                        </button>
                                    )}
                                    {periodOptions.length > 1 && (
                                        <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                                            <span>{t('map.periodPicker.label', { defaultValue: 'Period' })}</span>
                                            <PeriodPicker
                                                periods={periodOptions}
                                                value={selectedPeriodId}
                                                onChange={setSelectedPeriodId}
                                                includeAll={false}
                                                size="compact"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Identity */}
                            <Section title={t('parcels.detail.sectionIdentity', { defaultValue: 'Identity' })}>
                                <Field label={t('parcels.col.name', { defaultValue: 'Name' })} value={parcel.name} />
                                <Field label={t('parcels.col.sourceName', { defaultValue: 'Source name' })} value={parcel.sourceName} />
                                <Field label={t('parcels.col.code', { defaultValue: 'Code' })} value={parcel.sourceCode} />
                                <Field label={t('parcels.col.block', { defaultValue: 'Block (ilot)' })} value={parcel.sourceBlockCode} />
                                <Field label={t('parcels.col.guid', { defaultValue: 'Source GUID' })} value={parcel.sourceGuid} />
                                <Field label={t('parcels.col.cadastralRef', { defaultValue: 'Cadastral ref.' })} value={parcel.cadastralRef} />
                                <Field label={t('parcels.col.municipality', { defaultValue: 'Municipality' })} value={parcel.municipality} />
                                <Field label={t('parcels.col.campaignYear', { defaultValue: 'Campaign year' })} value={activePeriod?.campaignYear ?? null} />
                            </Section>

                            {/* Culture (per selected period) */}
                            <Section title={t('parcels.detail.sectionCulture', { defaultValue: 'Crop & Agronomics' })}>
                                <Field label={t('parcels.col.period', { defaultValue: 'Period' })} value={activePeriod?.periodName ?? null} />
                                <Field label={t('parcels.col.culture', { defaultValue: 'Culture' })} value={activePeriod?.cultureLabel || activePeriod?.cultureCode || null} />
                                <Field label={t('parcels.col.cultureCode', { defaultValue: 'Culture code' })} value={activePeriod?.cultureCode ?? null} />
                                <Field label={t('parcels.col.variety', { defaultValue: 'Variety' })} value={activePeriod?.variety ?? null} />
                                <Field label={t('parcels.col.declaredArea', { defaultValue: 'Declared area (ha)' })} value={activePeriod?.declaredAreaHa != null ? activePeriod.declaredAreaHa.toFixed(4) : null} />
                                <Field label={t('parcels.col.measuredArea', { defaultValue: 'Measured area (ha)' })} value={activePeriod?.measuredAreaHa != null ? activePeriod.measuredAreaHa.toFixed(4) : null} />
                                <Field label={t('parcels.col.targetYield', { defaultValue: 'Target yield (t/ha)' })} value={activePeriod?.targetYieldTha != null ? activePeriod.targetYieldTha.toFixed(2) : null} />
                                <Field label={t('parcels.col.sowingDensity', { defaultValue: 'Sowing density (kg/ha)' })} value={activePeriod?.sowingDensityKgha != null ? activePeriod.sowingDensityKgha.toFixed(2) : null} />
                                <Field label={t('parcels.col.rowSpacing', { defaultValue: 'Row spacing (cm)' })} value={activePeriod?.rowSpacingCm != null ? activePeriod.rowSpacingCm.toFixed(1) : null} />
                                <Field label={t('parcels.col.sowing', { defaultValue: 'Sowing date' })} value={activePeriod?.sowingDate ?? null} />
                                <Field label={t('parcels.col.harvest', { defaultValue: 'Harvest date' })} value={activePeriod?.harvestDate ?? null} />
                                <Field label={t('parcels.col.realizedYield', { defaultValue: 'Realized yield (t/ha)' })} value={activePeriod?.yieldRealizedTha != null ? activePeriod.yieldRealizedTha.toFixed(2) : null} />
                            </Section>

                            {/* Exploitant & Admin */}
                            <Section title={t('parcels.detail.sectionAdmin', { defaultValue: 'Administrative' })}>
                                <Field label={t('parcels.col.exploitantCode', { defaultValue: 'Exploitant code' })} value={parcel.exploitantCode} />
                                <Field label={t('parcels.col.exploitantName', { defaultValue: 'Exploitant name' })} value={parcel.exploitantName} />
                                <Field label={t('parcels.col.status', { defaultValue: 'Eligibility status' })} value={activePeriod?.eligibilityStatus ?? null} />
                                <Field label={t('parcels.col.active', { defaultValue: 'Active' })} value={activePeriod?.active !== false ? t('common.yes', { defaultValue: 'Yes' }) : t('common.no', { defaultValue: 'No' })} />
                                {activePeriod?.startValidity && <Field label={t('parcels.col.startValidity', { defaultValue: 'Valid from' })} value={activePeriod.startValidity.substring(0, 10)} />}
                                {activePeriod?.endValidity && <Field label={t('parcels.col.endValidity', { defaultValue: 'Valid to' })} value={activePeriod.endValidity.substring(0, 10)} />}
                            </Section>

                            {/* Links */}
                            <Section title={t('parcels.detail.sectionLinks', { defaultValue: 'Links' })}>
                                <Field label={t('parcels.col.farmId', { defaultValue: 'Farm ID' })} value={parcel.farmId} />
                                <Field label={t('parcels.col.parentParcelId', { defaultValue: 'Parent parcel ID' })} value={parcel.parentParcelId} />
                                <Field label={t('parcels.col.importRecordId', { defaultValue: 'Import record ID' })} value={parcel.importRecordId} />
                            </Section>
                        </div>
                    )}
                    {parcel && managing && parcel.farmId != null && (
                        <ParcelPeriodManager
                            parcelId={String(parcel.id)}
                            parcelName={parcel.sourceName || parcel.name || `#${parcel.id}`}
                            farmId={parcel.farmId}
                            parcelPeriods={parcel.parcelPeriods ?? []}
                            onClose={() => setManaging(false)}
                            onChanged={() => setRefreshNonce(n => n + 1)}
                        />
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}
