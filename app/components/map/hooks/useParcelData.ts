import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { apiGet } from "~/utils/api";
import { parseWktCoords } from "../utils/mapUtils";
import type { PolygonData, MapContextType } from "../types";

const normalizeParentId = (value: unknown): string | null => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? String(n) : null;
};

interface UseParcelDataProps {
    contextType: MapContextType;
    isImportMode: boolean;
    resolvedContextId: string | number;
    hasActiveSearchFilters: boolean;
    viewportEndpoint: string | null;
    searchEndpoint: string;
    setPolygons: Dispatch<SetStateAction<PolygonData[]>>;
    setAllPolygons: Dispatch<SetStateAction<PolygonData[]>>;
    t: (key: string, opts?: any) => string;
}

export function useParcelData(props: UseParcelDataProps) {
    const {
        contextType, isImportMode, resolvedContextId,
        hasActiveSearchFilters, viewportEndpoint, searchEndpoint,
        setPolygons, setAllPolygons, t,
    } = props;

    useEffect(() => {
        const useViewport = contextType === 'farm' && !isImportMode && !hasActiveSearchFilters;
        if (useViewport && !viewportEndpoint) return;
        const endpoint = useViewport ? viewportEndpoint! : searchEndpoint;
        let cancelled = false;
        (async () => {
            try {
                const response = await apiGet(endpoint);
                if (cancelled || !response.ok) return;
                const data = await response.json();
                if (cancelled) return;
                const parsed: PolygonData[] = data.map((p: any) => ({
                    id: String(p.id), name: p.name || t('map.unnamedParcel'), coords: p.geodata ? parseWktCoords(p.geodata) : [],
                    visible: true, version: 0, color: p.color || '#3388ff', canEdit: p.canEdit ?? true, canShare: p.canShare ?? false,
                    active: p.active, startValidity: p.startValidity, endValidity: p.endValidity, farmId: p.farmId, periodId: p.periodId ?? null, validationStatus: p.validationStatus, convertedParcelId: p.convertedParcelId ?? null,
                    parentId: normalizeParentId(p.parentParcelId),
                }));
                setPolygons(parsed);
                setAllPolygons(prev => {
                    const m = new Map(prev.map(i => [i.id, i]));
                    parsed.forEach(i => m.set(i.id, { ...m.get(i.id), ...i }));
                    return Array.from(m.values());
                });
            } catch (err) {
                if (!cancelled) console.error('fetch polygons failed', err);
            }
        })();
        return () => { cancelled = true; };
    }, [contextType, isImportMode, hasActiveSearchFilters, viewportEndpoint, searchEndpoint, setPolygons, setAllPolygons, t]);

    useEffect(() => {
        if (contextType !== 'farm' || !resolvedContextId || isImportMode) return;
        let cancelled = false;
        (async () => {
            try {
                const response = await apiGet(`/farm/${resolvedContextId}/parcels/all`);
                if (cancelled || !response.ok) return;
                const data = await response.json();
                if (cancelled) return;
                const parsed: PolygonData[] = data.map((p: any) => ({
                    id: String(p.id),
                    name: p.name || t('map.unnamedParcel'),
                    coords: [],
                    visible: true,
                    version: 0,
                    color: p.color || '#3388ff',
                    active: p.active,
                    farmId: p.farmId,
                    periodId: p.periodId ?? null,
                    validationStatus: p.validationStatus,
                    convertedParcelId: p.convertedParcelId ?? null,
                    parentId: normalizeParentId(p.parentParcelId),
                }));
                // viewport rows have coords so keep them and only fill missing parcels
                setAllPolygons(prev => {
                    const m = new Map(prev.map(i => [i.id, i]));
                    for (const i of parsed) {
                        const existing = m.get(i.id);
                        m.set(i.id, existing ? { ...i, ...existing } : i);
                    }
                    return Array.from(m.values());
                });
            } catch (err) {
                if (!cancelled) console.error('fetch all parcels failed', err);
            }
        })();
        return () => { cancelled = true; };
    }, [contextType, resolvedContextId, isImportMode, setAllPolygons, t]);
}
