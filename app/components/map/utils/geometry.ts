import L from "leaflet";
import polyClip from "polygon-clipping";
import type { PolygonData } from "../types";

export const removeConsecutiveDuplicates = (points: [number, number][], epsilon = 1e-10): [number, number][] => {
    if (points.length === 0) return [];
    const cleaned: [number, number][] = [];

    for (const point of points) {
        const prev = cleaned[cleaned.length - 1];
        if (!prev) {
            cleaned.push(point);
            continue;
        }

        const dist = Math.hypot(point[0] - prev[0], point[1] - prev[1]);
        if (dist > epsilon) {
            cleaned.push(point);
        }
    }

    if (cleaned.length > 2) {
        const first = cleaned[0];
        const last = cleaned[cleaned.length - 1];
        if (Math.hypot(last[0] - first[0], last[1] - first[1]) < epsilon) {
            cleaned.pop();
        }
    }

    return cleaned;
};

export const polygonSignedArea = (points: [number, number][]) => {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const [y1, x1] = points[i];
        const [y2, x2] = points[(i + 1) % points.length];
        sum += (x1 * y2 - x2 * y1);
    }
    return sum / 2;
};

export const ensureClosedRing = (points: [number, number][]): [number, number][] => {
    if (points.length === 0) return points;
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
        return points;
    }
    return [...points, first];
};

export const subtractPolygon = (
    subject: [number, number][],
    clip: [number, number][]
): [number, number][][] => {
    if (subject.length < 3) return [];
    if (clip.length < 3) return [subject];

    const subjectRing = ensureClosedRing(subject).map(([lat, lng]) => [lng, lat] as [number, number]);
    const clipRing = ensureClosedRing(clip).map(([lat, lng]) => [lng, lat] as [number, number]);

    try {
        const diff = polyClip.difference([[subjectRing]], [[clipRing]]);
        
        if (!diff || diff.length === 0) {
            return [];
        }

        const polygons: [number, number][][] = [];
        
        for (const multiPoly of diff) {
            if (!multiPoly || multiPoly.length === 0) continue;
            const outerRing = multiPoly[0];
            
            const coords: [number, number][] = [];
            for (let i = 0; i < outerRing.length - 1; i++) {
                const [lng, lat] = outerRing[i];
                coords.push([lat, lng]);
            }
            if (coords.length >= 3) {
                polygons.push(coords);
            }
        }
        
        return polygons.map(removeConsecutiveDuplicates);
    } catch (e) {
        console.error("polygon-clipping difference error:", e);
        return [subject];
    }
};

export const clipToPolygon = (
    subject: [number, number][],
    clip: [number, number][]
): [number, number][][] => {
    if (subject.length < 3) return [];
    if (clip.length < 3) return [subject];

    const subjectRing = ensureClosedRing(subject).map(([lat, lng]) => [lng, lat] as [number, number]);
    const clipRing = ensureClosedRing(clip).map(([lat, lng]) => [lng, lat] as [number, number]);

    try {
        const intersection = polyClip.intersection([[subjectRing]], [[clipRing]]);
        
        if (!intersection || intersection.length === 0) {
            return [];
        }

        const polygons: [number, number][][] = [];
        
        for (const multiPoly of intersection) {
            if (!multiPoly || multiPoly.length === 0) continue;
            const outerRing = multiPoly[0];
            
            const coords: [number, number][] = [];
            for (let i = 0; i < outerRing.length - 1; i++) {
                const [lng, lat] = outerRing[i];
                coords.push([lat, lng]);
            }
            if (coords.length >= 3) {
                polygons.push(coords);
            }
        }
        
        return polygons.map(removeConsecutiveDuplicates);
    } catch (e) {
        console.error("polygon-clipping intersection error:", e);
        return [subject];
    }
};

export const shrinkPolygonAwayFromObstacles = (
    coords: [number, number][],
    otherPolygons: PolygonData[]
): [number, number][] => {
    if (coords.length < 3) {
        return coords;
    }

    const center = coords.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1]], [0, 0]).map(v => v / coords.length) as [number, number];

    for (let shrinkFactor = 0.98; shrinkFactor > 0.10; shrinkFactor -= 0.01) {
        const shrunk = coords.map(c => {
            const dx = c[0] - center[0];
            const dy = c[1] - center[1];
            return [center[0] + dx * shrinkFactor, center[1] + dy * shrinkFactor] as [number, number];
        });

        const overlaps = otherPolygons.some(other => checkOverlap(shrunk, other.coords));
        if (!overlaps) {
            return shrunk;
        }
    }

    return coords.map(c => {
        const dx = c[0] - center[0];
        const dy = c[1] - center[1];
        return [center[0] + dx * 0.05, center[1] + dy * 0.05] as [number, number];
    });
};

export const isPointInPolygon = (point: [number, number], polygon: [number, number][]): boolean => {
    let inside = false;
    const [lat, lng] = point;
    
    // Ray-casting (Jordan Curve Theorem)
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [latI, lngI] = polygon[i];
        const [latJ, lngJ] = polygon[j];
        
        const intersect = ((lngI > lng) !== (lngJ > lng))
            && (lat < (latJ - latI) * (lng - lngI) / (lngJ - lngI) + latI + 1e-11); 
        if (intersect) inside = !inside;
    }
    
    // Boundary check: If not inside, check if we are *on* the edge
    if (!inside) {
        const closest = getClosestPointOnPolygon(point, polygon);
        const distSq = Math.pow(lat - closest[0], 2) + Math.pow(lng - closest[1], 2);
        if (distSq < 1e-16) return true; // extremely close to edge
    }

    return inside;
};

export const getClosestPointOnPolygon = (point: [number, number], polygon: [number, number][]): [number, number] => {
    let minDistance = Infinity;
    let closestPoint: [number, number] = point;

    for (let i = 0; i < polygon.length; i++) {
        const p1 = polygon[i];
        const p2 = polygon[(i + 1) % polygon.length];
        
        // Closest point on line segment p1-p2
        const A = point[0] - p1[0];
        const B = point[1] - p1[1];
        const C = p2[0] - p1[0];
        const D = p2[1] - p1[1];

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;

        let xx, yy;

        if (param < 0) {
            xx = p1[0];
            yy = p1[1];
        } else if (param > 1) {
            xx = p2[0];
            yy = p2[1];
        } else {
            xx = p1[0] + param * C;
            yy = p1[1] + param * D;
        }

        const dx = point[0] - xx;
        const dy = point[1] - yy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minDistance) {
            minDistance = dist;
            closestPoint = [xx, yy];
        }
    }

    return closestPoint;
};

/**
 * Returns the index of the vertex starting the closest edge on a polygon boundary to a given point.
 */
export const getClosestEdgeIndex = (point: [number, number], polygon: [number, number][]): number => {
    let minDistance = Infinity;
    let closestIndex = -1;

    for (let i = 0; i < polygon.length; i++) {
        const p1 = polygon[i];
        const p2 = polygon[(i + 1) % polygon.length];
        
        const A = point[0] - p1[0];
        const B = point[1] - p1[1];
        const C = p2[0] - p1[0];
        const D = p2[1] - p1[1];

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;

        let xx, yy;
        if (param < 0) { xx = p1[0]; yy = p1[1]; }
        else if (param > 1) { xx = p2[0]; yy = p2[1]; }
        else { xx = p1[0] + param * C; yy = p1[1] + param * D; }

        const dist = Math.hypot(point[0] - xx, point[1] - yy);
        if (dist < minDistance) {
            minDistance = dist;
            closestIndex = i;
        }
    }

    return closestIndex;
};

export const getLineIntersection = (
    p1: [number, number], p2: [number, number], 
    p3: [number, number], p4: [number, number]
): [number, number] | null => {
    const [x1, y1] = p1; const [x2, y2] = p2;
    const [x3, y3] = p3; const [x4, y4] = p4;
    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (Math.abs(denom) < 1e-12) return null;
    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
    const eps = 1e-9;
    if (ua >= -eps && ua <= 1+eps && ub >= -eps && ub <= 1+eps) {
        return [x1 + ua * (x2 - x1), y1 + ua * (y2 - y1)];
    }
    return null;
};

export const getSegmentPolygonIntersections = (
    p1: [number, number], 
    p2: [number, number], 
    polygon: [number, number][]
): { point: [number, number], index: number }[] => {
    const intersections: { point: [number, number], index: number }[] = [];
    for (let i = 0; i < polygon.length; i++) {
        const p3 = polygon[i];
        const p4 = polygon[(i + 1) % polygon.length];
        const inter = getLineIntersection(p1, p2, p3, p4);
        if (inter) intersections.push({ point: inter, index: i });
    }
    return intersections;
};

/**
 * Extracts a path along a polygon boundary between two points. 
 * Assumes the points are snapped to the boundary edges starting at index1 and index2.
 */
export const getPathOnBoundary = (
    index1: number, 
    index2: number, 
    polygon: [number, number][],
    snapPoint1: [number, number],
    snapPoint2: [number, number]
): [number, number][] => {
    if (index1 === -1 || index2 === -1) return [snapPoint1, snapPoint2];
    
    // Path A: forward
    const pathA: [number, number][] = [snapPoint1];
    let i = index1;
    // Entrance is on edge (index1, index1+1). 
    // Forward path goes to vertex index1+1, then index1+2... until it reaches vertex index2, then snapPoint2.
    // Note: if index1 === index2 and we go forward, we might be going the long way around or short way.
    while (i !== index2) {
        i = (i + 1) % polygon.length;
        pathA.push(polygon[i]);
    }
    pathA.push(snapPoint2);

    // Path B: backward
    const pathB: [number, number][] = [snapPoint1];
    let j = index1;
    // Backward path goes to vertex index1, then index1-1... until it reaches vertex (index2+1)%len, then snapPoint2.
    while (j !== (index2 + 1) % polygon.length) {
        pathB.push(polygon[j]);
        j = (j - 1 + polygon.length) % polygon.length;
    }
    pathB.push(snapPoint2);

    // Calculate length of paths to pick the shorter one
    const getLen = (p: [number, number][]) => {
        let l = 0;
        for (let k = 0; k < p.length - 1; k++) {
            l += Math.hypot(p[k+1][0] - p[k][0], p[k+1][1] - p[k][1]);
        }
        return l;
    };

    return getLen(pathA) <= getLen(pathB) ? pathA : pathB;
};

export const checkOverlap = (coords1: [number, number][], coords2: [number, number][]): boolean => {
    try {
        if (coords1.length < 3 || coords2.length < 3) return false;

        // Quick bounds check first to save performance
        const poly1 = L.polygon(coords1);
        const poly2 = L.polygon(coords2);
        if (!poly1.getBounds().intersects(poly2.getBounds())) {
            return false;
        }

        const ring1 = ensureClosedRing(removeConsecutiveDuplicates(coords1)).map(([lat, lng]) => [lng, lat] as [number, number]);
        const ring2 = ensureClosedRing(removeConsecutiveDuplicates(coords2)).map(([lat, lng]) => [lng, lat] as [number, number]);

        if (ring1.length < 4 || ring2.length < 4) return false;

        const intersection = polyClip.intersection([[ring1]], [[ring2]]);
        
        if (!intersection || intersection.length === 0) {
            return false;
        }

        // Check if the intersection has any meaningful area (skip tiny slivers / shared borders)
        for (const multiPoly of intersection) {
            if (!multiPoly || multiPoly.length === 0) continue;
            const outerRing = multiPoly[0];
            const coords = outerRing.map(([lng, lat]) => [lat, lng] as [number, number]);
            
            // Calculate area of intersection in square meters (approx)
            // Just using the signed area function we already have, which works in degrees.
            // A threshold of 1e-12 degrees^2 is roughly 0.01 sq meter at the equator, 
            // enough to ignore float inaccuracies on shared borders.
            const area = Math.abs(polygonSignedArea(coords));
            if (area > 1e-12) {
                return true;
            }
        }

        return false;
    } catch (e) {
        console.error("Error checking overlap:", e);
        return false;
    }
};

/**
 * Checks if a line segment (p1, p2) intersects any edge of a polygon.
 */
export const segmentIntersectsPolygon = (p1: [number, number], p2: [number, number], polygon: [number, number][]): boolean => {
    const ccw = (A: [number, number], B: [number, number], C: [number, number]) => {
        return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
    };
    const intersect = (A: [number, number], B: [number, number], C: [number, number], D: [number, number]) => {
        return ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D);
    };

    for (let i = 0; i < polygon.length; i++) {
        const p3 = polygon[i];
        const p4 = polygon[(i + 1) % polygon.length];
        if (intersect(p1, p2, p3, p4)) return true;
    }
    return false;
};

export const fixOverlap = (coords: [number, number][], otherPolygons: PolygonData[]): [number, number][] => {
    try {
        if (coords.length < 3) {
            return coords;
        }

        const candidates = otherPolygons.filter(p => p.coords.length >= 3);
        if (candidates.length === 0) {
            return coords;
        }

        let workingPolygons: [number, number][][] = [coords];

        for (const obstacle of candidates) {
            const nextPolygons: [number, number][][] = [];
            for (const subjectPoly of workingPolygons) {
                const diff = subtractPolygon(subjectPoly, obstacle.coords);
                nextPolygons.push(...diff);
            }
            workingPolygons = nextPolygons;
        }

        const filtered = workingPolygons
            .map(poly => removeConsecutiveDuplicates(poly))
            .filter(poly => poly.length >= 3);

        if (filtered.length === 0) {
            console.warn("All candidate polygons removed during clipping, falling back to shrink");
            return shrinkPolygonAwayFromObstacles(coords, candidates);
        }

        filtered.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)));
        return filtered[0];

    } catch (e) {
        console.error("Error in fixOverlap:", e);
        return shrinkPolygonAwayFromObstacles(coords, otherPolygons);
    }
};
