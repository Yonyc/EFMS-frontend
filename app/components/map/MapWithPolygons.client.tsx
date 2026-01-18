import {
    MapContainer,
    TileLayer,
    Polygon,
    Marker,
    Popup,
    FeatureGroup,
    useMapEvents,
    Tooltip,
} from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import PolygonList from "./PolygonList";
import OverlapModal from "./components/OverlapModal";
import { checkOverlap, fixOverlap } from "./utils/geometry";
import type { EditState, ManualEditContext, OverlapWarning, PolygonData } from "./types";
import { apiDelete, apiGet, apiPost, apiPut, apiRequest } from "~/utils/api";
import { useFarm } from "~/contexts/FarmContext";

type MapContextType = 'farm' | 'import';

interface MapWithPolygonsProps {
    farm_id?: string;
    contextId?: string;
    contextType?: MapContextType;
    allowCreate?: boolean;
    onApproveAll?: () => Promise<void>;
    approveLabel?: string;
    importMode?: boolean; // when true, show statuses and allow single approval
}

export default function MapWithPolygons(props: MapWithPolygonsProps) {
    const { t } = useTranslation();
    const { selectedFarm } = useFarm();
    const center: [number, number] = [50.668333, 4.621278];
    const resolvedContextId = props.contextId ?? props.farm_id;
    if (!resolvedContextId) {
        throw new Error("MapWithPolygons requires either contextId or farm_id");
    }
    const contextType: MapContextType = props.contextType ?? 'farm';
    const allowCreate = props.allowCreate ?? true;
    const isImportMode = props.importMode ?? (contextType === 'import');
    const basePath = isImportMode ? `/imports/${resolvedContextId}` : `/farm/${resolvedContextId}`;
    const parcelsEndpoint = `${basePath}/parcels`;
    
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
    const [isApproving, setIsApproving] = useState(false);
    const [approveFeedback, setApproveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const originalColorRef = useRef<string | null>(null);
    const polygonLayersRef = useRef<Map<string, L.Polygon>>(new Map());
    
    // Refs
    const featureGroupRef = useRef<L.FeatureGroup>(null);
    const editControlRef = useRef<any>(null);
    const createHandlerRef = useRef<any>(null);
    const createdLayerRef = useRef<any>(null);
    const createRafRef = useRef<number | null>(null);
    const editStateRef = useRef<EditState | null>(null);
    const originalCoordsRef = useRef<Record<string, [number, number][]>>({});

    const getMap = () => (featureGroupRef.current as any)?._map || (featureGroupRef.current as any)?.getMap?.();

    const togglePolygonVisibility = useCallback((id: string) => {
        setPolygons(prev => prev.map(p => p.id === id ? { ...p, visible: !p.visible } : p));
    }, []);

    const renamePolygonInline = useCallback((id: string, name: string) => {
        setPolygons(prev => prev.map(p => p.id === id ? { ...p, name } : p));
    }, []);

    const focusPolygon = useCallback((id: string) => {
        const polygon = polygons.find(p => p.id === id);
        const map = getMap();
        if (!polygon || !map || !polygon.coords?.length) return;

        setPolygons(prev => prev.map(p => p.id === id ? { ...p, visible: true } : p));
        setSelectedId(id);

        const bounds = L.latLngBounds(polygon.coords.map(([lat, lng]) => [lat, lng] as [number, number]));
        if (bounds.isValid()) {
            map.flyToBounds(bounds, { maxZoom: 18, padding: [80, 80] });
        } else if (polygon.coords.length) {
            map.flyTo(polygon.coords[0], 17);
        }
    }, [polygons]);

    const filterOptions = useMemo(() => {
        const base = [
            { key: 'all', label: t('map.polygonList.filters.all', { defaultValue: 'All' }) },
            { key: 'visible', label: t('map.polygonList.filters.visible', { defaultValue: 'Visible' }) },
            { key: 'hidden', label: t('map.polygonList.filters.hidden', { defaultValue: 'Hidden' }) },
        ];
        if (isImportMode) {
            base.push({ key: 'approved', label: t('map.polygonList.filters.approved', { defaultValue: 'Approved' }) });
            base.push({ key: 'unapproved', label: t('map.polygonList.filters.unapproved', { defaultValue: 'Unapproved' }) });
        }
        return base;
    }, [isImportMode, t]);

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

    useEffect(() => {
        if (!approveFeedback) return;
        const timer = setTimeout(() => setApproveFeedback(null), 4000);
        return () => clearTimeout(timer);
    }, [approveFeedback]);

    const handleApproveAll = useCallback(async () => {
        if (!props.onApproveAll) return;
        setIsApproving(true);
        setApproveFeedback(null);
        try {
            await props.onApproveAll();
            setApproveFeedback({ type: 'success', message: props.approveLabel || t('imports.map.approveSuccess', { defaultValue: 'Import list approved' }) });
        } catch (err) {
            console.error('Failed to approve import list:', err);
            setApproveFeedback({ type: 'error', message: t('imports.map.approveError', { defaultValue: 'Unable to approve import list' }) });
        } finally {
            setIsApproving(false);
        }
    }, [props.onApproveAll, props.approveLabel, t]);

    const approveSingleParcel = useCallback(async (id: string) => {
        if (!isImportMode) return;
        if (!selectedFarm?.id) {
            setApproveFeedback({ type: 'error', message: t('imports.map.approveFarmRequired', { defaultValue: 'Select a farm before approving.' }) });
            return;
        }
        try {
            const response = await apiRequest(`/imported-parcels/${id}/validate`, {
                method: 'PATCH',
                body: JSON.stringify({ validationStatus: 'APPROVED', farmId: Number(selectedFarm.id) }),
            });
            if (!response.ok) {
                throw new Error(`Approve failed: ${response.status}`);
            }
            const updated = await response.json();
            setPolygons(prev => prev.map(p => p.id === String(id) ? { ...p, validationStatus: updated?.validationStatus || 'APPROVED', convertedParcelId: updated?.convertedParcelId ?? p.convertedParcelId } : p));
            setApproveFeedback({ type: 'success', message: t('imports.map.approveOneSuccess', { defaultValue: 'Parcel approved' }) });
        } catch (err) {
            console.error('Failed to approve parcel', err);
            setApproveFeedback({ type: 'error', message: t('imports.map.approveError', { defaultValue: 'Unable to approve parcel' }) });
        }
    }, [isImportMode, t]);

    const extractCoords = (layer: any): [number, number][] => {
        const raw = layer?.getLatLngs?.();
        if (!raw) return [];
        const ring = Array.isArray(raw) ? (Array.isArray(raw[0]) ? raw[0] : raw) : [raw];
        return ring.map((ll: any) => [ll.lat, ll.lng]);
    };

    const coordsToWKT = (coords: [number, number][]): string => {
        // Convert Leaflet format [lat, lng] to WKT format "POLYGON((lng lat, lng lat, ...))"
        const wktCoords = coords.map(([lat, lng]) => `${lng} ${lat}`).join(', ');
        // Close the polygon by adding the first coordinate at the end if not already closed
        const firstCoord = coords[0];
        const lastCoord = coords[coords.length - 1];
        const needsClosing = firstCoord[0] !== lastCoord[0] || firstCoord[1] !== lastCoord[1];
        const closedWktCoords = needsClosing ? `${wktCoords}, ${firstCoord[1]} ${firstCoord[0]}` : wktCoords;
        return `POLYGON((${closedWktCoords}))`;
    };

    const parseWktCoords = (wktInput?: string | null): [number, number][] => {
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

    const detectOverlaps = (id: string, coords: [number, number][]): { id: string; name: string }[] => {
        const overlapping: { id: string; name: string }[] = [];
        
        for (const poly of polygons) {
            if (poly.id === id) continue;
            if (!poly.visible) continue;
            
            if (checkOverlap(coords, poly.coords)) {
                overlapping.push({ id: poly.id, name: poly.name });
            }
        }
        
        return overlapping;
    };

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

    const setupEditListeners = useCallback((layer: any, id: string) => {
        const handleUpdate = () => updatePolygon(id, extractCoords(layer), false);
        layer.on('edit', handleUpdate);

        const map = getMap();
        let moveListener: any = null;
        if (map) {
            let lastUpdate = 0;
            moveListener = () => {
                const now = Date.now();
                if (now - lastUpdate < 16) return; // ~60fps
                lastUpdate = now;
                handleUpdate();
            };
            map.on('mousemove', moveListener);
        }

        if (editStateRef.current) {
            editStateRef.current.listeners = {
                edit: handleUpdate,
                mousemove: moveListener ? { map, listener: moveListener } : undefined
            };
        }
    }, [updatePolygon]);

    const startEdit = useCallback((id: string) => {
        if (editingId && editingId !== id) return;

        const poly = polygons.find(p => p.id === id);
        const fg = featureGroupRef.current;
        if (!poly || !fg) return;

        let targetLayer: any = null;
        fg.eachLayer((l: any) => { if (l?.options?.customId === id) targetLayer = l; });
        if (!targetLayer) return;

        originalCoordsRef.current[id] = extractCoords(targetLayer);
        getMap()?.closePopup?.();

        const clone = L.polygon(poly.coords as L.LatLngExpression[], { color: 'blue' });
        (clone as any).options = { ...clone.options, customId: id };
        const tmpGroup = new L.FeatureGroup().addLayer(clone);
        getMap()?.addLayer(tmpGroup);

        const EditHandler = (L as any).EditToolbar?.Edit || (L as any).EditToolbarEdit;
        if (!EditHandler) return;

        const handler = new EditHandler(getMap(), { featureGroup: tmpGroup });
        if (handler._selectedLayers) {
            handler._selectedLayers.clearLayers?.();
            handler._selectedLayers.addLayer(clone);
        }

        editStateRef.current = { layer: clone, handler, tempGroup: tmpGroup, listeners: {} };
        setupEditListeners(clone, id);
        handler.enable();
        setEditingId(id);
    }, [polygons, editingId, setupEditListeners]);

    const finishEdit = useCallback(async () => {
        const state = editStateRef.current;
        if (!state || !editingId) return;

        const newCoords = extractCoords(state.layer);
        const overlapping = detectOverlaps(editingId, newCoords);
        const manualContextActive = manualEditContext?.warning.polygonId === editingId;
        
        if (overlapping.length > 0) {
            const otherPolygons = polygons.filter(p => overlapping.some(o => o.id === p.id));
            const fixedCoords = fixOverlap(newCoords, otherPolygons);
            cleanupEdit();
            setEditingId(null);
            delete originalCoordsRef.current[editingId];
            if (manualContextActive) {
                setManualEditContext(null);
            }
            getMap()?.closePopup?.();

            setOverlapWarning({
                polygonId: editingId,
                overlappingPolygons: overlapping,
                originalCoords: newCoords,
                fixedCoords
            });
            setShowPreview(false);
            return;
        }

        // Send PUT request to backend to update the polygon
        try {
            const payload = {
                geodata: coordsToWKT(newCoords),
            };

            const response = await apiPut(`${parcelsEndpoint}/${editingId}`, payload);
            if (response.ok) {
                console.log("Polygon updated successfully on backend");
            } else {
                console.error("Failed to update parcel:", response.statusText);
            }
        } catch (err) {
            console.error("Failed to update parcel:", err);
        }

        updatePolygon(editingId, newCoords, true);
        delete originalCoordsRef.current[editingId];
        cleanupEdit();
        setEditingId(null);
        getMap()?.closePopup?.();

        if (manualContextActive) {
            setManualEditContext(null);
        }
    }, [editingId, polygons, updatePolygon, cleanupEdit, manualEditContext, parcelsEndpoint]);

    const cancelEdit = useCallback(() => {
        const state = editStateRef.current;
        if (!state || !editingId) return;

        if (manualEditContext && manualEditContext.warning.polygonId === editingId) {
            cleanupEdit();
            setEditingId(null);
            delete originalCoordsRef.current[editingId];
            setPolygons(prev => prev.filter(p => p.id !== editingId));
            setOverlapWarning(manualEditContext.warning);
            setAreaName(manualEditContext.areaNameSnapshot);
            setShowPreview(false);
            setManualEditContext(null);
            setPendingManualEditId(null);
            getMap()?.closePopup?.();
            return;
        }

        const original = originalCoordsRef.current[editingId];
        if (original) {
            state.layer.setLatLngs?.(original);
            updatePolygon(editingId, original, true);
            delete originalCoordsRef.current[editingId];
        }

        cleanupEdit();
        setEditingId(null);
        getMap()?.closePopup?.();
    }, [editingId, manualEditContext, updatePolygon, cleanupEdit]);

    const deletePolygon = useCallback(async (id: string) => {
        if (contextType === 'farm') {
            try {
                const response = await apiDelete(`/parcels/${id}`);
                if (!response.ok) {
                    console.error("Failed to delete parcel:", response.statusText);
                    return;
                }
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
    }, [contextType, editingId, cleanupEdit]);

    const closePolygonContextMenu = useCallback(() => {
        setPolygonContextMenu(null);
        setPendingDeleteId(null);
        setShowColorPicker(false);
        originalColorRef.current = null;
    }, []);

    const handleOverlapIgnore = useCallback(async () => {
        if (!overlapWarning) return;
        
        if (overlapWarning.isNewPolygon) {
            // For new polygons, create with the original coords
            createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
            createdLayerRef.current = null;
            
            const newPoly: PolygonData = {
                id: overlapWarning.polygonId,
                name: areaName || t('map.defaultPolygonName'),
                coords: overlapWarning.originalCoords,
                version: 0,
                visible: true,
                color: '#3388ff',
            };

            // Send POST request to backend
            try {
                const payload = {
                    name: newPoly.name,
                    active: true,
                    startValidity: new Date().toISOString(),
                    endValidity: null,
                    geodata: coordsToWKT(newPoly.coords),
                    color: newPoly.color,
                };

                const response = await apiPost(parcelsEndpoint, payload);
                if (response.ok) {
                    const createdParcel = await response.json();
                    // Update the polygon with the backend-generated ID
                    newPoly.id = String(createdParcel.id);
                    setPolygons(prev => [...prev, newPoly]);
                } else {
                    console.error("Failed to create parcel:", response.statusText);
                    // Still add locally with temp ID for now
                    // TODO: Consider removing if backend creation fails
                    setPolygons(prev => [...prev, newPoly]);
                }
            } catch (err) {
                console.error("Failed to create parcel:", err);
                // Still add locally with temp ID for now
                // TODO: Consider removing if backend creation fails
                setPolygons(prev => [...prev, newPoly]);
            }

            setModal({ open: false, coords: null });
            setAreaName("");
        } else {
            // For edited polygons
            
            // Send PUT request to backend to update the polygon
            try {
                const payload = {
                    geodata: coordsToWKT(overlapWarning.originalCoords),
                };

                const response = await apiPut(`${parcelsEndpoint}/${overlapWarning.polygonId}`, payload);
                if (response.ok) {
                    console.log("Polygon updated successfully on backend");
                } else {
                    console.error("Failed to update parcel:", response.statusText);
                }
            } catch (err) {
                console.error("Failed to update parcel:", err);
            }

            updatePolygon(overlapWarning.polygonId, overlapWarning.originalCoords, true);
            delete originalCoordsRef.current[overlapWarning.polygonId];
            cleanupEdit();
            setEditingId(null);
            getMap()?.closePopup?.();
        }
        
        setOverlapWarning(null);
        setShowPreview(false);
    }, [overlapWarning, areaName, updatePolygon, cleanupEdit, parcelsEndpoint, t]);

    const handleOverlapAccept = useCallback(async () => {
        if (!overlapWarning || !overlapWarning.fixedCoords) {
            console.error("No overlap warning or fixed coords!");
            return;
        }
        
        console.log("Accepting fixed coords:", overlapWarning.fixedCoords);
        console.log("For polygon:", overlapWarning.polygonId);
        
        if (overlapWarning.isNewPolygon) {
            // For new polygons, create with the fixed coords
            createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
            createdLayerRef.current = null;
            
            const newPoly: PolygonData = {
                id: overlapWarning.polygonId,
                name: areaName || t('map.defaultPolygonName'),
                coords: overlapWarning.fixedCoords,
                version: 0,
                visible: true,
                color: '#3388ff',
            };
            
            console.log("Creating new polygon:", newPoly);

            // Send POST request to backend
            try {
                const payload = {
                    name: newPoly.name,
                    active: true,
                    startValidity: new Date().toISOString(),
                    endValidity: null,
                    geodata: coordsToWKT(newPoly.coords),
                    color: newPoly.color,
                };

                const response = await apiPost(parcelsEndpoint, payload);
                if (response.ok) {
                    const createdParcel = await response.json();
                    // Update the polygon with the backend-generated ID
                    newPoly.id = String(createdParcel.id);
                    setPolygons(prev => {
                        const updated = [...prev, newPoly];
                        console.log("Updated polygons:", updated);
                        return updated;
                    });
                } else {
                    console.error("Failed to create parcel:", response.statusText);
                    // Still add locally with temp ID for now
                    setPolygons(prev => {
                        const updated = [...prev, newPoly];
                        console.log("Updated polygons:", updated);
                        return updated;
                    });
                }
            } catch (err) {
                console.error("Failed to create parcel:", err);
                // Still add locally with temp ID for now
                setPolygons(prev => {
                    const updated = [...prev, newPoly];
                    console.log("Updated polygons:", updated);
                    return updated;
                });
            }
        } else {
            // For edited polygons
            console.log("Updating existing polygon");

            // Send PUT request to backend to update the polygon
            try {
                const payload = {
                    geodata: coordsToWKT(overlapWarning.fixedCoords),
                };

                const response = await apiPut(`${parcelsEndpoint}/${overlapWarning.polygonId}`, payload);
                if (response.ok) {
                    console.log("Polygon updated successfully on backend");
                } else {
                    console.error("Failed to update parcel:", response.statusText);
                }
            } catch (err) {
                console.error("Failed to update parcel:", err);
            }

            updatePolygon(overlapWarning.polygonId, overlapWarning.fixedCoords, true);
            delete originalCoordsRef.current[overlapWarning.polygonId];
            cleanupEdit();
            setEditingId(null);
            getMap()?.closePopup?.();
        }
        
        setModal({ open: false, coords: null });
        setAreaName("");
        setOverlapWarning(null);
        setShowPreview(false);
    }, [overlapWarning, areaName, updatePolygon, cleanupEdit, parcelsEndpoint, t]);

    const handleOverlapCancel = useCallback(() => {
        if (overlapWarning?.isNewPolygon) {
            createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
            createdLayerRef.current = null;
            setModal({ open: false, coords: null });
            setAreaName("");
            setPendingManualEditId(null);
        }

        setOverlapWarning(null);
        setShowPreview(false);
    }, [overlapWarning]);

    const handleOverlapEditOriginal = useCallback(() => {
        if (!overlapWarning) return;
        
        const polygonId = overlapWarning.polygonId;
        setOverlapWarning(null);
        setShowPreview(false);
        
        // For new polygons, this doesn't make sense, so just cancel
        if (overlapWarning.isNewPolygon) {
            setModal({ open: true, coords: overlapWarning.originalCoords });
        } else {
            startEdit(polygonId);
        }
    }, [overlapWarning, startEdit]);

    const handleOverlapManualEdit = useCallback(() => {
        if (!overlapWarning?.isNewPolygon) return;

        setManualEditContext({
            warning: overlapWarning,
            areaNameSnapshot: areaName,
        });

        const newPoly: PolygonData = {
            id: overlapWarning.polygonId,
            name: areaName || t('map.defaultPolygonName'),
            coords: overlapWarning.originalCoords,
            version: 0,
            visible: true,
            color: '#3388ff',
        };

        createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
        createdLayerRef.current = null;

        setPolygons(prev => [...prev, newPoly]);
        setPendingManualEditId(newPoly.id);
        setModal({ open: false, coords: null });
        setOverlapWarning(null);
        setShowPreview(false);
    }, [overlapWarning, areaName, t]);

    // Creation
    const getPointCount = (handler: any) => {
        if (!handler) return 0;
        return handler._markers?.length || handler._poly?.getLatLngs()[0]?.length || 
               handler._shape?.getLatLngs()[0]?.length || handler._polyline?.getLatLngs()[0]?.length || 0;
    };

    const startCreate = useCallback(() => {
        if (!allowCreate) return;
        const drawMode = editControlRef.current?._toolbars?.draw?._modes?.polygon?.handler;
        const handler = drawMode || (getMap() && (L as any).Draw?.Polygon ? new (L as any).Draw.Polygon(getMap(), {}) : null);
        if (!handler) return;

        handler.enable();
        createHandlerRef.current = handler;
        setIsCreating(true);
        setCreatePointCount(0);
    }, [allowCreate]);

    const finishCreate = useCallback(() => {
        if (getPointCount(createHandlerRef.current) < 3) return;
        createHandlerRef.current?.completeShape?.() || createHandlerRef.current?._finishShape?.() || createHandlerRef.current?.finishDrawing?.();
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
        const coords = e.layer.getLatLngs()[0].map((ll: L.LatLng) => [ll.lat, ll.lng]) as [number, number][];
        createdLayerRef.current = e.layer;
        setModal({ open: true, coords });
        createHandlerRef.current = null;
        setIsCreating(false);
    }, []);

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

        const newPoly: PolygonData = {
            id: tempId,
            name: areaName || t('map.defaultPolygonName'),
            coords,
            version: 0,
            visible: true,
            color: '#3388ff',
        };

        // Send POST request to backend
        try {
            const payload = {
                name: newPoly.name,
                active: true,
                startValidity: new Date().toISOString(),
                endValidity: null,
                geodata: coordsToWKT(newPoly.coords),
                color: newPoly.color,
            };

            const response = await apiPost(parcelsEndpoint, payload);
            if (response.ok) {
                const createdParcel = await response.json();
                // Update the polygon with the backend-generated ID
                newPoly.id = String(createdParcel.id);
                setPolygons(prev => [...prev, newPoly]);
            } else {
                console.error("Failed to create parcel:", response.statusText);
                // Still add locally with temp ID for now
                setPolygons(prev => [...prev, newPoly]);
            }
        } catch (err) {
            console.error("Failed to create parcel:", err);
            // Still add locally with temp ID for now
            setPolygons(prev => [...prev, newPoly]);
        }

        setModal({ open: false, coords: null });
        setAreaName("");
    }, [modal.coords, areaName, polygons, parcelsEndpoint, t]);

    const cancelModal = useCallback(() => {
        createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
        createdLayerRef.current = null;
        setModal({ open: false, coords: null });
        setAreaName("");
    }, []);

    const detachCreatedLayer = useCallback(() => {
        const layer = createdLayerRef.current;
        const map = getMap();
        if (layer && map?.hasLayer?.(layer)) {
            map.removeLayer(layer);
        }
    }, []);

    const reattachCreatedLayer = useCallback(() => {
        const layer = createdLayerRef.current;
        const map = getMap();
        if (layer && map && !map.hasLayer?.(layer)) {
            map.addLayer(layer);
        }
    }, []);

    const handleShowPreview = useCallback(() => {
        if (!overlapWarning) return;
        if (overlapWarning.isNewPolygon) {
            detachCreatedLayer();
        }
        setPreviewVisibility({ original: false, fixed: true });
        setShowPreview(true);
    }, [overlapWarning, detachCreatedLayer]);

    // Effects
    useEffect(() => {
        const fetchPolygons = async () => {
            try {
                const response = await apiGet(parcelsEndpoint);
                if (response.ok) {
                    const data = await response.json();
                    setPolygons(data.map((p: any) => {
                        // Parse geodata WKT string to coordinates
                        let coords: [number, number][] = [];
                        try {
                            if (p.geodata) {
                                coords = parseWktCoords(typeof p.geodata === 'string' ? p.geodata : String(p.geodata));
                                if (!coords.length) {
                                    console.warn('Invalid WKT format for parcel:', p.id, p.geodata);
                                }
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
                            // Store additional API fields for reference
                            active: p.active,
                            startValidity: p.startValidity,
                            endValidity: p.endValidity,
                            farmId: p.farmId,
                            validationStatus: p.validationStatus,
                            convertedParcelId: p.convertedParcelId ?? null,
                        };
                    }));
                } else {
                    console.error("Failed to fetch polygons:", response.statusText);
                    setPolygons([]);
                }
            } catch (err) {
                console.error("Failed to fetch polygons:", err);
                setPolygons([]);
            }
        };

        fetchPolygons();
    }, [parcelsEndpoint, t]);

    useEffect(() => {
        if (!isCreating) return;
        const tick = () => {
            setCreatePointCount(getPointCount(createHandlerRef.current));
            createRafRef.current = requestAnimationFrame(tick);
        };
        createRafRef.current = requestAnimationFrame(tick);
        return () => {
            createRafRef.current && cancelAnimationFrame(createRafRef.current);
            createRafRef.current = null;
        };
    }, [isCreating]);

    useEffect(() => {
        if (!showPreview && overlapWarning?.isNewPolygon) {
            reattachCreatedLayer();
        }
    }, [showPreview, overlapWarning, reattachCreatedLayer]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (overlapWarning) { setOverlapWarning(null); setShowPreview(false); }
                else if (isCreating) cancelCreate();
                else if (editingId) cancelEdit();
                else if (renamingId) { setRenamingId(null); setRenameValue(''); }
                else if (pendingDeleteId) setPendingDeleteId(null);
                else if (contextMenu) setContextMenu(null);
                else if (polygonContextMenu) closePolygonContextMenu();
            } else if (e.key === 'Enter') {
                if (isCreating && createPointCount >= 3) {
                    e.preventDefault();
                    finishCreate();
                } else if (editingId) {
                    e.preventDefault();
                    finishEdit();
                }
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (editingId) {
                    e.preventDefault();
                    deletePolygon(editingId);
                } else if (selectedId && !renamingId && !pendingDeleteId) {
                    e.preventDefault();
                    setPendingDeleteId(selectedId);
                }
            }
        };
        window.addEventListener('keydown', handleKey, { capture: true });
        return () => window.removeEventListener('keydown', handleKey, { capture: true });
    }, [isCreating, editingId, selectedId, renamingId, pendingDeleteId, contextMenu, polygonContextMenu, createPointCount, overlapWarning, cancelCreate, cancelEdit, finishCreate, finishEdit, deletePolygon, closePolygonContextMenu]);

    useEffect(() => {
        if (!pendingManualEditId) return;
        const exists = polygons.some(p => p.id === pendingManualEditId);
        if (!exists) return;
        startEdit(pendingManualEditId);
        setPendingManualEditId(null);
    }, [pendingManualEditId, polygons, startEdit]);

    // Components
    function MapEvents() {
        useMapEvents({
            contextmenu: e => {
                if (!editingId && !isCreating) {
                    e.originalEvent.preventDefault();
                    setContextMenu({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
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

    // Highlight selected polygon without scanning all layers each frame
    useEffect(() => {
        if (!selectedId) return;

        const layer = polygonLayersRef.current.get(selectedId);
        if (!layer) return;

        layer.setStyle({ dashArray: '10 5' });
        const element = layer.getElement();
        if (element) {
            element.classList.add('polygon-glow');
        }

        return () => {
            const target = polygonLayersRef.current.get(selectedId);
            if (!target) return;
            target.setStyle({ dashArray: undefined, dashOffset: '0' });
            const el = target.getElement();
            if (el) {
                el.classList.remove('polygon-glow');
            }
        };
    }, [selectedId]);

    return (
        <>
            {overlapWarning && !showPreview && (
                <OverlapModal
                    warning={overlapWarning}
                    areaName={areaName}
                    onAreaNameChange={setAreaName}
                    onCancel={handleOverlapCancel}
                    onManualEdit={handleOverlapManualEdit}
                    onEditOriginal={handleOverlapEditOriginal}
                    onIgnore={handleOverlapIgnore}
                    onAccept={handleOverlapAccept}
                    onShowPreview={handleShowPreview}
                />
            )}

            {allowCreate && contextMenu && (
                <div style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, background: 'white', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 10000, minWidth: 150 }}>
                    <button onClick={() => { setContextMenu(null); startCreate(); }} style={{ width: '100%', padding: '0.5rem 1rem', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: '#333' }} onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        ➕ {t('map.contextMenu.addPolygon')}
                    </button>
                </div>
            )}

            {polygonContextMenu && (
                <div style={{ position: 'fixed', left: polygonContextMenu.x, top: polygonContextMenu.y, background: 'white', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 10000, minWidth: 150, overflow: 'hidden' }}>
                    <style>{`
                        @keyframes slideIn {
                            from { transform: translateX(100%); opacity: 0; }
                            to { transform: translateX(0); opacity: 1; }
                        }
                    `}</style>
                    <button onClick={() => { 
                        const poly = polygons.find(p => p.id === polygonContextMenu.polygonId);
                        closePolygonContextMenu(); 
                        setRenamingId(polygonContextMenu.polygonId); 
                        setRenameValue(poly?.name || ''); 
                    }} style={{ width: '100%', padding: '0.5rem 1rem', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: '#333', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span>✏️</span> {t('map.polygonMenu.rename')}
                    </button>
                    <button onClick={() => { closePolygonContextMenu(); startEdit(polygonContextMenu.polygonId); }} style={{ width: '100%', padding: '0.5rem 1rem', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: '#333', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span>🔧</span> {t('map.polygonMenu.edit')}
                    </button>
                    {isImportMode && (
                        <button onClick={() => { closePolygonContextMenu(); approveSingleParcel(polygonContextMenu.polygonId); }} style={{ width: '100%', padding: '0.5rem 1rem', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: '#333', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <span>✅</span> {t('imports.map.approveOne', { defaultValue: 'Approve parcel' })}
                        </button>
                    )}
                    {!showColorPicker ? (
                        <button onClick={() => setShowColorPicker(true)} style={{ width: '100%', padding: '0.5rem 1rem', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: '#333', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <span>🎨</span> {t('map.polygonMenu.color')}
                        </button>
                    ) : (
                        <div style={{ padding: '0.5rem 1rem', animation: 'slideIn 0.3s ease-out' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {['#3388ff', '#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf', '#ff8b94', '#b4a7d6', '#ffa07a'].map(color => {
                                    return (
                                        <button
                                            key={color}
                                            onClick={async () => {
                                                setPolygons(prev => prev.map(p => p.id === polygonContextMenu.polygonId ? { ...p, color } : p));
                                                originalColorRef.current = null;
                                                closePolygonContextMenu();

                                                // Send PUT request to backend to update the color
                                                try {
                                                    const payload = {
                                                        color: color,
                                                    };

                                                    const response = await apiPut(`${parcelsEndpoint}/${polygonContextMenu.polygonId}`, payload);
                                                    if (response.ok) {
                                                        console.log("Polygon color updated successfully on backend");
                                                    } else {
                                                        console.error("Failed to update parcel color:", response.statusText);
                                                    }
                                                } catch (err) {
                                                    console.error("Failed to update parcel color:", err);
                                                }
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'scale(1.2)';
                                                if (!originalColorRef.current) {
                                                    const currentPoly = polygons.find(p => p.id === polygonContextMenu.polygonId);
                                                    originalColorRef.current = currentPoly?.color || '#3388ff';
                                                }
                                                setPolygons(prev => prev.map(p => p.id === polygonContextMenu.polygonId ? { ...p, color } : p));
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'scale(1)';
                                                if (originalColorRef.current) {
                                                    setPolygons(prev => prev.map(p => p.id === polygonContextMenu.polygonId ? { ...p, color: originalColorRef.current! } : p));
                                                }
                                            }}
                                            style={{
                                                width: '24px',
                                                height: '24px',
                                                border: '2px solid #fff',
                                                borderRadius: '50%',
                                                background: color,
                                                cursor: 'pointer',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                                transition: 'transform 0.2s'
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <button 
                        onClick={() => { 
                            if (pendingDeleteId) {
                                deletePolygon(pendingDeleteId);
                                closePolygonContextMenu();
                            } else {
                                setPendingDeleteId(polygonContextMenu.polygonId);
                            }
                        }} 
                        style={{ 
                            width: '100%', 
                            padding: '0.5rem 1rem', 
                            border: 'none', 
                            background: pendingDeleteId ? '#ef5350' : 'transparent', 
                            textAlign: 'left', 
                            cursor: 'pointer', 
                            fontSize: '0.9rem', 
                            color: pendingDeleteId ? 'white' : '#d32f2f', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem', 
                            transition: 'all 0.3s ease-out',
                            fontWeight: pendingDeleteId ? 500 : 'normal',
                            animation: pendingDeleteId ? 'slideIn 0.3s ease-out' : 'none'
                        }} 
                        onMouseEnter={e => e.currentTarget.style.background = pendingDeleteId ? '#e53935' : '#ffebee'} 
                        onMouseLeave={e => e.currentTarget.style.background = pendingDeleteId ? '#ef5350' : 'transparent'}
                    >
                        <span>🗑️</span> {pendingDeleteId ? t('common.confirm') : t('common.delete')}
                    </button>
                </div>
            )}

            {pendingDeleteId && !polygonContextMenu && (
                <div style={{ position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", background: "#ef5350", color: "white", padding: "1rem 2rem", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.3)", zIndex: 10000, display: "flex", alignItems: "center", gap: "1rem", animation: "slideIn 0.3s ease-out" }}>
                    <span style={{ fontSize: "1.1rem", fontWeight: 500 }}>{t('map.deletePrompt', { name: polygons.find(p => p.id === pendingDeleteId)?.name ?? '' })}</span>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button onClick={() => { deletePolygon(pendingDeleteId); setPendingDeleteId(null); }} style={{ padding: "0.5rem 1rem", borderRadius: 4, border: "none", background: "white", color: "#ef5350", cursor: "pointer", fontWeight: 600 }}>{t('common.confirm')}</button>
                        <button onClick={() => setPendingDeleteId(null)} style={{ padding: "0.5rem 1rem", borderRadius: 4, border: "1px solid white", background: "transparent", color: "white", cursor: "pointer" }}>{t('common.cancel')}</button>
                    </div>
                </div>
            )}

            {renamingId && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10001 }}>
                    <div style={{ background: "#fff", padding: "2rem", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.3)", minWidth: 400, display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                        <h2 style={{ margin: 0, color: '#222', fontSize: "1.5rem" }}>{t('map.renameModal.title')}</h2>
                        <input type="text" value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={async e => { 
                            if (e.key === "Enter") {
                                setPolygons(prev => prev.map(p => p.id === renamingId ? { ...p, name: renameValue } : p));
                                
                                // Send PUT request to backend to update the name
                                try {
                                    const payload = {
                                        name: renameValue,
                                    };

                                    const response = await apiPut(`${parcelsEndpoint}/${renamingId}`, payload);
                                    if (response.ok) {
                                        console.log("Polygon name updated successfully on backend");
                                    } else {
                                        console.error("Failed to update parcel name:", response.statusText);
                                    }
                                } catch (err) {
                                    console.error("Failed to update parcel name:", err);
                                }
                                
                                setRenamingId(null); 
                            } else if (e.key === "Escape") {
                                setRenamingId(null);
                            }
                        }} placeholder={t('map.renameModal.placeholder')} style={{ padding: "0.75rem", fontSize: "1rem", borderRadius: 4, border: "1px solid #ccc", color: "#222" }} autoFocus />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
                            <button onClick={() => setRenamingId(null)} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: 500, color: "#333" }}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                            <button onClick={async () => {
                                setPolygons(prev => prev.map(p => p.id === renamingId ? { ...p, name: renameValue } : p));
                                
                                // Send PUT request to backend to update the name
                                try {
                                    const payload = {
                                        name: renameValue,
                                    };

                                    const response = await apiPut(`${parcelsEndpoint}/${renamingId}`, payload);
                                    if (response.ok) {
                                        console.log("Polygon name updated successfully on backend");
                                    } else {
                                        console.error("Failed to update parcel name:", response.statusText);
                                    }
                                } catch (err) {
                                    console.error("Failed to update parcel name:", err);
                                }
                                
                                setRenamingId(null);
                            }} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "none", background: "#007bff", color: "#fff", cursor: "pointer", fontWeight: 500 }}>{t('common.confirm', { defaultValue: 'Confirm' })}</button>
                        </div>
                    </div>
                </div>
            )}
            
            {modal.open && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10001 }}>
                    <div style={{ background: "#fff", padding: "2rem", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.3)", minWidth: 400, display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                        <h2 style={{ margin: 0, color: '#222', fontSize: "1.5rem" }}>{t('map.areaModal.title')}</h2>
                        <input type="text" value={areaName} onChange={e => setAreaName(e.target.value)} onKeyDown={e => e.key === "Enter" && confirmCreate()} placeholder={t('map.areaModal.placeholder')} style={{ padding: "0.75rem", fontSize: "1rem", borderRadius: 4, border: "1px solid #ccc", color: "#222" }} autoFocus />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
                            <button onClick={cancelModal} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: 500, color: "#333" }}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                            <button onClick={confirmCreate} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "none", background: "#007bff", color: "#fff", cursor: "pointer", fontWeight: 500 }}>{t('common.confirm', { defaultValue: 'Confirm' })}</button>
                        </div>
                    </div>
                </div>
            )}
            <div style={{ flex: 1, position: 'relative', height: '100%' }}>
                <div
                    style={{
                        position: 'absolute',
                        top: '1.5rem',
                        left: '1.5rem',
                        zIndex: 1000,
                        pointerEvents: 'none',
                        display: 'flex',
                        justifyContent: 'flex-start',
                        width: '100%',
                        gap: '1rem',
                    }}
                >
                    <div
                        style={{
                            width: isListCollapsed ? 'auto' : '320px',
                            pointerEvents: 'auto',
                            transition: 'width 0.25s ease',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.75rem',
                                background: 'rgba(15, 23, 42, 0.9)',
                                color: '#fff',
                                borderRadius: isListCollapsed ? '999px' : '1.25rem',
                                padding: isListCollapsed ? '0.45rem' : '0.6rem 0.6rem 0.6rem 1.1rem',
                                boxShadow: '0 18px 35px rgba(15,23,42,0.35)',
                                backdropFilter: 'blur(6px)',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    overflow: 'hidden',
                                    opacity: isListCollapsed ? 0 : 1,
                                    maxWidth: isListCollapsed ? 0 : '100%',
                                    transition: 'opacity 0.2s ease, max-width 0.2s ease',
                                }}
                            >
                                <span style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                                    {t('map.polygonList.title', { defaultValue: 'Polygons' })}
                                </span>
                                <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.15)', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                                    {filteredPolygons.length}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsListCollapsed(!isListCollapsed)}
                                aria-label={t('map.polygonList.toggle', { defaultValue: 'Toggle polygon list' })}
                                style={{
                                    border: 'none',
                                    borderRadius: '999px',
                                    background: '#fff',
                                    color: '#0f172a',
                                    width: '2.5rem',
                                    height: '2.5rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    boxShadow: '0 10px 30px rgba(15,23,42,0.25)',
                                    transition: 'transform 0.2s ease',
                                }}
                                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                {isListCollapsed ? (
                                    <ChevronRightIcon width={20} height={20} />
                                ) : (
                                    <ChevronLeftIcon width={20} height={20} />
                                )}
                            </button>
                        </div>
                        {!isListCollapsed && (
                            <div
                                style={{
                                    marginTop: '0.75rem',
                                    background: 'rgba(255,255,255,0.95)',
                                    borderRadius: '1.5rem',
                                    padding: '1.25rem',
                                    boxShadow: '0 30px 60px rgba(15,23,42,0.25)',
                                    maxHeight: '65vh',
                                    overflowY: 'auto',
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="search"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder={t('map.polygonList.searchPlaceholder', { defaultValue: 'Search polygons' })}
                                            style={{
                                                width: '100%',
                                                borderRadius: '999px',
                                                border: '1px solid rgba(15,23,42,0.15)',
                                                padding: '0.65rem 3rem 0.65rem 1rem',
                                                fontSize: '0.9rem',
                                                outline: 'none',
                                                boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.08)',
                                                color: '#0f172a',
                                            }}
                                        />
                                        {searchQuery && (
                                            <button
                                                type="button"
                                                onClick={() => setSearchQuery('')}
                                                aria-label={t('map.polygonList.clearSearch', { defaultValue: 'Clear search' })}
                                                style={{
                                                    position: 'absolute',
                                                    right: '0.6rem',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    border: 'none',
                                                    background: 'transparent',
                                                    color: '#94a3b8',
                                                    cursor: 'pointer',
                                                    fontSize: '1.1rem',
                                                    lineHeight: 1,
                                                }}
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowFilterMenu(prev => !prev)}
                                            aria-expanded={showFilterMenu}
                                            style={{
                                                border: 'none',
                                                borderRadius: '999px',
                                                padding: '0.35rem 0.85rem',
                                                fontSize: '0.85rem',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                background: 'rgba(15,23,42,0.08)',
                                                color: '#0f172a',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            {t('map.polygonList.filters.label', { defaultValue: 'Filters' })}:
                                            <span style={{ fontWeight: 600 }}>{activeFilterLabel}</span>
                                            <span aria-hidden>▾</span>
                                        </button>
                                        {showFilterMenu && (
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    top: '120%',
                                                    left: 0,
                                                    zIndex: 20,
                                                    minWidth: '180px',
                                                    borderRadius: '0.75rem',
                                                    border: '1px solid rgba(15,23,42,0.12)',
                                                    background: '#fff',
                                                    boxShadow: '0 12px 30px rgba(15,23,42,0.15)',
                                                    padding: '0.35rem',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '0.15rem',
                                                }}
                                            >
                                                {filterOptions.map(option => (
                                                    <button
                                                        key={option.key}
                                                        type="button"
                                                        onClick={() => {
                                                            if (option.key === 'all') {
                                                                setListFilter([]);
                                                                setShowFilterMenu(false);
                                                                return;
                                                            }
                                                            setListFilter(prev => {
                                                                const exists = prev.includes(option.key as 'visible' | 'hidden' | 'approved' | 'unapproved');
                                                                if (exists) {
                                                                    return prev.filter(item => item !== option.key);
                                                                }
                                                                return [...prev, option.key as 'visible' | 'hidden' | 'approved' | 'unapproved'];
                                                            });
                                                        }}
                                                        style={{
                                                            border: 'none',
                                                            borderRadius: '0.6rem',
                                                            padding: '0.45rem 0.6rem',
                                                            fontSize: '0.85rem',
                                                            fontWeight: 500,
                                                            cursor: 'pointer',
                                                            textAlign: 'left',
                                                            background: listFilter === option.key ? 'rgba(15,23,42,0.08)' : 'transparent',
                                                            color: '#0f172a',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                        }}
                                                    >
                                                        <span>{option.label}</span>
                                                        {(option.key === 'all' && listFilter.length === 0) && <span aria-hidden>✓</span>}
                                                        {option.key !== 'all' && listFilter.includes(option.key as 'visible' | 'hidden' | 'approved' | 'unapproved') && <span aria-hidden>✓</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {props.onApproveAll && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                                        <button
                                            type="button"
                                            onClick={handleApproveAll}
                                            disabled={isApproving}
                                            style={{
                                                border: 'none',
                                                borderRadius: '1rem',
                                                padding: '0.75rem 1rem',
                                                fontWeight: 600,
                                                fontSize: '0.95rem',
                                                cursor: isApproving ? 'not-allowed' : 'pointer',
                                                background: isApproving ? 'rgba(15,23,42,0.2)' : '#0f172a',
                                                color: '#fff',
                                                boxShadow: '0 20px 40px rgba(15,23,42,0.25)',
                                                transition: 'background 0.2s ease, transform 0.2s ease',
                                            }}
                                        >
                                            {props.approveLabel || t('imports.map.approveButton', { defaultValue: 'Approve import list' })}
                                        </button>
                                        {approveFeedback && (
                                            <span style={{ fontSize: '0.85rem', color: approveFeedback.type === 'success' ? '#15803d' : '#dc2626' }}>
                                                {approveFeedback.message}
                                            </span>
                                        )}
                                    </div>
                                )}
                                <PolygonList
                                    polygons={filteredPolygons}
                                    onToggle={togglePolygonVisibility}
                                    onRename={renamePolygonInline}
                                    onFocus={focusPolygon}
                                    onApproveSingle={isImportMode ? approveSingleParcel : undefined}
                                    showStatus={isImportMode}
                                    emptyLabel={polygons.length ? t('map.polygonList.emptyFiltered', { defaultValue: 'No polygons match this filter' }) : undefined}
                                />
                            </div>
                        )}
                    </div>
                </div>
                <MapContainer style={{ height: "100%", width: "100%" }} center={center} zoom={15} maxZoom={19}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxNativeZoom={20} attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>' />
                    <MapEvents />
                    <style>{`
                        .leaflet-control-container .leaflet-draw, .leaflet-draw-toolbar { display: none !important; }
                        
                        /* Smooth transitions for polygon animations */
                        .leaflet-interactive {
                            transition: filter 0.5s ease-out !important;
                        }
                        
                        .polygon-tooltip {
                            background: transparent !important;
                            border: none !important;
                            box-shadow: none !important;
                            padding: 0 !important;
                        }
                        .polygon-tooltip::before {
                            display: none !important;
                        }
                        .leaflet-tooltip-pane .leaflet-tooltip {
                            background: transparent !important;
                            border: none !important;
                            box-shadow: none !important;
                        }

                        @keyframes polygonDash {
                            to { stroke-dashoffset: -60; }
                        }

                        @keyframes polygonGlow {
                            0% { filter: drop-shadow(0 0 2px currentColor); }
                            50% { filter: drop-shadow(0 0 8px currentColor); }
                            100% { filter: drop-shadow(0 0 2px currentColor); }
                        }

                        .leaflet-overlay-pane .polygon-glow {
                            stroke-dasharray: 10 5;
                            animation: polygonDash 1.2s linear infinite, polygonGlow 2.4s ease-in-out infinite;
                        }
                    `}</style>
                    
                    <FeatureGroup ref={featureGroupRef}>
                        <EditControl ref={editControlRef} position="topright" draw={{ rectangle: false, polyline: false, circle: false, marker: false, circlemarker: false, polygon: true }} onCreated={handleCreated} />
                        
                        {polygons
                            .filter(p => p.visible)
                            .filter(poly => !(showPreview && overlapWarning?.polygonId === poly.id))
                            .map(poly => {
                            const isThisEditing = editingId === poly.id;
                            const isSelected = selectedId === poly.id;
                            const polyColor = poly.color || '#3388ff';
                            const showPermanentTooltip = isSelected;
                            const polygonKey = isThisEditing 
                                ? `${poly.id}-editing-${poly.version}` 
                                : `${poly.id}-${isSelected ? 'selected' : 'normal'}`;
                            
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
                                            if (!editingId && !isCreating && selectedId !== poly.id) {
                                                setSelectedId(poly.id);
                                            }
                                        },
                                        contextmenu: e => { 
                                            L.DomEvent.stopPropagation(e as any); 
                                            if (!editingId) {
                                                e.originalEvent.preventDefault();
                                                setPolygonContextMenu({ 
                                                    x: e.originalEvent.clientX, 
                                                    y: e.originalEvent.clientY, 
                                                    polygonId: poly.id 
                                                });
                                                setSelectedId(poly.id);
                                            }
                                        }
                                    }}
                                >
                                    <Tooltip 
                                        direction="center" 
                                        offset={[0, 0]} 
                                        opacity={1}
                                        permanent={showPermanentTooltip}
                                        className="polygon-tooltip"
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                                            <span style={{ 
                                                display: 'inline-block',
                                                padding: '3px 8px',
                                                fontSize: '0.8rem',
                                                fontWeight: '600',
                                                color: '#fff',
                                                background: polyColor,
                                                borderRadius: '4px',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px'
                                            }}>
                                                {poly.name}
                                            </span>
                                            {isImportMode && poly.validationStatus && (
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '2px 6px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                    color: '#0f172a',
                                                    background: 'rgba(255,255,255,0.85)',
                                                    borderRadius: '999px',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                                }}>
                                                    {poly.validationStatus}
                                                </span>
                                            )}
                                        </div>
                                    </Tooltip>
                                </Polygon>
                            );
                        })}

                        {/* Preview polygons for overlap fix */}
                        {overlapWarning && showPreview && (
                            <>
                                {previewVisibility.original && (
                                    <Polygon
                                        positions={overlapWarning.originalCoords}
                                        pathOptions={{ 
                                            color: '#ff5252', 
                                            opacity: 0.7, 
                                            fillOpacity: 0.15,
                                            dashArray: '10 5',
                                            weight: 3
                                        }}
                                    />
                                )}
                                {previewVisibility.fixed && overlapWarning.fixedCoords && (
                                    <Polygon
                                        positions={overlapWarning.fixedCoords}
                                        pathOptions={{ 
                                            color: '#4caf50', 
                                            opacity: 0.9, 
                                            fillOpacity: 0.3,
                                            weight: 3
                                        }}
                                    />
                                )}
                            </>
                        )}
                    </FeatureGroup>
                </MapContainer>

                <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 2000, display: 'flex', gap: 8 }}>
                    {overlapWarning && showPreview ? (
                        <>
                            <button
                                onClick={() => setShowPreview(false)}
                                title={t('map.preview.back')}
                                style={{
                                    background: '#007bff',
                                    color: 'white',
                                    border: 'none',
                                    padding: '0.5rem 0.75rem',
                                    borderRadius: 4,
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem'
                                }}
                            >
                                <span>👁️</span>
                                {t('map.preview.back')}
                            </button>
                            <div style={{ display: 'flex', gap: 6, background: 'rgba(0,0,0,0.45)', padding: '0.35rem', borderRadius: 999, boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
                                <button
                                    onClick={() => setPreviewVisibility(prev => ({ ...prev, original: !prev.original }))}
                                    disabled={!overlapWarning.originalCoords?.length}
                                    style={{
                                        border: 'none',
                                        borderRadius: 999,
                                        padding: '0.35rem 0.85rem',
                                        fontSize: '0.8rem',
                                        cursor: overlapWarning.originalCoords?.length ? 'pointer' : 'not-allowed',
                                        background: previewVisibility.original ? '#ff5252' : 'transparent',
                                        color: '#fff',
                                        opacity: overlapWarning.originalCoords?.length ? 1 : 0.4,
                                        transition: 'background 0.2s, opacity 0.2s'
                                    }}
                                >
                                    {t('map.preview.original')}
                                </button>
                                <button
                                    onClick={() => setPreviewVisibility(prev => ({ ...prev, fixed: !prev.fixed }))}
                                    disabled={!overlapWarning.fixedCoords?.length}
                                    style={{
                                        border: 'none',
                                        borderRadius: 999,
                                        padding: '0.35rem 0.85rem',
                                        fontSize: '0.8rem',
                                        cursor: overlapWarning.fixedCoords?.length ? 'pointer' : 'not-allowed',
                                        background: previewVisibility.fixed ? '#4caf50' : 'transparent',
                                        color: '#fff',
                                        opacity: overlapWarning.fixedCoords?.length ? 1 : 0.4,
                                        transition: 'background 0.2s, opacity 0.2s'
                                    }}
                                >
                                    {t('map.preview.fixed')}
                                </button>
                            </div>
                        </>
                    ) : (allowCreate && !editingId && !isCreating && (
                        <button onClick={startCreate} title={t('map.toolbar.addTitle')} style={{ background: '#007bff', color: 'white', border: 'none', padding: '0.5rem', borderRadius: 4 }}>+</button>
                    ))}
                    {allowCreate && isCreating && (
                        <>
                            <button onClick={finishCreate} title={t('map.toolbar.finishDrawing')} disabled={createPointCount < 3} style={{ background: createPointCount >= 3 ? 'green' : '#9fc59f', color: 'white', border: 'none', padding: '0.5rem', borderRadius: 4, cursor: createPointCount >= 3 ? 'pointer' : 'not-allowed', opacity: createPointCount >= 3 ? 1 : 0.6 }}>✓</button>
                            <button onClick={cancelCreate} title={t('map.toolbar.cancelDrawing')} style={{ background: 'red', color: 'white', border: 'none', padding: '0.5rem', borderRadius: 4 }}>✕</button>
                            <button onClick={() => createHandlerRef.current?.deleteLastVertex?.()} title={t('map.toolbar.removeLastPoint')} style={{ background: '#ddd', color: '#333', border: 'none', padding: '0.5rem', borderRadius: 4 }}>-</button>
                        </>
                    )}
                    {editingId && (
                        <>
                            <button onClick={finishEdit} title={t('map.toolbar.saveEdit')} style={{ background: 'green', color: 'white', border: 'none', padding: '0.5rem', borderRadius: 4 }}>✓</button>
                            <button onClick={cancelEdit} title={t('map.toolbar.cancelEdit')} style={{ background: 'red', color: 'white', border: 'none', padding: '0.5rem', borderRadius: 4 }}>✕</button>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
