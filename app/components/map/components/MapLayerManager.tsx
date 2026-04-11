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
import { useEffect, useRef } from "react";
import type { PolygonData, OverlapWarning } from "../types";
import { clampToRect, getSafeMenuPosition } from "../utils/mapUtils";
import { isPointInPolygon } from "../utils/geometry";

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
    removeSketchPoint: (index: number) => void;
}

import { Marker } from "react-leaflet";

const vertexIcon = L.divIcon({
    className: 'custom-vertex-icon',
    html: '<div style="background-color: #3388ff; width: 12px; height: 12px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6]
});

const midpointIcon = L.divIcon({
    className: 'custom-midpoint-icon',
    html: '<div class="midpoint-dot"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

const MIDPOINT_Z_INDEX = 200000;
const VERTEX_Z_INDEX = 300000;

const ZIndexEnforcer = ({ polygons, polygonLayersRef }: { polygons: PolygonData[], polygonLayersRef: React.MutableRefObject<Map<string, L.Polygon>> }) => {
    const map = useMap();
    useEffect(() => {
        if (!map) return;
        // enforce leaf geometry sorting over parents so they never hide underneath
        // Use a small timeout to ensure DOM paths actually exist
        const timer = setTimeout(() => {
            const children = polygons.filter(p => p.parentId && p.visible);
            children.forEach(child => {
                const layer = polygonLayersRef.current.get(child.id);
                if (layer && typeof layer.bringToFront === 'function') {
                    layer.bringToFront();
                }
            });
        }, 50);
        return () => clearTimeout(timer);
    }, [polygons, polygonLayersRef, map]);
    return null;
};

export default function MapLayerManager({
    center, polygons, editingId, selectedId, setSelectedId, isCreating,
    drawOptions, handleCreated, overlapWarning, showPreview, previewVisibility,
    pendingManualEditId, featureGroupRef, editControlRef, polygonLayersRef,
    setPolygonContextMenu, setRenamingId, setRenameValue, setPendingDeleteId, setContextMenu,
    closePolygonContextMenu, viewportDebounceRef, setViewportBounds,
    hasActiveSearchFilters, isImportMode, contextType,
    drawingPoints, ghostCoords, createPreviewPoint, autoCorrectEnabled,
    setIsHoveringSketchHandle, suppressSketchClickTemporarily, moveSketchPoint, insertSketchPoint, removeSketchPoint
}: MapLayerManagerProps) {

    const POPUP_PADDING = 12;
    const MAP_MENU_WIDTH = 240;
    const MAP_MENU_HEIGHT = 200;
    const draggingMidpointRef = useRef<{ edgeIndex: number; lastLatLng: [number, number] } | null>(null);
    const isDraggingHandleRef = useRef(false);
    const suppressMidpointClickUntilRef = useRef(0);

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

    function MapEvents() {
        const updateViewport = (map: L.Map) => {
            if (hasActiveSearchFilters || isImportMode || contextType !== 'farm') return;
            const bounds = map.getBounds().pad(0.2);
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            setViewportBounds({
                minLat: sw.lat,
                minLng: sw.lng,
                maxLat: ne.lat,
                maxLng: ne.lng,
            });
        };

        useMapEvents({
            load: e => {
                if (viewportDebounceRef.current) window.clearTimeout(viewportDebounceRef.current);
                viewportDebounceRef.current = window.setTimeout(() => updateViewport(e.target as L.Map), 150);
            },
            moveend: e => {
                if (viewportDebounceRef.current) window.clearTimeout(viewportDebounceRef.current);
                viewportDebounceRef.current = window.setTimeout(() => updateViewport(e.target as L.Map), 150);
            },
            zoomend: e => {
                if (viewportDebounceRef.current) window.clearTimeout(viewportDebounceRef.current);
                viewportDebounceRef.current = window.setTimeout(() => updateViewport(e.target as L.Map), 150);
            },
            contextmenu: e => {
                if (!editingId && !isCreating) {
                    e.originalEvent.preventDefault();
                    const mapRect = (e.target as L.Map)?.getContainer?.()?.getBoundingClientRect?.();
                    const { x, y } = mapRect
                        ? clampToRect(
                            e.originalEvent.clientX,
                            e.originalEvent.clientY,
                            MAP_MENU_WIDTH,
                            MAP_MENU_HEIGHT,
                            mapRect,
                            POPUP_PADDING
                        )
                        : getSafeMenuPosition(
                            e.originalEvent.clientX,
                            e.originalEvent.clientY,
                            MAP_MENU_WIDTH,
                            MAP_MENU_HEIGHT,
                            POPUP_PADDING
                        );
                    setContextMenu({ x, y });
                }
            },
            click: () => {
                if (editingId) return;
                setRenamingId(null);
                setRenameValue('');
                setPendingDeleteId(null);
                setContextMenu(null);
                closePolygonContextMenu();
                setSelectedId(null);
            },
            mousedown: () => {
                closePolygonContextMenu();
                setContextMenu(null);
            },
            popupopen: e => editingId && e.popup?.remove?.()
        });

        return null;
    }

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

    return (
        <MapContainer
            style={{ height: "100%", width: "100%" }}
            center={center}
            zoom={15}
            maxZoom={19}
            zoomControl={false}
        >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxNativeZoom={20} attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>' />
            <ZoomControl position="bottomright" />
            <MapEvents />
            <ZIndexEnforcer polygons={polygons} polygonLayersRef={polygonLayersRef} />

            <FeatureGroup ref={featureGroupRef}>
                <EditControl
                    ref={editControlRef}
                    position="topright"
                    draw={drawOptions}
                    onCreated={handleCreated}
                />

                {polygons
                    .filter(p => p.visible && overlapWarning?.polygonId !== p.id && editingId !== p.id && pendingManualEditId !== p.id)
                    .sort((a, b) => {
                        // parents first (bottom), children last (top)
                        const aDepth = a.parentId ? 1 : 0;
                        const bDepth = b.parentId ? 1 : 0;
                        return aDepth - bDepth;
                    })
                    .map(poly => {
                        const isThisEditing = editingId === poly.id;
                        const isSelected = selectedId === poly.id;
                        const polyColor = poly.color || '#3388ff';
                        const showPermanentTooltip = isSelected;
                        const polygonKey = `${poly.id}-${poly.version}`;

                        return (
                            <Polygon
                                key={polygonKey}
                                positions={poly.coords}
                                interactive={!isThisEditing && !editingId && !isCreating}
                                pathOptions={{
                                    color: polyColor,
                                    opacity: isThisEditing ? 0.9 : (isSelected ? 1 : 0.8),
                                    fillOpacity: isSelected ? 0.35 : 0.2,
                                    dashArray: isThisEditing ? '8 6' : undefined,
                                    weight: isThisEditing ? 4 : (isSelected ? 3 : 2)
                                }}
                                eventHandlers={{
                                    add: e => {
                                        const layer = e.target as L.Polygon;
                                        (layer.options as any).customId = poly.id;
                                        polygonLayersRef.current.set(poly.id, layer);

                                        // Preserve selection glow when the selected layer is recreated.
                                        if (selectedId === poly.id) {
                                            layer.setStyle({ dashArray: '10 5' });
                                            const el = layer.getElement();
                                            if (el) el.classList.add('polygon-glow');
                                        }

                                        // Force to front if it's a child
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
                                        const hasChildAtPoint = polygons.some(p => 
                                            p.parentId === poly.id && p.visible && isPointInPolygon(clickPt, p.coords)
                                        );
                                        // Priority: if this is already selected, keep it selected.
                                        if (hasChildAtPoint && selectedId !== poly.id) return;
                                        setSelectedId(poly.id);
                                    },
                                    contextmenu: e => {
                                        L.DomEvent.stopPropagation(e as any);
                                        if (editingId || isCreating) return;
                                        const clickPt: [number, number] = [e.latlng.lat, e.latlng.lng];
                                        const nativeEvent = (e as any).originalEvent as MouseEvent | undefined;

                                        let menuTargetId = poly.id;

                                        // Preserve the parent-selection override: if a parent is already selected
                                        // and the right-click occurs on one of its children, open the parent menu.
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
                            const polygonCoords = autoCorrectEnabled
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
                                icon={vertexIcon}
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
                            const mid: [number, number] = [
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

                                            draggingMidpointRef.current = {
                                                edgeIndex: i,
                                                lastLatLng: [startLatLng.lat, startLatLng.lng],
                                            };

                                            setMapDraggingEnabled(marker, false);
                                            isDraggingHandleRef.current = true;
                                            setIsHoveringSketchHandle(true);
                                        },
                                        drag: (e) => {
                                            const marker = e.target as L.Marker;
                                            const latlng = marker.getLatLng();
                                            const dragging = draggingMidpointRef.current;
                                            if (dragging) {
                                                dragging.lastLatLng = [latlng.lat, latlng.lng];
                                            }
                                        },
                                        dragend: (e) => {
                                            const marker = e.target as L.Marker;
                                            const dragging = draggingMidpointRef.current;
                                            const edgeIndex = dragging?.edgeIndex ?? i;
                                            const finalLatLng = dragging?.lastLatLng ?? [marker.getLatLng().lat, marker.getLatLng().lng];

                                            insertSketchPoint(edgeIndex, finalLatLng);

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
    );
}
