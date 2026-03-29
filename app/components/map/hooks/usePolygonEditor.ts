import { useState, useCallback, useRef } from "react";
import L from "leaflet";
import { checkOverlap, fixOverlap } from "../utils/geometry";
import { extractCoords, coordsToWKT } from "../utils/mapUtils";
import type { PolygonData, EditState, OverlapWarning, ManualEditContext } from "../types";
import { apiDelete, apiPut, apiPatch } from "~/utils/api";

interface UsePolygonEditorProps {
    polygons: PolygonData[];
    setPolygons: React.Dispatch<React.SetStateAction<PolygonData[]>>;
    setAllPolygons: React.Dispatch<React.SetStateAction<PolygonData[]>>;
    parcelsEndpoint: string;
    contextType: string;
    getMap: () => L.Map | null;
    t: any;
    areaName: string;
    setAreaName: (val: string) => void;
    setModal: (val: { open: boolean; coords: [number, number][] | null }) => void;
    setRenamingId: (val: string | null) => void;
    setSelectedPeriodId: (val: string) => void;
    setRenameValue: (val: string) => void;
    setRenamePeriodId: (val: string) => void;
}

export function usePolygonEditor({
    polygons, setPolygons, setAllPolygons, parcelsEndpoint, contextType, getMap, t, areaName, setAreaName, setModal, setRenamingId, setSelectedPeriodId, setRenameValue, setRenamePeriodId
}: UsePolygonEditorProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [createPointCount, setCreatePointCount] = useState(0);
    const [overlapWarning, setOverlapWarning] = useState<OverlapWarning | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [pendingManualEditId, setPendingManualEditId] = useState<string | null>(null);
    const [manualEditContext, setManualEditContext] = useState<ManualEditContext | null>(null);
    const [previewVisibility, setPreviewVisibility] = useState<{ original: boolean; fixed: boolean }>({ original: false, fixed: true });

    const originalCoordsRef = useRef<Record<string, [number, number][]>>({});
    const editStateRef = useRef<EditState | null>(null);
    const createdLayerRef = useRef<any>(null);
    const createHandlerRef = useRef<any>(null);

    const detectOverlaps = useCallback((id: string, coords: [number, number][]): { id: string; name: string }[] => {
        const overlapping: { id: string; name: string }[] = [];
        for (const poly of polygons) {
            if (poly.id === id || !poly.visible) continue;
            if (checkOverlap(coords, poly.coords)) {
                overlapping.push({ id: poly.id, name: poly.name });
            }
        }
        return overlapping;
    }, [polygons]);

    const updatePolygon = useCallback((id: string, coords: [number, number][], incrementVersion: boolean = true) => {
        const updater = (prev: PolygonData[]) => prev.map(p => p.id === id ? { ...p, coords, version: incrementVersion ? (p.version || 0) + 1 : p.version } : p);
        setPolygons(updater);
        setAllPolygons(updater);
    }, [setPolygons, setAllPolygons]);

    const cleanupEdit = useCallback(() => {
        const state = editStateRef.current;
        if (!state) return;
        
        // clear events
        state.listeners.edit && state.layer?.off('edit', state.listeners.edit);
        state.listeners.mousemove && state.listeners.mousemove.map?.off('mousemove', state.listeners.mousemove.listener);
        
        // kill handler
        try {
            if (state.handler) {
                state.handler.disable();
                // clean leaflet draw markers
                if (state.handler._markers) {
                    state.handler._markers.clearLayers();
                }
            }
        } catch (err) {
            console.warn("Error disabling edit handler:", err);
        }

        // empty temp group
        const map = getMap();
        if (state.tempGroup) {
            state.tempGroup.clearLayers?.();
            if (map && map.hasLayer?.(state.tempGroup)) {
                map.removeLayer(state.tempGroup);
            }
        }
        
        editStateRef.current = null;
    }, [getMap]);

    const setupEditListeners = useCallback((layer: any, id: string) => {
        const handleUpdate = () => updatePolygon(id, extractCoords(layer), false);
        layer.on('edit', handleUpdate);
        const map = getMap();
        let moveListener: any = null;
        if (map) {
            let lastUpdate = 0;
            moveListener = () => {
                const now = Date.now();
                if (now - lastUpdate < 16) return;
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
    }, [getMap, updatePolygon]);

    const startEdit = useCallback((id: string, canEdit: boolean, forceCoords?: [number, number][]) => {
        // always clean old edit session first
        if (editStateRef.current) cleanupEdit();
        if (!canEdit) return;
        
        let coords = forceCoords;
        if (!coords) {
            const poly = polygons.find(p => p.id === id);
            if (!poly) return;
            coords = poly.coords as [number, number][];
        }
        
        const map = getMap();
        if (!map) return;

        originalCoordsRef.current[id] = coords;
        map.closePopup?.();

        // make bright clone
        const clone = L.polygon(coords as L.LatLngExpression[], {
            color: '#2196f3',
            weight: 4,
            dashArray: '10, 10',
            fillOpacity: 0.3,
            interactive: true,
            stroke: true,
            opacity: 1,
            fillColor: '#2196f3',
            className: 'pulse-dash'
        });
        (clone as any).options = { ...clone.options, customId: id };
        
        // add map now
        const tmpGroup = new L.FeatureGroup([clone]);
        map.addLayer(tmpGroup);

        const EditHandler = (L as any).EditToolbar?.Edit || (L as any).EditToolbarEdit;
        if (!EditHandler) return;

        // start edit on clone
        const handler = new EditHandler(map, { 
            featureGroup: tmpGroup,
            selectedPathOptions: {
                color: '#2196f3',
                weight: 4,
                dashArray: '10, 10',
                fill: true,
                stroke: true,
                opacity: 1,
                fillColor: '#2196f3',
                fillOpacity: 0.3
            }
        });
        
        if (handler._selectedLayers) {
            handler._selectedLayers.addLayer(clone);
        }

        editStateRef.current = { layer: clone, handler, tempGroup: tmpGroup, listeners: {} };
        setupEditListeners(clone, id);
        handler.enable();
        setEditingId(id);
    }, [polygons, getMap, setupEditListeners, cleanupEdit, setEditingId]);

    const finishEdit = useCallback(async (forceParam: boolean | any = false) => {
        const force = forceParam === true; // make sure it's boolean
        const state = editStateRef.current;
        if (!state || !editingId) return;
        const newCoords = extractCoords(state.layer);
        const overlapping = detectOverlaps(editingId, newCoords);
        const manualContextActive = manualEditContext?.warning.polygonId === editingId;

        if (!force && overlapping.length > 0) {
            let fixedCoords: [number, number][] | null = null;
            if (overlapping.length > 0) {
                const overlappingData = polygons.filter(p => overlapping.some(o => o.id === p.id));
                fixedCoords = fixOverlap(newCoords, overlappingData);
            }
            // 1. save state
            const currentPoly = polygons.find(p => p.id === editingId);
            const snapName = manualContextActive ? manualEditContext.areaNameSnapshot : (currentPoly?.name || '');
            const snapPeriod = manualContextActive ? manualEditContext.selectedPeriodIdSnapshot : (currentPoly?.periodId ? String(currentPoly.periodId) : '');

            // 2. put back original shape
            // removes leaflet ghost
            if (state.layer && currentPoly) {
                const originalCoords = currentPoly.coords;
                (state.layer as L.Polygon).setLatLngs(originalCoords.map(([lat, lng]: [number, number]) => L.latLng(lat, lng)));
            }
            
            // 3. clean up and warn
            cleanupEdit();
            setEditingId(null);

            setOverlapWarning({ 
                polygonId: editingId, 
                overlappingPolygons: overlapping, 
                originalCoords: newCoords, 
                fixedCoords: fixedCoords || null,
                areaNameSnapshot: snapName,
                selectedPeriodIdSnapshot: snapPeriod
            });
            setShowPreview(false);
            
            // 3. re-open modal
            const isNew = manualEditContext?.isNewPolygon || editingId.startsWith('poly-');
            
            if (manualContextActive) {
                if (isNew) {
                    setAreaName(manualEditContext.areaNameSnapshot || t('map.defaultPolygonName'));
                    setSelectedPeriodId(manualEditContext.selectedPeriodIdSnapshot || '');
                    setModal({ open: true, coords: newCoords });
                } else {
                    setRenameValue(manualEditContext.areaNameSnapshot || '');
                    setRenamePeriodId(manualEditContext.selectedPeriodIdSnapshot || '');
                    setRenamingId(editingId);
                }
            } else {
                if (isNew) {
                    setModal({ open: true, coords: newCoords });
                } else {
                    setRenamingId(editingId);
                }
            }
            return;
        }

        let coordsToSave = newCoords;
        if (force && overlapWarning && overlapWarning.polygonId === editingId && overlapWarning.fixedCoords) {
            coordsToSave = overlapWarning.fixedCoords;
        }

        // clean before big updates
        cleanupEdit();
        setEditingId(null);

        // save existing polygon coords
        if (!editingId.startsWith('poly-')) {
            try {
                const currentPoly = polygons.find(p => p.id === editingId);
                const currentName = currentPoly?.name || t('map.defaultPolygonName');
                
                const isImportMode = contextType === 'import';
                let response;
                let finalName = '';
                let finalPeriodId: number | null = null;

                if (isImportMode) {
                    // imports need patch
                    const payload = { geodata: coordsToWKT(coordsToSave), validationNotes: "Manual edit" };
                    response = await apiPatch(`/imports/parcels/${editingId}`, payload);
                    finalName = currentPoly?.name || t('map.defaultPolygonName');
                    finalPeriodId = currentPoly?.periodId ? Number(currentPoly.periodId) : null;
                } else {
                    // farms need put
                    const periodIdNum = currentPoly?.periodId ? Number(currentPoly.periodId) : null;
                    const payload: any = { 
                        geodata: coordsToWKT(coordsToSave),
                        name: (currentName).trim() || t('map.defaultPolygonName'),
                        active: true,
                        periodId: (periodIdNum && periodIdNum > 0) ? periodIdNum : null,
                        startValidity: new Date().toISOString(),
                        endValidity: null
                    };

                    // send farm id just in case
                    if (contextType === 'farm') {
                        const match = parcelsEndpoint.match(/\/farm\/([^\/]+)/);
                        if (match) payload.farmId = Number(match[1]);
                    }
                    
                    // save names if we fixed overlap
                    if (manualContextActive && manualEditContext && !manualEditContext.isNewPolygon) {
                        const snpName = (manualEditContext.areaNameSnapshot || '').trim();
                        if (snpName) payload.name = snpName;
                        if (manualEditContext.selectedPeriodIdSnapshot) {
                            const snpPeriodNum = Number(manualEditContext.selectedPeriodIdSnapshot);
                            payload.periodId = (snpPeriodNum > 0) ? snpPeriodNum : null;
                        }
                    }

                    response = await apiPut(`${parcelsEndpoint}/${editingId}`, payload);
                    finalName = payload.name;
                    finalPeriodId = payload.periodId;
                }

                if (!response.ok) console.error("Failed to update parcel:", response.statusText);
                else {
                    // update state right away
                    const updateFn = (prev: PolygonData[]) => prev.map(p => p.id === editingId 
                        ? { ...p, name: finalName, periodId: finalPeriodId, coords: coordsToSave, version: (p.version || 0) + 1 } 
                        : p
                    );
                    setPolygons(updateFn);
                    setAllPolygons(updateFn);
                }
            } catch (err) {
                console.error("Failed to update parcel:", err);
            }
        }

        // re-open create modal if new polygon
        if (manualEditContext?.isNewPolygon) {
            setAreaName(manualEditContext.areaNameSnapshot || t('map.defaultPolygonName'));
            setSelectedPeriodId(manualEditContext.selectedPeriodIdSnapshot || '');
            setModal({ open: true, coords: coordsToSave });
            setOverlapWarning(null); // clear old warning
        }

        updatePolygon(editingId, coordsToSave, true);
        delete originalCoordsRef.current[editingId];
        cleanupEdit();
        setEditingId(null);
        setManualEditContext(null);
        setPendingManualEditId(null);
        getMap()?.closePopup?.();
        if (manualContextActive) setManualEditContext(null);
    }, [editingId, polygons, detectOverlaps, updatePolygon, cleanupEdit, manualEditContext, parcelsEndpoint, getMap]);

    const cancelEdit = useCallback(() => {
        if (!editingId) return;
        if (manualEditContext && manualEditContext.warning.polygonId === editingId) {
            cleanupEdit();
            setEditingId(null);
            delete originalCoordsRef.current[editingId];
            if (manualEditContext.isNewPolygon) {
                setPolygons(prev => prev.filter(p => p.id !== editingId));
                setAreaName(manualEditContext.areaNameSnapshot);
                setSelectedPeriodId(manualEditContext.selectedPeriodIdSnapshot);
                setModal({ open: true, coords: manualEditContext.originalCoords });
            } else {
                setRenamingId(editingId);
            }
            setOverlapWarning(manualEditContext.warning);
            setShowPreview(false);
            setManualEditContext(null);
            setPendingManualEditId(null);
            getMap()?.closePopup?.();
            return;
        }
        const original = originalCoordsRef.current[editingId];
        if (original && editStateRef.current) {
            editStateRef.current.layer.setLatLngs?.(original);
            updatePolygon(editingId, original, true);
            delete originalCoordsRef.current[editingId];
        }
        cleanupEdit();
        setEditingId(null);
        getMap()?.closePopup?.();
    }, [editingId, manualEditContext, updatePolygon, cleanupEdit, getMap, setPolygons, setAreaName]);

    const deletePolygon = useCallback(async (id: string, canEdit: boolean) => {
        if (!canEdit) return;
        if (contextType === 'farm') {
            try {
                const response = await apiDelete(`/parcels/${id}`);
                if (!response.ok) return console.error("Failed to delete parcel:", response.statusText);
            } catch (err) {
                return console.error("Failed to delete parcel:", err);
            }
        }
        setPolygons(prev => prev.filter(p => p.id !== id));
        setAllPolygons(prev => prev.filter(p => p.id !== id));
        if (id === editingId) {
            cleanupEdit();
            setEditingId(null);
        }
    }, [contextType, editingId, cleanupEdit, setPolygons, setAllPolygons]);

    const startCreate = useCallback(() => {
        const map = getMap();
        if (!map || editingId) return;
        const handler = (L as any).Draw?.Polygon ? new (L as any).Draw.Polygon(map, { allowIntersection: false, showArea: true, metric: true, repeatMode: false }) : null;
        if (!handler) return;
        handler.enable();
        createHandlerRef.current = handler;
        setIsCreating(true);
        setCreatePointCount(0);
    }, [getMap, editingId]);

    const cancelCreate = useCallback(() => {
        createHandlerRef.current?.disable?.();
        createHandlerRef.current = null;
        setIsCreating(false);
        setCreatePointCount(0);
        if (createdLayerRef.current) getMap()?.removeLayer(createdLayerRef.current);
        createdLayerRef.current = null;
    }, [getMap]);

    return {
        editingId, setEditingId,
        isCreating, setIsCreating,
        createPointCount, setCreatePointCount,
        overlapWarning, setOverlapWarning,
        showPreview, setShowPreview,
        pendingManualEditId, setPendingManualEditId,
        manualEditContext, setManualEditContext,
        previewVisibility, setPreviewVisibility,
        originalCoordsRef, editStateRef, createdLayerRef, createHandlerRef,
        detectOverlaps, updatePolygon, cleanupEdit, startEdit, finishEdit, cancelEdit, deletePolygon,
        startCreate, cancelCreate
    };
}
