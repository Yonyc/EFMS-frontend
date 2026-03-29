import { useState, useCallback, useMemo, useRef } from "react";
import L from "leaflet";
import type { ParcelSearchFilters } from "../types";
import { toWktPolygon } from "../utils/mapUtils";

interface UseParcelSearchProps {
    parcelsEndpoint: string;
    contextType: string;
    isImportMode: boolean;
    getMap: () => L.Map | null;
    defaultSearchFilters: ParcelSearchFilters;
}

export function useParcelSearch({
    parcelsEndpoint, contextType, isImportMode, getMap, defaultSearchFilters
}: UseParcelSearchProps) {
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchDraft, setSearchDraft] = useState<ParcelSearchFilters>(defaultSearchFilters);
    const [appliedFilters, setAppliedFilters] = useState<ParcelSearchFilters>(defaultSearchFilters);
    const [appliedBounds, setAppliedBounds] = useState<{ minLat: number; minLng: number; maxLat: number; maxLng: number } | null>(null);
    const [searchAreaCoords, setSearchAreaCoords] = useState<[number, number][]>([]);
    const [isSearchDrawing, setIsSearchDrawing] = useState(false);
    const [appliedPolygonWkt, setAppliedPolygonWkt] = useState<string | null>(null);
    const [viewportBounds, setViewportBounds] = useState<{ minLat: number; minLng: number; maxLat: number; maxLng: number } | null>(null);

    const searchDrawHandlerRef = useRef<any>(null);
    const searchAreaLayerRef = useRef<L.Polygon | null>(null);

    const hasActiveSearchFilters = useMemo(() => (
        Boolean(appliedFilters.periodId) ||
        Boolean(appliedFilters.operationTypeId) ||
        Boolean(appliedFilters.toolId) ||
        Boolean(appliedFilters.productId) ||
        Boolean(appliedFilters.startDate) ||
        Boolean(appliedFilters.endDate) ||
        appliedFilters.useMapArea ||
        appliedFilters.usePolygon
    ), [appliedFilters]);

    const searchEndpoint = useMemo(() => {
        if (!hasActiveSearchFilters) {
            return parcelsEndpoint;
        }
        const params = new URLSearchParams();
        if (appliedFilters.periodId) params.set('periodId', appliedFilters.periodId);
        if (appliedFilters.operationTypeId) params.set('operationTypeId', appliedFilters.operationTypeId);
        if (appliedFilters.toolId) params.set('toolId', appliedFilters.toolId);
        if (appliedFilters.productId) params.set('productId', appliedFilters.productId);
        if (appliedFilters.startDate) params.set('startDate', appliedFilters.startDate);
        if (appliedFilters.endDate) params.set('endDate', appliedFilters.endDate);
        if (appliedFilters.usePolygon && appliedPolygonWkt) params.set('polygonWkt', appliedPolygonWkt);
        if (appliedFilters.useMapArea && appliedBounds) {
            params.set('minLat', String(appliedBounds.minLat));
            params.set('minLng', String(appliedBounds.minLng));
            params.set('maxLat', String(appliedBounds.maxLat));
            params.set('maxLng', String(appliedBounds.maxLng));
        }
        const query = params.toString();
        return `${parcelsEndpoint}/search${query ? `?${query}` : ''}`;
    }, [appliedBounds, appliedFilters, appliedPolygonWkt, hasActiveSearchFilters, parcelsEndpoint]);

    const viewportEndpoint = useMemo(() => {
        if (!viewportBounds || contextType !== 'farm' || isImportMode || hasActiveSearchFilters) return null;
        const params = new URLSearchParams({
            minLat: String(viewportBounds.minLat),
            minLng: String(viewportBounds.minLng),
            maxLat: String(viewportBounds.maxLat),
            maxLng: String(viewportBounds.maxLng),
        });
        return `${parcelsEndpoint}/viewport?${params.toString()}`;
    }, [contextType, hasActiveSearchFilters, isImportMode, parcelsEndpoint, viewportBounds]);

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
        setIsSearchOpen(false);
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
        applySearchFilters, clearSearchFilters,
        startSearchPolygon, cancelSearchPolygon, clearSearchPolygon,
        handleSearchCreated, searchAreaLayerRef
    };
}
