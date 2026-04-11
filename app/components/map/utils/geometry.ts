import L from "leaflet";
import { diff as martinezDiff, intersection as martinezIntersection } from "martinez-polygon-clipping";
import type { PolygonData } from "../types";

export type MartinezMultiPolygon = number[][][][];

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

export const coordsToMartinezRing = (coords: [number, number][]): number[][] => {
    return ensureClosedRing(coords).map(([lat, lng]) => [lng, lat]);
};

export const martinezRingToCoords = (ring: number[][]): [number, number][] => {
    if (!ring || ring.length === 0) return [];
    const result: [number, number][] = [];
    for (let i = 0; i < ring.length - 1; i++) {
        const [lng, lat] = ring[i];
        result.push([lat, lng]);
    }
    return result;
};

export const martinezToPolygons = (multi: MartinezMultiPolygon | null | undefined): [number, number][][] => {
    if (!multi) return [];
    const polygons: [number, number][][] = [];
    for (const polygon of multi) {
        if (!polygon || polygon.length === 0) continue;
        const outer = polygon[0];
        const coords = martinezRingToCoords(outer);
        if (coords.length >= 3) {
            polygons.push(coords);
        }
    }
    return polygons;
};

export const subtractPolygon = (
    subject: [number, number][],
    clip: [number, number][]
): [number, number][][] => {
    if (subject.length < 3) return [];
    if (clip.length < 3) return [subject];

    const subjectPoly = [[coordsToMartinezRing(subject)]];
    const clipPoly = [[coordsToMartinezRing(clip)]];

    const diff = martinezDiff(subjectPoly, clipPoly) as MartinezMultiPolygon | null;
    if (!diff || diff.length === 0) {
        return [];
    }

    return martinezToPolygons(diff).map(removeConsecutiveDuplicates);
};

export const intersectPolygon = (
    subject: [number, number][],
    clip: [number, number][]
): [number, number][][] => {
    if (subject.length < 3) return [];
    if (clip.length < 3) return [];

    const subjectPoly = [[coordsToMartinezRing(subject)]];
    const clipPoly = [[coordsToMartinezRing(clip)]];

    const inter = martinezIntersection(subjectPoly, clipPoly) as MartinezMultiPolygon | null;
    if (!inter || inter.length === 0) {
        return [];
    }

    return martinezToPolygons(inter).map(removeConsecutiveDuplicates);
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
    const x = point[0], y = point[1];
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    
    return inside;
};

export const isPointInOrOnPolygon = (point: [number, number], polygon: [number, number][], tolerance: number = 1e-7): boolean => {
    if (isPointInPolygon(point, polygon)) return true;
    
    // if completly outside outside it check if it's right on the edge
    const closest = getClosestPointOnPolygon(point, polygon);
    const lngScale = Math.cos(point[0] * Math.PI / 180);
    const dLat = point[0] - closest[0];
    const dLng = (point[1] - closest[1]) * lngScale;
    const dist = Math.hypot(dLat, dLng);
    return dist < tolerance;
};

export const isPointStrictlyInsidePolygon = (point: [number, number], polygon: [number, number][], tolerance: number = 1e-7): boolean => {
    if (!isPointInPolygon(point, polygon)) return false;
    
    // it's inside but is it exactly on the edge
    const closest = getClosestPointOnPolygon(point, polygon);
    const lngScale = Math.cos(point[0] * Math.PI / 180);
    const dLat = point[0] - closest[0];
    const dLng = (point[1] - closest[1]) * lngScale;
    const dist = Math.hypot(dLat, dLng);
    return dist >= tolerance;
};

// check if line segments cross
const intersectSegments = (p1: [number, number], p2: [number, number], p3: [number, number], p4: [number, number]): boolean => {
    const [y1, x1] = p1, [y2, x2] = p2, [y3, x3] = p3, [y4, x4] = p4;
    const det = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
    if (det === 0) return false;
    const lambda = ((y4 - y3) * (x4 - x1) + (x3 - x4) * (y4 - y1)) / det;
    const gamma = ((y1 - y2) * (x4 - x1) + (x2 - x1) * (y4 - y1)) / det;
    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
};

export const doEdgesIntersect = (poly1: [number, number][], poly2: [number, number][]): boolean => {
    const r1 = ensureClosedRing(poly1);
    const r2 = ensureClosedRing(poly2);
    for (let i = 0; i < r1.length - 1; i++) {
        for (let j = 0; j < r2.length - 1; j++) {
            if (intersectSegments(r1[i], r1[i + 1], r2[j], r2[j + 1])) return true;
        }
    }
    return false;
};

export const checkOverlap = (coords1: [number, number][], coords2: [number, number][]): boolean => {
    try {
        if (coords1.length < 3 || coords2.length < 3) return false;
        
        // 1. bounds check
        const poly1 = L.polygon(coords1);
        const poly2 = L.polygon(coords2);
        if (!poly1.getBounds().intersects(poly2.getBounds())) return false;

        // 2. fast vertex check
        for (const point of coords1) {
            if (isPointInPolygon(point, coords2)) return true;
        }
        for (const point of coords2) {
            if (isPointInPolygon(point, coords1)) return true;
        }

        // 3. edge crossing for thin overlaps
        if (doEdgesIntersect(coords1, coords2)) return true;

        // 4. martinez intersection
        const s1 = [[coordsToMartinezRing(coords1)]];
        const s2 = [[coordsToMartinezRing(coords2)]];
        const inter = martinezIntersection(s1, s2) as MartinezMultiPolygon | null;
        if (inter && inter.length > 0) {
            const polys = martinezToPolygons(inter);
            if (polys.some(p => Math.abs(polygonSignedArea(p)) > 1e-12)) return true;
        }
        
        return false;
    } catch (e) {
        console.error("Error in checkOverlap:", e);
        return false;
    }
};

export const fixOverlap = (coords: [number, number][], otherPolygons: PolygonData[], parentCoords?: [number, number][]): [number, number][] => {
    try {
        if (coords.length < 3) {
            return coords;
        }

        const cleanedCoords = removeConsecutiveDuplicates(coords);
        if (cleanedCoords.length < 3) return coords;

        if (Math.abs(polygonSignedArea(cleanedCoords)) < 1e-10) {
            return coords;
        }

        let workingPolygons: [number, number][][] = [cleanedCoords];

        // if child intersect with parent first
        if (parentCoords && parentCoords.length >= 3) {
            const nextPolygons: [number, number][][] = [];
            for (const subjectPoly of workingPolygons) {
                const inter = intersectPolygon(subjectPoly, parentCoords);
                nextPolygons.push(...inter);
            }
            workingPolygons = nextPolygons;
        }

        // subtract all siblings/obstacles
        const candidates = otherPolygons.filter(p => p.coords.length >= 3);
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
            console.warn("All candidate polygons removed during clipping, following fallback");
            // only shrink if there are obstacles otherwise it's just outside of the parent
            if (candidates.length > 0) {
                return shrinkPolygonAwayFromObstacles(coords, candidates);
            }
            return coords;
        }

        filtered.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)));
        return filtered[0];

    } catch (e) {
        console.error("Error in fixOverlap:", e);
        return shrinkPolygonAwayFromObstacles(coords, otherPolygons);
    }
};

export const getClosestPointOnSegment = (p: [number, number], a: [number, number], b: [number, number], lngScale: number = 1): [number, number] => {
    // py = lat, px = lng
    const [py, px] = p;
    const [ay, ax] = a;
    const [by, bx] = b;
    
    const dLng = (bx - ax) * lngScale;
    const dLat = by - ay;
    
    if (dLng === 0 && dLat === 0) return a;
    
    const pLng = px * lngScale;
    const aLng = ax * lngScale;
    
    const t = ((pLng - aLng) * dLng + (py - ay) * dLat) / (dLng * dLng + dLat * dLat);
    const cappedT = Math.max(0, Math.min(1, t));
    
    return [ay + cappedT * (by - ay), ax + cappedT * (bx - ax)];
};

export const getClosestPointOnPolygon = (p: [number, number], polygon: [number, number][]): [number, number] => {
    if (polygon.length < 2) return polygon[0] || p;
    
    let minD = Infinity;
    let best: [number, number] = p;
    const closed = ensureClosedRing(polygon);
    
    const lngScale = Math.cos(p[0] * Math.PI / 180);
    
    for (let i = 0; i < closed.length - 1; i++) {
        const closest = getClosestPointOnSegment(p, closed[i], closed[i + 1], lngScale);
        const dLat = p[0] - closest[0];
        const dLng = (p[1] - closest[1]) * lngScale;
        const d = Math.hypot(dLat, dLng);
        if (d < minD) {
            minD = d;
            best = closest;
        }
    }
    return best;
};

export const magnetSnap = (p: [number, number], polygons: [number, number][][], threshold: number): [number, number] => {
    let minD = threshold;
    let best = p;
    
    const lngScale = Math.cos(p[0] * Math.PI / 180);
    const candidates: { point: [number, number], dist: number, isVertex: boolean }[] = [];

    for (const poly of polygons) {
        if (poly.length < 2) continue;
        
        // check vertices
        for (const vertex of poly) {
            const dLat = p[0] - vertex[0];
            const dLng = (p[1] - vertex[1]) * lngScale;
            const d = Math.hypot(dLat, dLng);
            if (d < threshold) {
                candidates.push({ point: vertex, dist: d, isVertex: true });
            }
        }

        // check edges
        const snapped = getClosestPointOnPolygon(p, poly);
        const dLat = p[0] - snapped[0];
        const dLng = (p[1] - snapped[1]) * lngScale;
        const d = Math.hypot(dLat, dLng);
        if (d < threshold) {
            candidates.push({ point: snapped, dist: d, isVertex: false });
        }
    }

    if (candidates.length === 0) return p;

    // Prioritize vertices, then distance
    candidates.sort((a, b) => {
        if (a.isVertex !== b.isVertex) return a.isVertex ? -1 : 1;
        return a.dist - b.dist;
    });
    return candidates[0].point;
};
