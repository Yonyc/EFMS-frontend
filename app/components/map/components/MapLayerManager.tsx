import {
    MapContainer,
    TileLayer,
    Polygon,
    FeatureGroup,
    useMapEvents,
    Tooltip,
    ZoomControl,
} from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import { useEffect, useRef } from "react";
import type { PolygonData, OverlapWarning } from "../types";
import { clampToViewport } from "../utils/mapUtils";

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
    setPolygonContextMenu: (m: { x: number; y: number; polygonId: string } | null) => void;
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
    getMap: () => L.Map | undefined;
}

export default function MapLayerManager({
    center, polygons, editingId, selectedId, setSelectedId, isCreating,
    drawOptions, handleCreated, overlapWarning, showPreview, previewVisibility,
    pendingManualEditId, featureGroupRef, editControlRef, polygonLayersRef,
    setPolygonContextMenu, setRenamingId, setRenameValue, setPendingDeleteId, setContextMenu,
    closePolygonContextMenu, viewportDebounceRef, setViewportBounds,
    hasActiveSearchFilters, isImportMode, contextType, getMap
}: MapLayerManagerProps) {

    const POPUP_PADDING = 12;

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
                viewportDebounceRef.current = window.setTimeout(() => updateViewport(e.target), 150);
            },
            moveend: e => {
                if (viewportDebounceRef.current) window.clearTimeout(viewportDebounceRef.current);
                viewportDebounceRef.current = window.setTimeout(() => updateViewport(e.target), 150);
            },
            zoomend: e => {
                if (viewportDebounceRef.current) window.clearTimeout(viewportDebounceRef.current);
                viewportDebounceRef.current = window.setTimeout(() => updateViewport(e.target), 150);
            },
            contextmenu: e => {
                if (!editingId && !isCreating) {
                    e.originalEvent.preventDefault();
                    const { x, y } = clampToViewport(e.originalEvent.clientX, e.originalEvent.clientY, 240, 200, POPUP_PADDING);
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
    }, [selectedId, polygonLayersRef]);

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

            <FeatureGroup ref={featureGroupRef}>
                <EditControl
                    ref={editControlRef}
                    position="topright"
                    draw={drawOptions}
                    onCreated={handleCreated}
                />

                {polygons
                    .filter(p => p.visible && overlapWarning?.polygonId !== p.id && editingId !== p.id && pendingManualEditId !== p.id)
                    .map(poly => {
                        const isThisEditing = editingId === poly.id;
                        const isSelected = selectedId === poly.id;
                        const polyColor = poly.color || '#3388ff';
                        const showPermanentTooltip = isSelected;
                        const polygonKey = isThisEditing ? `${poly.id}-editing-${poly.version}` : `${poly.id}-${isSelected ? 'selected' : 'normal'}`;

                        return (
                            <Polygon
                                key={polygonKey}
                                positions={poly.coords}
                                interactive={!isThisEditing && !editingId}
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
                                    },
                                    remove: e => {
                                        const id = (e.target as any)?.options?.customId;
                                        if (id) polygonLayersRef.current.delete(id as string);
                                    },
                                    click: e => {
                                        L.DomEvent.stopPropagation(e as any);
                                        if (!editingId && !isCreating && selectedId !== poly.id) setSelectedId(poly.id);
                                    },
                                    contextmenu: e => {
                                        L.DomEvent.stopPropagation(e as any);
                                        if (!editingId) {
                                            e.originalEvent.preventDefault();
                                            const { x, y } = clampToViewport(e.originalEvent.clientX, e.originalEvent.clientY, 260, 260, POPUP_PADDING);
                                            setPolygonContextMenu({ x, y, polygonId: poly.id });
                                            setSelectedId(poly.id);
                                        }
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
            </FeatureGroup>
        </MapContainer>
    );
}
