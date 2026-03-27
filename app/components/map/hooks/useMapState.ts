import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import L from "leaflet";
import { useTranslation } from "react-i18next";
import { useFarm } from "~/contexts/FarmContext";
import { useAuth } from "~/contexts/AuthContext";
import { apiDelete, apiGet, apiPost, apiPut } from "~/utils/api";
import { 
    checkOverlap, 
    fixOverlap, 
    clipToPolygon, 
    polygonSignedArea, 
    isPointInPolygon, 
    getClosestPointOnPolygon,
    getClosestEdgeIndex,
    getPathOnBoundary,
    segmentIntersectsPolygon,
    getSegmentPolygonIntersections
} from "../utils/geometry";
import { 
    extractCoords, 
    coordsToWKT, 
    parseWktCoords,
    toWktPolygon, 
    hasActiveSearchFilters 
} from "../utils/map";
const PREVIEW_MARKER_STYLE = {
    radius: 8,
    fillColor: '#6366f1',
    fillOpacity: 0.5,
    color: '#4f46e5',
    weight: 3,
    interactive: false,
    className: 'snappy-preview-ring'
};

const TRACE_PATH_STYLE = {
    color: '#4f46e5',
    weight: 3,
    dashArray: '5, 5',
    opacity: 0.6,
    interactive: false
};

import type { 
    PolygonData, 
    EditState, 
    ManualEditContext, 
    OverlapWarning, 
    ParcelSearchFilters,
    OperationTypeDto,
    UnitDto,
    ProductDto,
    ToolDto,
    ParcelOperationDto,
    PeriodDto,
    OperationProductInputState,
    MapContextType
} from "../types";

export function useMapState(props: {
    resolvedContextId: string;
    contextType: MapContextType;
    isImportMode: boolean;
    parcelsEndpoint: string;
    onApproveAll?: () => Promise<void>;
    approveLabel?: string;
    farm_id?: string;
}) {
    const { t } = useTranslation();
    const { selectedFarm } = useFarm();
    const { user } = useAuth();

    // State
    const [polygons, setPolygons] = useState<PolygonData[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [activeDrawHandler, setActiveDrawHandler] = useState<any>(null);
    const [createPointCount, setCreatePointCount] = useState(0);
    const [isInspecting, setIsInspecting] = useState(false);
    const inspectionHandlerRef = useRef<any>(null);
    const [modal, setModal] = useState<{ open: boolean; coords: [number, number][] | null }>({ open: false, coords: null });
    const [areaName, setAreaName] = useState("");
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [polygonContextMenu, setPolygonContextMenu] = useState<{ x: number; y: number; polygonId: string } | null>(null);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [overlapWarning, setOverlapWarning] = useState<OverlapWarning | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [pendingManualEditId, setPendingManualEditId] = useState<string | null>(null);
    const [manualEditContext, setManualEditContext] = useState<ManualEditContext | null>(null);
    const [previewVisibility, setPreviewVisibility] = useState<{ original: boolean; fixed: boolean }>({ original: false, fixed: true });
    const [isListCollapsed, setIsListCollapsed] = useState(false);
    const [listFilter, setListFilter] = useState<Array<'visible' | 'hidden' | 'approved' | 'unapproved'>>([]);
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isTinkered, setIsTinkered] = useState(false);
    
    // Refs
    const originalColorRef = useRef<string | null>(null);
    // Refs for stale closure prevention
    const editingIdRef = useRef(editingId);
    useEffect(() => { editingIdRef.current = editingId; }, [editingId]);
    const overlapWarningRef = useRef(overlapWarning);
    useEffect(() => { overlapWarningRef.current = overlapWarning; }, [overlapWarning]);
    const getStrictSnapTargetRef = useRef<any>(null);
    const listBarRef = useRef<HTMLDivElement>(null);
    const polygonLayersRef = useRef<Map<string, L.Polygon>>(new Map());
    const searchDrawHandlerRef = useRef<any>(null);
    const searchAreaLayerRef = useRef<L.Polygon | null>(null);
    const featureGroupRef = useRef<L.FeatureGroup>(null);
    const editStateRef = useRef<EditState | null>(null);
    const originalCoordsRef = useRef<Record<string, [number, number][]>>({});
    const createHandlerRef = useRef<any>(null);
    const createdLayerRef = useRef<any>(null);
    const efmsContextRef = useRef<any>(null);
    const editControlRef = useRef<any>(null);
    const createRafRef = useRef<number | null>(null);

    const defaultSearchFilters = useMemo<ParcelSearchFilters>(() => ({
        periodId: '',
        toolId: '',
        productId: '',
        startDate: '',
        endDate: '',
        useMapArea: false,
        usePolygon: false,
    }), []);

    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchDraft, setSearchDraft] = useState<ParcelSearchFilters>(defaultSearchFilters);
    const [appliedFilters, setAppliedFilters] = useState<ParcelSearchFilters>(defaultSearchFilters);
    const [appliedBounds, setAppliedBounds] = useState<{ minLat: number; minLng: number; maxLat: number; maxLng: number } | null>(null);
    const [searchAreaCoords, setSearchAreaCoords] = useState<[number, number][]>([]);
    const [isSearchDrawing, setIsSearchDrawing] = useState(false);
    const [appliedPolygonWkt, setAppliedPolygonWkt] = useState<string | null>(null);
    const [isApproving, setIsApproving] = useState(false);
    const [approveFeedback, setApproveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    
    // Operation Popup State
    const [operationPopup, setOperationPopup] = useState<{ x: number; y: number; polygonId: string } | null>(null);
    const [popupCoords, setPopupCoords] = useState<{ left: number; top: number } | null>(null);
    const [currentParcelId, setCurrentParcelId] = useState<string | null>(null);
    const [operationTypes, setOperationTypes] = useState<OperationTypeDto[]>([]);
    const [units, setUnits] = useState<UnitDto[]>([]);
    const [products, setProducts] = useState<ProductDto[]>([]);
    const [tools, setTools] = useState<ToolDto[]>([]);
    const [operationTypeId, setOperationTypeId] = useState<string>("");
    const [operationDate, setOperationDate] = useState<string>("");
    const [operationDurationMinutes, setOperationDurationMinutes] = useState<string>("");
    const [operationLines, setOperationLines] = useState<OperationProductInputState[]>([{ productId: "", quantity: "", unitId: "", toolId: "" }]);
    const [operationError, setOperationError] = useState<string | null>(null);
    const [operationLoading, setOperationLoading] = useState(false);
    const [parcelOperations, setParcelOperations] = useState<ParcelOperationDto[]>([]);
    const [periods, setPeriods] = useState<PeriodDto[]>([]);
    const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
    const [renamePeriodId, setRenamePeriodId] = useState<string>("");
    const [preferTopRight, setPreferTopRight] = useState<boolean>(!!user?.operationsPopupTopRight);
    const [isMobile, setIsMobile] = useState(false);
    const [dragState, setDragState] = useState<{ active: boolean; offsetX: number; offsetY: number }>({ active: false, offsetX: 0, offsetY: 0 });

    const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

    const cleanupDrawSession = useCallback(() => {
        console.log("--- CLEANING UP DRAW SESSION ---");
        setIsCreating(false);
        setActiveDrawHandler(null);
        setCreatePointCount(0);
        createHandlerRef.current?.disable();
        createHandlerRef.current = null;
        
        // Hide Snapping Artifacts
        if (efmsContextRef.current) {
            const ctx = efmsContextRef.current;
            if (ctx.previewTarget) (ctx.previewTarget as any).getElement()?.style.setProperty('opacity', '0');
            if (ctx.previewPath) ctx.previewPath.setLatLngs([]);
            if (ctx.previewDots) ctx.previewDots.clearLayers();
        }

        if (inspectionHandlerRef.current) {
            inspectionHandlerRef.current.disable();
            inspectionHandlerRef.current = null;
        }
    }, []);

    // Helpers
    const getMap = useCallback(() => (featureGroupRef.current as any)?._map || (featureGroupRef.current as any)?.getMap?.(), []);

    const resetParcelFlow = useCallback(() => {
        console.log("--- RESETTING PARCEL FLOW ---");
        setModal({ open: false, coords: null });
        setAreaName("");
        setSelectedPeriodId("");
        setSelectedParentId(null);
        setIsInspecting(false);
        setOverlapWarning(null);
        setShowPreview(false);
        const map = getMap();
        if (map) {
            map.eachLayer((l: any) => {
                if (l.isCorrectionLayer) {
                    map.removeLayer(l);
                }
            });
        }
        if (createdLayerRef.current && featureGroupRef.current) {
            featureGroupRef.current.removeLayer(createdLayerRef.current);
        }
        document.body.classList.remove('inspecting-parcel');
        createdLayerRef.current = null;
    }, [getMap]);

    const searchEndpoint = useMemo(() => {
        if (!hasActiveSearchFilters(appliedFilters)) {
            return props.parcelsEndpoint;
        }
        const params = new URLSearchParams();
        if (appliedFilters.periodId) params.set('periodId', appliedFilters.periodId);
        if (appliedFilters.toolId) params.set('toolId', appliedFilters.toolId);
        if (appliedFilters.productId) params.set('productId', appliedFilters.productId);
        if (appliedFilters.startDate) params.set('startDate', appliedFilters.startDate);
        if (appliedFilters.endDate) params.set('endDate', appliedFilters.endDate);
        if (appliedFilters.usePolygon && appliedPolygonWkt) params.set('polygonWkt', appliedPolygonWkt);
        if (appliedFilters.useMapArea && appliedBounds) {
            params.set('minLat', String(appliedBounds.minLat));
            params.set('minLng', String(appliedBounds.minLng));
            params.set('maxLat', String(appliedBounds.maxLat));
            params.set('maxLng', String(appliedBounds.maxLng));
        }
        const query = params.toString();
        return `${props.parcelsEndpoint}/search${query ? `?${query}` : ''}`;
    }, [appliedBounds, appliedFilters, appliedPolygonWkt, props.parcelsEndpoint]);

    const fetchPolygons = useCallback(async () => {
        try {
            const response = await apiGet(searchEndpoint);
            if (response.ok) {
                const data = await response.json();
                setPolygons(data.map((p: any) => {
                    let coords: [number, number][] = [];
                    try {
                        if (p.geodata) {
                            coords = parseWktCoords(typeof p.geodata === 'string' ? p.geodata : String(p.geodata));
                        }
                    } catch (e) {
                        console.error('Error parsing geodata for parcel:', p.id, e);
                    }

                    return {
                        id: String(p.id),
                        name: p.name || t('map.unnamedParcel'),
                        coords,
                        visible: true,
                        version: 0,
                        color: p.color || '#3388ff',
                        active: p.active,
                        startValidity: p.startValidity,
                        endValidity: p.endValidity,
                        farmId: p.farmId,
                        periodId: p.periodId ?? null,
                        validationStatus: p.validationStatus,
                        convertedParcelId: p.convertedParcelId ?? null,
                        parentId: p.parentParcelId ? String(p.parentParcelId) : null,
                    };
                }));
            }
        } catch (err) {
            console.error("Failed to fetch polygons:", err);
            setPolygons([]);
        }
    }, [searchEndpoint, t]);

    useEffect(() => {
        fetchPolygons();
    }, [fetchPolygons]);

    // Snapping & Tracing logic
    const polygonsRef = useRef(polygons);
    useEffect(() => { polygonsRef.current = polygons; }, [polygons]);

    const getStrictSnapTarget = useCallback((latlng: L.LatLng, skipId?: string): { finalLatLng: L.LatLng, isSnapped: boolean, snappedObstacle: PolygonData | null } => {
        const currentPoint: [number, number] = [latlng.lat, latlng.lng];
        const currentPolygons = polygonsRef.current;
        let finalLatLng = latlng;
        let isSnapped = false;
        let snappedObstacle: PolygonData | null = null;
        
        console.log(`[SNAP DEBUG] Checking ${currentPolygons.length} polygons. skipId: ${skipId}`);
        if (currentPolygons.length > 0) {
            console.log(`[SNAP DEBUG] First polygon ID: ${currentPolygons[0].id}, Coords length: ${currentPolygons[0].coords.length}`);
        }
        
        const map = getMap();
        if (!map) return { finalLatLng, isSnapped, snappedObstacle };

        // 1. Parent Clamping (Subparcel)
        const parent = selectedParentId ? currentPolygons.find(p => p.id === String(selectedParentId)) : null;
        if (parent && !isPointInPolygon(currentPoint, parent.coords)) {
            const snapped = getClosestPointOnPolygon(currentPoint, parent.coords);
            finalLatLng = L.latLng(snapped[0], snapped[1]);
            isSnapped = true;
            snappedObstacle = parent;
        }

        // 2. Obstacle Snapping & Interior Prevention
        const currentP: [number, number] = [finalLatLng.lat, finalLatLng.lng];
        const obstacles = currentPolygons.filter(p => 
            p.visible && 
            p.id !== skipId && 
            p.id !== (selectedParentId ? String(selectedParentId) : "")
        );
        
        if (obstacles.length === 0 && currentPolygons.length > 0) {
            console.warn(`[SNAP ERROR] All ${currentPolygons.length} polygons filtered out! skipId: ${skipId}, parentId: ${selectedParentId}`);
        }
        
        let minSnapDistPx = Infinity;
        let bestSnap: L.LatLng | null = null;
        let bestObstacle: PolygonData | null = null;

        for (const obstacle of obstacles) {
            // Strict Interior Prevention
            if (isPointInPolygon(currentP, obstacle.coords)) {
                console.log(`[INTERIOR PREVENTION] Snapping to edge of ${obstacle.name}`);
                const snappedObs = getClosestPointOnPolygon(currentP, obstacle.coords);
                bestSnap = L.latLng(snappedObs[0], snappedObs[1]);
                bestObstacle = obstacle;
                minSnapDistPx = 0; 
                break;
            }

            const snappedObs = getClosestPointOnPolygon(currentP, obstacle.coords);
            const snappedObsLatLng = L.latLng(snappedObs[0], snappedObs[1]);
            const distPx = map.latLngToLayerPoint(L.latLng(currentP)).distanceTo(map.latLngToLayerPoint(snappedObsLatLng));

            if (distPx < 20) { 
                if (distPx < minSnapDistPx) {
                    minSnapDistPx = distPx;
                    bestSnap = snappedObsLatLng;
                    bestObstacle = obstacle;
                }
            }
        }
        
        if (bestSnap) {
            console.log(`[SNAP APPLIED] to ${bestObstacle?.name} at dist ${minSnapDistPx}px. Interior: ${minSnapDistPx === 0}`);
            finalLatLng = bestSnap;
            isSnapped = true;
            snappedObstacle = bestObstacle;
        }

        return { finalLatLng, isSnapped, snappedObstacle };
    }, [getMap, selectedParentId]);
    useEffect(() => { 
        polygonsRef.current = polygons; 
        getStrictSnapTargetRef.current = getStrictSnapTarget;
    }, [polygons, getStrictSnapTarget]);

    useEffect(() => {
        if (!isCreating || !activeDrawHandler) return;
        const handler = activeDrawHandler;
        const map = getMap();
        if (!map) return;

        // Ensure a dedicated pane is used for all drawing overlays
        if (!map.getPane('drawingOverlayPane')) {
            map.createPane('drawingOverlayPane');
            const pane = map.getPane('drawingOverlayPane');
            if (pane) pane.style.zIndex = '2000005';
        }

        const mapContainer = map.getContainer();
        const originalCursor = mapContainer.style.cursor;
        mapContainer.style.cursor = 'default';
        document.body.classList.add('creating-parcel');

        // 1. Snapping Target (The pulsating ring + solid center)
        const previewTarget = L.marker([0, 0], { 
            icon: L.divIcon({
                className: 'snappy-preview-marker-container',
                html: '<div class="snappy-preview-ring"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            }), 
            interactive: false,
            pane: 'drawingOverlayPane'
        });
        
        // 2. Trace Path (Thick dashed line)
        const previewPath = L.polyline([], {
            color: '#6366f1',
            weight: 4,
            dashArray: '8, 8',
            opacity: 0.8,
            interactive: false,
            className: 'indigo-preview-drawing-path',
            pane: 'drawingOverlayPane'
        });

        // 3. Adaptive Trace Points (Small dots for intermediate vertices)
        const previewDots = L.featureGroup().addTo(map);
        
        previewTarget.addTo(map);
        previewPath.addTo(map);
        console.log("--- ADAPTIVE PREVIEW LAYERS INITIALIZED ---");
        
        let currentTrace: [number, number][] = [];
        
        // Persistent context for wrappers
        const efmsContext = {
            previewTarget,
            previewPath,
            previewDots,
            mapContainer,
            // These will be updated on every effect run
            computeTarget: (latlng: L.LatLng) => ({ finalLatLng: latlng, trace: [] as [number, number][] }),
            syncEventLatlng: (e: any, targetLatLng: L.LatLng) => {}
        };
        (handler as any)._efmsContext = efmsContext;
        efmsContextRef.current = efmsContext;

        const computeTarget = (latlng: L.LatLng): { finalLatLng: L.LatLng, trace: [number, number][], isSnapped: boolean } => {
            const { finalLatLng, isSnapped, snappedObstacle } = getStrictSnapTarget(latlng);
            
            // 3. Boundary Tracing (Auto-Avoidance)
            let trace: [number, number][] = [];
            const markers = (handler as any)._markers || [];
            if (markers.length > 0) {
                const lastLatLng = markers[markers.length - 1].getLatLng();
                const lastP: [number, number] = [lastLatLng.lat, lastLatLng.lng];
                const snapP: [number, number] = [finalLatLng.lat, finalLatLng.lng];
                
                // Detection: Are both points on the SAME obstacle?
                if (snappedObstacle) {
                    const idx1 = getClosestEdgeIndex(lastP, snappedObstacle.coords);
                    const idx2 = getClosestEdgeIndex(snapP, snappedObstacle.coords);
                    
                    // Check if last point is actually near the same boundary
                    const lastDistPx = map.latLngToLayerPoint(lastLatLng).distanceTo(map.latLngToLayerPoint(L.latLng(getClosestPointOnPolygon(lastP, snappedObstacle.coords))));
                    
                    if (lastDistPx < 10) { // If last point is also "on" this boundary
                        trace = getPathOnBoundary(idx1, idx2, snappedObstacle.coords, lastP, snapP);
                    } else {
                        trace = [lastP, snapP];
                    }
                } else {
                    trace = [lastP, snapP];
                }
            }

            return { finalLatLng, trace, isSnapped };
        };

        const syncEventLatlng = (e: any, targetLatLng: L.LatLng) => {
            if (!e) return;
            e.latlng = targetLatLng;
            // Real-time cursor enforcement
            if (mapContainer) mapContainer.style.cursor = 'default';
        };

        // Expose helpers for inspection mode
        efmsContext.computeTarget = computeTarget;
        efmsContext.syncEventLatlng = syncEventLatlng;

        // Capture originals persistently on the handler instance
        if (!(handler as any)._efmsOriginals) {
            (handler as any)._efmsOriginals = {
                onMouseMove: (handler as any)._onMouseMove,
                onClick: (handler as any)._onClick,
                addVertex: (handler as any).addVertex
            };
        }
        const originals = (handler as any)._efmsOriginals;

        if (!(handler as any)._efmsOverridden) {
            (handler as any)._efmsOverridden = true;
            
            const originalOnMouseMove = originals.onMouseMove;
        (handler as any)._onMouseMove = function(e: any) {
            const ctx = (this as any)._efmsContext;
            if (!ctx) return originalOnMouseMove.call(this, e);
            
            try {
                const { finalLatLng, trace, isSnapped } = ctx.computeTarget(e.latlng);
                currentTrace = trace;
                
                // Update Snapping Target Visibility
                ctx.previewTarget.setLatLng(finalLatLng);
                (ctx.previewTarget as any).getElement()?.style.setProperty('opacity', isSnapped ? '1' : '0');
                
                // Update Path (Direct segment)
                if (trace.length >= 2) {
                    ctx.previewPath.setLatLngs(trace.map((p: any) => L.latLng(p[0], p[1])));
                } else {
                    ctx.previewPath.setLatLngs([]);
                }
                ctx.previewDots.clearLayers();
                
                ctx.syncEventLatlng(e, finalLatLng);
                originalOnMouseMove.call(this, e);
            } catch (err) {
                console.error("Tracing error in mousemove:", err);
                originalOnMouseMove.call(this, e);
            }
        };

        const originalAddVertex = originals.addVertex;
        if (typeof originalAddVertex === 'function') {
        (handler as any).addVertex = function(latlng: L.LatLng) {
                const ctx = (this as any)._efmsContext;
                if (!ctx) return originalAddVertex.call(this, latlng);
                
                try {
                    const { finalLatLng, trace } = ctx.computeTarget(latlng);
                    
                    if (trace.length > 2) {
                        // Multi-Point Insertion for Tracing
                        // Skip the first and last (first is already there, last is added by final call)
                        for (let i = 1; i < trace.length - 1; i++) {
                            originalAddVertex.call(this, L.latLng(trace[i][0], trace[i][1]));
                        }
                    }
                    
                    return originalAddVertex.call(this, finalLatLng);
                } catch (err) {
                    console.error("Snapping error in addVertex:", err);
                    return originalAddVertex.call(this, latlng);
                }
            };
        }

        const originalOnClick = originals.onClick;
        (handler as any)._onClick = function(e: any) {
            const ctx = (this as any)._efmsContext;
            if (!ctx) return originalOnClick.call(this, e);
            
            try {
                const { finalLatLng } = ctx.computeTarget(e.latlng);
                e.latlng = finalLatLng;
                originalOnClick.call(this, e);
            } catch (err) {
                originalOnClick.call(this, e);
            }
        };

        console.log("--- ENABLING HANDLER WITH OVERRIDES ---");
        handler.enable();
    } // End of conditional wrap

        return () => {
            console.log("--- CLEANING UP ADAPTIVE PREVIEW ---");
            document.body.classList.remove('creating-parcel');
            if (mapContainer) mapContainer.style.cursor = originalCursor;
            (handler as any)._efmsOverridden = false;
            (handler as any)._onMouseMove = originals.onMouseMove;
            (handler as any)._onClick = originals.onClick;
            if (typeof originals.addVertex === 'function') {
                (handler as any).addVertex = originals.addVertex;
            }
            map.removeLayer(previewTarget);
            map.removeLayer(previewPath);
            map.removeLayer(previewDots);
        };
    }, [isCreating, activeDrawHandler, selectedParentId, getMap]);
    
    // Add point count effect for toolbar
    useEffect(() => {
        if (!isCreating || !activeDrawHandler) return;
        const handler = activeDrawHandler;
        const updateCount = () => setCreatePointCount(handler._markers?.length || 0);
        handler.on('draw:drawstart draw:drawstop draw:created', updateCount);
        const interval = setInterval(updateCount, 100);
        return () => {
            handler.off('draw:drawstart draw:drawstop draw:created', updateCount);
            clearInterval(interval);
        };
    }, [isCreating, activeDrawHandler]);

    const getPointCount = useCallback((handler: any) => {
        if (!handler) return 0;
        return handler._markers?.length || 0;
    }, []);

    const focusPolygon = useCallback((coords: [number, number][]) => {
        const map = getMap();
        if (!map || !coords.length) return;
        const bounds = L.latLngBounds(coords);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
    }, [getMap]);

    const approveSingleParcel = useCallback(async (id: string) => {
        if (!props.parcelsEndpoint) return;
        setIsApproving(true);
        try {
            const res = await apiPost(`${props.parcelsEndpoint}/${id}/approve`, {});
            if (res.ok) {
                setApproveFeedback({ type: 'success', message: t('map.feedback.parcelApproved') });
                fetchPolygons();
            } else {
                setApproveFeedback({ type: 'error', message: t('map.feedback.errorApproving') });
            }
        } catch (err) {
            console.error(err);
            setApproveFeedback({ type: 'error', message: t('map.feedback.errorApproving') });
        } finally {
            setIsApproving(false);
        }
    }, [props.parcelsEndpoint, t, fetchPolygons]);

    const startDrag = useCallback((e: React.MouseEvent) => {
        if (!popupCoords || isMobile) return;
        e.preventDefault();
        setDragState({ active: true, offsetX: e.clientX - popupCoords.left, offsetY: e.clientY - popupCoords.top });
    }, [popupCoords, isMobile]);

    const clearSearchFilters = useCallback(() => {
        setSearchDraft({
            periodId: '',
            toolId: '',
            productId: '',
            startDate: '',
            endDate: '',
            useMapArea: false,
            usePolygon: false,
        });
        setAppliedFilters({
            periodId: '',
            toolId: '',
            productId: '',
            startDate: '',
            endDate: '',
            useMapArea: false,
            usePolygon: false,
        });
        setAppliedPolygonWkt(null);
        setAppliedBounds(null);
        setSearchAreaCoords([]);
        if (searchAreaLayerRef.current) {
            getMap()?.removeLayer(searchAreaLayerRef.current);
            searchAreaLayerRef.current = null;
        }
    }, [getMap]);

    const filterOptions = useMemo(() => [
        { key: 'all', label: t('map.filter.all'), value: '' },
        { key: 'active', label: t('map.filter.active'), value: 'active' },
        { key: 'inactive', label: t('map.filter.inactive'), value: 'inactive' },
    ], [t]);



    const detectOverlaps = useCallback((id: string, coords: [number, number][], parentIdToIgnore?: string | null) => {
        const overlapping: { id: string; name: string }[] = [];
        console.log(`--- DETECTING OVERLAPS for ${id} ---`, { parentIdToIgnore, polygonCount: polygons.length });
        
        for (const poly of polygons) {
            // Skip itself and its sub-parcels
            if (poly.id === id || poly.parentId === id) continue;
            // Skip its own parent in subparcel mode
            if (parentIdToIgnore && poly.id === parentIdToIgnore) continue;
            if (!poly.visible) continue;
            
            const isOverlap = checkOverlap(coords, poly.coords);
            if (isOverlap) {
                console.log(`[OVERLAP DETECTED] with ${poly.name} (${poly.id})`);
                overlapping.push({ id: poly.id, name: poly.name });
            }
        }
        return overlapping;
    }, [polygons]);

    const updatePolygon = useCallback((id: string, coords: [number, number][], incrementVersion: boolean = true) => {
        setPolygons(prev => prev.map(p => p.id === id ? { ...p, coords, version: incrementVersion ? (p.version || 0) + 1 : p.version } : p));
    }, []);

    const cleanupEdit = useCallback(() => {
        const state = editStateRef.current;
        if (!state) return;
        state.listeners.edit && state.layer?.off('edit', state.listeners.edit);
        state.listeners.mousemove && state.listeners.mousemove.map?.off('mousemove', state.listeners.mousemove.listener);
        state.handler?.disable?.();
        state.tempGroup && getMap()?.removeLayer(state.tempGroup);
        editStateRef.current = null;
    }, []);

    const startEdit = useCallback((id: string) => {
        if (editingId && editingId !== id) return;
        const poly = polygons.find(p => p.id === id);
        const map = getMap();
        if (!poly || !map) return;

        let targetLayer: any = null;
        featureGroupRef.current?.eachLayer((l: any) => { if (l?.options?.customId === id) targetLayer = l; });
        if (!targetLayer) return;

        originalCoordsRef.current[id] = extractCoords(targetLayer);
        map.closePopup?.();

        const clone = L.polygon(poly.coords as L.LatLngExpression[], { color: 'blue' });
        (clone as any).options = { ...clone.options, customId: id };
        const tmpGroup = new L.FeatureGroup().addLayer(clone);
        map.addLayer(tmpGroup);

        const EditHandler = (L as any).EditToolbar?.Edit || (L as any).EditToolbarEdit;
        if (!EditHandler) return;

        const handler = new EditHandler(map, { featureGroup: tmpGroup });
        if (handler._selectedLayers) {
            handler._selectedLayers.clearLayers?.();
            handler._selectedLayers.addLayer(clone);
        }

        const parent = poly.parentId ? polygons.find(p => p.id === String(poly.parentId)) : null;

        const handleUpdate = () => updatePolygon(id, extractCoords(clone), false);
        clone.on('edit', handleUpdate);

        let moveListener: any = null;
        let lastUpdate = 0;
        moveListener = () => {
            const now = Date.now();
            if (now - lastUpdate < 16) return;
            lastUpdate = now;
            handleUpdate();
        };
        map.on('mousemove', moveListener);

        if (true) { // We always check for obstacles, even if no parent
            const snapMarkers = () => {
                if (!(handler as any)._markerGroup) return;
                (handler as any)._markerGroup.eachLayer((marker: any) => {
                    if (marker._snapBound) return;
                    marker._snapBound = true;
                    marker.on('drag', (e: any) => {
                        const latlng = marker.getLatLng();
                        const point: [number, number] = [latlng.lat, latlng.lng];
                        let finalLatLng = latlng;

                        // 1. Clamp to parent if subparcel
                        if (parent) {
                            if (!isPointInPolygon(point, parent.coords)) {
                                const snapped = getClosestPointOnPolygon(point, parent.coords);
                                finalLatLng = L.latLng(snapped[0], snapped[1]);
                            }
                        }

                        // 2. Snap to obstacles
                        const obstacles = polygons.filter(p => p.visible && p.id !== id && p.id !== poly.parentId);
                        let bestSnap: L.LatLng | null = null;
                        let minSnapDistPx = Infinity;

                        for (const obstacle of obstacles) {
                            const currentPoint: [number, number] = [finalLatLng.lat, finalLatLng.lng];
                            const isInsideObs = isPointInPolygon(currentPoint, obstacle.coords);
                            const snappedObs = getClosestPointOnPolygon(currentPoint, obstacle.coords);
                            const snappedObsLatLng = L.latLng(snappedObs[0], snappedObs[1]);
                            
                            const cursorPointPx = map.latLngToLayerPoint(finalLatLng);
                            const snappedPointPx = map.latLngToLayerPoint(snappedObsLatLng);
                            const distPx = cursorPointPx.distanceTo(snappedPointPx);

                            if (isInsideObs || distPx < 25) {
                                if (distPx < minSnapDistPx) {
                                    minSnapDistPx = distPx;
                                    bestSnap = snappedObsLatLng;
                                }
                            }
                        }

                        if (bestSnap) finalLatLng = bestSnap;

                        // 3. Re-clamp if needed
                        if (parent) {
                            const finalPoint: [number, number] = [finalLatLng.lat, finalLatLng.lng];
                            if (!isPointInPolygon(finalPoint, parent.coords)) {
                                const reSnapped = getClosestPointOnPolygon(finalPoint, parent.coords);
                                finalLatLng = L.latLng(reSnapped[0], reSnapped[1]);
                            }
                        }

                        marker.setLatLng(finalLatLng);
                        handleUpdate();
                    });
                });
            };
            handler.on('enabled', snapMarkers);
            setTimeout(snapMarkers, 100); // Wait a bit more for markers to populate
        }

        editStateRef.current = { 
            layer: clone, 
            handler, 
            tempGroup: tmpGroup, 
            listeners: { 
                edit: handleUpdate, 
                mousemove: { map, listener: moveListener } 
            } 
        };
        handler.enable();
        setEditingId(id);
    }, [polygons, editingId, updatePolygon, getMap]);

    const finishEdit = useCallback(async () => {
        const state = editStateRef.current;
        if (!state || !editingId) return;

        const newCoords = extractCoords(state.layer);
        let finalCoords = newCoords;
        const editingPoly = polygons.find(p => p.id === editingId);
        const parentIdToIgnore = editingPoly?.parentId;
        
        if (parentIdToIgnore) {
            const parent = polygons.find(p => p.id === parentIdToIgnore);
            if (parent) {
                const clipped = clipToPolygon(newCoords, parent.coords);
                if (clipped.length > 0) {
                    clipped.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)));
                    finalCoords = clipped[0];
                } else {
                    cancelEdit();
                    return;
                }
            }
        }

        const overlapping = detectOverlaps(editingId, finalCoords, parentIdToIgnore);
        
        if (overlapping.length > 0) {
            const otherPolygons = polygons.filter(p => overlapping.some(o => o.id === p.id));
            const fixedCoords = fixOverlap(newCoords, otherPolygons);
            cleanupEdit();
            setEditingId(null);
            delete originalCoordsRef.current[editingId];
            setOverlapWarning({
                polygonId: editingId,
                overlappingPolygons: overlapping,
                originalCoords: finalCoords,
                fixedCoords
            });
            setShowPreview(false);
            return;
        }

        try {
            await apiPut(`${props.parcelsEndpoint}/${editingId}`, {
                geodata: coordsToWKT(finalCoords),
            });
            
            // Check for children and clip them to the new parent geometry
            const children = polygons.filter(p => p.parentId === editingId);
            for (const child of children) {
                const clippedChild = clipToPolygon(child.coords, finalCoords);
                if (clippedChild.length > 0) {
                    clippedChild.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)));
                    const newChildCoords = clippedChild[0];
                    
                    // Only update if geometry actually changed
                    if (coordsToWKT(newChildCoords) !== coordsToWKT(child.coords)) {
                        await apiPut(`${props.parcelsEndpoint}/${child.id}`, {
                            geodata: coordsToWKT(newChildCoords),
                        });
                        updatePolygon(child.id, newChildCoords, true);
                    }
                } else {
                    // Child is now completely outside parent! 
                    // This is a difficult edge case. For now, we'll keep it as is or warn, 
                    // but the user's logic implies children MUST stay inside.
                    console.warn(`Child ${child.id} is now outside modified parent ${editingId}`);
                }
            }
        } catch (err) {
            console.error("Failed to update parcel or its children:", err);
        }

        updatePolygon(editingId, finalCoords, true);
        delete originalCoordsRef.current[editingId];
        cleanupEdit();
        setEditingId(null);
    }, [editingId, polygons, detectOverlaps, props.parcelsEndpoint, updatePolygon, cleanupEdit]);

    const cancelEdit = useCallback(() => {
        const state = editStateRef.current;
        if (!state || !editingId) return;

        const original = originalCoordsRef.current[editingId];
        if (original) {
            state.layer.setLatLngs?.(original);
            updatePolygon(editingId, original, true);
            delete originalCoordsRef.current[editingId];
        }

        cleanupEdit();
        setEditingId(null);
    }, [editingId, updatePolygon, cleanupEdit]);

    const reattachCreatedLayer = useCallback(() => {
        if (!overlapWarning?.isNewPolygon || !createdLayerRef.current) return;
        const map = getMap();
        if (map && !map.hasLayer(createdLayerRef.current)) {
            map.addLayer(createdLayerRef.current);
        }
    }, [overlapWarning, getMap]);

    const deletePolygon = useCallback(async (id: string) => {
        if (props.contextType === 'farm') {
            try {
                const response = await apiDelete(`/parcels/${id}`);
                if (!response.ok) return;
            } catch (err) {
                console.error("Failed to delete parcel:", err);
                return;
            }
        }
        setPolygons(prev => prev.filter(p => p.id !== id));
        if (id === editingId) {
            cleanupEdit();
            setEditingId(null);
        }
    }, [props.contextType, editingId, cleanupEdit]);

    const startCreate = useCallback(() => {
        console.log("--- STARTING CREATE ---");
        const map = getMap();
        if (!map) return;
        
        // Ensure any existing handler is disabled
        if (createHandlerRef.current) {
            createHandlerRef.current.disable();
        }

        // Always create a fresh handler to avoid session lockups and ensure clean overrides
        const handler = new (L as any).Draw.Polygon(map, {
            showArea: true,
            repeatMode: false,
            shapeOptions: {
                color: '#6366f1',
                weight: 3
            }
        });

        // handler.enable() moved to drawing useEffect for correct wrapping order
        createHandlerRef.current = handler;
        setActiveDrawHandler(handler);
        setIsCreating(true);
        setCreatePointCount(0);
    }, [getMap]);

    const finishCreate = useCallback(() => {
        const count = createHandlerRef.current?._markers?.length || 0;
        if (count < 3) return;
        createHandlerRef.current?.completeShape?.() || createHandlerRef.current?._finishShape?.();
    }, []);

    const cancelCreate = useCallback(() => {
        cleanupDrawSession();
        resetParcelFlow();
        createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
    }, [cleanupDrawSession, resetParcelFlow, getMap]);

    const startManualEdit = useCallback((coords: [number, number][], fixedIndices?: number[]) => {
        const map = getMap();
        if (!map) return;

        // Cleanup any existing scratch layer
        if (createdLayerRef.current) {
            map.removeLayer(createdLayerRef.current);
            if (featureGroupRef.current) featureGroupRef.current.removeLayer(createdLayerRef.current);
        }

        // Cleanup all correction layers
        map.eachLayer((l: any) => {
            if (l.isCorrectionLayer) map.removeLayer(l);
        });

        const activeLayer = L.polygon(
            coords.map(c => L.latLng(c[0], c[1])),
            { dashArray: '10 10', color: '#6366f1', weight: 4 }
        ) as any;
        activeLayer.isCorrectionLayer = true;
        activeLayer.fixedIndices = fixedIndices; // Store for styling in the client

        if (featureGroupRef.current) {
            featureGroupRef.current.addLayer(activeLayer);
        }
        
        createdLayerRef.current = activeLayer;
        setIsInspecting(true);
        setIsTinkered(false);
        document.body.classList.add('inspecting-parcel');
        activeLayer.bringToFront();

        // Listen for vertex moves to track if auto-fix needs re-running
        activeLayer.on('editvertex', () => {
            setIsTinkered(true);
        });

        if ((L as any).Edit && activeLayer.editing) {
            setTimeout(() => {
                if (activeLayer.editing) {
                    activeLayer.editing.enable();
                    inspectionHandlerRef.current = activeLayer.editing;

                    // ENFORCE INTERIOR PREVENTION ON MARKERS (Robust Override)
                    const editHandler = activeLayer.editing;
                    
                    const attachSnap = (marker: L.Marker) => {
                        marker.on('drag', (e: any) => {
                            const currentWarning = overlapWarningRef.current;
                            const currentEditingId = editingIdRef.current;
                            const skipId = currentWarning?.polygonId || currentEditingId;
                            
                            const snapFunc = getStrictSnapTargetRef.current;
                            if (snapFunc) {
                                let { finalLatLng, isSnapped } = snapFunc(e.latlng, skipId);
                                
                                // Robust Edge Intersection Prevention
                                // We check if moving this vertex causes its segments to cross any neighbor
                                if (!isSnapped) {
                                    const layer = createdLayerRef.current;
                                    const obstacles = polygonsRef.current.filter(p => p.visible && p.id !== skipId);
                                    if (layer && obstacles.length > 0) {
                                        const coords = extractCoords(layer);
                                        const markerIndex = (marker as any)._index;
                                        if (markerIndex !== undefined) {
                                            const pPrev = coords[(markerIndex - 1 + coords.length) % coords.length];
                                            const pNext = coords[(markerIndex + 1) % coords.length];
                                            const pNew: [number, number] = [e.latlng.lat, e.latlng.lng];
                                            
                                            for (const obs of obstacles) {
                                                if (segmentIntersectsPolygon(pPrev, pNew, obs.coords) || 
                                                    segmentIntersectsPolygon(pNew, pNext, obs.coords)) {
                                                    console.log(`[SEGMENT BLOCK] Crossing ${obs.name}`);
                                                    const snapped = getClosestPointOnPolygon(pNew, obs.coords);
                                                    finalLatLng = L.latLng(snapped[0], snapped[1]);
                                                    isSnapped = true;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }

                                if (isSnapped) {
                                    marker.setLatLng(finalLatLng);
                                    // FORCE update marker internal state
                                    (marker as any)._latlng = L.latLng(finalLatLng.lat, finalLatLng.lng);
                                    
                                    if ((editHandler as any)._poly) {
                                        (editHandler as any)._updatePoly();
                                    }
                                }
                            }
                        });
                    };

                    // Catch existing markers
                    if (editHandler._markers) editHandler._markers.forEach(attachSnap);
                    if (editHandler._middleMarkers) editHandler._middleMarkers.forEach(attachSnap);

                    // Override creation to catch dynamic markers (e.g. from middle markers)
                    if (!(editHandler as any)._efmsOverridden) {
                        (editHandler as any)._efmsOverridden = true;
                        
                        const originalCreateMarker = editHandler._createMarker;
                        editHandler._createMarker = function(latlng: L.LatLng, index: number) {
                            const marker = originalCreateMarker.call(this, latlng, index);
                            attachSnap(marker);
                            return marker;
                        };

                        const originalCreateMiddleMarker = editHandler._createMiddleMarker;
                        editHandler._createMiddleMarker = function(marker1: L.Marker, marker2: L.Marker) {
                            const marker = originalCreateMiddleMarker.call(this, marker1, marker2);
                            attachSnap(marker);
                            return marker;
                        };
                    }
                }
            }, 100);
        }
    }, [getMap]);

    const handleCreated = useCallback((e: any) => {
        console.log("--- POLYGON CREATED (INSPECTING) ---", e);
        const { layerType, layer } = e;
        if (layerType === 'polygon') {
            const coords = extractCoords(layer);
            let finalCoords = coords;
            
            // Check for parent clipping if active
            let parentIdToIgnore = selectedParentId ? String(selectedParentId) : undefined;
            if (selectedParentId) {
                const parent = polygons.find(p => p.id === String(selectedParentId));
                if (parent) {
                    const clipped = clipToPolygon(coords, parent.coords);
                    if (clipped.length > 0) {
                        clipped.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)));
                        finalCoords = clipped[0];
                    }
                }
            }

            // Check for overlaps immediately
            const tempId = `temp-${Date.now()}`;
            const overlapping = detectOverlaps(tempId, finalCoords, parentIdToIgnore);
            
            if (overlapping.length > 0) {
                const otherPolygons = polygons.filter(p => overlapping.some(o => o.id === p.id));
                const fixedCoords = fixOverlap(finalCoords, otherPolygons);
                
                // Identify which vertices are auto-generated/moved
                const fixedIndices: number[] = [];
                fixedCoords.forEach((p, idx) => {
                    const match = finalCoords.some(op => Math.hypot(p[0] - op[0], p[1] - op[1]) < 1e-9);
                    if (!match) fixedIndices.push(idx);
                });

                // Store for reference ghost (Amber ghost)
                setOverlapWarning({
                    polygonId: tempId,
                    overlappingPolygons: overlapping,
                    originalCoords: finalCoords,
                    fixedCoords,
                    fixedIndices,
                    isNewPolygon: true,
                    isAutoFixEnabled: true, // Default to ON
                });

                // AUTO-START INSPECTION with the fixed shape
                startManualEdit(fixedCoords, fixedIndices);
                
                // Nuclear Cleanup of the original Draw layer (The Ghost)
                const map = getMap();
                if (map && layer) map.removeLayer(layer);
                
                cleanupDrawSession();
            } else {
                // No overlap detected.
                const isClean = coordsToWKT(coords) === coordsToWKT(finalCoords);
                
                if (isClean) {
                    // PERFECT: No overlap, No clipping. Direct to save.
                    setModal({ open: true, coords: finalCoords });
                } else {
                    // Auto-correction was applied (clipping to parent). 
                    // Set minimal overlapWarning to trigger Bottom Bar confirmation
                    setOverlapWarning({
                        polygonId: tempId,
                        overlappingPolygons: [],
                        originalCoords: coords,
                        fixedCoords: finalCoords,
                        fixedIndices: [], // Clipping might not move existing points significantly to highlight
                        isNewPolygon: true,
                        isAutoFixEnabled: true, // Default to ON
                    });
                    startManualEdit(finalCoords);
                }

                // Nuclear Cleanup of the original Draw layer
                const map = getMap();
                if (map && layer) map.removeLayer(layer);

                cleanupDrawSession();
            }
        }
    }, [cleanupDrawSession, polygons, selectedParentId, detectOverlaps, startManualEdit]);

    const validateInspection = useCallback(() => {
        const layer = createdLayerRef.current;
        if (!layer) return;
        
        // Disable editing for a moment to get clean coords
        if (inspectionHandlerRef.current) {
            inspectionHandlerRef.current.disable();
        }
        
        const coords = extractCoords(layer);
        
        // FINAL RE-VALIDATION: Ensure no "escaped" overlaps before allowing save
        const tempId = `temp-${Date.now()}`;
        const skipId = overlapWarning?.polygonId || editingId;
        const remainingOverlaps = detectOverlaps(tempId, coords, skipId);
        
        if (remainingOverlaps.length > 0) {
            console.log("--- SAVE BLOCKED: OVERLAPS DETECTED ---", remainingOverlaps);
            const otherPolygons = polygons.filter(p => remainingOverlaps.some(o => o.id === p.id));
            const fixedCoords = fixOverlap(coords, otherPolygons);
            
            // Re-run inspection with newly fixed coords
            const fixedIndices: number[] = [];
            fixedCoords.forEach((p, idx) => {
                const match = coords.some(op => Math.hypot(p[0] - op[0], p[1] - op[1]) < 1e-9);
                if (!match) fixedIndices.push(idx);
            });

            setOverlapWarning({
                ...(overlapWarning || { polygonId: tempId, isNewPolygon: true, originalCoords: coords, overlappingPolygons: [] }),
                overlappingPolygons: remainingOverlaps,
                fixedCoords,
                fixedIndices,
                isAutoFixEnabled: true, // Re-enable if we hit a new overlap
            });
            startManualEdit(fixedCoords, fixedIndices);
            return;
        }

        // Clean up UI states
        setOverlapWarning(null);
        setShowPreview(false);
        setIsInspecting(false);
        document.body.classList.remove('inspecting-parcel');
        
        // Proceed to save
        setModal({ open: true, coords });
    }, [polygons, detectOverlaps, overlapWarning, editingId, startManualEdit]);

    const cancelInspection = useCallback(() => {
        if (createdLayerRef.current && featureGroupRef.current) {
            featureGroupRef.current.removeLayer(createdLayerRef.current);
        }
        cleanupDrawSession();
        resetParcelFlow();
    }, [cleanupDrawSession, resetParcelFlow]);

    // Ensure all draw events are caught, even for manual handlers
    useEffect(() => {
        const map = getMap();
        if (!map) return;
        
        const onCreated = (e: any) => {
            console.log("--- MAP DRAW:CREATED ---", e.layerType);
            handleCreated(e);
        };
        
        map.on('draw:created', onCreated);
        return () => {
            map.off('draw:created', onCreated);
        };
    }, [getMap, handleCreated]);

    const confirmCreate = useCallback(async () => {
        const coords = modal.coords;
        if (!coords) return;
        let finalCoords = coords;
        let parentIdToIgnore = selectedParentId ? String(selectedParentId) : undefined;
        
        if (selectedParentId) {
            const parent = polygons.find(p => p.id === String(selectedParentId));
            if (parent) {
                const clipped = clipToPolygon(coords, parent.coords);
                if (clipped.length > 0) {
                    clipped.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)));
                    finalCoords = clipped[0];
                } else {
                    console.warn("Subparcel completely outside parent");
                    resetParcelFlow();
                    createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
                    return;
                }
            }
        }
        
        const tempId = `poly-${Date.now()}`;
        const overlapping = detectOverlaps(tempId, finalCoords, parentIdToIgnore);
        
        if (overlapping.length > 0) {
            const otherPolygons = polygons.filter(p => overlapping.some(o => o.id === p.id));
            const fixedCoords = fixOverlap(finalCoords, otherPolygons);
            
            // Identify which vertices are auto-generated/moved
            const fixedIndices: number[] = [];
            fixedCoords.forEach((p, idx) => {
                const match = finalCoords.some(op => Math.hypot(p[0] - op[0], p[1] - op[1]) < 1e-9);
                if (!match) fixedIndices.push(idx);
            });

            setModal({ open: false, coords: null });
            setOverlapWarning({
                polygonId: tempId,
                overlappingPolygons: overlapping,
                originalCoords: finalCoords,
                fixedCoords,
                fixedIndices,
                isNewPolygon: true
            });
            setShowPreview(false);
            return;
        }
        
        if (createdLayerRef.current && featureGroupRef.current) {
            featureGroupRef.current.removeLayer(createdLayerRef.current);
        }
        createdLayerRef.current = null;

        const payload = {
            name: areaName || t('map.defaultPolygonName'),
            active: true,
            startValidity: new Date().toISOString(),
            geodata: coordsToWKT(finalCoords),
            color: '#3388ff',
            periodId: selectedPeriodId ? Number(selectedPeriodId) : undefined,
            parentParcelId: selectedParentId ? Number(selectedParentId) : undefined,
        };

        try {
            console.log('--- SAVING PARCEL ---', payload);
            const response = await apiPost(props.parcelsEndpoint, payload);
            if (response.ok) {
                const created = await response.json();
                console.log('--- DB SAVED RESPONSE ---', created);
                setPolygons(prev => [...prev, {
                    id: String(created.id),
                    name: created.name,
                    coords: finalCoords,
                    visible: true,
                    version: 0,
                    color: created.color || '#3388ff',
                    periodId: created.periodId,
                    parentId: created.parentParcelId ? String(created.parentParcelId) : null,
                }]);
            }
        } catch (err) {
            console.error("Failed to create parcel:", err);
        }
        resetParcelFlow();
    }, [modal.coords, areaName, polygons, props.parcelsEndpoint, selectedPeriodId, selectedParentId, t, detectOverlaps, resetParcelFlow]);

    const cancelModal = useCallback(() => {
        createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
        resetParcelFlow();
    }, [resetParcelFlow, getMap]);

    const handleOverlapCancel = useCallback(() => {
        setOverlapWarning(null);
        setShowPreview(false);
        if (overlapWarning?.isNewPolygon) {
            createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
            createdLayerRef.current = null;
        }
        setIsInspecting(false);
        setIsCreating(false);
    }, [overlapWarning, getMap]);

    const handleOverlapIgnore = useCallback(() => {
        if (!overlapWarning) return;
        const coords = overlapWarning.originalCoords;

        // Final confirmation for overlapping save
        const confirmed = window.confirm(t('map.overlap.confirmSaveAnyway') || "Are you sure you want to save this parcel with overlaps?");
        if (!confirmed) return;

        setOverlapWarning(null);
        setShowPreview(false);
        if (overlapWarning.isNewPolygon) {
            setModal({ open: true, coords });
        } else {
            setEditingId(overlapWarning.polygonId);
            setModal({ open: true, coords });
        }
        setIsInspecting(false);
        // Always clear creating state when dismiss/ignore the overlap
        resetParcelFlow();
    }, [overlapWarning, resetParcelFlow, t]);

    const handleToggleAutoFix = useCallback(() => {
        if (!overlapWarning) return;
        const newEnabled = !overlapWarning.isAutoFixEnabled;
        
        // Get current visual coordinates
        let currentCoords: [number, number][] = [];
        if (createdLayerRef.current) {
            currentCoords = extractCoords(createdLayerRef.current);
        } else {
            currentCoords = overlapWarning.originalCoords;
        }

        if (newEnabled) {
            // Toggling ON: Use current position as the new 'intended' shape and clip it
            const obstacles = polygonsRef.current.filter(p => 
                p.visible && p.id !== (overlapWarning.polygonId || editingIdRef.current)
            );
            
            console.log(`--- [TOGGLE AUTO-FIX ON] Re-calculating with ${obstacles.length} obstacles ---`);
            const freshFixedCoords = fixOverlap(currentCoords, obstacles);
            
            setOverlapWarning({ 
                ...overlapWarning, 
                isAutoFixEnabled: true,
                originalCoords: currentCoords, // Save current manual state as the new 'revert' target
                fixedCoords: freshFixedCoords
            });
            startManualEdit(freshFixedCoords, overlapWarning.fixedIndices);
        } else {
            // Toggling OFF: The user wants to see the un-clipped version.
            // "disable autofix should only remove points that it added"
            console.log("--- [TOGGLE AUTO-FIX OFF] Reverting to un-clipped state ---");
            
            // If the current lengths match our initial fix, we can try to filter out the added indices
            let unclipped = currentCoords;
            if (overlapWarning.fixedCoords && currentCoords.length === overlapWarning.fixedCoords.length) {
                unclipped = currentCoords.filter((_, i) => !overlapWarning.fixedIndices?.includes(i));
            } else {
                // Otherwise just revert to the last known 'original'
                unclipped = overlapWarning.originalCoords;
            }

            setOverlapWarning({ ...overlapWarning, isAutoFixEnabled: false, originalCoords: unclipped });
            startManualEdit(unclipped, []);
        }
    }, [overlapWarning, startManualEdit, fixOverlap, extractCoords]);

    const handleOverlapTweakFix = useCallback(() => {
        if (!overlapWarning?.fixedCoords) return;
        startManualEdit(overlapWarning.fixedCoords, overlapWarning.fixedIndices);
        setOverlapWarning(null);
        setShowPreview(false);
        setIsInspecting(true); // Keep editing open but reset the footer
    }, [overlapWarning, startManualEdit]);

    const handleOverlapAccept = useCallback(async () => {
        if (!overlapWarning) return;
        
        const layerCoords = extractCoords(createdLayerRef.current);
        const source = overlapWarning.isAutoFixEnabled ? 'AUTO-FIX' : 'MANUAL/ORIGINAL';
        const coords = layerCoords || (overlapWarning.isAutoFixEnabled ? overlapWarning.fixedCoords : overlapWarning.originalCoords);
        
        console.log(`--- [SAVE] Using ${source} coords ---`, { isAutoFix: overlapWarning.isAutoFixEnabled, hasLayer: !!createdLayerRef.current });
        
        if (!coords) return;
        const id = overlapWarning.polygonId;
        const isNew = overlapWarning.isNewPolygon;

        setOverlapWarning(null);
        setShowPreview(false);
        setIsInspecting(false); 
        // Clear creating/editing state
        setIsCreating(false);
        setCreatePointCount(0);
        setEditingId(null);
        cleanupDrawSession();
        
        if (isNew) {
            // Save directly with the already-entered name — no need to re-ask
            createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
            createdLayerRef.current = null;
            const payload = {
                name: areaName || t('map.defaultPolygonName'),
                active: true,
                startValidity: new Date().toISOString(),
                geodata: coordsToWKT(coords),
                color: '#3388ff',
                periodId: selectedPeriodId ? Number(selectedPeriodId) : undefined,
                parentParcelId: selectedParentId ? Number(selectedParentId) : undefined,
            };
            try {
                console.log('--- SAVING OVERLAP PARCEL ---', payload);
                const response = await apiPost(props.parcelsEndpoint, payload);
                if (response.ok) {
                    const created = await response.json();
                    console.log('--- DB SAVED OVERLAP RESPONSE ---', created);
                    setPolygons(prev => [...prev, {
                        id: String(created.id),
                        name: created.name,
                        coords,
                        visible: true,
                        version: 0,
                        color: created.color || '#3388ff',
                        periodId: created.periodId,
                        parentId: created.parentParcelId ? String(created.parentParcelId) : null,
                    }]);
                }
            } catch (err) {
                console.error("Failed to create parcel (overlap shrink):", err);
            }
            setAreaName("");
            setSelectedPeriodId("");
            setSelectedParentId(null);
        } else {
            try {
                await apiPut(`${props.parcelsEndpoint}/${id}`, {
                    geodata: coordsToWKT(coords),
                });
                updatePolygon(id, coords, true);
            } catch (err) {
                console.error("Failed to update parcel (overlap fix):", err);
            }
        }
    }, [overlapWarning, areaName, selectedPeriodId, selectedParentId, props.parcelsEndpoint, updatePolygon, t, getMap]);

    const handleShowPreview = useCallback(() => setShowPreview(true), []);


    const loadOperationReferences = useCallback(async () => {
        if (props.contextType !== 'farm' || !props.resolvedContextId) return;
        try {
            const [typesRes, unitsRes, productsRes, toolsRes] = await Promise.all([
                apiGet(`/operations/types`),
                apiGet(`/units`),
                apiGet(`/farm/${props.resolvedContextId}/products`),
                apiGet(`/farm/${props.resolvedContextId}/tools`),
            ]);
            if (typesRes.ok) setOperationTypes(await typesRes.json());
            if (unitsRes.ok) setUnits(await unitsRes.json());
            if (productsRes.ok) setProducts(await productsRes.json());
            if (toolsRes.ok) setTools(await toolsRes.json());
        } catch (err) { console.error(err); }
    }, [props.contextType, props.resolvedContextId]);

    const loadPeriods = useCallback(async () => {
        if (props.contextType !== 'farm' || !props.resolvedContextId) return;
        try {
            const res = await apiGet(`/farm/${props.resolvedContextId}/periods`);
            if (res.ok) setPeriods(await res.json());
        } catch (err) { console.error(err); }
    }, [props.contextType, props.resolvedContextId]);

    const loadParcelOperations = useCallback(async (parcelId: string) => {
        if (props.contextType !== 'farm' || !props.resolvedContextId) return;
        setOperationLoading(true);
        try {
            const res = await apiGet(`/farm/${props.resolvedContextId}/parcels/${parcelId}/operations`);
            if (res.ok) setParcelOperations(await res.json());
        } catch (err) { console.error(err); }
        finally { setOperationLoading(false); }
    }, [props.contextType, props.resolvedContextId]);

    const closeOperationPopup = useCallback(() => {
        setOperationPopup(null);
        setPopupCoords(null);
    }, []);

    const handleAddOperationLine = useCallback(() => {
        setOperationLines(prev => [...prev, { productId: "", quantity: "", unitId: "", toolId: "" }]);
    }, []);

    const updateOperationLine = useCallback((index: number, field: keyof OperationProductInputState, value: string) => {
        setOperationLines(prev => prev.map((line, i) => i === index ? { ...line, [field]: value } : line));
    }, []);

    const handleRemoveOperationLine = useCallback((index: number) => {
        setOperationLines(prev => prev.filter((_, i) => i !== index));
    }, []);

    const resetOperationForm = useCallback(() => {
        setOperationTypeId("");
        setOperationDate("");
        setOperationDurationMinutes("");
        setOperationLines([{ productId: "", quantity: "", unitId: "", toolId: "" }]);
        setOperationPopup(null);
        setPopupCoords(null);
    }, []);

    useEffect(() => {
        loadOperationReferences();
    }, [loadOperationReferences]);

    useEffect(() => {
        loadPeriods();
    }, [loadPeriods]);

    const handleSaveOperation = useCallback(async () => {
        if (!currentParcelId) return;
        setOperationLoading(true);
        try {
            const payload = {
                typeId: operationTypeId ? Number(operationTypeId) : undefined,
                date: operationDate ? new Date(operationDate).toISOString() : undefined,
                durationSeconds: operationDurationMinutes ? Number(operationDurationMinutes) * 60 : undefined,
                products: operationLines.filter(l => l.productId).map(l => ({
                    productId: Number(l.productId),
                    quantity: l.quantity ? Number(l.quantity) : undefined,
                    unitId: l.unitId ? Number(l.unitId) : undefined,
                    toolId: l.toolId ? Number(l.toolId) : undefined,
                })),
            };
            const res = await apiPost(`/farm/${props.farm_id}/parcels/${currentParcelId}/operations`, payload);
            if (res.ok) {
                setOperationTypeId("");
                setOperationDate("");
                setOperationDurationMinutes("");
                setOperationLines([{ productId: "", quantity: "", unitId: "", toolId: "" }]);
                await loadParcelOperations(currentParcelId);
            }
        } catch (err) { console.error(err); }
        finally { setOperationLoading(false); }
    }, [currentParcelId, operationTypeId, operationDate, operationDurationMinutes, operationLines, props.farm_id, loadParcelOperations]);

    const applySearchFilters = useCallback(() => {
        setAppliedFilters(searchDraft);
        setAppliedPolygonWkt(searchDraft.usePolygon ? toWktPolygon(searchAreaCoords) : null);
        if (searchDraft.useMapArea) {
            const bounds = getMap()?.getBounds();
            if (bounds) {
                const sw = bounds.getSouthWest();
                const ne = bounds.getNorthEast();
                setAppliedBounds({ minLat: sw.lat, minLng: sw.lng, maxLat: ne.lat, maxLng: ne.lng });
            }
        } else {
            setAppliedBounds(null);
        }
        setIsSearchOpen(false);
    }, [searchDraft, searchAreaCoords, getMap]);

    const startSearchPolygon = useCallback(() => {
        const map = getMap();
        if (!map) return;
        if (searchAreaLayerRef.current) {
            map.removeLayer(searchAreaLayerRef.current);
            searchAreaLayerRef.current = null;
        }
        const handler = new (L as any).Draw.Polygon(map, { shapeOptions: { color: '#6366f1', fillOpacity: 0.1, weight: 2 } });
        handler.enable();
        searchDrawHandlerRef.current = handler;
        setIsSearchDrawing(true);

        const onCreated = (e: any) => {
            const layer = e.layer;
            searchAreaLayerRef.current = layer;
            setSearchAreaCoords(extractCoords(layer));
            setIsSearchDrawing(false);
            map.off((L as any).Draw.Event.CREATED, onCreated);
        };
        map.on((L as any).Draw.Event.CREATED, onCreated);
    }, [getMap, extractCoords]);

    const cancelSearchPolygon = useCallback(() => {
        searchDrawHandlerRef.current?.disable?.();
        searchDrawHandlerRef.current = null;
        setIsSearchDrawing(false);
    }, []);

    const clearSearchPolygon = useCallback(() => {
        if (searchAreaLayerRef.current) {
            getMap()?.removeLayer(searchAreaLayerRef.current);
            searchAreaLayerRef.current = null;
        }
        setSearchAreaCoords([]);
        setAppliedPolygonWkt(null);
    }, [getMap]);

    const togglePolygonVisibility = useCallback((id: string) => {
        setPolygons(prev => prev.map(p => p.id === id ? { ...p, visible: !p.visible } : p));
    }, []);

    const renamePolygonInline = useCallback((id: string, name: string) => {
        setPolygons(prev => prev.map(p => p.id === id ? { ...p, name } : p));
    }, []);

    const closePolygonContextMenu = useCallback(() => {
        setPolygonContextMenu(null);
        setShowColorPicker(false);
    }, []);

    // Memoized values
    const activeFilterLabel = useMemo(() => {
        if (!listFilter.length) {
            return t('map.polygonList.filters.all', { defaultValue: 'All' });
        }
        return t('map.polygonList.filters.selected', { defaultValue: '{{count}} selected', count: listFilter.length });
    }, [listFilter, t]);

    const filteredPolygons = useMemo(() => {
        let next = polygons;
        const visibilityFilters = listFilter.filter(filter => filter === 'visible' || filter === 'hidden');
        const statusFilters = listFilter.filter(filter => filter === 'approved' || filter === 'unapproved');

        if (visibilityFilters.length === 1) {
            next = next.filter(p => visibilityFilters[0] === 'visible' ? p.visible : !p.visible);
        }

        if (statusFilters.length === 1) {
            next = next.filter(p => {
                const status = (p.validationStatus || '').toUpperCase();
                const isApproved = status === 'APPROVED' || status === 'CONVERTED';
                return statusFilters[0] === 'approved' ? isApproved : !isApproved;
            });
        }

        if (searchQuery.trim()) {
            const needle = searchQuery.trim().toLowerCase();
            next = next.filter(p => (p.name || '').toLowerCase().includes(needle));
        }

        return next;
    }, [polygons, listFilter, searchQuery]);


    // Cleanup and effects
    useEffect(() => {
        if (!approveFeedback) return;
        const timer = setTimeout(() => setApproveFeedback(null), 4000);
        return () => clearTimeout(timer);
    }, [approveFeedback]);

    return {
        polygons, setPolygons,
        editingId, setEditingId,
        selectedId, setSelectedId,
        renamingId, setRenamingId,
        renameValue, setRenameValue,
        pendingDeleteId, setPendingDeleteId,
        isCreating, setIsCreating,
        createPointCount, setCreatePointCount,
        modal, setModal,
        areaName, setAreaName,
        contextMenu, setContextMenu,
        polygonContextMenu, setPolygonContextMenu,
        showColorPicker, setShowColorPicker,
        overlapWarning, setOverlapWarning,
        showPreview, setShowPreview,
        pendingManualEditId, setPendingManualEditId,
        manualEditContext, setManualEditContext,
        previewVisibility, setPreviewVisibility,
        isListCollapsed, setIsListCollapsed,
        listFilter, setListFilter,
        showFilterMenu, setShowFilterMenu,
        searchQuery, setSearchQuery,
        defaultSearchFilters,
        isSearchOpen, setIsSearchOpen,
        searchDraft, setSearchDraft,
        appliedFilters, setAppliedFilters,
        appliedBounds, setAppliedBounds,
        searchAreaCoords, setSearchAreaCoords,
        isSearchDrawing, setIsSearchDrawing,
        appliedPolygonWkt, setAppliedPolygonWkt,
        isApproving, setIsApproving,
        approveFeedback, setApproveFeedback,
        operationPopup, setOperationPopup,
        popupCoords, setPopupCoords,
        currentParcelId, setCurrentParcelId,
        operationTypes, setOperationTypes,
        units, setUnits,
        products, setProducts,
        tools, setTools,
        operationTypeId, setOperationTypeId,
        operationDate, setOperationDate,
        operationDurationMinutes, setOperationDurationMinutes,
        operationLines, setOperationLines,
        operationError, setOperationError,
        operationLoading, setOperationLoading,
        parcelOperations, setParcelOperations,
        periods, setPeriods,
        selectedPeriodId, setSelectedPeriodId,
        renamePeriodId, setRenamePeriodId,
        preferTopRight, setPreferTopRight,
        isMobile, setIsMobile,
        dragState, setDragState,
        selectedParentId, setSelectedParentId,
        
        // Refs
        originalColorRef,
        listBarRef,
        polygonLayersRef,
        searchDrawHandlerRef,
        searchAreaLayerRef,
        featureGroupRef,
        editControlRef,
        editStateRef,
        originalCoordsRef,
        createHandlerRef,
        createdLayerRef,
        createRafRef,

        // Memoized
        activeFilterLabel,
        filteredPolygons,
        filterOptions,
        searchEndpoint,
        getPointCount,

        applySearchFilters,
        clearSearchFilters,
        startCreate,
        finishCreate,
        cancelCreate,
        isInspecting,
        validateInspection,
        cancelInspection,
        confirmCreate,
        startEdit,
        finishEdit,
        cancelEdit,
        deletePolygon,
        approveSingleParcel,
        focusPolygon,
        startDrag,
        loadOperationReferences,
        loadPeriods,
        loadParcelOperations,
        handleSaveOperation,
        fetchPolygons,
        togglePolygonVisibility,
        renamePolygonInline,
        closePolygonContextMenu,
        reattachCreatedLayer,
        handleCreated,
        cancelModal,
        handleOverlapCancel,
        handleOverlapIgnore,
        handleOverlapAccept,
        handleShowPreview,
        handleOverlapTweakFix,
        handleToggleAutoFix,
        closeOperationPopup,
        handleAddOperationLine,
        updateOperationLine,
        handleRemoveOperationLine,
        resetOperationForm,
        startSearchPolygon,
        cancelSearchPolygon,
        clearSearchPolygon,
    };
}
