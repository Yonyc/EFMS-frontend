import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import L from "leaflet";
import { useTranslation } from "react-i18next";
import { useFarm } from "~/contexts/FarmContext";
import { useAuth } from "~/contexts/AuthContext";
import { apiDelete, apiGet, apiPost, apiPut } from "~/utils/api";
import { checkOverlap, fixOverlap } from "../utils/geometry";
import { 
    extractCoords, 
    coordsToWKT, 
    parseWktCoords,
    toWktPolygon, 
    hasActiveSearchFilters 
} from "../utils/map";
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
    const [createPointCount, setCreatePointCount] = useState(0);
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

    const originalColorRef = useRef<string | null>(null);
    const listBarRef = useRef<HTMLDivElement>(null);
    const polygonLayersRef = useRef<Map<string, L.Polygon>>(new Map());
    const searchDrawHandlerRef = useRef<any>(null);
    const searchAreaLayerRef = useRef<L.Polygon | null>(null);
    const featureGroupRef = useRef<L.FeatureGroup>(null);
    const editStateRef = useRef<EditState | null>(null);
    const originalCoordsRef = useRef<Record<string, [number, number][]>>({});
    const createHandlerRef = useRef<any>(null);
    const createdLayerRef = useRef<any>(null);
    const editControlRef = useRef<any>(null);
    const createRafRef = useRef<number | null>(null);

    // Helpers
    const getMap = () => (featureGroupRef.current as any)?._map || (featureGroupRef.current as any)?.getMap?.();

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



    const detectOverlaps = useCallback((id: string, coords: [number, number][]) => {
        const overlapping: { id: string; name: string }[] = [];
        for (const poly of polygons) {
            if (poly.id === id) continue;
            if (!poly.visible) continue;
            if (checkOverlap(coords, poly.coords)) {
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
    }, [polygons, editingId, updatePolygon]);

    const finishEdit = useCallback(async () => {
        const state = editStateRef.current;
        if (!state || !editingId) return;

        const newCoords = extractCoords(state.layer);
        const overlapping = detectOverlaps(editingId, newCoords);
        
        if (overlapping.length > 0) {
            const otherPolygons = polygons.filter(p => overlapping.some(o => o.id === p.id));
            const fixedCoords = fixOverlap(newCoords, otherPolygons);
            cleanupEdit();
            setEditingId(null);
            delete originalCoordsRef.current[editingId];
            setOverlapWarning({
                polygonId: editingId,
                overlappingPolygons: overlapping,
                originalCoords: newCoords,
                fixedCoords
            });
            setShowPreview(false);
            return;
        }

        try {
            await apiPut(`${props.parcelsEndpoint}/${editingId}`, {
                geodata: coordsToWKT(newCoords),
            });
        } catch (err) {
            console.error("Failed to update parcel:", err);
        }

        updatePolygon(editingId, newCoords, true);
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
        const drawMode = editControlRef.current?._toolbars?.draw?._modes?.polygon?.handler;
        const map = getMap();
        const handler = drawMode || (map && (L as any).Draw?.Polygon ? new (L as any).Draw.Polygon(map, {}) : null);
        if (!handler) return;

        handler.enable();
        createHandlerRef.current = handler;
        setIsCreating(true);
        setCreatePointCount(0);
    }, []);

    const finishCreate = useCallback(() => {
        const count = createHandlerRef.current?._markers?.length || 0;
        if (count < 3) return;
        createHandlerRef.current?.completeShape?.() || createHandlerRef.current?._finishShape?.();
    }, []);

    const cancelCreate = useCallback(() => {
        createHandlerRef.current?.disable?.();
        createHandlerRef.current = null;
        setIsCreating(false);
        setCreatePointCount(0);
        createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
        createdLayerRef.current = null;
    }, []);

    const handleCreated = useCallback((e: any) => {
        const { layerType, layer } = e;
        if (layerType === 'polygon') {
            const coords = extractCoords(layer);
            setModal({ open: true, coords });
            createdLayerRef.current = layer;
            // Exit drawing mode so toolbar/keyboard know we're no longer actively creating
            setIsCreating(false);
            setCreatePointCount(0);
            createHandlerRef.current = null;
        }
    }, [extractCoords]);

    const confirmCreate = useCallback(async () => {
        const coords = modal.coords;
        if (!coords) return;
        
        const tempId = `poly-${Date.now()}`;
        const overlapping = detectOverlaps(tempId, coords);
        
        if (overlapping.length > 0) {
            const otherPolygons = polygons.filter(p => overlapping.some(o => o.id === p.id));
            const fixedCoords = fixOverlap(coords, otherPolygons);
            setModal({ open: false, coords: null });
            setOverlapWarning({
                polygonId: tempId,
                overlappingPolygons: overlapping,
                originalCoords: coords,
                fixedCoords,
                isNewPolygon: true
            });
            setShowPreview(false);
            return;
        }
        
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
            const response = await apiPost(props.parcelsEndpoint, payload);
            if (response.ok) {
                const created = await response.json();
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
            console.error("Failed to create parcel:", err);
        }

        setModal({ open: false, coords: null });
        setAreaName("");
        setSelectedPeriodId("");
        setSelectedParentId(null);
    }, [modal.coords, areaName, polygons, props.parcelsEndpoint, selectedPeriodId, selectedParentId, t, detectOverlaps]);

    const cancelModal = useCallback(() => {
        setModal({ open: false, coords: null });
        createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
        createdLayerRef.current = null;
    }, [getMap]);

    const handleOverlapCancel = useCallback(() => {
        setOverlapWarning(null);
        setShowPreview(false);
        if (overlapWarning?.isNewPolygon) {
            createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
            createdLayerRef.current = null;
        }
    }, [overlapWarning, getMap]);

    const handleOverlapIgnore = useCallback(() => {
        if (!overlapWarning) return;
        const coords = overlapWarning.originalCoords;
        setOverlapWarning(null);
        setShowPreview(false);
        if (overlapWarning.isNewPolygon) {
            setModal({ open: true, coords });
        } else {
            updatePolygon(overlapWarning.polygonId, coords, true);
        }
        // Always clear creating state when dismiss/ignore the overlap
        setIsCreating(false);
        setCreatePointCount(0);
        createHandlerRef.current = null;
    }, [overlapWarning, updatePolygon]);

    const handleOverlapAccept = useCallback(async () => {
        if (!overlapWarning || !overlapWarning.fixedCoords) return;
        const coords = overlapWarning.fixedCoords;
        const id = overlapWarning.polygonId;
        const isNew = overlapWarning.isNewPolygon;

        setOverlapWarning(null);
        setShowPreview(false);
        // Clear creating state in all cases
        setIsCreating(false);
        setCreatePointCount(0);
        createHandlerRef.current = null;

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
                const response = await apiPost(props.parcelsEndpoint, payload);
                if (response.ok) {
                    const created = await response.json();
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

    const handleOverlapManualEdit = useCallback(() => {
        if (!overlapWarning) return;
        const coords = overlapWarning.originalCoords;
        const id = overlapWarning.polygonId;
        const isNew = !!overlapWarning.isNewPolygon;

        setOverlapWarning(null);
        setShowPreview(false);

        if (isNew) {
            const tempId = `temp-${Date.now()}`;
            setPolygons(prev => [...prev, {
                id: tempId,
                name: t('map.unnamedParcel'),
                coords,
                visible: true,
                version: 0,
                color: '#3388ff',
            }]);
            setPendingManualEditId(tempId);
        } else {
            startEdit(id);
        }
    }, [overlapWarning, t, startEdit]);

    const handleOverlapEditOriginal = useCallback(() => {
        if (!overlapWarning || overlapWarning.isNewPolygon || !overlapWarning.overlappingPolygons.length) return;
        const firstId = overlapWarning.overlappingPolygons[0].id;
        setOverlapWarning(null);
        setShowPreview(false);
        startEdit(firstId);
    }, [overlapWarning, startEdit]);

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
        handleOverlapManualEdit,
        handleOverlapEditOriginal,
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
