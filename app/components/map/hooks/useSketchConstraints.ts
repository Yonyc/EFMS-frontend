import { useCallback } from "react";
import type { MutableRefObject } from "react";
import L from "leaflet";
import { snapLatLng, getAncestorIds, getDescendantIds } from "./useSnappyEditing";
import {
    checkOverlap,
    isPointInOrOnPolygon,
    isPointInPolygon,
    doEdgesIntersect,
    getClosestPointOnPolygon,
} from "../utils/geometry";
import type { PolygonData } from "../types";

// squared geodesic-ish distance, lng scaled by latitude so comparisons stay sane near the poles
export function pointDistanceSq(a: [number, number], b: [number, number]): number {
    const lngScale = Math.cos(((a[0] + b[0]) * 0.5) * Math.PI / 180) || 1;
    const dLat = a[0] - b[0];
    const dLng = (a[1] - b[1]) * lngScale;
    return dLat * dLat + dLng * dLng;
}

export function distanceToPolygonEdge(point: [number, number], polygon: [number, number][]): number {
    if (!polygon.length) return Infinity;
    const closest = getClosestPointOnPolygon(point, polygon);
    const lngScale = Math.cos(point[0] * Math.PI / 180) || 1;
    const dLat = point[0] - closest[0];
    const dLng = (point[1] - closest[1]) * lngScale;
    return Math.hypot(dLat, dLng);
}

// binary search along a segment for the last point satisfying a predicate
export function findLastPointAlongSegmentByPredicate(
    fromPoint: [number, number],
    toPoint: [number, number],
    isValidPoint: (pt: [number, number]) => boolean,
): [number, number] | null {
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
}

interface UseSketchConstraintsProps {
    polygonsRef: MutableRefObject<PolygonData[]>;
    parentIdRef: MutableRefObject<string | null>;
    edgeSnapEnabledRef: MutableRefObject<boolean>;
    getMap: () => L.Map | null;
}

export function useSketchConstraints({
    polygonsRef,
    parentIdRef,
    edgeSnapEnabledRef,
    getMap,
}: UseSketchConstraintsProps) {
    const getParentForSketch = useCallback((activeEditId?: string | null): string | null => {
        if (activeEditId) {
            return polygonsRef.current.find(p => p.id === activeEditId)?.parentId ?? parentIdRef.current;
        }
        return parentIdRef.current;
    }, [polygonsRef, parentIdRef]);

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
    }, [polygonsRef]);

    const isPointAllowed = useCallback((point: [number, number], activeEditId?: string | null): boolean => {
        const parentForSketch = getParentForSketch(activeEditId);
        const ancestorIds = getAncestorIds(parentForSketch, polygonsRef.current);
        const descendantIds = activeEditId ? getDescendantIds(activeEditId, polygonsRef.current) : [];

        // fixed geographic epsilons so behaviour stays zoom-independent
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

            // never allow points strictly inside forbidden parcels
            if (isPointInPolygon(point, poly.coords)) return false;

            // touching one forbidden boundary is fine for corner snaps
            // touching two at once means a shared sibling border, reject
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

        // allow precise shared corners between two parcels or a parcel and the parent
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

        // reject narrow corridors between two forbidden polygons even when float drift keeps the point off both edges
        if (forbiddenEdgeDistances.length >= 2) {
            const sorted = [...forbiddenEdgeDistances].sort((a, b) => a - b);
            if ((sorted[0] + sorted[1]) < NARROW_CORRIDOR_GAP_EPS) {
                if (!hasSharedForbiddenCornerException()) return false;
            }
        }

        // reject no-space corridors between parent border and a sibling border
        if (parentParcel && forbiddenEdgeDistances.length >= 1) {
            const nearestForbidden = Math.min(...forbiddenEdgeDistances);
            const nearParentBoundary = parentEdgeDistance < NO_SPACE_CLEARANCE_EPS;
            const nearForbiddenBoundary = nearestForbidden < NO_SPACE_CLEARANCE_EPS;
            if (nearParentBoundary && nearForbiddenBoundary && (parentEdgeDistance + nearestForbidden) < PARENT_FORBIDDEN_GAP_EPS) {
                if (!hasParentSiblingCornerException() && !hasSharedForbiddenCornerException()) return false;
            }
        }

        return true;
    }, [getParentForSketch, polygonsRef]);

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

        // parent clamp first, anything outside goes to the nearest border
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

        // if it landed inside a forbidden polygon, push it back onto the edge
        for (let pass = 0; pass < 3; pass++) {
            let changed = false;
            for (const obstacle of obstacles) {
                if (!isPointInPolygon(point, obstacle.coords)) continue;
                point = getClosestPointOnPolygon(point, obstacle.coords);
                changed = true;
            }
            if (!changed) break;
        }

        // edge magnet picks the nearest border in screen pixels
        const shouldEdgeSnap = options?.forceEdgeSnap === true || ((options?.respectShift ?? true) && edgeSnapEnabledRef.current);
        if (map && shouldEdgeSnap) {
            const pointPx = map.latLngToLayerPoint(L.latLng(point[0], point[1]));

            // bias toward vertices near corners to match expected snapping
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
    }, [edgeSnapEnabledRef, getMap, getParentForSketch, polygonsRef]);

    const isSketchGeometryStructurallyAllowed = useCallback((candidateCoords: [number, number][], activeEditId?: string | null, strict: boolean = true): boolean => {
        if (candidateCoords.length < 3 || !strict) return true;

        const parentForSketch = getParentForSketch(activeEditId);
        const ancestorIds = getAncestorIds(parentForSketch, polygonsRef.current);
        const descendantIds = activeEditId ? getDescendantIds(activeEditId, polygonsRef.current) : [];
        const parentParcel = parentForSketch
            ? polygonsRef.current.find(p => String(p.id) === String(parentForSketch))
            : undefined;

        // points-only checks miss an edge that leaves the parent and comes back
        if (parentParcel && doEdgesIntersect(candidateCoords, parentParcel.coords)) {
            return false;
        }

        for (const poly of polygonsRef.current) {
            if (!poly.visible) continue;
            if (activeEditId && poly.id === activeEditId) continue;
            if (ancestorIds.includes(poly.id)) continue;
            if (descendantIds.includes(poly.id)) continue;

            // no area or edge overlap allowed
            if (checkOverlap(candidateCoords, poly.coords)) {
                return false;
            }
        }

        return true;
    }, [getParentForSketch, polygonsRef]);

    const isSketchGeometryAllowed = useCallback((candidateCoords: [number, number][], activeEditId?: string | null, strict: boolean = true): boolean => {
        if (candidateCoords.length === 0) return true;

        // point-level containment goes first
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
        // strict check on the moved/inserted point, leave older points alone until edited
        if (!isPointAllowed(changedPoint, activeEditId)) return false;
        return isSketchGeometryStructurallyAllowed(candidateCoords, activeEditId, strict);
    }, [isPointAllowed, isSketchGeometryStructurallyAllowed]);

    const resolveConstrainedLatLng = useCallback((
        latlng: L.LatLng,
        activeEditId?: string | null,
        _fallbackPoint?: [number, number],
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
    }, [edgeSnapEnabledRef, getMap, getParentForSketch, getStrictSnapTarget, polygonsRef]);

    const findNearestValidPoint = useCallback((
        target: [number, number],
        buildCandidate: (pt: [number, number]) => [number, number][],
        activeEditId?: string | null,
        fallbackPoint?: [number, number],
        strict: boolean = true,
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
    }, [findNearestValidPoint, getMap, isSketchGeometryAllowed]);

    const findLastValidPointAlongSegment = useCallback((
        fromPoint: [number, number],
        toPoint: [number, number],
        buildCandidate: (pt: [number, number]) => [number, number][],
        activeEditId?: string | null,
    ): [number, number] | null => {
        const isValid = (pt: [number, number]) => isSketchGeometryAllowed(buildCandidate(pt), activeEditId, true);
        return findLastPointAlongSegmentByPredicate(fromPoint, toPoint, isValid);
    }, [isSketchGeometryAllowed]);

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
    }, [getMap]);

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
        const cornerStrictTarget = findNearestSnapVertex(strictTarget, 18);
        // corner magnet is shift-only, otherwise corners stay as fallback candidates
        // so a free-moving point doesn't jump onto every nearby corner
        if (edgeSnapEnabledRef.current) {
            if (cornerTarget && accepts(cornerTarget)) return cornerTarget;
            if (cornerStrictTarget && accepts(cornerStrictTarget)) return cornerStrictTarget;
        }

        const findNearestAround = (center: [number, number], radiusPx: number): [number, number] | null => {
            if (!allowNearestSearch) return null;
            return validatePoint
                ? findNearestPointByPredicate(center, validatePoint, radiusPx)
                : findNearestValidPointNearTarget(center, buildCandidate, activeEditId, radiusPx);
        };

        // shift affects preview snap only
        if (edgeSnapEnabledRef.current) {
            if (accepts(strictTarget)) return strictTarget;
            const snappedNear = findNearestAround(strictTarget, 160);
            if (snappedNear && accepts(snappedNear)) return snappedNear;
        }

        // candidate queue ranked by distance to cursor
        pushCandidate(cornerTarget);
        pushCandidate(cornerStrictTarget);
        pushCandidate(target);
        pushCandidate(findNearestAround(target, 160));

        if (!targetValid) {
            // cursor in invalid region, broaden the search and lean on edge/corner fallback
            pushCandidate(findNearestAround(target, 240));
            pushCandidate(strictTarget);
            pushCandidate(findNearestAround(strictTarget, 160));
            pushCandidate(findNearestAround(strictTarget, 240));
        } else {
            pushCandidate(strictTarget);
            pushCandidate(findNearestAround(strictTarget, 160));
        }

        // continuity candidates only as last resort
        pushCandidate(previousPreview);
        pushCandidate(anchorPoint ?? null);

        if (candidates.length === 0) return null;

        const orderedCandidates = [...candidates].sort((a, b) => pointDistanceSq(a, target) - pointDistanceSq(b, target));

        // never hard-block preview if the point is otherwise valid
        return orderedCandidates[0];
    }, [edgeSnapEnabledRef, findNearestPointByPredicate, findNearestValidPointNearTarget, getMap, getParentForSketch, getStrictSnapTarget, isSketchGeometryAllowed, polygonsRef]);

    return {
        getParentForSketch,
        clampPointToParentBoundary,
        isPointAllowed,
        getStrictSnapTarget,
        isSketchGeometryAllowed,
        isEditCandidateAllowed,
        resolveConstrainedLatLng,
        findNearestValidPoint,
        findNearestValidPointNearTarget,
        findLastValidPointAlongSegment,
        findNearestPointByPredicate,
        resolvePreviewPoint,
    };
}
