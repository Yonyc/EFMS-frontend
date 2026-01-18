import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "~/components/ProtectedRoute";
import { apiGet, apiPost } from "~/utils/api";
import { buildLocalizedPath } from "~/utils/locale";
import { useCurrentLocale } from "~/hooks/useCurrentLocale";

interface ImportGroupDetail {
    id: string;
    name: string;
    createdAt?: string;
    polygonsCount?: number;
    status?: string;
}

type MapComponentType = ComponentType<any> | null;

export default function ImportMapPage() {
    const { t } = useTranslation();
    const [MapComponent, setMapComponent] = useState<MapComponentType>(null);
    const [params] = useSearchParams();
    const [importInfo, setImportInfo] = useState<ImportGroupDetail | null>(null);
    const [loadingInfo, setLoadingInfo] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isApproving, setIsApproving] = useState(false);
    const [approveFeedback, setApproveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const locale = useCurrentLocale();

    const importId = useMemo(() => params.get('list') || '', [params]);

    useEffect(() => {
        let active = true;
        import("../components/map/MapWithPolygons.client").then((mod) => {
            if (active) {
                setMapComponent(() => mod.default);
            }
        });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!importId) return;
        let active = true;
        setLoadingInfo(true);
        (async () => {
            try {
                const response = await apiGet(`/imports/${importId}/parcels`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch import batch: ${response.statusText}`);
                }
                const payload = await response.json();
                if (active) {
                    setImportInfo(payload);
                    setError(null);
                }
            } catch (err) {
                console.error(err);
                if (active) {
                    setError(t('imports.map.loadError', { defaultValue: 'Failed to load import details' }));
                }
            } finally {
                active && setLoadingInfo(false);
            }
        })();
        return () => {
            active = false;
        };
    }, [importId, t]);

    const handleApproveAll = useCallback(async () => {
        if (!importId) return;
        setIsApproving(true);
        setApproveFeedback(null);
        try {
            const response = await apiPost(`/imports/${importId}/approve`);
            if (!response.ok) {
                throw new Error('Approve request failed');
            }
            setApproveFeedback({ type: 'success', message: t('imports.map.approveSuccess', { defaultValue: 'Import list approved successfully.' }) });
        } catch (err) {
            console.error(err);
            setApproveFeedback({ type: 'error', message: t('imports.map.approveError', { defaultValue: 'Unable to approve import list.' }) });
        } finally {
            setIsApproving(false);
        }
    }, [importId]);

    if (!importId) {
        return (
            <ProtectedRoute>
                <div className="mx-auto max-w-3xl px-4 py-16 text-center">
                    <p className="text-2xl font-semibold text-slate-900">{t('imports.map.noSelectionTitle', { defaultValue: 'Select an import batch' })}</p>
                    <p className="mt-2 text-slate-500">{t('imports.map.noSelectionDescription', { defaultValue: 'Choose a batch from the imports list to start validating polygons.' })}</p>
                    <div className="mt-6">
                        <Link
                            to={buildLocalizedPath(locale, '/imports')}
                            className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
                        >
                            {t('imports.map.returnToList', { defaultValue: 'Back to imports' })}
                        </Link>
                    </div>
                </div>
            </ProtectedRoute>
        );
    }

    return (
        <ProtectedRoute>
            <div className="flex h-screen flex-col">
                <div className="border-b border-slate-200 bg-white/90 px-6 py-4 shadow-sm">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-wide text-indigo-600">{t('imports.map.title', { defaultValue: 'Import validation' })}</p>
                            <h1 className="text-2xl font-semibold text-slate-900">{importInfo?.name || t('imports.list.untitled', { defaultValue: 'Untitled batch' })}</h1>
                            <p className="text-sm text-slate-500">
                                {loadingInfo
                                    ? t('imports.map.loadingDetails', { defaultValue: 'Loading batch details...' })
                                    : importInfo?.polygonsCount != null
                                        ? t('imports.map.polygonsCount', { count: importInfo.polygonsCount, defaultValue: '{{count}} polygons ready for review' })
                                        : t('imports.map.instructions', { defaultValue: 'Adjust polygons, then approve the list to import it.' })}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col items-end gap-1">
                                <button
                                    type="button"
                                    onClick={handleApproveAll}
                                    disabled={isApproving}
                                    className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow transition ${isApproving ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                                >
                                    {t('imports.map.approveButton', { defaultValue: 'Approve import list' })}
                                </button>
                                {approveFeedback && (
                                    <span className={`text-xs font-medium ${approveFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {approveFeedback.message}
                                    </span>
                                )}
                            </div>
                            <Link
                                to={buildLocalizedPath(locale, '/imports')}
                                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300"
                            >
                                {t('imports.map.returnToList', { defaultValue: 'Back to imports' })}
                            </Link>
                        </div>
                    </div>
                    {error && (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                            {error}
                        </div>
                    )}
                </div>
                <div style={{ display: "flex", height: "100vh", width: "100%" }}>
                    {MapComponent ? (
                        <MapComponent
                            key={importId}
                            contextId={importId}
                            contextType="import"
                            allowCreate
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center text-slate-500">
                            {t('imports.map.loadingMap', { defaultValue: 'Loading map...' })}
                        </div>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}
