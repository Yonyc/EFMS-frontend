import type { PolygonData } from "../types";

export const DEFAULT_POLYGON_COLOR = "#3388ff";

// normalises hex to #rrggbb, expands #rgb, falls back to default on garbage
export function normalizeHex(color: string | undefined | null): string {
    if (!color) return DEFAULT_POLYGON_COLOR;
    let c = color.trim();
    if (!c.startsWith("#")) return DEFAULT_POLYGON_COLOR;
    if (c.length === 4) {
        c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    }
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : DEFAULT_POLYGON_COLOR;
}

function hexToRgb(hex: string): [number, number, number] {
    const c = normalizeHex(hex);
    return [
        parseInt(c.slice(1, 3), 16),
        parseInt(c.slice(3, 5), 16),
        parseInt(c.slice(5, 7), 16),
    ];
}

function rgbToHex(r: number, g: number, b: number): string {
    const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
}

// 0 dark, 1 light
export function luminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// amount 0–1, used to derive the high-contrast stroke
export function darkenHex(hex: string, amount = 0.4): string {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

// pale fills get a strongly darkened edge, dark fills a milder one
export function strokeColorFor(fill: string): string {
    const lum = luminance(fill);
    return darkenHex(fill, lum > 0.7 ? 0.55 : lum > 0.45 ? 0.45 : 0.3);
}

// 0 = top level parcel, 1 = child, etc
export function getDepth(poly: PolygonData, byId: Map<string, PolygonData>): number {
    let d = 0;
    let cur: PolygonData | undefined = poly;
    const seen = new Set<string>();
    while (cur?.parentId && !seen.has(String(cur.id))) {
        seen.add(String(cur.id));
        cur = byId.get(String(cur.parentId));
        d++;
    }
    return d;
}

export function effectiveFillColor(poly: PolygonData): string {
    return normalizeHex(poly.color);
}

// DOM-safe id fragment for a hex color
export function colorKey(hex: string): string {
    return normalizeHex(hex).replace("#", "");
}
