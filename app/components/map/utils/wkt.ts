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
