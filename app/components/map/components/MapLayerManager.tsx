import {
    MapContainer,
    TileLayer,
    Polygon,
    Polyline,
    FeatureGroup,
    useMap,
    useMapEvents,
    Tooltip,
    ZoomControl
} from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PolygonData, OverlapWarning } from "../types";
import { clampToRect, getSafeMenuPosition } from "../utils/mapUtils";
import { isPointInPolygon, intersectPolygon, polygonSignedArea } from "../utils/geometry";
import {
    effectiveFillColor, strokeColorFor, getDepth, darkenHex,
} from "../utils/colorUtils";

interface MapLayerManagerProps {
    center: [number, number];
    polygons: PolygonData[];
    editingId: string | null;
    selectedId: string | null;
    setSelectedId: (id: string | null) => void;
    isCreating: boolean;
    drawOptions: any;
    handleCreated: (e: any) => void;
    overlapWarning: OverlapWarning | null;
    showPreview: boolean;
    previewVisibility: { original: boolean; fixed: boolean };
    pendingManualEditId: string | null;
    featureGroupRef: React.RefObject<L.FeatureGroup>;
    editControlRef: React.RefObject<any>;
    polygonLayersRef: React.MutableRefObject<Map<string, L.Polygon>>;
    setPolygonContextMenu: (m: { x: number; y: number; polygonId: string; mapRect?: { left: number; top: number; right: number; bottom: number } } | null) => void;
    setRenamingId: (id: string | null) => void;
    setRenameValue: (s: string) => void;
    setPendingDeleteId: (id: string | null) => void;
    setContextMenu: (m: { x: number; y: number } | null) => void;
    closePolygonContextMenu: () => void;
    viewportDebounceRef: React.MutableRefObject<number | null>;
    setViewportBounds: (b: any) => void;
    hasActiveSearchFilters: boolean;
    isImportMode: boolean;
    contextType: string;
    drawingPoints: [number, number][];
    ghostCoords: [number, number][];
    createPreviewPoint: [number, number] | null;
    autoCorrectEnabled: boolean;
    setIsHoveringSketchHandle: (isHovering: boolean) => void;
    suppressSketchClickTemporarily: (ms?: number) => void;
    moveSketchPoint: (index: number, point: [number, number]) => [number, number];
    insertSketchPoint: (insertAfterIndex: number, point: [number, number]) => boolean;
    sketchInsertPreview: [number, number][] | null;
    previewSketchInsertion: (edgeIndex: number, point: [number, number]) => [number, number] | null;
    clearSketchInsertPreview: () => void;
    removeSketchPoint: (index: number) => void;
    // 1 = top level, max can be Infinity for all
    minLayer?: number;
    maxLayer?: number;
    // scope to this parcel and its descendants when set
    restrictToFamilyId?: string | null;
    highlightLastPoint?: boolean;
}

import { Marker } from "react-leaflet";

const vertexIcon = L.divIcon({
    className: 'custom-vertex-icon',
    html: '<div style="background-color: #3388ff; width: 12px; height: 12px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6]
});

// highlights the last vertex when the remove-last button is hovered
const vertexDeleteHighlightIcon = L.divIcon({
    className: 'custom-vertex-icon vertex-delete-highlight',
    html: '<div style="background-color: #ef4444; width: 20px; height: 20px; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 0 3px rgba(239,68,68,0.45), 0 0 8px rgba(239,68,68,0.8);"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
});

const midpointIcon = L.divIcon({
    className: 'custom-midpoint-icon',
    html: '<div class="midpoint-dot"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

const MIDPOINT_Z_INDEX = 200000;
const VERTEX_Z_INDEX = 300000;

const ZIndexEnforcer = ({ polygons, polygonLayersRef, editingId }: { polygons: PolygonData[], polygonLayersRef: React.MutableRefObject<Map<string, L.Polygon>>, editingId: string | null }) => {
    const map = useMap();
    
    const signature = useMemo(() => {
        const parts: string[] = [editingId || ''];
        for (const p of polygons) {
            if (p.parentId && p.visible) parts.push(`${p.id}|${p.parentId}`);
        }
        return parts.join('#');
    }, [polygons, editingId]);

    useEffect(() => {
        if (!map) return;
        const timer = setTimeout(() => {
            const byId = new Map(polygons.map(p => [String(p.id), p]));
            const depthOf = (poly: typeof polygons[number]) => {
                let d = 0;
                let cur: typeof poly | undefined = poly;
                const seen = new Set<string>();
                while (cur?.parentId && !seen.has(String(cur.id))) {
                    seen.add(String(cur.id));
                    cur = byId.get(String(cur.parentId));
                    d++;
                }
                return d;
            };
            // shallowest first so each deeper one ends up above its ancestor
            const children = polygons
                .filter(p => p.parentId && p.visible)
                .sort((a, b) => depthOf(a) - depthOf(b));
            children.forEach(child => {
                const layer = polygonLayersRef.current.get(child.id);
                if (layer && typeof layer.bringToFront === 'function') {
                    layer.bringToFront();
                }
            });
        }, 50);
        return () => clearTimeout(timer);
    // signature gates the run so polygons is intentionally not a dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, signature]);
    return null;
};

const SVGNS = "http://www.w3.org/2000/svg";

// stable non-negative hash for per-parcel variation
function stableHash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

// svg-id-safe so each sub-parcel gets its own pattern
function parcelPatternId(polyId: string): string {
    return `efms-pat-${String(polyId).replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

// builds the <pattern> shell with a per-id rotation, variants add their marks on top
function makePatternFrame(poly: PolygonData, depth: number) {
    const color = effectiveFillColor(poly);
    const ink = darkenHex(color, 0.45);
    const h = stableHash(String(poly.id));
    const rot = [15, 35, 50, 65, 105, 120, 140, 160][h % 8];
    // cap at 3 so the tile stays light at deep nesting
    const lineCount = Math.min(3, Math.max(1, depth));
    const lineGap = 7;
    const bundleW = (lineCount - 1) * lineGap;
    const margin = 26 + (h % 3) * 6;
    const size = Math.round(bundleW + margin);

    const pattern = document.createElementNS(SVGNS, "pattern");
    pattern.setAttribute("id", parcelPatternId(poly.id));
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("width", String(size));
    pattern.setAttribute("height", String(size));
    pattern.setAttribute("patternTransform", `rotate(${rot})`);

    const bg = document.createElementNS(SVGNS, "rect");
    bg.setAttribute("width", String(size));
    bg.setAttribute("height", String(size));
    bg.setAttribute("fill", color);
    bg.setAttribute("fill-opacity", "0.18");
    pattern.appendChild(bg);

    return { pattern, ink, size, lineCount, lineGap, bundleW };
}

function buildStripes(poly: PolygonData, depth: number): SVGPatternElement {
    const f = makePatternFrame(poly, depth);
    const x0 = (f.size - f.bundleW) / 2;
    for (let i = 0; i < f.lineCount; i++) {
        const line = document.createElementNS(SVGNS, "line");
        line.setAttribute("x1", String(x0 + i * f.lineGap));
        line.setAttribute("y1", "-2");
        line.setAttribute("x2", String(x0 + i * f.lineGap));
        line.setAttribute("y2", String(f.size + 2));
        line.setAttribute("stroke", f.ink);
        line.setAttribute("stroke-width", "1.1");
        line.setAttribute("stroke-opacity", "0.32");
        line.setAttribute("stroke-linecap", "round");
        f.pattern.appendChild(line);
    }
    return f.pattern;
}

function buildParcelPattern(poly: PolygonData, depth: number): SVGPatternElement {
    return buildStripes(poly, depth);
}

// keeps <defs> in sync with the visible sub-parcels so pathOptions url(#id) resolves
const ParcelPatternDefs = ({ polygons }: { polygons: PolygonData[] }) => {
    const map = useMap();
    // skip the defs rebuild when polygons reference changed but nothing visible did
    const signature = useMemo(() => {
        const parts: string[] = [];
        for (const p of polygons) {
            if (!p.parentId) continue;
            parts.push(`${p.id}|${p.parentId}|${p.visible ? 1 : 0}|${p.color || ''}`);
        }
        return parts.join('#');
    }, [polygons]);

    useEffect(() => {
        if (!map) return;
        const apply = (): boolean => {
            const svg = map.getPanes()?.overlayPane?.querySelector("svg");
            if (!svg) return false;
            let defs = svg.querySelector("defs#efms-defs") as SVGDefsElement | null;
            if (!defs) {
                defs = document.createElementNS(SVGNS, "defs") as SVGDefsElement;
                defs.setAttribute("id", "efms-defs");
                svg.insertBefore(defs, svg.firstChild);
            }
            const byId = new Map(polygons.map(p => [String(p.id), p]));
            const wanted = new Set<string>();
            for (const poly of polygons) {
                if (!poly.parentId || !poly.visible) continue;
                const id = parcelPatternId(poly.id);
                wanted.add(id);
                defs.querySelector(`#${CSS.escape(id)}`)?.remove();
                defs.appendChild(buildParcelPattern(poly, getDepth(poly, byId)));
            }
            defs.querySelectorAll("pattern").forEach(p => {
                if (p.id && !wanted.has(p.id)) p.remove();
            });
            return true;
        };
        // retry only if the overlay svg isn't mounted yet
        if (!apply()) {
            const t = setTimeout(apply, 80);
            return () => clearTimeout(t);
        }
    // signature is the real dep, polygons reference is intentionally ignored
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, signature]);
    return null;
};

// module scope so its component type stays stable, otherwise leaflet listeners rebind every render
interface MapEventsProps {
    propsRef: React.MutableRefObject<{
        hasActiveSearchFilters: boolean;
        isImportMode: boolean;
        contextType: string;
        editingId: string | null;
        isCreating: boolean;
        setViewportBounds: (b: any) => void;
        setContextMenu: (m: { x: number; y: number } | null) => void;
        setRenamingId: (id: string | null) => void;
        setRenameValue: (s: string) => void;
        setPendingDeleteId: (id: string | null) => void;
        closePolygonContextMenu: () => void;
        setSelectedId: (id: string | null) => void;
    }>;
    viewportDebounceRef: React.MutableRefObject<number | null>;
    mapInstanceRef: React.MutableRefObject<L.Map | null>;
}

const MAP_MENU_WIDTH = 240;
const MAP_MENU_HEIGHT = 200;
const POPUP_PADDING = 12;

// shared by the handlers and the mount effect, covers a missed `load` event
function pushViewportFromMap(map: L.Map, p: MapEventsProps['propsRef']['current']) {
    if (p.hasActiveSearchFilters || p.isImportMode || p.contextType !== 'farm') return;
    const bounds = map.getBounds().pad(0.2);
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    p.setViewportBounds({
        minLat: sw.lat,
        minLng: sw.lng,
        maxLat: ne.lat,
        maxLng: ne.lng,
    });
}

function MapEvents({ propsRef, viewportDebounceRef, mapInstanceRef }: MapEventsProps) {
    const mapForRef = useMap();
    useEffect(() => {
        mapInstanceRef.current = mapForRef;
    }, [mapForRef, mapInstanceRef]);

    // whenReady covers the case where `load` already fired before useMapEvents attached
    useEffect(() => {
        if (!mapForRef) return;
        mapForRef.whenReady(() => pushViewportFromMap(mapForRef, propsRef.current));
    }, [mapForRef, propsRef]);

    // []-memoised so leaflet attaches once, handlers read live values off propsRef
    const handlers = useMemo(() => {
        const debouncedPush = (map: L.Map) => {
            if (viewportDebounceRef.current) window.clearTimeout(viewportDebounceRef.current);
            viewportDebounceRef.current = window.setTimeout(() => pushViewportFromMap(map, propsRef.current), 150);
        };
        return {
            load: (e: any) => debouncedPush(e.target as L.Map),
            moveend: (e: any) => debouncedPush(e.target as L.Map),
            zoomend: (e: any) => debouncedPush(e.target as L.Map),
            contextmenu: (e: any) => {
                const p = propsRef.current;
                if (!p.editingId && !p.isCreating) {
                    e.originalEvent.preventDefault();
                    const mapRect = (e.target as L.Map)?.getContainer?.()?.getBoundingClientRect?.();
                    const { x, y } = mapRect
                        ? clampToRect(e.originalEvent.clientX, e.originalEvent.clientY, MAP_MENU_WIDTH, MAP_MENU_HEIGHT, mapRect, POPUP_PADDING)
                        : getSafeMenuPosition(e.originalEvent.clientX, e.originalEvent.clientY, MAP_MENU_WIDTH, MAP_MENU_HEIGHT, POPUP_PADDING);
                    p.setContextMenu({ x, y });
                }
            },
            click: () => {
                const p = propsRef.current;
                if (p.editingId) return;
                p.setRenamingId(null);
                p.setRenameValue('');
                p.setPendingDeleteId(null);
                p.setContextMenu(null);
                p.closePolygonContextMenu();
                p.setSelectedId(null);
            },
            mousedown: () => {
                const p = propsRef.current;
                p.closePolygonContextMenu();
                p.setContextMenu(null);
            },
            popupopen: (e: any) => propsRef.current.editingId && e.popup?.remove?.(),
        };
    // stable by design, live values pulled from propsRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useMapEvents(handlers);
    return null;
}

type BaseLayer = 'osm' | 'satellite' | 'topo';

const TILE_LAYERS: Record<BaseLayer, { url: string; attribution: string; maxNativeZoom: number }> = {
    osm: {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors',
        maxNativeZoom: 19,
    },
    satellite: {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: 'Tiles &copy; Esri &mdash; Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN',
        maxNativeZoom: 19,
    },
    topo: {
        url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
        maxNativeZoom: 17,
    },
};

const LAYER_LABELS: Record<BaseLayer, string> = { osm: 'Map', satellite: 'Satellite', topo: 'Topo' };

function MapLayerManagerImpl({
    center, polygons, editingId, selectedId, setSelectedId, isCreating,
    drawOptions, handleCreated, overlapWarning, showPreview, previewVisibility,
    pendingManualEditId, featureGroupRef, editControlRef, polygonLayersRef,
    setPolygonContextMenu, setRenamingId, setRenameValue, setPendingDeleteId, setContextMenu,
    closePolygonContextMenu, viewportDebounceRef, setViewportBounds,
    hasActiveSearchFilters, isImportMode, contextType,
    drawingPoints, ghostCoords, createPreviewPoint, autoCorrectEnabled,
    setIsHoveringSketchHandle, suppressSketchClickTemporarily, moveSketchPoint, insertSketchPoint, sketchInsertPreview, previewSketchInsertion, clearSketchInsertPreview, removeSketchPoint,
    minLayer = 1, maxLayer = 1, restrictToFamilyId = null,
    highlightLastPoint = false
}: MapLayerManagerProps) {

    const [baseLayer, setBaseLayer] = useState<BaseLayer>('osm');

    // single id→poly map shared by depth, family scope and the render filter
    const polyById = useMemo(() => new Map(polygons.map(p => [String(p.id), p])), [polygons]);
    const layerOf = (p: PolygonData) => getDepth(p, polyById) + 1;
    // walks up the parent chain to check if id belongs to rootId's family
    const isInFamily = (id: string | null | undefined, rootId: string | null) => {
        if (!rootId) return true;
        let cur: string | null | undefined = id;
        const seen = new Set<string>();
        while (cur && !seen.has(String(cur))) {
            if (String(cur) === String(rootId)) return true;
            seen.add(String(cur));
            cur = polyById.get(String(cur))?.parentId ?? null;
        }
        return false;
    };
    const isInLayerRange = (p: PolygonData) => {
        const l = layerOf(p);
        return l >= minLayer && l <= maxLayer;
    };

    const draggingMidpointRef = useRef<{ edgeIndex: number; lastLatLng: [number, number] } | null>(null);
    const isDraggingHandleRef = useRef(false);
    const suppressMidpointClickUntilRef = useRef(0);
    const mapInstanceRef = useRef<L.Map | null>(null);

    // visible polygons in render order, shallowest first so children paint on top
    // memoised so sketch ticks and selection changes don't re-walk the tree
    const renderedPolygons = useMemo(() => {
        const depthOf = (poly: PolygonData) => {
            let d = 0;
            let cur: PolygonData | undefined = poly;
            const seen = new Set<string>();
            while (cur?.parentId && !seen.has(String(cur.id))) {
                seen.add(String(cur.id));
                cur = polyById.get(String(cur.parentId));
                d++;
            }
            return d;
        };
        return polygons
            .filter(p => {
                if (!p.visible) return false;
                if (overlapWarning?.polygonId === p.id) return false;
                if (editingId === p.id) return false;
                if (pendingManualEditId === p.id) return false;
                if (selectedId === p.id || editingId === p.id) return true;
                if (!isInLayerRange(p)) return false;
                if (restrictToFamilyId && !isInFamily(p.id, restrictToFamilyId)) return false;
                return true;
            })
            .sort((a, b) => depthOf(a) - depthOf(b));
    // deps listed primitively, helpers aren't stable refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [polygons, polyById, overlapWarning?.polygonId, editingId, pendingManualEditId, selectedId, minLayer, maxLayer, restrictToFamilyId]);

    // live values for MapEvents so it can stay []-memoised
    const mapEventsPropsRef = useRef({
        hasActiveSearchFilters, isImportMode, contextType,
        editingId, isCreating,
        setViewportBounds, setContextMenu, setRenamingId, setRenameValue,
        setPendingDeleteId, closePolygonContextMenu, setSelectedId,
    });
    useEffect(() => {
        mapEventsPropsRef.current = {
            hasActiveSearchFilters, isImportMode, contextType,
            editingId, isCreating,
            setViewportBounds, setContextMenu, setRenamingId, setRenameValue,
            setPendingDeleteId, closePolygonContextMenu, setSelectedId,
        };
    });
    // hide the add-point handle on edges shorter than this, no room for a real vertex
    const MIN_MIDPOINT_EDGE_PX = 30;

    const setMapDraggingEnabled = (marker: L.Marker, enabled: boolean) => {
        const map = (marker as any)._map as L.Map | undefined;
        if (!map) return;
        if (enabled) map.dragging.enable();
        else map.dragging.disable();
    };

    const resetHandleInteraction = (marker?: L.Marker) => {
        const markerMap = marker ? ((marker as any)._map as L.Map | undefined) : undefined;
        const fallbackMap = (featureGroupRef.current as any)?._map as L.Map | undefined;
        const map = markerMap ?? fallbackMap;
        map?.dragging?.enable?.();
        isDraggingHandleRef.current = false;
        setIsHoveringSketchHandle(false);
    };

    useEffect(() => {
        return () => {
            draggingMidpointRef.current = null;
            resetHandleInteraction();
        };
    }, []);

    const setHandleHover = (isHovering: boolean) => {
        if (isDraggingHandleRef.current && !isHovering) return;
        setIsHoveringSketchHandle(isHovering);
    };

    const shouldSuppressMidpointClick = () => Date.now() < suppressMidpointClickUntilRef.current;

    // focus picked polygon
    useEffect(() => {
        if (!selectedId) return;
        const layer = polygonLayersRef.current.get(selectedId);
        if (!layer) return;

        layer.setStyle({ dashArray: '10 5' });
        const element = layer.getElement();
        if (element) element.classList.add('polygon-glow');

        return () => {
            const target = polygonLayersRef.current.get(selectedId);
            if (!target) return;
            target.setStyle({ dashArray: undefined, dashOffset: '0' });
            const el = target.getElement();
            if (el) el.classList.remove('polygon-glow');
        };
    }, [selectedId, polygonLayersRef, polygons]);

    const tileLayer = TILE_LAYERS[baseLayer];

    return (
        <div style={{ position: 'relative', height: '100%', width: '100%' }}>
        <MapContainer
            style={{ height: "100%", width: "100%" }}
            center={center}
            zoom={15}
            maxZoom={22}
            zoomControl={false}
        >
            <TileLayer
                key={baseLayer}
                url={tileLayer.url}
                attribution={tileLayer.attribution}
                maxNativeZoom={tileLayer.maxNativeZoom}
                maxZoom={22}
            />
            <ZoomControl position="bottomright" />
            <MapEvents propsRef={mapEventsPropsRef} viewportDebounceRef={viewportDebounceRef} mapInstanceRef={mapInstanceRef} />
            <ZIndexEnforcer polygons={polygons} polygonLayersRef={polygonLayersRef} editingId={editingId} />
            <ParcelPatternDefs polygons={polygons} />

            <FeatureGroup ref={featureGroupRef}>
                <EditControl
                    ref={editControlRef}
                    position="topright"
                    draw={drawOptions}
                    onCreated={handleCreated}
                />

                {renderedPolygons.map(poly => {
                        const isThisEditing = editingId === poly.id;
                        const isSelected = selectedId === poly.id;
                        const effColor = effectiveFillColor(poly);
                        const strokeColor = strokeColorFor(effColor);
                        const polyColor = effColor;
                        const showPermanentTooltip = isSelected;
                        const polygonKey = `${poly.id}-${poly.version}`;

                        let displayCoords = poly.coords;
                        if (editingId === String(poly.parentId) && ghostCoords && ghostCoords.length >= 3) {
                            try {
                                const inters = intersectPolygon(poly.coords, ghostCoords);
                                if (inters && inters.length > 0) {
                                    inters.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)));
                                    displayCoords = inters[0];
                                }
                            } catch (e) {
                                console.error("Error live-clipping child polygon", e);
                            }
                        }

                        return (
                            <Polygon
                                key={polygonKey}
                                positions={displayCoords}
                                interactive={!isThisEditing && !editingId && !isCreating}
                                pathOptions={{
                                    color: strokeColor,
                                    // sub-parcels use their own svg pattern as fill, parents stay solid
                                    fillColor: poly.parentId ? `url(#${parcelPatternId(poly.id)}) ${effColor}` : effColor,
                                    opacity: isThisEditing ? 0.95 : 1,
                                    fillOpacity: poly.parentId ? 1 : (isSelected ? 0.4 : 0.28),
                                    // tighter dash for deeper children so layers read differently
                                    dashArray: isThisEditing
                                        ? '8 6'
                                        : (poly.parentId
                                            ? (layerOf(poly) >= 4 ? '3 2' : layerOf(poly) === 3 ? '4 3' : '6 4')
                                            : undefined),
                                    weight: isThisEditing ? 4 : (poly.parentId ? (isSelected ? 3.5 : 2.5) : (isSelected ? 5 : 3.5)),
                                    className: `efms-parcel${poly.parentId ? ' efms-child' : ''}${isSelected ? ' efms-selected' : ''}`,
                                }}
                                eventHandlers={{
                                    add: e => {
                                        const layer = e.target as L.Polygon;
                                        (layer.options as any).customId = poly.id;
                                        polygonLayersRef.current.set(poly.id, layer);

                                        // keep the selection glow when the layer gets recreated
                                        if (selectedId === poly.id) {
                                            layer.setStyle({ dashArray: '10 5' });
                                            const el = layer.getElement();
                                            if (el) el.classList.add('polygon-glow');
                                        }

                                        // children always on top
                                        if (poly.parentId) layer.bringToFront();
                                    },
                                    remove: e => {
                                        const id = (e.target as any)?.options?.customId;
                                        if (id) polygonLayersRef.current.delete(id as string);
                                    },
                                    click: e => {
                                        L.DomEvent.stopPropagation(e as any);
                                        if (editingId || isCreating) return;
                                        const clickPt: [number, number] = [e.latlng.lat, e.latlng.lng];
                                        // only defer to a child that's actually rendered, otherwise hidden ones steal the parent selection
                                        const hasChildAtPoint = polygons.some(p => {
                                            if (p.parentId !== poly.id || !p.visible) return false;
                                            const overrideShow = selectedId === p.id || editingId === p.id;
                                            const inRange = isInLayerRange(p);
                                            const inFamily = !restrictToFamilyId || isInFamily(p.id, restrictToFamilyId);
                                            return (overrideShow || (inRange && inFamily)) && isPointInPolygon(clickPt, p.coords);
                                        });
                                        // keep current selection if it's already this one
                                        if (hasChildAtPoint && selectedId !== poly.id) return;
                                        setSelectedId(poly.id);
                                    },
                                    contextmenu: e => {
                                        L.DomEvent.stopPropagation(e as any);
                                        if (editingId || isCreating) return;
                                        const clickPt: [number, number] = [e.latlng.lat, e.latlng.lng];
                                        const nativeEvent = (e as any).originalEvent as MouseEvent | undefined;

                                        let menuTargetId = poly.id;

                                        // if a parent is already selected and the click lands on its child, keep the parent menu
                                        if (selectedId && selectedId !== poly.id) {
                                            const selectedPoly = polygons.find(p => p.id === selectedId);
                                            const selectedIsParentOfClicked = selectedPoly ? poly.parentId === selectedPoly.id : false;
                                            if (selectedPoly && selectedIsParentOfClicked && isPointInPolygon(clickPt, selectedPoly.coords)) {
                                                menuTargetId = selectedId;
                                            }
                                        }

                                        setSelectedId(menuTargetId);
                                        if (!nativeEvent) return;
                                        const mapRect = ((e.target as any)?._map as L.Map | undefined)?.getContainer?.()?.getBoundingClientRect?.();
                                        setPolygonContextMenu({
                                            x: nativeEvent.clientX + 2,
                                            y: nativeEvent.clientY + 2,
                                            polygonId: menuTargetId,
                                            mapRect: mapRect
                                                ? {
                                                    left: mapRect.left,
                                                    top: mapRect.top,
                                                    right: mapRect.right,
                                                    bottom: mapRect.bottom,
                                                }
                                                : undefined,
                                        });
                                    }
                                }}
                            >
                                <Tooltip direction="center" offset={[0, 0]} opacity={1} permanent={showPermanentTooltip} className="polygon-tooltip">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                                        <span style={{
                                            display: 'inline-block', padding: '3px 8px', fontSize: '0.8rem', fontWeight: '600',
                                            color: '#fff', background: polyColor, borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                            textTransform: 'uppercase', letterSpacing: '0.5px'
                                        }}>
                                            {poly.name}
                                        </span>
                                        {isImportMode && poly.validationStatus && (
                                            <span style={{
                                                display: 'inline-block', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 600,
                                                color: '#0f172a', background: 'rgba(255,255,255,0.85)', borderRadius: '999px', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                            }}>
                                                {poly.validationStatus}
                                            </span>
                                        )}
                                    </div>
                                </Tooltip>
                            </Polygon>
                        );
                    })}

                {overlapWarning && showPreview && (
                    <>
                        {previewVisibility.original && (
                            <Polygon positions={overlapWarning.originalCoords} pathOptions={{ color: '#ff5252', opacity: 1, fillOpacity: 0.15, dashArray: '10 5', weight: 4, interactive: false, fill: true, stroke: true }} />
                        )}
                        {previewVisibility.fixed && overlapWarning.fixedCoords && (
                            <Polygon positions={overlapWarning.fixedCoords} pathOptions={{ color: '#4caf50', opacity: 1, fillOpacity: 0.3, weight: 4, interactive: false, fill: true, stroke: true }} />
                        )}
                    </>
                )}
                {/* Unified sketch layer for create + edit */}
                {(isCreating || !!editingId) && drawingPoints.length > 0 && (
                    <FeatureGroup>
                        {(() => {
                            const polygonCoords = (sketchInsertPreview && sketchInsertPreview.length >= 3)
                                ? sketchInsertPreview
                                : autoCorrectEnabled
                                    ? (ghostCoords.length >= 3 ? ghostCoords : (drawingPoints.length >= 3 ? drawingPoints : []))
                                    : (drawingPoints.length >= 3 ? drawingPoints : []);
                            return (
                                <Polygon
                                    positions={polygonCoords}
                                    pathOptions={{ color: '#10b981', weight: 2, dashArray: '5, 5', fillOpacity: 0.1 }}
                                />
                            );
                        })()}
                        {createPreviewPoint && drawingPoints.length > 0 && (
                            <>
                                <Polyline
                                    positions={[drawingPoints[0], createPreviewPoint]}
                                    pathOptions={{ color: '#f59e0b', weight: 2, dashArray: '4, 6', opacity: 0.9 }}
                                />
                                <Polyline
                                    positions={[drawingPoints[drawingPoints.length - 1], createPreviewPoint]}
                                    pathOptions={{ color: '#ef4444', weight: 2.5, dashArray: '2, 6', opacity: 0.95 }}
                                />
                            </>
                        )}
                        {/* Solid vertices */}
                        {drawingPoints.map((p, i) => (
                            <Marker
                                key={`sketch-${i}`}
                                position={p}
                                icon={highlightLastPoint && i === drawingPoints.length - 1 ? vertexDeleteHighlightIcon : vertexIcon}
                                zIndexOffset={VERTEX_Z_INDEX}
                                draggable={true}
                                eventHandlers={{
                                    mouseover: () => setHandleHover(true),
                                    mouseout: () => setHandleHover(false),
                                    mousedown: (e) => {
                                        suppressSketchClickTemporarily(260);
                                        const marker = e.target as L.Marker;
                                        const original = e.originalEvent as MouseEvent | undefined;
                                        if (!original || original.button === 0) {
                                            setMapDraggingEnabled(marker, false);
                                        }
                                        if (original) {
                                            L.DomEvent.stopPropagation(original);
                                            (original as any)._vertexClick = true;
                                        }
                                    },
                                    mouseup: (e) => {
                                        resetHandleInteraction(e.target as L.Marker);
                                    },
                                    click: (e) => {
                                        L.DomEvent.stopPropagation(e.originalEvent);
                                        (e.originalEvent as any)._vertexClick = true;
                                    },
                                    contextmenu: (e) => {
                                        const original = (e as any).originalEvent as MouseEvent | undefined;
                                        if (original) {
                                            original.preventDefault();
                                            L.DomEvent.stopPropagation(original);
                                        }
                                        resetHandleInteraction(e.target as L.Marker);
                                        removeSketchPoint(i);
                                    },
                                    dragstart: (e) => {
                                        suppressSketchClickTemporarily(420);
                                        suppressMidpointClickUntilRef.current = Date.now() + 450;
                                        setMapDraggingEnabled(e.target as L.Marker, false);
                                        isDraggingHandleRef.current = true;
                                        setIsHoveringSketchHandle(true);
                                    },
                                    drag: (e) => {
                                        const marker = e.target as L.Marker;
                                        const latlng = marker.getLatLng();
                                        const constrained = moveSketchPoint(i, [latlng.lat, latlng.lng]);
                                        marker.setLatLng(constrained as L.LatLngExpression);
                                    },
                                    dragend: (e) => {
                                        suppressSketchClickTemporarily(420);
                                        suppressMidpointClickUntilRef.current = Date.now() + 450;
                                        resetHandleInteraction(e.target as L.Marker);
                                    }
                                }}
                            />
                        ))}
                        {/* Midpoint insertion handles */}
                        {drawingPoints.length >= 2 && drawingPoints.map((p, i) => {
                            const isClosingEdge = i === drawingPoints.length - 1;
                            if (isClosingEdge && drawingPoints.length < 3) return null;
                            const nextIndex = isClosingEdge ? 0 : i + 1;
                            const next = drawingPoints[nextIndex];
                            const isActiveDrag = draggingMidpointRef.current?.edgeIndex === i;
                            // hide the handle on edges too small for a real point, but never mid-drag
                            const m = mapInstanceRef.current;
                            if (m && !isActiveDrag) {
                                const aPx = m.latLngToLayerPoint(L.latLng(p[0], p[1]));
                                const bPx = m.latLngToLayerPoint(L.latLng(next[0], next[1]));
                                if (aPx.distanceTo(bPx) < MIN_MIDPOINT_EDGE_PX) return null;
                            }
                            // place the marker at the resolved spot during drag, otherwise preview re-renders fight leaflet
                            const insertedIdx = Math.min(i + 1, drawingPoints.length);
                            const mid: [number, number] = (isActiveDrag && sketchInsertPreview && sketchInsertPreview[insertedIdx])
                                ? sketchInsertPreview[insertedIdx]
                                : [
                                    (p[0] + next[0]) / 2,
                                    (p[1] + next[1]) / 2,
                                ];
                            return (
                                <Marker
                                    key={`mid-${i}-${nextIndex}`}
                                    position={mid}
                                    icon={midpointIcon}
                                    zIndexOffset={MIDPOINT_Z_INDEX}
                                    draggable={true}
                                    eventHandlers={{
                                        mouseover: () => setHandleHover(true),
                                        mouseout: () => setHandleHover(false),
                                        mousedown: (e) => {
                                            suppressSketchClickTemporarily(260);
                                            const marker = e.target as L.Marker;
                                            const original = (e as any).originalEvent as MouseEvent | undefined;
                                            if (!original || original.button === 0) {
                                                setMapDraggingEnabled(marker, false);
                                            }
                                            if (original) {
                                                original.preventDefault();
                                                L.DomEvent.stopPropagation(original);
                                                (original as any)._vertexClick = true;
                                            }
                                        },
                                        mouseup: (e) => {
                                            resetHandleInteraction(e.target as L.Marker);
                                        },
                                        click: (e) => {
                                            if (shouldSuppressMidpointClick()) return;
                                            const original = (e as any).originalEvent as MouseEvent | undefined;
                                            if (original) {
                                                original.preventDefault();
                                                L.DomEvent.stopPropagation(original);
                                                (original as any)._vertexClick = true;
                                            }
                                            insertSketchPoint(i, [e.latlng.lat, e.latlng.lng]);
                                        },
                                        dragstart: (e) => {
                                            const marker = e.target as L.Marker;
                                            const startLatLng = marker.getLatLng();

                                            suppressMidpointClickUntilRef.current = Date.now() + 300;
                                            suppressSketchClickTemporarily(500);

                                            const original = (e as any).originalEvent as MouseEvent | undefined;
                                            if (original) {
                                                L.DomEvent.stopPropagation(original);
                                                (original as any)._vertexClick = true;
                                            }

                                            const resolved = previewSketchInsertion(i, [startLatLng.lat, startLatLng.lng]);
                                            draggingMidpointRef.current = {
                                                edgeIndex: i,
                                                lastLatLng: resolved ?? [startLatLng.lat, startLatLng.lng],
                                            };
                                            if (resolved) marker.setLatLng(resolved as L.LatLngExpression);

                                            setMapDraggingEnabled(marker, false);
                                            isDraggingHandleRef.current = true;
                                            setIsHoveringSketchHandle(true);
                                        },
                                        drag: (e) => {
                                            const marker = e.target as L.Marker;
                                            const latlng = marker.getLatLng();
                                            const dragging = draggingMidpointRef.current;
                                            if (dragging) {
                                                const resolved = previewSketchInsertion(dragging.edgeIndex, [latlng.lat, latlng.lng]);
                                                if (resolved) dragging.lastLatLng = resolved;
                                                marker.setLatLng((resolved ?? dragging.lastLatLng) as L.LatLngExpression);
                                            }
                                        },
                                        dragend: (e) => {
                                            const marker = e.target as L.Marker;
                                            const dragging = draggingMidpointRef.current;
                                            const edgeIndex = dragging?.edgeIndex ?? i;
                                            const finalLatLng = dragging?.lastLatLng ?? [marker.getLatLng().lat, marker.getLatLng().lng];

                                            insertSketchPoint(edgeIndex, finalLatLng);
                                            clearSketchInsertPreview();

                                            suppressSketchClickTemporarily(500);
                                            draggingMidpointRef.current = null;
                                            resetHandleInteraction(marker);
                                            suppressMidpointClickUntilRef.current = Date.now() + 300;
                                        }
                                    }}
                                />
                            );
                        })}
                    </FeatureGroup>
                )}
            </FeatureGroup>
        </MapContainer>

        {/* Layer switcher — bottom-left, outside MapContainer so it doesn't conflict with Leaflet panes */}
        <div style={{
            position: 'absolute',
            bottom: '2.5rem',
            left: '1rem',
            zIndex: 1200,
            display: 'flex',
            gap: '0.25rem',
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '0.75rem',
            padding: '0.3rem',
            boxShadow: '0 4px 16px rgba(15,23,42,0.18)',
            backdropFilter: 'blur(6px)',
            pointerEvents: 'auto',
        }}>
            {(Object.keys(TILE_LAYERS) as BaseLayer[]).map(layer => (
                <button
                    key={layer}
                    type="button"
                    onClick={() => setBaseLayer(layer)}
                    style={{
                        padding: '0.28rem 0.65rem',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        borderRadius: '0.5rem',
                        border: 'none',
                        cursor: 'pointer',
                        background: baseLayer === layer ? '#0f172a' : 'transparent',
                        color: baseLayer === layer ? '#fff' : '#64748b',
                        transition: 'background 0.15s, color 0.15s',
                    }}
                >
                    {LAYER_LABELS[layer]}
                </button>
            ))}
        </div>
        </div>
    );
}

// memoised so unrelated parent state (modal open, rename input, popup, etc.) doesn't trigger
// a full polygon reconciliation with new pathOptions/eventHandlers references
const MapLayerManager = React.memo(MapLayerManagerImpl);
export default MapLayerManager;
