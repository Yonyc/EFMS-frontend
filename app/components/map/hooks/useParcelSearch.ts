import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import L from "leaflet";
import type { ParcelSearchFilters } from "../types";
import { toWktPolygon } from "../utils/mapUtils";

interface UseParcelSearchProps {
    parcelsEndpoint: string;
    contextType: string;
    isImportMode: boolean;
    getMap: () => L.Map | null;
    defaultSearchFilters: ParcelSearchFilters;
    initialSharePayload?: any;
    defaultPeriodId?: string;
}

export function useParcelSearch({
    parcelsEndpoint, contextType, isImportMode, getMap, defaultSearchFilters, initialSharePayload, defaultPeriodId
}: UseParcelSearchProps) {
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchDraft, setSearchDraft] = useState<ParcelSearchFilters>(defaultSearchFilters);
    const [appliedFilters, setAppliedFilters] = useState<ParcelSearchFilters>(defaultSearchFilters);
    const [appliedBounds, setAppliedBounds] = useState<{ minLat: number; minLng: number; maxLat: number; maxLng: number } | null>(null);
    const [searchAreaCoords, setSearchAreaCoords] = useState<[number, number][]>(() => {
        if (!initialSharePayload?.zoneWkt) return [];
        try {
            const wkt = initialSharePayload.zoneWkt.trim();
            const coordsSource = wkt.match(/POLYGON\s*\(\s*\(\s*([^)]*?)\s*\)\s*/i)?.[1] ??
                wkt.match(/MULTIPOLYGON\s*\(\s*\(\s*\(\s*([^)]*?)\s*\)\s*/i)?.[1];
            if (!coordsSource) return [];
            return coordsSource.split(',').map((pair: string) => pair.replace(/[()]/g, '').trim()).map((pair: string) => {
                const [lngStr, latStr] = pair.split(/\s+/).filter(Boolean);
                const lng = Number(lngStr);
                const lat = Number(latStr);
                if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng] as [number, number];
                return null;
            }).filter((val: any): val is [number, number] => Array.isArray(val));
        } catch { return []; }
    });
    const [isSearchDrawing, setIsSearchDrawing] = useState(false);
    const [appliedPolygonWkt, setAppliedPolygonWkt] = useState<string | null>(initialSharePayload?.zoneWkt || null);
    const [viewportBounds, setViewportBounds] = useState<{ minLat: number; minLng: number; maxLat: number; maxLng: number } | null>(null);

    const searchDrawHandlerRef = useRef<any>(null);
    const searchAreaLayerRef = useRef<L.Polygon | null>(null);

    const hasActiveSearchFilters = useMemo(() => (
        (appliedFilters.operationTypeIds && appliedFilters.operationTypeIds.length > 0) ||
        (appliedFilters.toolIds && appliedFilters.toolIds.length > 0) ||
        (appliedFilters.productIds && appliedFilters.productIds.length > 0) ||
        Boolean(appliedFilters.startDate) ||
        Boolean(appliedFilters.endDate) ||
        appliedFilters.usePolygon
    ), [appliedFilters]);

    const searchEndpoint = useMemo(() => {
        if (!hasActiveSearchFilters) {
            return parcelsEndpoint;
        }
        const params = new URLSearchParams();
        if (appliedFilters.periodIds) appliedFilters.periodIds.forEach(id => params.append('periodIds', id));
        if (appliedFilters.operationTypeIds) appliedFilters.operationTypeIds.forEach(id => params.append('operationTypeIds', id));
        if (appliedFilters.toolIds) appliedFilters.toolIds.forEach(id => params.append('toolIds', id));
        if (appliedFilters.productIds) appliedFilters.productIds.forEach(id => params.append('productIds', id));
        if (appliedFilters.startDate) params.set('startDate', appliedFilters.startDate);
        if (appliedFilters.endDate) params.set('endDate', appliedFilters.endDate);
        if (appliedFilters.usePolygon && appliedPolygonWkt) {
            params.set('polygonWkt', appliedPolygonWkt);
        } else if (viewportBounds) {
            // Merge viewport + search: bound the filtered results to the current view and refetch
            // as the user pans/zooms, so the map stays dynamically loaded even with filters active.
            params.set('minLat', String(viewportBounds.minLat));
            params.set('minLng', String(viewportBounds.minLng));
            params.set('maxLat', String(viewportBounds.maxLat));
            params.set('maxLng', String(viewportBounds.maxLng));
        }
        // Shared users scope the search to a single share's envelope (server enforces it).
        if (appliedFilters.selectedShareId) params.set('shareId', appliedFilters.selectedShareId);
        const query = params.toString();
        return `${parcelsEndpoint}/search${query ? `?${query}` : ''}`;
    }, [appliedFilters, appliedPolygonWkt, hasActiveSearchFilters, parcelsEndpoint, viewportBounds]);

    const viewportEndpoint = useMemo(() => {
        if (!viewportBounds || contextType !== 'farm' || isImportMode || hasActiveSearchFilters) return null;
        const params = new URLSearchParams({
            minLat: String(viewportBounds.minLat),
            minLng: String(viewportBounds.minLng),
            maxLat: String(viewportBounds.maxLat),
            maxLng: String(viewportBounds.maxLng),
        });
        if (appliedFilters.periodIds) appliedFilters.periodIds.forEach(id => params.append('periodIds', id));
        // Shared users: scope the viewport to a single share's envelope (server enforces periods too).
        if (appliedFilters.selectedShareId) params.set('shareId', appliedFilters.selectedShareId);
        return `${parcelsEndpoint}/viewport?${params.toString()}`;
    }, [contextType, hasActiveSearchFilters, isImportMode, parcelsEndpoint, viewportBounds, appliedFilters.periodIds, appliedFilters.selectedShareId]);

    const seededPeriodRef = useRef<string | null>(null);
    useEffect(() => {
        if (!defaultPeriodId) return;
        if (seededPeriodRef.current === parcelsEndpoint) return;
        seededPeriodRef.current = parcelsEndpoint;
        setSearchDraft(prev => ({ ...prev, periodIds: [defaultPeriodId] }));
        setAppliedFilters(prev => ({ ...prev, periodIds: [defaultPeriodId] }));
    }, [defaultPeriodId, parcelsEndpoint]);

    const setPeriodFilter = useCallback((ids: string[]) => {
        setSearchDraft(prev => ({ ...prev, periodIds: ids }));
        setAppliedFilters(prev => ({ ...prev, periodIds: ids }));
    }, []);

    const applySearchFilters = useCallback(() => {
        setAppliedFilters(searchDraft);
        if (searchDraft.usePolygon) {
            setAppliedPolygonWkt(toWktPolygon(searchAreaCoords));
        } else {
            setAppliedPolygonWkt(null);
        }
        if (searchDraft.useMapArea) {
            const map = getMap();
            if (map?.getBounds) {
                const bounds = map.getBounds();
                const southWest = bounds.getSouthWest();
                const northEast = bounds.getNorthEast();
                setAppliedBounds({
                    minLat: southWest.lat,
                    minLng: southWest.lng,
                    maxLat: northEast.lat,
                    maxLng: northEast.lng,
                });
            } else {
                setAppliedBounds(null);
            }
        } else {
            setAppliedBounds(null);
        }
        // Keep the filter panel open after applying so the user can review results and export
        // without re-opening it.
    }, [searchAreaCoords, searchDraft, getMap]);

    const clearSearchFilters = useCallback(() => {
        setSearchDraft(defaultSearchFilters);
        setAppliedFilters(defaultSearchFilters);
        setAppliedBounds(null);
        setAppliedPolygonWkt(null);
        setSearchAreaCoords([]);
        const map = getMap();
        if (map && searchAreaLayerRef.current) {
            map.removeLayer(searchAreaLayerRef.current);
            searchAreaLayerRef.current = null;
        }
        setIsSearchOpen(false);
    }, [defaultSearchFilters, getMap]);

    const startSearchPolygon = useCallback((isCreating: boolean, editingId: string | null) => {
        if (isCreating || editingId) return;
        const map = getMap();
        const handler = map && (L as any).Draw?.Polygon ? new (L as any).Draw.Polygon(map, { allowIntersection: false, showArea: false }) : null;
        if (!handler) return;
        handler.enable();
        searchDrawHandlerRef.current = handler;
        setIsSearchDrawing(true);
    }, [getMap]);

    const cancelSearchPolygon = useCallback(() => {
        searchDrawHandlerRef.current?.disable?.();
        searchDrawHandlerRef.current = null;
        setIsSearchDrawing(false);
    }, []);

    const clearSearchPolygon = useCallback(() => {
        setSearchAreaCoords([]);
        const map = getMap();
        if (map && searchAreaLayerRef.current) {
            map.removeLayer(searchAreaLayerRef.current);
            searchAreaLayerRef.current = null;
        }
        setSearchDraft(prev => ({ ...prev, usePolygon: false }));
    }, [getMap]);

    const handleSearchCreated = useCallback((layer: any) => {
        const coords = layer.getLatLngs()[0].map((ll: L.LatLng) => [ll.lat, ll.lng]) as [number, number][];
        const map = getMap();
        if (map) {
            if (searchAreaLayerRef.current) {
                map.removeLayer(searchAreaLayerRef.current);
            }
            layer.setStyle?.({ color: '#f97316', weight: 2, fillOpacity: 0.08, dashArray: '6 6' });
            layer.addTo(map);
            searchAreaLayerRef.current = layer;
        }
        setSearchAreaCoords(coords);
        setIsSearchDrawing(false);
        searchDrawHandlerRef.current?.disable?.();
        searchDrawHandlerRef.current = null;
        setSearchDraft(prev => ({ ...prev, usePolygon: true }));
    }, [getMap]);

    return {
        isSearchOpen, setIsSearchOpen,
        searchDraft, setSearchDraft,
        appliedFilters, setAppliedFilters,
        appliedBounds, setAppliedBounds,
        searchAreaCoords, setSearchAreaCoords,
        isSearchDrawing, setIsSearchDrawing,
        appliedPolygonWkt, setAppliedPolygonWkt,
        viewportBounds, setViewportBounds,
        hasActiveSearchFilters, searchEndpoint, viewportEndpoint,
        setPeriodFilter,
        applySearchFilters, clearSearchFilters,
        startSearchPolygon, cancelSearchPolygon, clearSearchPolygon,
        handleSearchCreated, searchAreaLayerRef
    };
}
