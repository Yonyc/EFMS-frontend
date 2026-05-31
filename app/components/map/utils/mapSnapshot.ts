export interface SnapshotParcel {
    id: string;
    name: string;
    coords: [number, number][];
    color?: string | null;
}

export interface SnapshotResult {
    dataUrl: string;
    width: number;
    height: number;
}

interface SnapshotOptions {
    width?: number;
    height?: number;
    maxZoom?: number;
}

const TILE_SIZE = 256;
const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const ATTRIBUTION = "Tiles © Esri, Maxar, Earthstar Geographics";
const DEFAULT_COLOR = "#6366f1";

const lngToWorldX = (lng: number, z: number) => ((lng + 180) / 360) * TILE_SIZE * 2 ** z;
const latToWorldY = (lat: number, z: number) => {
    const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE_SIZE * 2 ** z;
};

function loadTile(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

export async function renderParcelsSatellite(
    parcels: SnapshotParcel[],
    opts: SnapshotOptions = {},
): Promise<SnapshotResult | null> {
    const width = opts.width ?? 1000;
    const height = opts.height ?? 700;
    const maxZoom = opts.maxZoom ?? 18;

    const usable = parcels.filter((p) => p.coords && p.coords.length >= 3);
    if (usable.length === 0) return null;

    // Bounding box of every vertex.
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of usable) {
        for (const [lat, lng] of p.coords) {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
        }
    }
    if (!Number.isFinite(minLat)) return null;

    const latSpan = Math.max(maxLat - minLat, 0.0005);
    const lngSpan = Math.max(maxLng - minLng, 0.0005);
    minLat -= latSpan * 0.12; maxLat += latSpan * 0.12;
    minLng -= lngSpan * 0.12; maxLng += lngSpan * 0.12;

    // Largest zoom whose padded bbox fits inside the canvas
    let zoom = maxZoom;
    for (let z = maxZoom; z >= 1; z--) {
        const extentX = lngToWorldX(maxLng, z) - lngToWorldX(minLng, z);
        const extentY = latToWorldY(minLat, z) - latToWorldY(maxLat, z); // lower lat => larger Y
        if (extentX <= width && extentY <= height) { zoom = z; break; }
        zoom = z;
    }

    const centerWorldX = lngToWorldX((minLng + maxLng) / 2, zoom);
    const centerWorldY = latToWorldY((minLat + maxLat) / 2, zoom);
    const originX = centerWorldX - width / 2; 
    const originY = centerWorldY - height / 2;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#1f2937";
    ctx.fillRect(0, 0, width, height);

    const tileMinX = Math.floor(originX / TILE_SIZE);
    const tileMaxX = Math.floor((originX + width) / TILE_SIZE);
    const tileMinY = Math.floor(originY / TILE_SIZE);
    const tileMaxY = Math.floor((originY + height) / TILE_SIZE);
    const span = 2 ** zoom;

    const jobs: Promise<void>[] = [];
    for (let tx = tileMinX; tx <= tileMaxX; tx++) {
        for (let ty = tileMinY; ty <= tileMaxY; ty++) {
            if (ty < 0 || ty >= span) continue;
            const wrappedX = ((tx % span) + span) % span;
            const url = `${TILE_URL}/${zoom}/${ty}/${wrappedX}`;
            const dx = tx * TILE_SIZE - originX;
            const dy = ty * TILE_SIZE - originY;
            jobs.push(loadTile(url).then((img) => {
                if (img) ctx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE);
            }));
        }
    }
    await Promise.all(jobs);

    const project = (lat: number, lng: number): [number, number] => [
        lngToWorldX(lng, zoom) - originX,
        latToWorldY(lat, zoom) - originY,
    ];

    // Parcel fills + outlines + labels.
    ctx.lineJoin = "round";
    for (const parcel of usable) {
        const color = parcel.color || DEFAULT_COLOR;
        const pts = parcel.coords.map(([lat, lng]) => project(lat, lng));

        ctx.beginPath();
        pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();

        ctx.globalAlpha = 0.3;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = color;
        ctx.stroke();

        // Label at the vertex centroid.
        if (parcel.name) {
            const cx = pts.reduce((s, [x]) => s + x, 0) / pts.length;
            const cy = pts.reduce((s, [, y]) => s + y, 0) / pts.length;
            ctx.font = "600 14px system-ui, -apple-system, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineWidth = 3;
            ctx.strokeStyle = "rgba(0,0,0,0.75)";
            ctx.strokeText(parcel.name, cx, cy);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(parcel.name, cx, cy);
        }
    }

    // Attribution
    ctx.font = "11px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    const pad = 6;
    const textW = ctx.measureText(ATTRIBUTION).width;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(width - textW - pad * 2, height - 20, textW + pad * 2, 20);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(ATTRIBUTION, width - pad, height - pad);

    return { dataUrl: canvas.toDataURL("image/png"), width, height };
}
