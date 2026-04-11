import { useState, useCallback, useRef, useEffect } from "react";
import L from "leaflet";
import { snapLatLng, getAncestorIds, getDescendantIds } from "./useSnappyEditing";
import { checkOverlap, isPointInOrOnPolygon, isPointInPolygon, doEdgesIntersect, getClosestPointOnPolygon } from "../utils/geometry";
import { coordsToWKT } from "../utils/mapUtils";
import type { PolygonData, EditState, OverlapWarning, ManualEditContext } from "../types";
import { apiDelete, apiPut, apiPatch } from "~/utils/api";

const normalizeParentParcelId = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
};

interface UsePolygonEditorProps {
    polygons: PolygonData[];
    setPolygons: React.Dispatch<React.SetStateAction<PolygonData[]>>;
    setAllPolygons: React.Dispatch<React.SetStateAction<PolygonData[]>>;
    parcelsEndpoint: string;
    contextType: string;
    getMap: () => L.Map | null;
    t: any;
    areaName: string;
    setAreaName: (val: string) => void;
    setModal: (val: { open: boolean; coords: [number, number][] | null }) => void;
    setRenamingId: (val: string | null) => void;
    setSelectedPeriodId: (val: string) => void;
    setRenameValue: (val: string) => void;
    setRenamePeriodId: (val: string) => void;
    selectedParentId: string | null;
    setSelectedParentId: (id: string | null) => void;
    updateGhost: (coords: [number, number][], parentId?: string | null, ignoreIds?: string[], options?: { edgeSnap?: boolean; autoCorrect?: boolean }) => [number, number][] | undefined;
    clearGhost: () => void;
    setSnapPreview: (pos: L.LatLng | null) => void;
}

export function usePolygonEditor({
    polygons, setPolygons, setAllPolygons, parcelsEndpoint, contextType, getMap, t, areaName, setAreaName, setModal, setRenamingId, setSelectedPeriodId, setRenameValue, setRenamePeriodId,
    selectedParentId, setSelectedParentId, updateGhost, clearGhost, setSnapPreview
}: UsePolygonEditorProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [createPointCount, setCreatePointCount] = useState(0);
    const [overlapWarning, setOverlapWarning] = useState<OverlapWarning | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [pendingManualEditId, setPendingManualEditId] = useState<string | null>(null);
    const [manualEditContext, setManualEditContext] = useState<ManualEditContext | null>(null);
    const [previewVisibility, setPreviewVisibility] = useState<{ original: boolean; fixed: boolean }>({ original: false, fixed: true });

    const originalCoordsRef = useRef<Record<string, [number, number][]>>({});
    const editStateRef = useRef<EditState | null>(null);
    const createdLayerRef = useRef<any>(null);
    const createHandlerRef = useRef<any>(null);
    const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
    const [ghostCoords, setGhostCoords] = useState<[number, number][]>([]);
    const [createPreviewPoint, setCreatePreviewPoint] = useState<[number, number] | null>(null);
    const [autoCorrectEnabled, setAutoCorrectEnabled] = useState(true);
    const [edgeSnapEnabled, setEdgeSnapEnabled] = useState(false);
    const [closeLoopMidpointEnabled, setCloseLoopMidpointEnabled] = useState(false);
    const [isHoveringSketchHandle, setIsHoveringSketchHandle] = useState(false);
    const suppressSketchClickUntilRef = useRef(0);
    const drawingPointsRef = useRef<[number, number][]>([]);
    const createPreviewPointRef = useRef<[number, number] | null>(null);
    const lastPreviewCursorRef = useRef<L.LatLng | null>(null);
    const edgeSnapEnabledRef = useRef(edgeSnapEnabled);
    const autoCorrectEnabledRef = useRef(autoCorrectEnabled);
    const closeLoopMidpointEnabledRef = useRef(closeLoopMidpointEnabled);
    const isHoveringSketchHandleRef = useRef(isHoveringSketchHandle);
    useEffect(() => { drawingPointsRef.current = drawingPoints; }, [drawingPoints]);
    useEffect(() => { createPreviewPointRef.current = createPreviewPoint; }, [createPreviewPoint]);
    useEffect(() => { edgeSnapEnabledRef.current = edgeSnapEnabled; }, [edgeSnapEnabled]);
    useEffect(() => { autoCorrectEnabledRef.current = autoCorrectEnabled; }, [autoCorrectEnabled]);
    useEffect(() => { closeLoopMidpointEnabledRef.current = closeLoopMidpointEnabled; }, [closeLoopMidpointEnabled]);
    useEffect(() => { isHoveringSketchHandleRef.current = isHoveringSketchHandle; }, [isHoveringSketchHandle]);

    const suppressSketchClickTemporarily = useCallback((ms: number = 320) => {
        suppressSketchClickUntilRef.current = Date.now() + ms;
    }, []);

    const isSketchClickSuppressed = useCallback(() => Date.now() < suppressSketchClickUntilRef.current, []);

    const commitDrawingPoints = useCallback((next: [number, number][]) => {
        drawingPointsRef.current = next;
        setDrawingPoints(next);
    }, []);

    const requestPreviewRecompute = useCallback(() => {
        const map = getMap();
        const last = lastPreviewCursorRef.current;
        if (!map || !last) return;
        if (!isCreating && !editingId) return;
        map.fire('mousemove', { latlng: last } as any);
    }, [editingId, getMap, isCreating]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Shift') return;
            if (edgeSnapEnabledRef.current) return;

            edgeSnapEnabledRef.current = true;
            setEdgeSnapEnabled(true);
            window.requestAnimationFrame(() => requestPreviewRecompute());
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key !== 'Shift') return;
            if (!edgeSnapEnabledRef.current) return;

            edgeSnapEnabledRef.current = false;
            setEdgeSnapEnabled(false);
            window.requestAnimationFrame(() => requestPreviewRecompute());
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, [requestPreviewRecompute]);

    const polygonsRef = useRef(polygons);
    const parentIdRef = useRef(selectedParentId);
    const updateGhostRef = useRef(updateGhost);
    const clearGhostRef = useRef(clearGhost);

    // sync refs
    polygonsRef.current = polygons;
    parentIdRef.current = selectedParentId;
    updateGhostRef.current = updateGhost;
    clearGhostRef.current = clearGhost;

    // LIVE GHOST DURING SKETCH (creation + editing)
    useEffect(() => {
        if (!isCreating && !editingId) return;

        if (drawingPoints.length === 0) {
            clearGhostRef.current();
            setGhostCoords([]);
            return;
        }

        if (drawingPoints.length < 3) {
            clearGhostRef.current();
            setGhostCoords(drawingPoints);
            return;
        }

        // While a handle is active, avoid expensive polygon fixing on every drag tick.
        if (isHoveringSketchHandleRef.current) {
            setGhostCoords(drawingPoints);
            return;
        }

        const activeParentId = editingId
            ? (polygonsRef.current.find(p => p.id === editingId)?.parentId ?? parentIdRef.current)
            : parentIdRef.current;
        const ignoreIds = editingId
            ? [editingId, ...getDescendantIds(editingId, polygonsRef.current)]
            : [];

        const result = updateGhostRef.current(drawingPoints, activeParentId, ignoreIds, {
            edgeSnap: false,
            autoCorrect: autoCorrectEnabledRef.current,
        });
        if (result) setGhostCoords(result);
    }, [drawingPoints, isCreating, editingId, autoCorrectEnabled, isHoveringSketchHandle]);

    const detectOverlaps = useCallback((
        id: string,
        coords: [number, number][],
        parentIdOverride?: string | null
    ): { id: string; name: string }[] => {
        const overlapping: { id: string; name: string }[] = [];
        const activeParentId = parentIdOverride !== undefined ? parentIdOverride : selectedParentId;
        const ancestors = getAncestorIds(activeParentId, polygons);
        const descendants = getDescendantIds(id, polygons);
        for (const poly of polygons) {
            if (poly.id === id || !poly.visible) continue;
            if (ancestors.includes(poly.id)) continue;
            if (descendants.includes(poly.id)) continue;
            if (checkOverlap(coords, poly.coords)) {
                overlapping.push({ id: poly.id, name: poly.name });
            }
        }
        return overlapping;
    }, [polygons, selectedParentId]);

    const updatePolygon = useCallback((id: string, coords: [number, number][], incrementVersion: boolean = true) => {
        const updater = (prev: PolygonData[]) => prev.map(p => p.id === id ? { ...p, coords, version: incrementVersion ? (p.version || 0) + 1 : p.version } : p);
        setPolygons(updater);
        setAllPolygons(updater);
    }, [setPolygons, setAllPolygons]);

    const getParentForSketch = useCallback((activeEditId?: string | null): string | null => {
        if (activeEditId) {
            return polygonsRef.current.find(p => p.id === activeEditId)?.parentId ?? parentIdRef.current;
        }
        return parentIdRef.current;
    }, []);

    const clampPointToParentBoundary = useCallback((
        point: [number, number],
        activeParentId?: string | null,
    ): [number, number] => {
        const pStr = activeParentId ? String(activeParentId) : null;
        if (!pStr) return point;

        const parentParcel = polygonsRef.current.find(p => String(p.id) === pStr);
        if (!parentParcel) return point;
        if (isPointInOrOnPolygon(point, parentParcel.coords)) return point;

        return getClosestPointOnPolygon(point, parentParcel.coords);
    }, []);

    const distanceToPolygonEdge = useCallback((point: [number, number], polygon: [number, number][]): number => {
        if (!polygon.length) return Infinity;
        const closest = getClosestPointOnPolygon(point, polygon);
        const lngScale = Math.cos(point[0] * Math.PI / 180) || 1;
        const dLat = point[0] - closest[0];
        const dLng = (point[1] - closest[1]) * lngScale;
        return Math.hypot(dLat, dLng);
    }, []);

    const pointDistanceSq = useCallback((a: [number, number], b: [number, number]): number => {
        const lngScale = Math.cos(((a[0] + b[0]) * 0.5) * Math.PI / 180) || 1;
        const dLat = a[0] - b[0];
        const dLng = (a[1] - b[1]) * lngScale;
        return dLat * dLat + dLng * dLng;
    }, []);

    const isPointAllowed = useCallback((point: [number, number], activeEditId?: string | null): boolean => {
        const parentForSketch = getParentForSketch(activeEditId);
        const ancestorIds = getAncestorIds(parentForSketch, polygonsRef.current);
        const descendantIds = activeEditId ? getDescendantIds(activeEditId, polygonsRef.current) : [];

        // Use fixed geographic epsilons so behavior is independent of zoom level.
        const FORBIDDEN_EDGE_EPS = 6e-7;
        const NO_SPACE_CLEARANCE_EPS = 2.4e-6;
        const NARROW_CORRIDOR_GAP_EPS = 4.0e-6;
        const PARENT_FORBIDDEN_GAP_EPS = 2.8e-6;
        const CORNER_VERTEX_EPS = 8e-7;
        const JUNCTION_VERTEX_EPS = 2.2e-6;

        const parentParcel = parentForSketch ? polygonsRef.current.find(p => String(p.id) === String(parentForSketch)) : undefined;
        if (parentParcel && !isPointInOrOnPolygon(point, parentParcel.coords)) {
            return false;
        }
        const parentEdgeDistance = parentParcel ? distanceToPolygonEdge(point, parentParcel.coords) : Number.POSITIVE_INFINITY;

        let forbiddenBoundaryTouchCount = 0;
        let nearbyForbiddenCount = 0;
        const forbiddenEdges: Array<{ polyCoords: [number, number][]; edgeDistance: number }> = [];

        for (const poly of polygonsRef.current) {
            if (!poly.visible) continue;
            if (activeEditId && poly.id === activeEditId) continue;
            if (ancestorIds.includes(poly.id)) continue;
            if (descendantIds.includes(poly.id)) continue;

            // Never allow points strictly inside forbidden parcels.
            if (isPointInPolygon(point, poly.coords)) return false;

            // Allow touching one forbidden boundary (needed for parent/child corner snaps),
            // but disallow touching two forbidden boundaries simultaneously (shared sibling borders).
            const edgeDistance = distanceToPolygonEdge(point, poly.coords);
            forbiddenEdges.push({ polyCoords: poly.coords, edgeDistance });
            if (edgeDistance < NO_SPACE_CLEARANCE_EPS) {
                nearbyForbiddenCount += 1;
            }
            if (edgeDistance < FORBIDDEN_EDGE_EPS) {
                forbiddenBoundaryTouchCount += 1;
            }
        }

        const junctionVertexEpsSq = JUNCTION_VERTEX_EPS * JUNCTION_VERTEX_EPS;
        const forbiddenVertexTouchCount = forbiddenEdges.reduce((acc, { polyCoords }) => {
            const touches = polyCoords.some(vertex => pointDistanceSq(point, vertex) <= junctionVertexEpsSq);
            return acc + (touches ? 1 : 0);
        }, 0);
        const touchesParentVertex = parentParcel
            ? parentParcel.coords.some(vertex => pointDistanceSq(point, vertex) <= junctionVertexEpsSq)
            : false;

        // Allow precise shared corners (two parcel vertices meeting, or parcel+parent vertex junction).
        if (forbiddenVertexTouchCount >= 2 || (forbiddenVertexTouchCount >= 1 && touchesParentVertex)) {
            return true;
        }

        const hasSharedForbiddenCornerException = (): boolean => {
            const nearForbiddenPolys = forbiddenEdges
                .filter(({ edgeDistance }) => edgeDistance < NO_SPACE_CLEARANCE_EPS)
                .map(({ polyCoords }) => polyCoords);

            if (nearForbiddenPolys.length < 2) return false;

            const cornerEpsSq = CORNER_VERTEX_EPS * CORNER_VERTEX_EPS;
            const sharedVertexEpsSq = (CORNER_VERTEX_EPS * 2.0) * (CORNER_VERTEX_EPS * 2.0);

            for (let i = 0; i < nearForbiddenPolys.length; i++) {
                for (let j = i + 1; j < nearForbiddenPolys.length; j++) {
                    const aCoords = nearForbiddenPolys[i];
                    const bCoords = nearForbiddenPolys[j];

                    for (const aVertex of aCoords) {
                        if (pointDistanceSq(point, aVertex) > cornerEpsSq) continue;
                        for (const bVertex of bCoords) {
                            if (pointDistanceSq(point, bVertex) > cornerEpsSq) continue;
                            if (pointDistanceSq(aVertex, bVertex) <= sharedVertexEpsSq) {
                                return true;
                            }
                        }
                    }
                }
            }

            return false;
        };

        if ((nearbyForbiddenCount >= 2 || forbiddenBoundaryTouchCount >= 2) && !hasSharedForbiddenCornerException()) {
            return false;
        }

        const hasParentSiblingCornerException = (): boolean => {
            if (!parentParcel) return false;
            if (parentEdgeDistance >= NO_SPACE_CLEARANCE_EPS) return false;

            const cornerEpsSq = CORNER_VERTEX_EPS * CORNER_VERTEX_EPS;
            for (const { polyCoords, edgeDistance } of forbiddenEdges) {
                if (edgeDistance >= NO_SPACE_CLEARANCE_EPS) continue;
                for (const vertex of polyCoords) {
                    if (pointDistanceSq(point, vertex) > cornerEpsSq) continue;
                    const vertexToParentEdge = distanceToPolygonEdge(vertex, parentParcel.coords);
                    if (vertexToParentEdge <= CORNER_VERTEX_EPS * 1.5) {
                        return true;
                    }
                }
            }
            return false;
        };

        const forbiddenEdgeDistances = forbiddenEdges.map(({ edgeDistance }) => edgeDistance);

        // Reject very narrow corridors between two forbidden polygons even when the point
        // is not exactly touching both edges due floating precision.
        if (forbiddenEdgeDistances.length >= 2) {
            const sorted = [...forbiddenEdgeDistances].sort((a, b) => a - b);
            if ((sorted[0] + sorted[1]) < NARROW_CORRIDOR_GAP_EPS) {
                if (!hasSharedForbiddenCornerException()) return false;
            }
        }

        // Reject no-space corridors between parent border and a forbidden sibling border.
        if (parentParcel && forbiddenEdgeDistances.length >= 1) {
            const nearestForbidden = Math.min(...forbiddenEdgeDistances);
            const nearParentBoundary = parentEdgeDistance < NO_SPACE_CLEARANCE_EPS;
            const nearForbiddenBoundary = nearestForbidden < NO_SPACE_CLEARANCE_EPS;
            if (nearParentBoundary && nearForbiddenBoundary && (parentEdgeDistance + nearestForbidden) < PARENT_FORBIDDEN_GAP_EPS) {
                if (!hasParentSiblingCornerException() && !hasSharedForbiddenCornerException()) return false;
            }
        }

        return true;
    }, [distanceToPolygonEdge, getParentForSketch, pointDistanceSq]);

    const getStrictSnapTarget = useCallback((
        latlng: L.LatLng,
        activeEditId?: string | null,
        options?: { forceEdgeSnap?: boolean; respectShift?: boolean },
    ): [number, number] => {
        const map = getMap();
        const parentForSketch = getParentForSketch(activeEditId);
        const ancestorIds = getAncestorIds(parentForSketch, polygonsRef.current);
        const descendantIds = activeEditId ? getDescendantIds(activeEditId, polygonsRef.current) : [];
        const parentParcel = parentForSketch
            ? polygonsRef.current.find(p => String(p.id) === String(parentForSketch))
            : undefined;

        let point: [number, number] = [latlng.lat, latlng.lng];

        // Parent clamp first: outside parent -> nearest parent border.
        if (parentParcel && !isPointInOrOnPolygon(point, parentParcel.coords)) {
            point = getClosestPointOnPolygon(point, parentParcel.coords);
        }

        const obstacles = polygonsRef.current.filter(poly => {
            if (!poly.visible) return false;
            if (activeEditId && poly.id === activeEditId) return false;
            if (ancestorIds.includes(poly.id)) return false;
            if (descendantIds.includes(poly.id)) return false;
            return true;
        });

        // Interior prevention: if snapped into forbidden polygon, push to its edge.
        for (let pass = 0; pass < 3; pass++) {
            let changed = false;
            for (const obstacle of obstacles) {
                if (!isPointInPolygon(point, obstacle.coords)) continue;
                point = getClosestPointOnPolygon(point, obstacle.coords);
                changed = true;
            }
            if (!changed) break;
        }

        // Edge magnet near forbidden borders: prefer nearest border in screen pixels.
        const shouldEdgeSnap = options?.forceEdgeSnap === true || ((options?.respectShift ?? true) && edgeSnapEnabledRef.current);
        if (map && shouldEdgeSnap) {
            const pointPx = map.latLngToLayerPoint(L.latLng(point[0], point[1]));

            // Vertex priority near corners: this matches expected corner snapping behavior.
            const VERTEX_SNAP_PX = 22;
            let bestVertex: [number, number] | null = null;
            let bestVertexDistPx = Number.POSITIVE_INFINITY;
            const considerVertexList = (coords: [number, number][]) => {
                for (const vertex of coords) {
                    const vPx = map.latLngToLayerPoint(L.latLng(vertex[0], vertex[1]));
                    const dPx = pointPx.distanceTo(vPx);
                    if (dPx < bestVertexDistPx) {
                        bestVertexDistPx = dPx;
                        bestVertex = vertex;
                    }
                }
            };
            if (parentParcel) considerVertexList(parentParcel.coords);
            for (const obstacle of obstacles) considerVertexList(obstacle.coords);

            if (bestVertex && bestVertexDistPx < VERTEX_SNAP_PX) {
                point = bestVertex;
                return point;
            }

            const SNAP_PX = 18;
            let bestSnap: [number, number] | null = null;
            let bestDistPx = Number.POSITIVE_INFINITY;

            for (const obstacle of obstacles) {
                const edgePoint = getClosestPointOnPolygon(point, obstacle.coords);
                const edgePx = map.latLngToLayerPoint(L.latLng(edgePoint[0], edgePoint[1]));
                const distPx = pointPx.distanceTo(edgePx);
                if (distPx < SNAP_PX && distPx < bestDistPx) {
                    bestDistPx = distPx;
                    bestSnap = edgePoint;
                }
            }

            if (bestSnap) point = bestSnap;
        }

        return point;
    }, [getMap, getParentForSketch]);

    const isSketchGeometryStructurallyAllowed = useCallback((candidateCoords: [number, number][], activeEditId?: string | null, strict: boolean = true): boolean => {
        if (candidateCoords.length < 3 || !strict) return true;

        const parentForSketch = getParentForSketch(activeEditId);
        const ancestorIds = getAncestorIds(parentForSketch, polygonsRef.current);
        const descendantIds = activeEditId ? getDescendantIds(activeEditId, polygonsRef.current) : [];
        const parentParcel = parentForSketch
            ? polygonsRef.current.find(p => String(p.id) === String(parentForSketch))
            : undefined;

        // If an edge crosses outside parent and re-enters, points-only checks miss it.
        if (parentParcel && doEdgesIntersect(candidateCoords, parentParcel.coords)) {
            return false;
        }

        for (const poly of polygonsRef.current) {
            if (!poly.visible) continue;
            if (activeEditId && poly.id === activeEditId) continue;
            if (ancestorIds.includes(poly.id)) continue;
            if (descendantIds.includes(poly.id)) continue;

            // Disallow any area/edge overlap.
            if (checkOverlap(candidateCoords, poly.coords)) {
                return false;
            }
        }

        return true;
    }, [getParentForSketch]);

    const isSketchGeometryAllowed = useCallback((candidateCoords: [number, number][], activeEditId?: string | null, strict: boolean = true): boolean => {
        if (candidateCoords.length === 0) return true;

        // Always enforce point-level containment first.
        if (candidateCoords.some(pt => !isPointAllowed(pt, activeEditId))) {
            return false;
        }

        return isSketchGeometryStructurallyAllowed(candidateCoords, activeEditId, strict);
    }, [isPointAllowed, isSketchGeometryStructurallyAllowed]);

    const isEditCandidateAllowed = useCallback((
        candidateCoords: [number, number][],
        changedPoint: [number, number],
        activeEditId?: string | null,
        strict: boolean = true,
    ): boolean => {
        // In edit mode, validate the point being moved/inserted strictly,
        // while allowing unchanged legacy points to remain until corrected.
        if (!isPointAllowed(changedPoint, activeEditId)) return false;
        return isSketchGeometryStructurallyAllowed(candidateCoords, activeEditId, strict);
    }, [isPointAllowed, isSketchGeometryStructurallyAllowed]);

    const resolveConstrainedLatLng = useCallback((
        latlng: L.LatLng,
        activeEditId?: string | null,
        fallbackPoint?: [number, number],
        options?: { respectShift?: boolean },
    ): L.LatLng => {
        const map = getMap();
        if (!map) return latlng;
        const parentForSketch = getParentForSketch(activeEditId);
        const skipId = activeEditId ?? undefined;
        const shouldEdgeSnap = !!options?.respectShift && edgeSnapEnabledRef.current;
        const constrained = snapLatLng(latlng, polygonsRef.current, parentForSketch, map, skipId, {
            edgeSnap: shouldEdgeSnap,
        });
        const strictTarget = getStrictSnapTarget(constrained, activeEditId, { respectShift: !!options?.respectShift });
        return L.latLng(strictTarget[0], strictTarget[1]);
    }, [getMap, getParentForSketch, getStrictSnapTarget]);

    const findNearestValidPoint = useCallback((
        target: [number, number],
        buildCandidate: (pt: [number, number]) => [number, number][],
        activeEditId?: string | null,
        fallbackPoint?: [number, number],
        strict: boolean = true
    ): [number, number] | null => {
        const distanceSq = (a: [number, number], b: [number, number]) => {
            const lngScale = Math.cos(((a[0] + b[0]) * 0.5) * Math.PI / 180) || 1;
            const dLat = a[0] - b[0];
            const dLng = (a[1] - b[1]) * lngScale;
            return dLat * dLat + dLng * dLng;
        };

        const search = (strictMode: boolean): [number, number] | null => {
            const isValid = (pt: [number, number]) => isSketchGeometryAllowed(buildCandidate(pt), activeEditId, strictMode);

            if (isValid(target)) return target;

            const map = getMap();
            if (map) {
                const basePoint = map.latLngToContainerPoint(L.latLng(target[0], target[1]));
                const angleCount = 24;
                for (let radiusPx = 3; radiusPx <= 220; radiusPx += 3) {
                    let ringBest: [number, number] | null = null;
                    let ringBestDist = Number.POSITIVE_INFINITY;
                    for (let a = 0; a < angleCount; a++) {
                        const angle = (2 * Math.PI * a) / angleCount;
                        const probePoint = L.point(
                            basePoint.x + Math.cos(angle) * radiusPx,
                            basePoint.y + Math.sin(angle) * radiusPx,
                        );
                        const ll = map.containerPointToLatLng(probePoint);
                        const candidate: [number, number] = [ll.lat, ll.lng];
                        if (!isValid(candidate)) continue;
                        const d2 = distanceSq(candidate, target);
                        if (d2 < ringBestDist) {
                            ringBestDist = d2;
                            ringBest = candidate;
                        }
                    }
                    if (ringBest) return ringBest;
                }
            } else {
                const latStep = 0.000004;
                const lngScale = Math.cos(target[0] * Math.PI / 180) || 1;
                const lngStep = latStep / lngScale;
                const angleCount = 24;
                for (let ring = 1; ring <= 48; ring++) {
                    const rLat = latStep * ring;
                    const rLng = lngStep * ring;
                    let ringBest: [number, number] | null = null;
                    let ringBestDist = Number.POSITIVE_INFINITY;
                    for (let a = 0; a < angleCount; a++) {
                        const angle = (2 * Math.PI * a) / angleCount;
                        const candidate: [number, number] = [
                            target[0] + Math.sin(angle) * rLat,
                            target[1] + Math.cos(angle) * rLng,
                        ];
                        if (!isValid(candidate)) continue;
                        const d2 = distanceSq(candidate, target);
                        if (d2 < ringBestDist) {
                            ringBestDist = d2;
                            ringBest = candidate;
                        }
                    }
                    if (ringBest) return ringBest;
                }
            }

            if (fallbackPoint && isValid(fallbackPoint)) return fallbackPoint;
            return null;
        };

        if (strict) return search(true);
        return search(false);
    }, [getMap, isSketchGeometryAllowed]);

    const findNearestValidPointNearTarget = useCallback((
        target: [number, number],
        buildCandidate: (pt: [number, number]) => [number, number][],
        activeEditId?: string | null,
        maxRadiusPx: number = 36,
    ): [number, number] | null => {
        const isValid = (pt: [number, number]) => isSketchGeometryAllowed(buildCandidate(pt), activeEditId, true);
        if (isValid(target)) return target;

        const map = getMap();
        if (map) {
            const basePoint = map.latLngToContainerPoint(L.latLng(target[0], target[1]));
            const angleCount = 20;

            for (let radiusPx = 3; radiusPx <= maxRadiusPx; radiusPx += 3) {
                let ringBest: [number, number] | null = null;
                let ringBestDist = Number.POSITIVE_INFINITY;

                for (let a = 0; a < angleCount; a++) {
                    const angle = (2 * Math.PI * a) / angleCount;
                    const probePoint = L.point(
                        basePoint.x + Math.cos(angle) * radiusPx,
                        basePoint.y + Math.sin(angle) * radiusPx,
                    );
                    const ll = map.containerPointToLatLng(probePoint);
                    const candidate: [number, number] = [ll.lat, ll.lng];
                    if (!isValid(candidate)) continue;

                    const d2 = pointDistanceSq(candidate, target);
                    if (d2 < ringBestDist) {
                        ringBestDist = d2;
                        ringBest = candidate;
                    }
                }

                if (ringBest) return ringBest;
            }

            return null;
        }

        return findNearestValidPoint(target, buildCandidate, activeEditId, undefined, true);
    }, [findNearestValidPoint, getMap, isSketchGeometryAllowed, pointDistanceSq]);

    const findLastValidPointAlongSegment = useCallback((
        fromPoint: [number, number],
        toPoint: [number, number],
        buildCandidate: (pt: [number, number]) => [number, number][],
        activeEditId?: string | null,
    ): [number, number] | null => {
        const isValid = (pt: [number, number]) => isSketchGeometryAllowed(buildCandidate(pt), activeEditId, true);

        if (!isValid(fromPoint)) return null;
        if (isValid(toPoint)) return toPoint;

        const interpolate = (a: [number, number], b: [number, number], t: number): [number, number] => [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
        ];

        let low = fromPoint;
        let high = toPoint;
        for (let i = 0; i < 18; i++) {
            const mid = interpolate(low, high, 0.5);
            if (isValid(mid)) low = mid;
            else high = mid;
        }

        return low;
    }, [isSketchGeometryAllowed]);

    const findLastPointAlongSegmentByPredicate = useCallback((
        fromPoint: [number, number],
        toPoint: [number, number],
        isValidPoint: (pt: [number, number]) => boolean,
    ): [number, number] | null => {
        if (!isValidPoint(fromPoint)) return null;
        if (isValidPoint(toPoint)) return toPoint;

        const interpolate = (a: [number, number], b: [number, number], t: number): [number, number] => [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
        ];

        let low = fromPoint;
        let high = toPoint;
        for (let i = 0; i < 18; i++) {
            const mid = interpolate(low, high, 0.5);
            if (isValidPoint(mid)) low = mid;
            else high = mid;
        }

        return low;
    }, []);

    const findNearestPointByPredicate = useCallback((
        target: [number, number],
        isValidPoint: (pt: [number, number]) => boolean,
        maxRadiusPx: number = 24,
    ): [number, number] | null => {
        if (isValidPoint(target)) return target;

        const map = getMap();
        if (!map) return null;

        const basePoint = map.latLngToContainerPoint(L.latLng(target[0], target[1]));
        const angleCount = 20;

        for (let radiusPx = 3; radiusPx <= maxRadiusPx; radiusPx += 3) {
            let ringBest: [number, number] | null = null;
            let ringBestDist = Number.POSITIVE_INFINITY;

            for (let a = 0; a < angleCount; a++) {
                const angle = (2 * Math.PI * a) / angleCount;
                const probePoint = L.point(
                    basePoint.x + Math.cos(angle) * radiusPx,
                    basePoint.y + Math.sin(angle) * radiusPx,
                );
                const ll = map.containerPointToLatLng(probePoint);
                const candidate: [number, number] = [ll.lat, ll.lng];
                if (!isValidPoint(candidate)) continue;

                const d2 = pointDistanceSq(candidate, target);
                if (d2 < ringBestDist) {
                    ringBestDist = d2;
                    ringBest = candidate;
                }
            }

            if (ringBest) return ringBest;
        }

        return null;
    }, [getMap, pointDistanceSq]);

    const resolvePreviewPoint = useCallback((
        target: [number, number],
        previousPreview: [number, number] | null,
        buildCandidate: (pt: [number, number]) => [number, number][],
        activeEditId?: string | null,
        anchorPoint?: [number, number] | null,
        allowNearestSearch: boolean = false,
        validatePoint?: (pt: [number, number]) => boolean,
    ): [number, number] | null => {
        const isValid = validatePoint
            ? validatePoint
            : (pt: [number, number]) => isSketchGeometryAllowed(buildCandidate(pt), activeEditId, true);
        const accepts = (pt: [number, number]) => isValid(pt);
        const targetValid = isValid(target);
        const candidates: [number, number][] = [];

        const map = getMap();
        const findNearestSnapVertex = (center: [number, number], maxRadiusPx: number): [number, number] | null => {
            if (!map) return null;

            const parentForSketch = getParentForSketch(activeEditId);
            const ancestorIds = getAncestorIds(parentForSketch, polygonsRef.current);
            const descendantIds = activeEditId ? getDescendantIds(activeEditId, polygonsRef.current) : [];
            const parentParcel = parentForSketch
                ? polygonsRef.current.find(p => String(p.id) === String(parentForSketch))
                : undefined;

            const centerPx = map.latLngToLayerPoint(L.latLng(center[0], center[1]));
            let bestVertex: [number, number] | null = null;
            let bestDistPx = Number.POSITIVE_INFINITY;

            const considerVertices = (coords: [number, number][]) => {
                for (const vertex of coords) {
                    const vertexPx = map.latLngToLayerPoint(L.latLng(vertex[0], vertex[1]));
                    const distPx = centerPx.distanceTo(vertexPx);
                    if (distPx < bestDistPx) {
                        bestDistPx = distPx;
                        bestVertex = vertex;
                    }
                }
            };

            if (parentParcel) considerVertices(parentParcel.coords);
            for (const poly of polygonsRef.current) {
                if (!poly.visible) continue;
                if (activeEditId && poly.id === activeEditId) continue;
                if (ancestorIds.includes(poly.id)) continue;
                if (descendantIds.includes(poly.id)) continue;
                considerVertices(poly.coords);
            }

            if (bestVertex && bestDistPx <= maxRadiusPx) return bestVertex;
            return null;
        };

        const pushCandidate = (pt: [number, number] | null | undefined) => {
            if (!pt || !accepts(pt)) return;
            if (candidates.some(c => pointDistanceSq(c, pt) <= 1e-16)) return;
            candidates.push(pt);
        };

        const strictTarget = getStrictSnapTarget(
            L.latLng(target[0], target[1]),
            activeEditId,
            { forceEdgeSnap: edgeSnapEnabledRef.current || !targetValid, respectShift: true },
        );

        const cornerTarget = findNearestSnapVertex(target, 24);
        if (cornerTarget && accepts(cornerTarget)) return cornerTarget;
        const cornerStrictTarget = findNearestSnapVertex(strictTarget, 18);
        if (cornerStrictTarget && accepts(cornerStrictTarget)) return cornerStrictTarget;

        const findNearestAround = (center: [number, number], radiusPx: number): [number, number] | null => {
            if (!allowNearestSearch) return null;
            return validatePoint
                ? findNearestPointByPredicate(center, validatePoint, radiusPx)
                : findNearestValidPointNearTarget(center, buildCandidate, activeEditId, radiusPx);
        };

        // Shift should affect preview snap only.
        if (edgeSnapEnabledRef.current) {
            if (accepts(strictTarget)) return strictTarget;
            const snappedNear = findNearestAround(strictTarget, 160);
            if (snappedNear && accepts(snappedNear)) return snappedNear;
        }

        // Deterministic candidate queue (closest-to-cursor preference).
        pushCandidate(cornerTarget);
        pushCandidate(cornerStrictTarget);
        pushCandidate(target);
        pushCandidate(findNearestAround(target, 160));

        if (!targetValid) {
            // If cursor is in invalid region, broaden search and prioritize edge/corner fallback.
            pushCandidate(findNearestAround(target, 240));
            pushCandidate(strictTarget);
            pushCandidate(findNearestAround(strictTarget, 160));
            pushCandidate(findNearestAround(strictTarget, 240));
        } else {
            pushCandidate(strictTarget);
            pushCandidate(findNearestAround(strictTarget, 160));
        }

        // Continuity candidates are last-resort only.
        pushCandidate(previousPreview);
        pushCandidate(anchorPoint ?? null);

        if (candidates.length === 0) return null;

        const orderedCandidates = [...candidates].sort((a, b) => pointDistanceSq(a, target) - pointDistanceSq(b, target));

        // Never hard-block preview when a point is otherwise valid.
        return orderedCandidates[0];
    }, [findNearestPointByPredicate, findNearestValidPointNearTarget, getMap, getParentForSketch, getStrictSnapTarget, isSketchGeometryAllowed, pointDistanceSq]);

    const constrainSketchPoint = useCallback((nextPoint: [number, number], activeEditId?: string | null, fallbackPoint?: [number, number]): [number, number] => {
        const constrained = resolveConstrainedLatLng(L.latLng(nextPoint[0], nextPoint[1]), activeEditId, fallbackPoint);
        const target: [number, number] = [constrained.lat, constrained.lng];
        const resolved = findNearestValidPoint(target, (pt) => [pt], activeEditId, fallbackPoint, false);
        return resolved ?? (fallbackPoint ?? target);
    }, [findNearestValidPoint, resolveConstrainedLatLng]);

    const moveSketchPoint = useCallback((index: number, nextPoint: [number, number]): [number, number] => {
        const prev = drawingPointsRef.current;
        if (index < 0 || index >= prev.length) return nextPoint;

        const fallback = prev[index];
        const constrained = resolveConstrainedLatLng(L.latLng(nextPoint[0], nextPoint[1]), editingId, fallback, { respectShift: true });
        const candidate: [number, number] = [constrained.lat, constrained.lng];
        const next = [...prev];
        next[index] = candidate;

        const strict = true;
        if (!isSketchGeometryAllowed(next, editingId, strict)) {
            const buildCandidate = (pt: [number, number]) => {
                const probe = [...prev];
                probe[index] = pt;
                return probe;
            };

            const isEditPointValid = (pt: [number, number]) => isEditCandidateAllowed(buildCandidate(pt), pt, editingId, true);

            const alongSegment = findLastPointAlongSegmentByPredicate(fallback, candidate, isEditPointValid);
            if (alongSegment && pointDistanceSq(alongSegment, fallback) > 1e-16) {
                const adjusted = [...prev];
                adjusted[index] = alongSegment;
                commitDrawingPoints(adjusted);
                return alongSegment;
            }

            const nearestGeometry = findNearestPointByPredicate(candidate, isEditPointValid, 24);
            if (!nearestGeometry) {
                const relaxedGeometry = findNearestPointByPredicate(candidate, (pt) => isPointAllowed(pt, editingId), 24);
                if (!relaxedGeometry) return fallback;
                if (pointDistanceSq(relaxedGeometry, fallback) <= 1e-16) return fallback;

                const adjustedRelaxed = [...prev];
                adjustedRelaxed[index] = relaxedGeometry;
                commitDrawingPoints(adjustedRelaxed);
                return relaxedGeometry;
            }

            const adjusted = [...prev];
            adjusted[index] = nearestGeometry;
            commitDrawingPoints(adjusted);
            return nearestGeometry;
        }

        commitDrawingPoints(next);
        return candidate;
    }, [commitDrawingPoints, editingId, findLastPointAlongSegmentByPredicate, findNearestPointByPredicate, pointDistanceSq, resolveConstrainedLatLng, isEditCandidateAllowed, isPointAllowed, isSketchGeometryAllowed]);

    const insertSketchPoint = useCallback((insertIndex: number, nextPoint: [number, number]): boolean => {
        const prev = drawingPointsRef.current;
        const insertAt = Math.max(0, Math.min(insertIndex + 1, prev.length));
        const rawTarget: [number, number] = [nextPoint[0], nextPoint[1]];
        const buildCandidate = (pt: [number, number]) => [
            ...prev.slice(0, insertAt),
            pt,
            ...prev.slice(insertAt),
        ];

        const constrained = resolveConstrainedLatLng(L.latLng(nextPoint[0], nextPoint[1]), editingId);
        const target: [number, number] = [constrained.lat, constrained.lng];

        if (editingId) {
            const isEditPointValid = (pt: [number, number]) => isEditCandidateAllowed(buildCandidate(pt), pt, editingId, true);

            const rawNext = buildCandidate(rawTarget);
            if (isEditPointValid(rawTarget)) {
                commitDrawingPoints(rawNext);
                return true;
            }

            const next = buildCandidate(target);
            if (isEditPointValid(target)) {
                commitDrawingPoints(next);
                return true;
            }

            const anchor = prev.length > 0 ? prev[Math.max(0, insertAt - 1)] : null;
            if (!anchor) return false;

            const alongSegment = findLastPointAlongSegmentByPredicate(anchor, target, isEditPointValid);
            if (alongSegment && pointDistanceSq(alongSegment, anchor) > 1e-16) {
                commitDrawingPoints(buildCandidate(alongSegment));
                return true;
            }

            const nearest = findNearestPointByPredicate(target, isEditPointValid, 24);
            if (nearest) {
                commitDrawingPoints(buildCandidate(nearest));
                return true;
            }

            const relaxed = findNearestPointByPredicate(target, (pt) => isPointAllowed(pt, editingId), 24);
            if (!relaxed) return false;
            commitDrawingPoints(buildCandidate(relaxed));
            return true;
        }

        const rawNext = buildCandidate(rawTarget);
        if (isSketchGeometryAllowed(rawNext, editingId, true)) {
            commitDrawingPoints(rawNext);
            return true;
        }

        const next = buildCandidate(target);
        if (isSketchGeometryAllowed(next, editingId, true)) {
            commitDrawingPoints(next);
            return true;
        }

        const anchor = prev.length > 0 ? prev[Math.max(0, insertAt - 1)] : null;
        if (!anchor) return false;

        const alongSegment = findLastValidPointAlongSegment(anchor, target, buildCandidate, editingId);
        if (!alongSegment || pointDistanceSq(alongSegment, anchor) <= 1e-16) {
            const relaxed = findNearestValidPoint(target, buildCandidate, editingId, undefined, false);
            if (!relaxed) return false;
            const relaxedNext = buildCandidate(relaxed);
            commitDrawingPoints(relaxedNext);
            return true;
        }

        const adjusted = buildCandidate(alongSegment);
        if (!isSketchGeometryAllowed(adjusted, editingId, true)) return false;

        commitDrawingPoints(adjusted);
        return true;
    }, [commitDrawingPoints, editingId, findLastPointAlongSegmentByPredicate, findLastValidPointAlongSegment, findNearestPointByPredicate, findNearestValidPoint, isEditCandidateAllowed, isPointAllowed, isSketchGeometryAllowed, resolveConstrainedLatLng]);

    // In edit mode, "Add Point" toggle enables cursor-based insertion on the
    // closing edge (last -> first) with live preview.
    useEffect(() => {
        const map = getMap();
        if (!map) return;

        const clearClosingInsertHandlers = () => {
            const mapAny = map as any;
            if (mapAny._closingInsertMoveHandler) map.off('mousemove', mapAny._closingInsertMoveHandler);
            if (mapAny._closingInsertClickHandler) map.off('click', mapAny._closingInsertClickHandler);
            delete mapAny._closingInsertMoveHandler;
            delete mapAny._closingInsertClickHandler;
        };

        clearClosingInsertHandlers();

        if (!editingId || isCreating) {
            return;
        }

        if (!closeLoopMidpointEnabled) {
            setCreatePreviewPoint(null);
            setSnapPreview(null);
            return;
        }

        const computePreviewAt = (latlng: L.LatLng) => {
            if (drawingPointsRef.current.length < 2) {
                setCreatePreviewPoint(null);
                setSnapPreview(null);
                return;
            }

            if (isHoveringSketchHandleRef.current) {
                setCreatePreviewPoint(null);
                setSnapPreview(null);
                return;
            }

            const target: [number, number] = [latlng.lat, latlng.lng];
            const previousPreview = createPreviewPointRef.current;
            const insertAt = drawingPointsRef.current.length;
            const anchorPoint = insertAt > 0 ? drawingPointsRef.current[insertAt - 1] : null;
            const buildCandidate = (pt: [number, number]) => [
                ...drawingPointsRef.current.slice(0, insertAt),
                pt,
                ...drawingPointsRef.current.slice(insertAt),
            ];
            const editPreviewValidator = (pt: [number, number]) => isPointAllowed(pt, editingId);

            const resolved = resolvePreviewPoint(target, previousPreview, buildCandidate, editingId, anchorPoint, true, editPreviewValidator);
            if (!resolved) {
                setCreatePreviewPoint(null);
                setSnapPreview(null);
                return;
            }

            if (previousPreview && pointDistanceSq(previousPreview, resolved) < 1e-16) return;

            const previewLatLng = L.latLng(resolved[0], resolved[1]);
            setSnapPreview(previewLatLng);
            setCreatePreviewPoint(resolved);
        };

        let moveRaf: number | null = null;
        let pendingMoveLatLng: L.LatLng | null = null;

        const moveHandler = (e: L.LeafletMouseEvent) => {
            lastPreviewCursorRef.current = e.latlng;
            pendingMoveLatLng = e.latlng;
            if (moveRaf !== null) return;
            moveRaf = window.requestAnimationFrame(() => {
                moveRaf = null;
                const ll = pendingMoveLatLng;
                pendingMoveLatLng = null;
                if (!ll) return;
                computePreviewAt(ll);
            });
        };

        const clickHandler = (e: L.LeafletMouseEvent) => {
            if (drawingPointsRef.current.length < 2) return;
            if (isSketchClickSuppressed()) return;
            if (isHoveringSketchHandleRef.current) return;

            const original = e.originalEvent as MouseEvent | undefined;
            const target = original?.target as HTMLElement | null;
            if (target?.closest('.custom-vertex-icon, .custom-midpoint-icon')) return;

            const closingEdgeIndex = drawingPointsRef.current.length - 1;
            const previewPoint = createPreviewPointRef.current;
            insertSketchPoint(closingEdgeIndex, previewPoint ?? [e.latlng.lat, e.latlng.lng]);
        };

        map.on('mousemove', moveHandler);
        map.on('click', clickHandler);

        const mapAny = map as any;
        mapAny._closingInsertMoveHandler = moveHandler;
        mapAny._closingInsertClickHandler = clickHandler;

        return () => {
            if (moveRaf !== null) window.cancelAnimationFrame(moveRaf);
            clearClosingInsertHandlers();
            setCreatePreviewPoint(null);
            setSnapPreview(null);
        };
    }, [editingId, isCreating, closeLoopMidpointEnabled, getMap, insertSketchPoint, isPointAllowed, isSketchClickSuppressed, pointDistanceSq, resolvePreviewPoint, setSnapPreview]);

    const cleanupEdit = useCallback(() => {
        editStateRef.current = null;
        drawingPointsRef.current = [];
        setDrawingPoints([]);
        setGhostCoords([]);
        setCreatePreviewPoint(null);
        setIsHoveringSketchHandle(false);
        setSnapPreview(null);
        clearGhost();
    }, [clearGhost, setSnapPreview]);

    const startEdit = useCallback((id: string, canEdit: boolean, forceCoords?: [number, number][]) => {
        if (!canEdit) return;

        const poly = polygons.find(p => p.id === id);
        const rawCoords = forceCoords ?? poly?.coords;
        if (!rawCoords || rawCoords.length < 3) return;

        const coords = rawCoords.map(c => [c[0], c[1]] as [number, number]);
        originalCoordsRef.current[id] = coords.map(c => [c[0], c[1]] as [number, number]);

        clearGhost();
        setSnapPreview(null);
        setCreatePreviewPoint(null);
        setIsHoveringSketchHandle(false);
        setIsCreating(false);
        setEditingId(id);
        setCloseLoopMidpointEnabled(false);
        setDrawingPoints(coords);

        const parentForEdit = poly?.parentId ?? selectedParentId;
        const ignoreIds = [id, ...getDescendantIds(id, polygons)];
        const snapped = updateGhost(coords, parentForEdit, ignoreIds, {
            edgeSnap: true,
            autoCorrect: autoCorrectEnabledRef.current,
        });
        setGhostCoords(snapped || coords);

        getMap()?.closePopup?.();
    }, [polygons, clearGhost, setSnapPreview, selectedParentId, updateGhost, getMap]);

    const finishEdit = useCallback(async (_forceParam: boolean | any = false) => {
        if (!editingId) return;

        const currentPoly = polygons.find(p => p.id === editingId);
        const parentId = currentPoly?.parentId || selectedParentId;
        const newCoords = drawingPointsRef.current;
        if (!newCoords || newCoords.length < 3) return;

        const ignoreIds = [editingId, ...getDescendantIds(editingId, polygons)];
        const finalCoords = updateGhost(newCoords, parentId, ignoreIds, {
            edgeSnap: true,
            autoCorrect: autoCorrectEnabledRef.current,
        }) || newCoords;

        if (!autoCorrectEnabledRef.current) {
            const overlapping = detectOverlaps(editingId, finalCoords, parentId ?? null);
            if (overlapping.length > 0) {
                const fixedCoords = updateGhost(newCoords, parentId, ignoreIds, {
                    edgeSnap: true,
                    autoCorrect: true,
                }) || finalCoords;
                setOverlapWarning({
                    polygonId: editingId,
                    overlappingPolygons: overlapping,
                    originalCoords: finalCoords,
                    fixedCoords,
                    isNewPolygon: false,
                    areaNameSnapshot: currentPoly?.name || t('map.defaultPolygonName'),
                    selectedPeriodIdSnapshot: currentPoly?.periodId ? String(currentPoly.periodId) : '',
                });
                setShowPreview(false);
                return;
            }
        }

        clearGhost();
        const coordsToSave = finalCoords;
        let alreadyUpdated = false;

        // save existing polygon coords
        if (!editingId.startsWith('poly-')) {
            try {
                const currentName = currentPoly?.name || t('map.defaultPolygonName');

                const isImportMode = contextType === 'import';
                let response;
                let finalName = '';
                let finalPeriodId: number | null = null;

                if (isImportMode) {
                    // imports need patch
                    const payload = { geodata: coordsToWKT(coordsToSave), validationNotes: "Manual edit" };
                    response = await apiPatch(`/imports/parcels/${editingId}`, payload);
                    finalName = currentPoly?.name || t('map.defaultPolygonName');
                    finalPeriodId = currentPoly?.periodId ? Number(currentPoly.periodId) : null;
                } else {
                    // farms need put
                    const periodIdNum = currentPoly?.periodId ? Number(currentPoly.periodId) : null;
                    const payload: any = {
                        geodata: coordsToWKT(coordsToSave),
                        name: (currentName).trim() || t('map.defaultPolygonName'),
                        active: true,
                        periodId: (periodIdNum && periodIdNum > 0) ? periodIdNum : null,
                        parentParcelId: normalizeParentParcelId(currentPoly?.parentId),
                        startValidity: new Date().toISOString(),
                        endValidity: null
                    };

                    // send farm id just in case
                    if (contextType === 'farm') {
                        const match = parcelsEndpoint.match(/\/farm\/([^\/]+)/);
                        if (match) payload.farmId = Number(match[1]);
                    }

                    // save names if we fixed overlap
                    if (manualEditContext && !manualEditContext.isNewPolygon) {
                        const snpName = (manualEditContext.areaNameSnapshot || '').trim();
                        if (snpName) payload.name = snpName;
                        if (manualEditContext.selectedPeriodIdSnapshot) {
                            const snpPeriodNum = Number(manualEditContext.selectedPeriodIdSnapshot);
                            payload.periodId = (snpPeriodNum > 0) ? snpPeriodNum : null;
                        }
                    }

                    response = await apiPut(`${parcelsEndpoint}/${editingId}`, payload);
                    finalName = payload.name;
                    finalPeriodId = payload.periodId;
                }

                if (!response.ok) {
                    let details = '';
                    try {
                        details = await response.text();
                    } catch {
                        details = '';
                    }
                    console.error("Failed to update parcel", {
                        status: response.status,
                        statusText: response.statusText,
                        details,
                    });
                }
                else {
                    const updateFn = (prev: PolygonData[]) => prev.map(p => p.id === editingId
                        ? { ...p, name: finalName, periodId: finalPeriodId, coords: coordsToSave, version: (p.version || 0) + 1 }
                        : p
                    );
                    setPolygons(updateFn);
                    setAllPolygons(updateFn);
                    alreadyUpdated = true;
                }
            } catch (err) {
                console.error("Failed to update parcel:", err);
            }
        }

        // re-open create modal if new polygon
        if (manualEditContext?.isNewPolygon) {
            setAreaName(manualEditContext.areaNameSnapshot || t('map.defaultPolygonName'));
            setSelectedPeriodId(manualEditContext.selectedPeriodIdSnapshot || '');
            setModal({ open: true, coords: coordsToSave });
            setOverlapWarning(null);
        }

        if (!manualEditContext?.isNewPolygon && !alreadyUpdated) {
            updatePolygon(editingId, coordsToSave, true);
        }

        delete originalCoordsRef.current[editingId];
        setManualEditContext(null);
        setPendingManualEditId(null);
        setSelectedParentId(null);
        setCloseLoopMidpointEnabled(true);
        cleanupEdit();
        setEditingId(null);
        getMap()?.closePopup?.();
    }, [editingId, polygons, selectedParentId, updateGhost, clearGhost, detectOverlaps, contextType, parcelsEndpoint, manualEditContext, t, updatePolygon, cleanupEdit, getMap, setSelectedParentId]);

    const cancelEdit = useCallback(() => {
        if (!editingId) return;
        if (manualEditContext && manualEditContext.warning.polygonId === editingId) {
            cleanupEdit();
            setEditingId(null);
            delete originalCoordsRef.current[editingId];
            if (manualEditContext.isNewPolygon) {
                setPolygons(prev => prev.filter(p => p.id !== editingId));
                setAreaName(manualEditContext.areaNameSnapshot);
                setSelectedPeriodId(manualEditContext.selectedPeriodIdSnapshot);
                setModal({ open: true, coords: manualEditContext.originalCoords });
            } else {
                setRenamingId(editingId);
            }
            setOverlapWarning(manualEditContext.warning);
            setShowPreview(false);
            setManualEditContext(null);
            setPendingManualEditId(null);
            setCloseLoopMidpointEnabled(true);
            getMap()?.closePopup?.();
            return;
        }

        const original = originalCoordsRef.current[editingId];
        if (original && editingId.startsWith('poly-')) {
            updatePolygon(editingId, original, true);
        }
        delete originalCoordsRef.current[editingId];
        setCloseLoopMidpointEnabled(true);
        cleanupEdit();
        setEditingId(null);
        setSelectedParentId(null);
        getMap()?.closePopup?.();
    }, [editingId, manualEditContext, cleanupEdit, getMap, setPolygons, setAreaName, setSelectedParentId, updatePolygon]);

    const deletePolygon = useCallback(async (id: string, canEdit: boolean) => {
        if (!canEdit) return;
        if (contextType === 'farm') {
            try {
                const response = await apiDelete(`/parcels/${id}`);
                if (!response.ok) return console.error("Failed to delete parcel:", response.statusText);
            } catch (err) {
                return console.error("Failed to delete parcel:", err);
            }
        }
        setPolygons(prev => prev.filter(p => p.id !== id));
        setAllPolygons(prev => prev.filter(p => p.id !== id));
        if (id === editingId) {
            cleanupEdit();
            setEditingId(null);
        }
    }, [contextType, editingId, cleanupEdit, setPolygons, setAllPolygons]);
    const startCreate = useCallback(() => {
        drawingPointsRef.current = [];
        setDrawingPoints([]);
        setIsCreating(true);
        setEditingId(null);
        setCreatePointCount(0);
        setIsHoveringSketchHandle(false);
        setCloseLoopMidpointEnabled(true);
        
        // Listen to map pointer-down to add points reliably.
        // `click` can be dropped by tiny drags on some devices.
        const map = getMap();
        if (!map) return;

        const mapAny = map as any;
        mapAny._sketchWasDoubleClickZoomEnabled = map.doubleClickZoom.enabled();
        if (mapAny._sketchWasDoubleClickZoomEnabled) map.doubleClickZoom.disable();

        const addPoint = (latlng: L.LatLng) => {
            const prev = drawingPointsRef.current;
            const fallback = prev.length > 0 ? prev[prev.length - 1] : undefined;
            const cursorTarget: [number, number] = [latlng.lat, latlng.lng];
            const rawTarget = clampPointToParentBoundary(cursorTarget, parentIdRef.current);
            const previewPoint = createPreviewPointRef.current;
            const buildCandidate = (pt: [number, number]) => [...prev, pt];
            const createPreviewValidator = (pt: [number, number]) => isPointAllowed(pt, null);

            const resolved = resolvePreviewPoint(rawTarget, previewPoint, buildCandidate, null, fallback ?? null, true, createPreviewValidator);
            if (!resolved) return;

            commitDrawingPoints([...prev, resolved]);
        };

        let pointerDown = false;
        let downX = 0;
        let downY = 0;
        let downOnVertex = false;
        let downTs = 0;
        let suppressNextClick = false;
        let lastPlacedTs = 0;
        let lastPlacedLat = Number.NaN;
        let lastPlacedLng = Number.NaN;
        const LONG_PRESS_MS = 260;

        const maybeAddPoint = (latlng: L.LatLng, ts?: number) => {
            if (isSketchClickSuppressed()) return;
            const canCursorInsert = drawingPointsRef.current.length < 3 || closeLoopMidpointEnabledRef.current;
            if (!canCursorInsert) return;
            if (isHoveringSketchHandleRef.current) return;

            const stamp = typeof ts === 'number' ? ts : Date.now();
            const sameSpot = Math.abs(latlng.lat - lastPlacedLat) < 1e-8 && Math.abs(latlng.lng - lastPlacedLng) < 1e-8;
            if (sameSpot && stamp - lastPlacedTs < 150) return;
            lastPlacedTs = stamp;
            lastPlacedLat = latlng.lat;
            lastPlacedLng = latlng.lng;
            addPoint(latlng);
        };

        const downHandler = (e: L.LeafletMouseEvent) => {
            const original = e.originalEvent as MouseEvent | undefined;
            const target = original?.target as HTMLElement | null;
            downOnVertex = !!target?.closest('.custom-vertex-icon, .custom-midpoint-icon');
            if (downOnVertex) {
                pointerDown = false;
                return;
            }
            pointerDown = true;
            suppressNextClick = false;
            downX = original?.clientX ?? 0;
            downY = original?.clientY ?? 0;
            downTs = original?.timeStamp ?? Date.now();
        };

        const upHandler = (e: L.LeafletMouseEvent) => {
            if (!pointerDown) return;
            pointerDown = false;
            if (downOnVertex) {
                downOnVertex = false;
                return;
            }

            const original = e.originalEvent as MouseEvent | undefined;
            const upX = original?.clientX ?? downX;
            const upY = original?.clientY ?? downY;
            const movedPx = Math.hypot(upX - downX, upY - downY);
            const upTs = original?.timeStamp ?? Date.now();
            const pressDuration = upTs - downTs;
            const isLongPress = pressDuration >= LONG_PRESS_MS;
            if (movedPx > 8 || isLongPress) {
                suppressNextClick = true;
                return;
            }

            maybeAddPoint(e.latlng, original?.timeStamp);
        };

        const clickHandler = (e: L.LeafletMouseEvent) => {
            if (suppressNextClick) {
                suppressNextClick = false;
                return;
            }
            if (isSketchClickSuppressed()) return;
            const original = e.originalEvent as MouseEvent | undefined;
            const target = original?.target as HTMLElement | null;
            if (target?.closest('.custom-vertex-icon, .custom-midpoint-icon')) return;
            maybeAddPoint(e.latlng, original?.timeStamp);
        };
        
        const computePreviewAt = (latlng: L.LatLng) => {
            const canCursorInsert = drawingPointsRef.current.length < 3 || closeLoopMidpointEnabledRef.current;
            if (!canCursorInsert || isHoveringSketchHandleRef.current) {
                setSnapPreview(null);
                setCreatePreviewPoint(null);
                return;
            }

            const anchorPoint = drawingPointsRef.current.length > 0
                ? drawingPointsRef.current[drawingPointsRef.current.length - 1]
                : null;
            const cursorTarget: [number, number] = [latlng.lat, latlng.lng];
            const target = clampPointToParentBoundary(cursorTarget, parentIdRef.current);
            const previousPreview = createPreviewPointRef.current;
            const buildCandidate = (pt: [number, number]) => [...drawingPointsRef.current, pt];
            const createPreviewValidator = (pt: [number, number]) => isPointAllowed(pt, null);

            const resolved = resolvePreviewPoint(target, previousPreview, buildCandidate, null, anchorPoint, true, createPreviewValidator);
            if (!resolved) {
                setSnapPreview(null);
                setCreatePreviewPoint(null);
                return;
            }

            if (previousPreview && pointDistanceSq(previousPreview, resolved) < 1e-16) return;

            const previewLatLng = L.latLng(resolved[0], resolved[1]);
            setSnapPreview(previewLatLng);
            setCreatePreviewPoint(resolved);
        };

        let moveRaf: number | null = null;
        let pendingMoveLatLng: L.LatLng | null = null;

        const moveHandler = (e: L.LeafletMouseEvent) => {
            lastPreviewCursorRef.current = e.latlng;
            pendingMoveLatLng = e.latlng;
            if (moveRaf !== null) return;
            moveRaf = window.requestAnimationFrame(() => {
                moveRaf = null;
                const ll = pendingMoveLatLng;
                pendingMoveLatLng = null;
                if (!ll) return;
                computePreviewAt(ll);
            });
        };

        map.on('mousedown', downHandler);
        map.on('mouseup', upHandler);
        map.on('click', clickHandler);
        map.on('mousemove', moveHandler);

        const cancelMoveRaf = () => {
            if (moveRaf !== null) {
                window.cancelAnimationFrame(moveRaf);
                moveRaf = null;
            }
            pendingMoveLatLng = null;
        };
        
        // Store for cleanup
        (map as any)._sketchDownHandler = downHandler;
        (map as any)._sketchUpHandler = upHandler;
        (map as any)._sketchClickHandler = clickHandler;
        (map as any)._sketchMoveHandler = moveHandler;
        (map as any)._sketchCancelMoveRaf = cancelMoveRaf;
    }, [clampPointToParentBoundary, commitDrawingPoints, getMap, isPointAllowed, pointDistanceSq, resolvePreviewPoint]);

    const cancelCreate = useCallback((options?: { preserveSelectedParent?: boolean }) => {
        const map = getMap();
        if (map) {
            if ((map as any)._sketchDownHandler) map.off('mousedown', (map as any)._sketchDownHandler);
            if ((map as any)._sketchUpHandler) map.off('mouseup', (map as any)._sketchUpHandler);
            if ((map as any)._sketchClickHandler) map.off('click', (map as any)._sketchClickHandler);
            if ((map as any)._sketchMoveHandler) map.off('mousemove', (map as any)._sketchMoveHandler);
            if ((map as any)._sketchCancelMoveRaf) (map as any)._sketchCancelMoveRaf();
            delete (map as any)._sketchDownHandler;
            delete (map as any)._sketchUpHandler;
            delete (map as any)._sketchClickHandler;
            delete (map as any)._sketchMoveHandler;
            delete (map as any)._sketchCancelMoveRaf;

            const mapAny = map as any;
            if (mapAny._sketchWasDoubleClickZoomEnabled) map.doubleClickZoom.enable();
            delete mapAny._sketchWasDoubleClickZoomEnabled;

            setSnapPreview(null);
            setCreatePreviewPoint(null);
        }
        setIsCreating(false);
        setCreatePointCount(0);
        drawingPointsRef.current = [];
        suppressSketchClickUntilRef.current = 0;
        setDrawingPoints([]);
        setGhostCoords([]);
        setIsHoveringSketchHandle(false);
        clearGhostRef.current();
        setCloseLoopMidpointEnabled(true);
        if (!options?.preserveSelectedParent) {
            setSelectedParentId(null);
        }
        setAreaName("");
        if (createdLayerRef.current) map?.removeLayer(createdLayerRef.current);
        createdLayerRef.current = null;
        createHandlerRef.current = null;
    }, [getMap, setAreaName, setSelectedParentId]);

    const finishCreate = useCallback((handleCreated: (e: any) => void) => {
        const coords = drawingPointsRef.current;
        if (coords.length < 3) {
            cancelCreate();
            return;
        }
        const map = getMap();
        if (!map) return;
        
        // Final Snap & Avoidance
        const snapped = updateGhostRef.current(coords, parentIdRef.current, [], {
            edgeSnap: false,
            autoCorrect: autoCorrectEnabledRef.current,
        }) || coords;
        handleCreated({ layer: L.polygon(snapped) });
        
        cancelCreate({ preserveSelectedParent: true });
    }, [cancelCreate, getMap]);

    const removeLastSketchPoint = useCallback(() => {
        if (!isCreating && !editingId) return;
        const prev = drawingPointsRef.current;
        let next = prev;
        if (isCreating) next = prev.slice(0, -1);
        else if (prev.length > 3) next = prev.slice(0, -1);
        if (next !== prev) commitDrawingPoints(next);
        setIsHoveringSketchHandle(false);
        if (isCreating) {
            setCreatePointCount(prev => Math.max(0, prev - 1));
        }
    }, [commitDrawingPoints, isCreating, editingId]);

    const removeSketchPoint = useCallback((index: number) => {
        if (!isCreating && !editingId) return;

        const prev = drawingPointsRef.current;
        if (index < 0 || index >= prev.length) return;
        if (editingId && prev.length <= 3) return;

        const next = prev.filter((_, i) => i !== index);
        commitDrawingPoints(next);
        setIsHoveringSketchHandle(false);
        if (isCreating) {
            setCreatePointCount(next.length);
        }
    }, [commitDrawingPoints, isCreating, editingId]);

    return {
        editingId, setEditingId,
        isCreating, setIsCreating,
        createPointCount, setCreatePointCount,
        drawingPoints, setDrawingPoints,
        ghostCoords, setGhostCoords,
        createPreviewPoint, setCreatePreviewPoint,
        autoCorrectEnabled, setAutoCorrectEnabled,
        edgeSnapEnabled,
        closeLoopMidpointEnabled, setCloseLoopMidpointEnabled,
        setIsHoveringSketchHandle,
        suppressSketchClickTemporarily,
        constrainSketchPoint,
        moveSketchPoint, insertSketchPoint,
        removeLastSketchPoint, removeSketchPoint,
        startCreate, cancelCreate, finishCreate,
        overlapWarning, setOverlapWarning,
        showPreview, setShowPreview,
        pendingManualEditId, setPendingManualEditId,
        manualEditContext, setManualEditContext,
        previewVisibility, setPreviewVisibility,
        originalCoordsRef, editStateRef, createdLayerRef, createHandlerRef,
        detectOverlaps, updatePolygon, cleanupEdit, startEdit, finishEdit, cancelEdit, deletePolygon,
    };
}
