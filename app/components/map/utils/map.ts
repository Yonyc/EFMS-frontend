import L from "leaflet";
import type { ParcelSearchFilters } from "../types";

export const extractCoords = (layer: any): [number, number][] => {
    const raw = layer?.getLatLngs?.();
    if (!raw) return [];
    const ring = Array.isArray(raw) ? (Array.isArray(raw[0]) ? raw[0] : raw) : [raw];
    return ring.map((ll: any) => [ll.lat, ll.lng]);
};

export const coordsToWKT = (coords: [number, number][]): string => {
    if (!coords.length) return "";
    const wktCoords = coords.map(([lat, lng]) => `${lng} ${lat}`).join(', ');
    const firstCoord = coords[0];
    const lastCoord = coords[coords.length - 1];
    const needsClosing = firstCoord[0] !== lastCoord[0] || firstCoord[1] !== lastCoord[1];
    const closedWktCoords = needsClosing ? `${wktCoords}, ${firstCoord[1]} ${firstCoord[0]}` : wktCoords;
    return `POLYGON((${closedWktCoords}))`;
};

export const parseWktCoords = (wktInput?: string | null): [number, number][] => {
    if (!wktInput) return [];
    const wkt = wktInput.trim();
    const polygonMatch = wkt.match(/POLYGON\s*\(\s*\(\s*([^)]*?)\s*\)\s*/i);
    const multiPolygonMatch = wkt.match(/MULTIPOLYGON\s*\(\s*\(\s*\(\s*([^)]*?)\s*\)\s*/i);
    const coordsSource = polygonMatch?.[1] ?? multiPolygonMatch?.[1];
    
    if (!coordsSource) return [];

    return coordsSource
        .split(',')
        .map((pair) => pair.replace(/[()]/g, '').trim())
        .map((pair) => {
            const [lngStr, latStr] = pair.split(/\s+/).filter(Boolean);
            const lng = Number(lngStr);
            const lat = Number(latStr);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                return [lat, lng] as [number, number];
            }
            return null;
        })
        .filter((val): val is [number, number] => Array.isArray(val));
};

export const toWktPolygon = (coords: [number, number][]) => {
    if (coords.length < 3) return null;
    const ring = coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
        ? coords
        : [...coords, coords[0]];
    const points = ring.map(([lat, lng]) => `${lng} ${lat}`).join(', ');
    return `POLYGON((${points}))`;
};

export const clampToViewport = (left: number, top: number, width: number, height: number, padding: number) => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : width;
    const vh = typeof window !== 'undefined' ? window.innerHeight : height;
    const x = Math.max(padding, Math.min(left, vw - width - padding));
    const y = Math.max(padding, Math.min(top, vh - height - padding));
    return { x, y };
};

export const clampToRect = (left: number, top: number, width: number, height: number, rect: DOMRect, padding: number) => {
    const x = Math.max(rect.left + padding, Math.min(left, rect.right - width - padding));
    const y = Math.max(rect.top + padding, Math.min(top, rect.bottom - height - padding));
    return { x, y };
};

export const hasActiveSearchFilters = (appliedFilters: ParcelSearchFilters) => (
    Boolean(appliedFilters.periodId) ||
    Boolean(appliedFilters.toolId) ||
    Boolean(appliedFilters.productId) ||
    Boolean(appliedFilters.startDate) ||
    Boolean(appliedFilters.endDate) ||
    appliedFilters.useMapArea ||
    appliedFilters.usePolygon
);
