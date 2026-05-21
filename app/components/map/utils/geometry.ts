import L from "leaflet";
import { diff as martinezDiff, intersection as martinezIntersection, union as martinezUnion } from "martinez-polygon-clipping";
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

// drops collinear vertices left by martinez after a difference
// iterated because one removal can flatten the next
// eps ≈ 0.1 m, below any real surveyed corner
export const removeCollinearVertices = (
    points: [number, number][],
    epsilon = 1e-6,
): [number, number][] => {
    let ring = points;
    for (let pass = 0; pass < 8 && ring.length > 3; pass++) {
        const out: [number, number][] = [];
        const n = ring.length;
        for (let i = 0; i < n; i++) {
            const prev = ring[(i - 1 + n) % n];
            const cur = ring[i];
            const next = ring[(i + 1) % n];
            const dx = next[0] - prev[0], dy = next[1] - prev[1];
            const L = Math.hypot(dx, dy);
            const dist = L < 1e-12
                ? Math.hypot(cur[0] - prev[0], cur[1] - prev[1])
                : Math.abs((cur[0] - prev[0]) * dy - (cur[1] - prev[1]) * dx) / L;
            if (dist > epsilon) out.push(cur);
            // don't let the ring drop below a triangle
            if (out.length + (n - 1 - i) <= 3) {
                for (let k = i + 1; k < n; k++) out.push(ring[k]);
                break;
            }
        }
        if (out.length === ring.length) return ring;
        ring = out;
    }
    return ring;
};

// dedupes any near-coincident vertices, not just consecutive ones
export const dedupeRing = (points: [number, number][], epsilon = 1e-7): [number, number][] => {
    if (points.length === 0) return [];
    const kept: [number, number][] = [];
    for (const point of points) {
        const dup = kept.some(k => Math.hypot(point[0] - k[0], point[1] - k[1]) <= epsilon);
        if (!dup) kept.push(point);
    }
    if (kept.length > 2) {
        const first = kept[0];
        const last = kept[kept.length - 1];
        if (Math.hypot(last[0] - first[0], last[1] - first[1]) <= epsilon) kept.pop();
    }
    return kept;
};

// edgecase
// martinez carries over drawn vertices when valid, so a piece with none of
// them is an error from a fully-forbidden shape, not a real correction
// eps ≈ 0.1 m to allow for clipper float drift
export const ringSharesVertex = (
    ring: [number, number][],
    reference: [number, number][],
    eps = 1e-6,
): boolean =>
    ring.some(r => reference.some(c => Math.hypot(r[0] - c[0], r[1] - c[1]) <= eps));

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

// flips [lat, lng] to [lng, lat] for martinez and closes the ring
export const coordsToMartinezRing = (coords: [number, number][]): number[][] => {
    return ensureClosedRing(coords).map(([lat, lng]) => [lng, lat]);
};

// reverses coordsToMartinezRing and drops the closing duplicate
export const martinezRingToCoords = (ring: number[][]): [number, number][] => {
    if (!ring || ring.length === 0) return [];
    const result: [number, number][] = [];
    for (let i = 0; i < ring.length - 1; i++) {
        const [lng, lat] = ring[i];
        result.push([lat, lng]);
    }
    return result;
};

// pulls outer rings from a martinez multipolygon, drops holes
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

// edgecase
// true when the point is strictly inside or sits right on the polygon edge
export const isPointInOrOnPolygon = (point: [number, number], polygon: [number, number][], tolerance: number = 1e-7): boolean => {
    if (isPointInPolygon(point, polygon)) return true;

    const closest = getClosestPointOnPolygon(point, polygon);
    const lngScale = Math.cos(point[0] * Math.PI / 180);
    const dLat = point[0] - closest[0];
    const dLng = (point[1] - closest[1]) * lngScale;
    const dist = Math.hypot(dLat, dLng);
    return dist < tolerance;
};

// edgecase
// strict containment: inside the polygon but not on the boundary
export const isPointStrictlyInsidePolygon = (point: [number, number], polygon: [number, number][], tolerance: number = 1e-7): boolean => {
    if (!isPointInPolygon(point, polygon)) return false;

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

// four-stage overlap test, each step is a stricter (and slower) fallback
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

// edgecase
// splits a "figure 8" ring, a body and a spike joined at near-duplicate vertex
// martinez emits this when the subtraction can't be one simple ring
// once split, the area and shared-vertex filters drop the spike
// eps ≈ 0.22 m, bigger than martinez drift, smaller than any real corner spacing
export const splitSelfTouchingRing = (
    ring: [number, number][],
    eps = 2e-6,
    depth = 0,
): [number, number][][] => {
    if (depth > 16 || ring.length < 4) return [ring];
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue;
            if (Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]) > eps) continue;
            const loopA = ring.slice(i, j);
            const loopB = [...ring.slice(j), ...ring.slice(0, i)];
            return [
                ...splitSelfTouchingRing(loopA, eps, depth + 1),
                ...splitSelfTouchingRing(loopB, eps, depth + 1),
            ];
        }
    }
    return [ring];
};

// returns the crossing point of two segments, or null if they only touch endpoints
const properSegmentCrossing = (
    p1: [number, number], p2: [number, number],
    p3: [number, number], p4: [number, number],
): [number, number] | null => {
    const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1];
    const d2x = p4[0] - p3[0], d2y = p4[1] - p3[1];
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-18) return null;
    const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / den;
    const u = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / den;
    const e = 1e-9;
    if (t <= e || t >= 1 - e || u <= e || u >= 1 - e) return null;
    return [p1[0] + t * d1x, p1[1] + t * d1y];
};

// edgecase
// splits a "bowtie" ring where two non-adjacent edges cross without sharing a vertex
// splitSelfTouchingRing can't see this, so we compute the crossing and cut there
// clean rings have no proper crossing and pass through untouched
export const splitSelfIntersectingRing = (
    ring: [number, number][],
    depth = 0,
): [number, number][][] => {
    if (depth > 24 || ring.length < 4) return [ring];
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const a1 = ring[i], a2 = ring[(i + 1) % n];
        for (let j = i + 1; j < n; j++) {
            if ((i + 1) % n === j || (j + 1) % n === i) continue;
            const X = properSegmentCrossing(a1, a2, ring[j], ring[(j + 1) % n]);
            if (!X) continue;
            const lobe1: [number, number][] = [X];
            for (let k = (i + 1) % n; ; k = (k + 1) % n) { lobe1.push(ring[k]); if (k === j) break; }
            const lobe2: [number, number][] = [X];
            for (let k = (j + 1) % n; ; k = (k + 1) % n) { lobe2.push(ring[k]); if (k === i) break; }
            return [
                ...splitSelfIntersectingRing(lobe1, depth + 1),
                ...splitSelfIntersectingRing(lobe2, depth + 1),
            ];
        }
    }
    return [ring];
};

// edgecase
// splits a "T junction" ring where a vertex sits inside a non-adjacent edge
// the other two splitters miss this since it's not a vertex pair or a crossing
// cut at the vertex into two lobes
export const splitVertexOnEdgeRing = (
    ring: [number, number][],
    distEps = 2e-6,
    depth = 0,
): [number, number][][] => {
    if (depth > 32 || ring.length < 4) return [ring];
    const n = ring.length;
    for (let k = 0; k < n; k++) {
        const v = ring[k];
        for (let j = 0; j < n; j++) {
            if (j === k || (j + 1) % n === k) continue;
            const a = ring[j], b = ring[(j + 1) % n];
            const dx = b[0] - a[0], dy = b[1] - a[1];
            const L2 = dx * dx + dy * dy;
            if (L2 < 1e-30) continue;
            const tRaw = ((v[0] - a[0]) * dx + (v[1] - a[1]) * dy) / L2;
            if (tRaw <= 1e-4 || tRaw >= 1 - 1e-4) continue;
            const dist = Math.hypot(v[0] - (a[0] + tRaw * dx), v[1] - (a[1] + tRaw * dy));
            if (dist > distEps) continue;
            const lobe1: [number, number][] = [];
            for (let i = k; ; i = (i + 1) % n) { lobe1.push(ring[i]); if (i === j) break; }
            const lobe2: [number, number][] = [ring[k]];
            for (let i = (j + 1) % n; i !== k; i = (i + 1) % n) lobe2.push(ring[i]);
            return [
                ...splitVertexOnEdgeRing(lobe1, distEps, depth + 1),
                ...splitVertexOnEdgeRing(lobe2, distEps, depth + 1),
            ];
        }
    }
    return [ring];
};

// run the three splitters until nothing changes
// one pass can leave a lobe that's bad in a different way, so iterate
export const splitToSimpleRings = (ring: [number, number][]): [number, number][][] => {
    let pieces = [ring];
    for (let pass = 0; pass < 8; pass++) {
        const next = pieces
            .flatMap(r => splitSelfTouchingRing(r))
            .flatMap(r => splitVertexOnEdgeRing(r))
            .flatMap(r => splitSelfIntersectingRing(r));
        if (next.length === pieces.length) return next;
        pieces = next;
    }
    return pieces;
};

// edgecase
// finds a bridge edge that runs along neither a neighbour border nor the user's outline
// martinez creates these when the real result needs holes and stitches them onto the
// outer ring with a near-zero-width chord. a single-ring parcel can't store that, so decline
const hasFreeSpaceBridge = (
    ring: [number, number][],
    subject: [number, number][],
    obstacles: PolygonData[],
    tolMeters = 20,
): boolean => {
    const segDistM = (p: [number, number], a: [number, number], b: [number, number]) => {
        const lngScale = Math.cos((p[0] * Math.PI) / 180);
        const ax = (b[1] - a[1]) * lngScale, ay = b[0] - a[0];
        const L2 = ax * ax + ay * ay || 1e-30;
        let t = (((p[1] - a[1]) * lngScale) * ax + (p[0] - a[0]) * ay) / L2;
        t = Math.max(0, Math.min(1, t));
        const cy = a[0] + t * (b[0] - a[0]);
        const cx = a[1] + t * (b[1] - a[1]);
        return Math.hypot(p[0] - cy, (p[1] - cx) * lngScale) * 111320;
    };
    const nearestBorderOrOutline = (p: [number, number]) => {
        let best = Infinity;
        for (let i = 0; i < subject.length; i++) {
            best = Math.min(best, segDistM(p, subject[i], subject[(i + 1) % subject.length]));
        }
        for (const o of obstacles) {
            const c = o.coords;
            for (let i = 0; i < c.length; i++) {
                best = Math.min(best, segDistM(p, c[i], c[(i + 1) % c.length]));
            }
        }
        return best;
    };
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        let bridge = true;
        for (let s = 0; s <= 8; s++) {
            const t = s / 8;
            const m: [number, number] = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
            if (nearestBorderOrOutline(m) <= tolMeters) { bridge = false; break; }
        }
        if (bridge) return true;
    }
    return false;
};

// trims `coords` to avoid `otherPolygons` and stay inside `parentCoords` if given,
// returns the largest valid piece, or the input untouched if no clean fix exists
export const fixOverlap = (coords: [number, number][], otherPolygons: PolygonData[], parentCoords?: [number, number][]): [number, number][] => {
    try {
        if (coords.length < 3) {
            return coords;
        }

        const cleanedCoords = dedupeRing(coords);
        if (cleanedCoords.length < 3) return coords;

        if (Math.abs(polygonSignedArea(cleanedCoords)) < 1e-10) {
            return coords;
        }

        const candidates = otherPolygons.filter(p => p.coords.length >= 3);

        let workingPolygons: [number, number][][] = [cleanedCoords];

        if (parentCoords && parentCoords.length >= 3) {
            const nextPolygons: [number, number][][] = [];
            for (const subjectPoly of workingPolygons) {
                const inter = intersectPolygon(subjectPoly, parentCoords);
                nextPolygons.push(...inter);
            }
            workingPolygons = nextPolygons;
        }

        // union the obstacles first and subtract once
        // doing it one obstacle at a time dropped intermediate holes and the
        // outer ring folded into the keyhole bridge slicing across parcels
        let clipGeom: MartinezMultiPolygon | null = null;
        for (const obstacle of candidates) {
            const g = [[coordsToMartinezRing(obstacle.coords)]] as unknown as MartinezMultiPolygon;
            clipGeom = clipGeom
                ? (martinezUnion(clipGeom as any, g as any) as MartinezMultiPolygon)
                : g;
        }

        const outerPieces: [number, number][][] = [];
        for (const subjectPoly of workingPolygons) {
            if (!clipGeom) { outerPieces.push(subjectPoly); continue; }
            const subjGeom = [[coordsToMartinezRing(subjectPoly)]] as unknown as MartinezMultiPolygon;
            const diff = martinezDiff(subjGeom as any, clipGeom as any) as MartinezMultiPolygon | null;
            if (!diff || diff.length === 0) continue;
            for (const poly of diff) {
                if (!poly || poly.length === 0) continue;
                // a real hole can't fit in a single-ring parcel, decline and let overlap detection flag it
                for (let r = 1; r < poly.length; r++) {
                    const holeCoords = martinezRingToCoords(poly[r]);
                    if (holeCoords.length >= 3 && Math.abs(polygonSignedArea(holeCoords)) > 1e-9) {
                        return coords;
                    }
                }
                const outer = removeConsecutiveDuplicates(martinezRingToCoords(poly[0]));
                if (outer.length < 3) continue;
                const subs = splitToSimpleRings(outer);
                for (const sub of subs) {
                    if (sub.length >= 3) outerPieces.push(sub);
                }
            }
        }

        const filtered = outerPieces
            .map(poly => removeCollinearVertices(dedupeRing(poly)))
            .filter(poly =>
                poly.length >= 3
                && Math.abs(polygonSignedArea(poly)) > 1e-12
                && ringSharesVertex(poly, cleanedCoords)
            );

        // nothing passed the filter, so the user drew entirely inside forbidden space
        // keep their shape rather than inventing geometry
        if (filtered.length === 0) return coords;

        filtered.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)));
        const result = filtered[0];

        if (hasFreeSpaceBridge(result, cleanedCoords, candidates)) return coords;

        return result;

    } catch (e) {
        console.error("Error in fixOverlap:", e);
        return coords;
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

// snaps `p` to the nearest polygon vertex or edge within `threshold`
// returns `p` unchanged if nothing is in range
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

    // distance-dominant with a small vertex bias
    // ranking every vertex above every edge made barely-in-range corners pull
    // points off the edge they sat on, which read as autocorrect skipping points
    const vertexBias = threshold * 0.3;
    const effective = (c: { dist: number; isVertex: boolean }) => c.dist - (c.isVertex ? vertexBias : 0);
    candidates.sort((a, b) => effective(a) - effective(b));
    return candidates[0].point;
};
