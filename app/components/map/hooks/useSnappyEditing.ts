import { useCallback, useRef } from 'react';
import L from 'leaflet';
import { isPointInOrOnPolygon, fixOverlap, magnetSnap, getClosestPointOnPolygon } from '../utils/geometry';
import type { PolygonData } from '../types';

export interface UseSnappyEditingProps {
    polygons: PolygonData[];
    getMap: () => L.Map | null;
}

export interface SnapOptions {
    edgeSnap?: boolean;
}

export interface GhostOptions {
    edgeSnap?: boolean;
    autoCorrect?: boolean;
}

export function getAncestorIds(parentId: string | null | undefined, polygons: PolygonData[]): string[] {
    const ancestors: string[] = [];
    let currentId = parentId;
    while (currentId) {
        ancestors.push(currentId);
        const parent = polygons.find(p => p.id === currentId);
        currentId = parent?.parentId;
    }
    return ancestors;
}

export function getDescendantIds(parentId: string, polygons: PolygonData[]): string[] {
    const descendants: string[] = [];
    const children = polygons.filter(p => p.parentId === parentId);
    for (const child of children) {
        descendants.push(child.id);
        descendants.push(...getDescendantIds(child.id, polygons));
    }
    return descendants;
}

function getSnapObstacles(
    polygons: PolygonData[],
    parentId: string | null | undefined,
    skipId?: string | null
): PolygonData[] {
    const ancestorIds = getAncestorIds(parentId, polygons);

    return polygons.filter(p => {
        if (!p.visible) return false;
        if (skipId && p.id === skipId) return false;
        if (ancestorIds.includes(p.id)) return false;
        return true;
    });
}

function pushPointOutsidePolygon(point: [number, number], polygon: [number, number][], baseEpsilon = 1e-6): [number, number] {
    const edge = getClosestPointOnPolygon(point, polygon);

    const centroid = polygon.reduce<[number, number]>(
        (acc, p) => [acc[0] + p[0], acc[1] + p[1]],
        [0, 0]
    );
    centroid[0] /= polygon.length || 1;
    centroid[1] /= polygon.length || 1;

    // Preferred outward direction: from polygon centroid toward nearest edge point.
    let dy = edge[0] - centroid[0];
    let dx = edge[1] - centroid[1];
    let norm = Math.hypot(dy, dx);

    // Fallback direction if centroid and edge are too close.
    if (norm < 1e-12) {
        dy = edge[0] - point[0];
        dx = edge[1] - point[1];
        norm = Math.hypot(dy, dx);
    }
    if (norm < 1e-12) {
        dy = 1;
        dx = 0;
        norm = 1;
    }

    const uy = dy / norm;
    const ux = dx / norm;

    for (let i = 0; i < 6; i++) {
        const eps = baseEpsilon * Math.pow(2, i);
        const candidate: [number, number] = [edge[0] + uy * eps, edge[1] + ux * eps];
        if (!isPointInOrOnPolygon(candidate, polygon)) {
            return candidate;
        }
    }

    return edge;
}

export function snapLatLng(
    latlng: L.LatLng,
    polygons: PolygonData[],
    parentId: string | null | undefined,
    map: L.Map,
    skipId?: string | null,
    options?: SnapOptions
): L.LatLng {
    const coords: [number, number] = [latlng.lat, latlng.lng];
    
    // 0. calculate threshold based on zoom
    const latPerPixel = (map.getBounds().getNorth() - map.getBounds().getSouth()) / map.getSize().y;
    const threshold = latPerPixel * 25;
    const edgeSnap = options?.edgeSnap ?? true;

    const pStr = parentId ? String(parentId) : null;
    const parentParcel = pStr ? polygons.find(p => String(p.id) === pStr) : null;

    // 1. magnet snap to nearby parcel edges + parent edge
    const obstacles = getSnapObstacles(polygons, parentId, skipId);
    const snapCandidates = obstacles.map(p => p.coords);
    if (parentParcel) {
        snapCandidates.push(parentParcel.coords);
    }
    let result = edgeSnap ? magnetSnap(coords, snapCandidates, threshold) : coords;

    // 2. parent constraint: MUST be inside or on edge
    if (parentParcel) {
        if (!isPointInOrOnPolygon(result, parentParcel.coords)) {
            result = getClosestPointOnPolygon(result, parentParcel.coords);
        }
    }

    // 3. obstacle avoidance: keep outside all relevant parcels
    let didMove = true;
    let attempts = 0;
    while (didMove && attempts < 5) {
        didMove = false;
        for (const obstacle of obstacles) {
            // Keep snapped point strictly outside obstacles (not inside and not on boundary).
            if (isPointInOrOnPolygon(result, obstacle.coords)) {
                result = pushPointOutsidePolygon(result, obstacle.coords);
                didMove = true;
            }
        }
        attempts++;
    }

    // 4. FINAL parent re-check: parent boundary is authoritative
    if (parentParcel) {
        if (!isPointInOrOnPolygon(result, parentParcel.coords)) {
            result = getClosestPointOnPolygon(result, parentParcel.coords);
        }
    }

    // always return the computed result, never the original
    // returning latlng for "small moves" caused blinking when cursor sat on a vertex
    return L.latLng(result[0], result[1]);
}

export function useSnappyEditing({ polygons, getMap }: UseSnappyEditingProps) {
    const ghostLayerRef = useRef<L.Polygon | L.Polyline | null>(null);
    const previewMarkerRef = useRef<L.CircleMarker | null>(null);

    // lazily create the preview marker when needed
    const ensurePreviewMarker = useCallback((map: L.Map): L.CircleMarker => {
        if (!previewMarkerRef.current) {
            previewMarkerRef.current = L.circleMarker([0, 0], {
                radius: 6,
                color: '#2563eb',
                fillColor: '#2563eb',
                fillOpacity: 0.7,
                weight: 3,
                className: 'snap-preview-dot',
                interactive: false,
                pane: 'markerPane'
            });
        }
        return previewMarkerRef.current;
    }, []);

    const updateGhost = useCallback((coords: [number, number][], parentId?: string | null, ignoreIds: string[] = [], options?: GhostOptions) => {
        const map = getMap();
        if (!map || coords.length < 1) return coords;

        if (ghostLayerRef.current) {
            ghostLayerRef.current.remove();
            ghostLayerRef.current = null;
        }

        const edgeSnap = options?.edgeSnap ?? true;
        const autoCorrect = options?.autoCorrect ?? true;
        const activePolygons = polygons.filter(p => !ignoreIds.includes(p.id));
        
        let snappedCoords = coords.map(c => {
            const ll = snapLatLng(
                L.latLng(c[0], c[1]),
            activePolygons,
                parentId,
                map,
                undefined,
                { edgeSnap }
            );
            return [ll.lat, ll.lng] as [number, number];
        });

        if (snappedCoords.length < 3) {
            return snappedCoords;
        }

        // Universal Avoidance: avoid everything that is not an ancestor (container)
        const ancestorIds = getAncestorIds(parentId, activePolygons);
        const pStr = parentId ? String(parentId) : null;
        const parentParcel = pStr ? activePolygons.find(p => String(p.id) === pStr) : null;
        const obstacles = activePolygons.filter(p => !ancestorIds.includes(p.id));
        const fixed = autoCorrect
            ? fixOverlap(snappedCoords, obstacles, parentParcel?.coords)
            : snappedCoords;

        return fixed;
    }, [polygons, getMap]);

    const clearGhost = useCallback(() => {
        if (ghostLayerRef.current) {
            ghostLayerRef.current.remove();
            ghostLayerRef.current = null;
        }
        if (previewMarkerRef.current) {
            previewMarkerRef.current.remove();
        }
    }, []);

    const setSnapPreview = useCallback((pos: L.LatLng | null) => {
        const map = getMap();
        if (!map) return;

        if (pos) {
            const marker = ensurePreviewMarker(map);
            marker.setLatLng(pos);
            if (!map.hasLayer(marker)) marker.addTo(map);
            marker.bringToFront();
        } else if (previewMarkerRef.current) {
            previewMarkerRef.current.remove();
        }
    }, [getMap, ensurePreviewMarker]);

    return { updateGhost, clearGhost, ghostLayerRef, setSnapPreview };
}
