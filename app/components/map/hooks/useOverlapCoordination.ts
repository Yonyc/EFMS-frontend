import { useCallback } from "react";
import { fixOverlap } from "../utils/geometry";
import { coordsToWKT } from "../utils/mapUtils";
import { apiPost, apiPut, apiPatch } from "~/utils/api";
import type { PolygonData, OverlapWarning, ManualEditContext, MapContextType } from "../types";

interface UseOverlapCoordinationProps {
    parcelsEndpoint: string;
    polygons: PolygonData[];
    setPolygons: React.Dispatch<React.SetStateAction<PolygonData[]>>;
    setAllPolygons: React.Dispatch<React.SetStateAction<PolygonData[]>>;
    overlapWarning: OverlapWarning | null;
    setOverlapWarning: (w: OverlapWarning | null) => void;
    modal: { open: boolean; coords: [number, number][] | null };
    setModal: (m: { open: boolean; coords: [number, number][] | null }) => void;
    areaName: string;
    areaNameRef: React.MutableRefObject<string>;
    renameValueRef: React.MutableRefObject<string>;
    selectedPeriodId: string;
    renameValue: string;
    renamePeriodId: string;
    showPreview: boolean;
    setShowPreview: (s: boolean) => void;
    setPendingManualEditId: (id: string | null) => void;
    setManualEditContext: (c: ManualEditContext | null) => void;
    setRenamingId: (id: string | null) => void;
    masterCleanup: () => void;
    detachCreatedLayer: () => void;
    getMap: () => L.Map | undefined;
    detectOverlaps: (id: string, coords: [number, number][]) => any[];
    updatePolygon: (id: string, coords: [number, number][]) => void;
    startEditSimple: (id: string, coords?: [number, number][]) => void;
    createHandlerRef: React.MutableRefObject<any>;
    createdLayerRef: React.MutableRefObject<any>;
    setIsCreating: (c: boolean) => void;
    contextType: MapContextType;
    resolvedContextId: string;
    t: any;
}

export function useOverlapCoordination({
    parcelsEndpoint, polygons, setPolygons, setAllPolygons,
    overlapWarning, setOverlapWarning, modal, setModal,
    areaName, areaNameRef, renameValueRef, selectedPeriodId, renameValue, renamePeriodId,
    showPreview, setShowPreview, setPendingManualEditId, setManualEditContext,
    setRenamingId, masterCleanup, detachCreatedLayer, getMap,
    detectOverlaps, updatePolygon, startEditSimple, createHandlerRef, createdLayerRef, setIsCreating,
    contextType, resolvedContextId, t
}: UseOverlapCoordinationProps) {

    const handleOverlapCancel = useCallback(() => {
        if (overlapWarning?.isNewPolygon) {
            detachCreatedLayer();
        }
        setOverlapWarning(null);
        setShowPreview(false);
    }, [overlapWarning, setOverlapWarning, setShowPreview, detachCreatedLayer]);

    const handleOverlapAccept = useCallback(async () => {
        if (!overlapWarning?.fixedCoords) return;
        if (overlapWarning.isNewPolygon) {
            detachCreatedLayer();
            setModal({ open: true, coords: overlapWarning.fixedCoords });
        } else {
            // save to db
            try {
                const isImportMode = contextType === 'import';
                const currentPoly = polygons.find(p => p.id === overlapWarning.polygonId);
                const wkt = coordsToWKT(overlapWarning.fixedCoords);
                
                let res;
                let finalName = '';
                let finalPeriodId: number | null = null;

                if (isImportMode) {
                    // imports need patch
                    const payload = { geodata: wkt, validationNotes: "Auto-corrected overlap" };
                    res = await apiPatch(`/imports/parcels/${overlapWarning.polygonId}`, payload);
                    finalName = currentPoly?.name || t('map.defaultPolygonName');
                    finalPeriodId = currentPoly?.periodId ? Number(currentPoly.periodId) : null;
                } else {
                    // farms need put
                    const resolvedName = (renameValueRef.current || overlapWarning.areaNameSnapshot || currentPoly?.name || t('map.defaultPolygonName')).trim();
                    const resolvedPeriod = renamePeriodId || overlapWarning.selectedPeriodIdSnapshot || (currentPoly?.periodId ? String(currentPoly.periodId) : '');
                    const periodIdNum = resolvedPeriod ? Number(resolvedPeriod) : null;

                    const payload: any = { 
                        geodata: wkt,
                        name: resolvedName || t('map.defaultPolygonName'),
                        active: true,
                        periodId: (periodIdNum && periodIdNum > 0) ? periodIdNum : null,
                        startValidity: new Date().toISOString(),
                        endValidity: null
                    };
                    if (contextType === 'farm') payload.farmId = Number(resolvedContextId);

                    res = await apiPut(`${parcelsEndpoint}/${overlapWarning.polygonId}`, payload);
                    finalName = payload.name;
                    finalPeriodId = payload.periodId;
                }
                
                if (res.ok) {
                    // update ui on success
                    updatePolygon(overlapWarning.polygonId, overlapWarning.fixedCoords);
                    
                    // update both lists
                    setAllPolygons(prev => prev.map(p => p.id === overlapWarning.polygonId 
                        ? { ...p, coords: overlapWarning.fixedCoords as [number, number][], name: finalName, periodId: finalPeriodId, version: (p.version || 0) + 1 } 
                        : p
                    ));
                    
                    console.log(`[Map] Successfully persisted auto-correction for ${overlapWarning.polygonId}`);
                } else {
                    console.error("Server rejected the auto-correction update.");
                }
            } catch (err) {
                console.error("Failed to persist auto-correction:", err);
            }
            setOverlapWarning(null);
            setRenamingId(null);
        }
        setShowPreview(false);
    }, [overlapWarning, setModal, updatePolygon, setOverlapWarning, setShowPreview, setRenamingId, detachCreatedLayer, parcelsEndpoint, polygons, t]);

    const handleOverlapManualEdit = useCallback(() => {
        if (!overlapWarning) return;
        
        const tempId = overlapWarning.polygonId;
        const coords = overlapWarning.originalCoords;
        const isNew = overlapWarning.isNewPolygon;

        setPendingManualEditId(tempId);
        masterCleanup();
        
        const currentName = isNew ? areaNameRef.current : renameValueRef.current;
        const polyName = currentName || (isNew ? t('map.defaultPolygonName') : (polygons.find(p => p.id === tempId)?.name || ''));
        
        setManualEditContext({ 
            warning: overlapWarning, 
            areaNameSnapshot: polyName,
            selectedPeriodIdSnapshot: isNew ? selectedPeriodId : renamePeriodId,
            polygonId: tempId,
            originalCoords: overlapWarning.originalCoords,
            isNewPolygon: isNew
        });

        if (isNew) {
            setPolygons(prev => {
                const filtered = prev.filter(p => p.id !== tempId);
                return [...filtered, {
                    id: tempId,
                    name: polyName,
                    coords,
                    version: 0,
                    visible: true,
                    color: '#3388ff',
                    canEdit: true,
                    canShare: false,
                }];
            });
            setModal({ open: false, coords: null });
        } else {
            setRenamingId(null);
            setModal({ open: false, coords: null });
        }

        startEditSimple(tempId, coords);
        setOverlapWarning(null);
        setShowPreview(false);
    }, [overlapWarning, areaNameRef, renameValueRef, t, polygons, selectedPeriodId, renamePeriodId, setPendingManualEditId, masterCleanup, setManualEditContext, setPolygons, setModal, setRenamingId, startEditSimple, setOverlapWarning]);

    const confirmCreate = useCallback(async (force: boolean = false, allowOverlap: boolean = false) => {
        masterCleanup();
        
        let coords = modal.coords;
        if (!coords) return;

        const tempId = overlapWarning?.polygonId || `poly-${Date.now()}`;

        if (overlapWarning && overlapWarning.fixedCoords && force && !allowOverlap) {
            coords = overlapWarning.fixedCoords;
        } else if (!force && !allowOverlap) {
            const overlapping = detectOverlaps(tempId, coords);
            if (overlapping.length > 0) {
                const otherPolygons = polygons.filter(p => overlapping.some(o => o.id === p.id));
                const fixedCoords = fixOverlap(coords, otherPolygons);

                setOverlapWarning({
                    polygonId: tempId,
                    overlappingPolygons: overlapping,
                    originalCoords: coords,
                    fixedCoords,
                    isNewPolygon: true,
                    areaNameSnapshot: areaName,
                    selectedPeriodIdSnapshot: selectedPeriodId
                });
                setShowPreview(false);
                return;
            }
        }

        setOverlapWarning(null);
        setModal({ open: false, coords: null });

        const resolvedName = (areaNameRef.current || areaName || overlapWarning?.areaNameSnapshot || t('map.defaultPolygonName')).trim() || t('map.defaultPolygonName');

        const newPoly: PolygonData = {
            id: tempId,
            name: resolvedName,
            coords,
            version: 0,
            visible: true,
            color: '#3388ff',
            periodId: selectedPeriodId ? Number(selectedPeriodId) : null,
            canEdit: true,
            canShare: false,
        };

        const postPayload = {
            name: newPoly.name,
            active: true,
            startValidity: new Date().toISOString(),
            endValidity: null,
            geodata: coordsToWKT(newPoly.coords),
            color: newPoly.color,
            periodId: selectedPeriodId ? Number(selectedPeriodId) : undefined,
        };

        try {
            const response = await apiPost(parcelsEndpoint, postPayload);
            if (response.ok) {
                const createdParcel = await response.json();
                newPoly.id = String(createdParcel.id);
                newPoly.canEdit = createdParcel.canEdit ?? true;
                newPoly.canShare = createdParcel.canShare ?? false;
                setPolygons(prev => [...prev.filter(p => p.id !== tempId), newPoly]);
                setAllPolygons(prev => [...prev.filter(p => p.id !== tempId), newPoly]);
            } else {
                setPolygons(prev => [...prev.filter(p => p.id !== tempId), newPoly]);
                setAllPolygons(prev => [...prev.filter(p => p.id !== tempId), newPoly]);
            }
        } catch (err) {
            console.error("Failed to create parcel:", err);
        }
    }, [masterCleanup, modal.coords, overlapWarning, detectOverlaps, polygons, setOverlapWarning, setShowPreview, setModal, areaName, selectedPeriodId, areaNameRef, t, parcelsEndpoint, setPolygons, setAllPolygons]);

    const handleCreated = useCallback((e: any) => {
        try {
            const latlngs = e.layer.getLatLngs();
            const ring = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
            const coords = ring.map((ll: any) => [ll.lat, ll.lng]) as [number, number][];
            
            const tempId = `poly-${Date.now()}`;
            const overlapping = detectOverlaps(tempId, coords);
            
            if (overlapping.length > 0) {
                const otherPolygons = polygons.filter(p => overlapping.some(o => o.id === p.id));
                const fixedCoords = fixOverlap(coords, otherPolygons);
                setOverlapWarning({
                    polygonId: tempId,
                    overlappingPolygons: overlapping,
                    originalCoords: coords,
                    fixedCoords: fixedCoords || null,
                    isNewPolygon: true,
                    areaNameSnapshot: areaNameRef.current,
                    selectedPeriodIdSnapshot: selectedPeriodId
                });
                setShowPreview(false);
                setModal({ open: true, coords: fixedCoords || coords });
            } else {
                setOverlapWarning(null);
                setModal({ open: true, coords });
            }
            createdLayerRef.current = e.layer;
            createHandlerRef.current = null;
            setIsCreating(false);
        } catch (err) {
            console.error("Error in handleCreated geometry processing:", err);
            setModal({ open: true, coords: [] });
        }
    }, [detectOverlaps, polygons, setOverlapWarning, areaNameRef, selectedPeriodId, setShowPreview, setModal, createHandlerRef, setIsCreating]);

    return {
        handleOverlapCancel, handleOverlapAccept, handleOverlapManualEdit, confirmCreate, handleCreated
    };
}
