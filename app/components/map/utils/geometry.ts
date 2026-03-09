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

export const checkOverlap = (coords1: [number, number][], coords2: [number, number][]): boolean => {
    try {
        if (coords1.length < 3 || coords2.length < 3) return false;

        // Quick bounds check first to save performance
        const poly1 = L.polygon(coords1);
        const poly2 = L.polygon(coords2);
        if (!poly1.getBounds().intersects(poly2.getBounds())) {
            return false;
        }

        const ring1 = ensureClosedRing(coords1).map(([lat, lng]) => [lng, lat] as [number, number]);
        const ring2 = ensureClosedRing(coords2).map(([lat, lng]) => [lng, lat] as [number, number]);

        const intersection = polyClip.intersection([[ring1]], [[ring2]]);
        
        if (!intersection || intersection.length === 0) return false;

        // Check if the intersection has any meaningful area (skip tiny slivers / shared borders)
        for (const multiPoly of intersection) {
            if (!multiPoly || multiPoly.length === 0) continue;
            const outerRing = multiPoly[0];
            const coords = outerRing.map(([lng, lat]) => [lat, lng] as [number, number]);
            
            // Calculate area of intersection in square meters (approx)
            // Just using the signed area function we already have, which works in degrees.
            // A threshold of 1e-10 degrees^2 is roughly 1 sq meter at the equator, 
            // enough to ignore float inaccuracies on shared borders.
            const area = Math.abs(polygonSignedArea(coords));
            if (area > 1e-10) {
                return true;
            }
        }

        return false;
    } catch (e) {
        console.error("Error checking overlap:", e);
        return false;
    }
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
