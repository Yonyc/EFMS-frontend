import { useState, useCallback, useRef, useEffect } from "react";
import L from "leaflet";
import { getAncestorIds, getDescendantIds } from "./useSnappyEditing";
import { checkOverlap } from "../utils/geometry";
import { useSketchConstraints, pointDistanceSq, findLastPointAlongSegmentByPredicate } from "./useSketchConstraints";
import { saveParcelCoords, autoCorrectChild, pickManualEditOverrides } from "../utils/parcelPersistence";
import { useOverlapModalState } from "./useOverlapModalState";
import { useSketchLifecycleState } from "./useSketchLifecycleState";
import type { PolygonData } from "../types";
import { apiDelete } from "~/utils/api";

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
    selectedParentId: string | null;
    setSelectedParentId: (id: string | null) => void;
    updateGhost: (coords: [number, number][], parentId?: string | null, ignoreIds?: string[], options?: { edgeSnap?: boolean; autoCorrect?: boolean }) => [number, number][] | undefined;
    clearGhost: () => void;
    setSnapPreview: (pos: L.LatLng | null) => void;
}

export function usePolygonEditor({
    polygons, setPolygons, setAllPolygons, parcelsEndpoint, contextType, getMap, t, areaName, setAreaName, setModal, setRenamingId, setSelectedPeriodId, setRenameValue, setRenamePeriodId,
    selectedParentId, setSelectedParentId, updateGhost, clearGhost, setSnapPreview
}: UsePolygonEditorProps) {
    const sketch = useSketchLifecycleState();
    const {
        editingId, isCreating, createPointCount, drawingPoints, ghostCoords, createPreviewPoint, sketchInsertPreview,
        pointsRef: drawingPointsRef, ghostRef: ghostCoordsRef, previewPointRef: createPreviewPointRef, originalCoordsRef,
        beginCreate, beginEdit, goIdle,
        setGhost: setGhostCoords, setPreviewPoint: setCreatePreviewPoint, setInsertPreview: setSketchInsertPreview,
        setIsCreating, setEditingId, setCreatePointCount,
    } = sketch;
    const commitDrawingPoints = sketch.setPoints;
    const {
        overlapWarning, showPreview, previewVisibility, manualEditContext, pendingManualEditId,
        flagOverlap, dismissOverlap, clearManualEdit, restoreOverlapFromContext,
        setOverlapWarning, setShowPreview, setPreviewVisibility, setManualEditContext, setPendingManualEditId,
    } = useOverlapModalState();

    const createdLayerRef = useRef<any>(null);
    const createHandlerRef = useRef<any>(null);
    const [autoCorrectEnabled, setAutoCorrectEnabled] = useState(true);
    const [edgeSnapEnabled, setEdgeSnapEnabled] = useState(false);
    const [closeLoopMidpointEnabled, setCloseLoopMidpointEnabled] = useState(false);
    const [isHoveringSketchHandle, setIsHoveringSketchHandle] = useState(false);
    const suppressSketchClickUntilRef = useRef(0);
    const lastPreviewCursorRef = useRef<L.LatLng | null>(null);
    const edgeSnapEnabledRef = useRef(edgeSnapEnabled);
    const autoCorrectEnabledRef = useRef(autoCorrectEnabled);
    const closeLoopMidpointEnabledRef = useRef(closeLoopMidpointEnabled);
    const isHoveringSketchHandleRef = useRef(isHoveringSketchHandle);
    useEffect(() => { edgeSnapEnabledRef.current = edgeSnapEnabled; }, [edgeSnapEnabled]);
    useEffect(() => { autoCorrectEnabledRef.current = autoCorrectEnabled; }, [autoCorrectEnabled]);
    useEffect(() => { closeLoopMidpointEnabledRef.current = closeLoopMidpointEnabled; }, [closeLoopMidpointEnabled]);
    useEffect(() => { isHoveringSketchHandleRef.current = isHoveringSketchHandle; }, [isHoveringSketchHandle]);

    const suppressSketchClickTemporarily = useCallback((ms: number = 320) => {
        suppressSketchClickUntilRef.current = Date.now() + ms;
    }, []);

    const isSketchClickSuppressed = useCallback(() => Date.now() < suppressSketchClickUntilRef.current, []);

    const requestPreviewRecompute = useCallback(() => {
        const map = getMap();
        const last = lastPreviewCursorRef.current;
        if (!map || !last) return;
        if (!isCreating && !editingId) return;
        map.fire('mousemove', { latlng: last } as any);
    }, [editingId, getMap, isCreating]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Shift') return;
            if (edgeSnapEnabledRef.current) return;

            edgeSnapEnabledRef.current = true;
            setEdgeSnapEnabled(true);
            window.requestAnimationFrame(() => requestPreviewRecompute());
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key !== 'Shift') return;
            if (!edgeSnapEnabledRef.current) return;

            edgeSnapEnabledRef.current = false;
            setEdgeSnapEnabled(false);
            window.requestAnimationFrame(() => requestPreviewRecompute());
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, [requestPreviewRecompute]);

    const polygonsRef = useRef(polygons);
    const parentIdRef = useRef(selectedParentId);
    const updateGhostRef = useRef(updateGhost);
    const clearGhostRef = useRef(clearGhost);

    // sync refs
    polygonsRef.current = polygons;
    parentIdRef.current = selectedParentId;
    updateGhostRef.current = updateGhost;
    clearGhostRef.current = clearGhost;

    // live ghost during sketch for create and edit
    useEffect(() => {
        if (!isCreating && !editingId) return;

        if (drawingPoints.length === 0) {
            clearGhostRef.current();
            setGhostCoords([]);
            return;
        }

        if (drawingPoints.length < 3) {
            clearGhostRef.current();
            setGhostCoords(drawingPoints);
            return;
        }

        // skip the expensive fix while a handle is being dragged
        if (isHoveringSketchHandleRef.current) {
            setGhostCoords(drawingPoints);
            return;
        }

        const activeParentId = editingId
            ? (polygonsRef.current.find(p => p.id === editingId)?.parentId ?? parentIdRef.current)
            : parentIdRef.current;
        const ignoreIds = editingId
            ? [editingId, ...getDescendantIds(editingId, polygonsRef.current)]
            : [];

        const result = updateGhostRef.current(drawingPoints, activeParentId, ignoreIds, {
            edgeSnap: false,
            autoCorrect: autoCorrectEnabledRef.current,
        });
        if (result) setGhostCoords(result);
    }, [drawingPoints, isCreating, editingId, autoCorrectEnabled, isHoveringSketchHandle]);

    const detectOverlaps = useCallback((
        id: string,
        coords: [number, number][],
        parentIdOverride?: string | null
    ): { id: string; name: string }[] => {
        const overlapping: { id: string; name: string }[] = [];
        const activeParentId = parentIdOverride !== undefined ? parentIdOverride : selectedParentId;
        const ancestors = getAncestorIds(activeParentId, polygons);
        const descendants = getDescendantIds(id, polygons);
        for (const poly of polygons) {
            if (poly.id === id || !poly.visible) continue;
            if (ancestors.includes(poly.id)) continue;
            if (descendants.includes(poly.id)) continue;
            if (checkOverlap(coords, poly.coords)) {
                overlapping.push({ id: poly.id, name: poly.name });
            }
        }
        return overlapping;
    }, [polygons, selectedParentId]);

    const updatePolygon = useCallback((id: string, coords: [number, number][], incrementVersion: boolean = true) => {
        const updater = (prev: PolygonData[]) => prev.map(p => p.id === id ? { ...p, coords, version: incrementVersion ? (p.version || 0) + 1 : p.version } : p);
        setPolygons(updater);
        setAllPolygons(updater);
    }, [setPolygons, setAllPolygons]);

    const {
        clampPointToParentBoundary,
        isPointAllowed,
        isSketchGeometryAllowed,
        isEditCandidateAllowed,
        resolveConstrainedLatLng,
        findNearestValidPoint,
        findLastValidPointAlongSegment,
        findNearestPointByPredicate,
        resolvePreviewPoint,
    } = useSketchConstraints({ polygonsRef, parentIdRef, edgeSnapEnabledRef, getMap });

    const constrainSketchPoint = useCallback((nextPoint: [number, number], activeEditId?: string | null, fallbackPoint?: [number, number]): [number, number] => {
        const constrained = resolveConstrainedLatLng(L.latLng(nextPoint[0], nextPoint[1]), activeEditId, fallbackPoint);
        const target: [number, number] = [constrained.lat, constrained.lng];
        const resolved = findNearestValidPoint(target, (pt) => [pt], activeEditId, fallbackPoint, false);
        return resolved ?? (fallbackPoint ?? target);
    }, [findNearestValidPoint, resolveConstrainedLatLng]);

    const moveSketchPoint = useCallback((index: number, nextPoint: [number, number]): [number, number] => {
        const prev = drawingPointsRef.current;
        if (index < 0 || index >= prev.length) return nextPoint;

        const fallback = prev[index];
        const constrained = resolveConstrainedLatLng(L.latLng(nextPoint[0], nextPoint[1]), editingId, fallback, { respectShift: true });
        const candidate: [number, number] = [constrained.lat, constrained.lng];
        const next = [...prev];
        next[index] = candidate;

        const strict = true;
        if (!isSketchGeometryAllowed(next, editingId, strict)) {
            const buildCandidate = (pt: [number, number]) => {
                const probe = [...prev];
                probe[index] = pt;
                return probe;
            };

            const isEditPointValid = (pt: [number, number]) => isEditCandidateAllowed(buildCandidate(pt), pt, editingId, true);

            const alongSegment = findLastPointAlongSegmentByPredicate(fallback, candidate, isEditPointValid);
            if (alongSegment && pointDistanceSq(alongSegment, fallback) > 1e-16) {
                const adjusted = [...prev];
                adjusted[index] = alongSegment;
                commitDrawingPoints(adjusted);
                return alongSegment;
            }

            const nearestGeometry = findNearestPointByPredicate(candidate, isEditPointValid, 24);
            if (!nearestGeometry) {
                const relaxedGeometry = findNearestPointByPredicate(candidate, (pt) => isPointAllowed(pt, editingId), 24);
                if (!relaxedGeometry) return fallback;
                if (pointDistanceSq(relaxedGeometry, fallback) <= 1e-16) return fallback;

                const adjustedRelaxed = [...prev];
                adjustedRelaxed[index] = relaxedGeometry;
                commitDrawingPoints(adjustedRelaxed);
                return relaxedGeometry;
            }

            const adjusted = [...prev];
            adjusted[index] = nearestGeometry;
            commitDrawingPoints(adjusted);
            return nearestGeometry;
        }

        commitDrawingPoints(next);
        return candidate;
    }, [commitDrawingPoints, editingId, findLastPointAlongSegmentByPredicate, findNearestPointByPredicate, pointDistanceSq, resolveConstrainedLatLng, isEditCandidateAllowed, isPointAllowed, isSketchGeometryAllowed]);

    // shared by commit and live drag preview so the drag matches the saved shape
    const resolveSketchInsertion = useCallback((insertIndex: number, nextPoint: [number, number]): [number, number][] | null => {
        const prev = drawingPointsRef.current;
        const insertAt = Math.max(0, Math.min(insertIndex + 1, prev.length));
        const buildCandidate = (pt: [number, number]) => [
            ...prev.slice(0, insertAt),
            pt,
            ...prev.slice(insertAt),
        ];

        // go through the constrained resolver so shift-snap applies, like moveSketchPoint
        const constrained = resolveConstrainedLatLng(L.latLng(nextPoint[0], nextPoint[1]), editingId, undefined, { respectShift: true });
        const target: [number, number] = [constrained.lat, constrained.lng];

        if (editingId) {
            const isEditPointValid = (pt: [number, number]) => isEditCandidateAllowed(buildCandidate(pt), pt, editingId, true);

            if (isEditPointValid(target)) return buildCandidate(target);

            const anchor = prev.length > 0 ? prev[Math.max(0, insertAt - 1)] : null;
            if (!anchor) return null;

            const alongSegment = findLastPointAlongSegmentByPredicate(anchor, target, isEditPointValid);
            if (alongSegment && pointDistanceSq(alongSegment, anchor) > 1e-16) {
                return buildCandidate(alongSegment);
            }

            const nearest = findNearestPointByPredicate(target, isEditPointValid, 24);
            if (nearest) return buildCandidate(nearest);

            const relaxed = findNearestPointByPredicate(target, (pt) => isPointAllowed(pt, editingId), 24);
            if (!relaxed) return null;
            return buildCandidate(relaxed);
        }

        const next = buildCandidate(target);
        if (isSketchGeometryAllowed(next, editingId, true)) return next;

        const anchor = prev.length > 0 ? prev[Math.max(0, insertAt - 1)] : null;
        if (!anchor) return null;

        const alongSegment = findLastValidPointAlongSegment(anchor, target, buildCandidate, editingId);
        if (!alongSegment || pointDistanceSq(alongSegment, anchor) <= 1e-16) {
            const relaxed = findNearestValidPoint(target, buildCandidate, editingId, undefined, false);
            if (!relaxed) return null;
            return buildCandidate(relaxed);
        }

        const adjusted = buildCandidate(alongSegment);
        if (!isSketchGeometryAllowed(adjusted, editingId, true)) return null;
        return adjusted;
    }, [editingId, findLastPointAlongSegmentByPredicate, findLastValidPointAlongSegment, findNearestPointByPredicate, findNearestValidPoint, isEditCandidateAllowed, isPointAllowed, isSketchGeometryAllowed, resolveConstrainedLatLng]);

    const insertSketchPoint = useCallback((insertIndex: number, nextPoint: [number, number]): boolean => {
        const resolved = resolveSketchInsertion(insertIndex, nextPoint);
        if (!resolved) return false;
        commitDrawingPoints(resolved);
        return true;
    }, [commitDrawingPoints, resolveSketchInsertion]);

    // returns the resolved point so the drag handler can pin the midpoint marker
    const previewSketchInsertion = useCallback((edgeIndex: number, point: [number, number]): [number, number] | null => {
        const resolved = resolveSketchInsertion(edgeIndex, point);
        if (!resolved) return null;
        setSketchInsertPreview(resolved);
        const insertedIdx = Math.min(edgeIndex + 1, drawingPointsRef.current.length);
        return resolved[insertedIdx] ?? null;
    }, [resolveSketchInsertion]);

    const clearSketchInsertPreview = useCallback(() => {
        setSketchInsertPreview(null);
    }, []);

    // edit-mode "add point" toggle, cursor inserts on the closing edge with live preview
    useEffect(() => {
        const map = getMap();
        if (!map) return;

        const clearClosingInsertHandlers = () => {
            const mapAny = map as any;
            if (mapAny._closingInsertMoveHandler) map.off('mousemove', mapAny._closingInsertMoveHandler);
            if (mapAny._closingInsertClickHandler) map.off('click', mapAny._closingInsertClickHandler);
            delete mapAny._closingInsertMoveHandler;
            delete mapAny._closingInsertClickHandler;
        };

        clearClosingInsertHandlers();

        if (!editingId || isCreating) {
            return;
        }

        if (!closeLoopMidpointEnabled) {
            setCreatePreviewPoint(null);
            setSnapPreview(null);
            return;
        }

        const computePreviewAt = (latlng: L.LatLng) => {
            if (drawingPointsRef.current.length < 2) {
                setCreatePreviewPoint(null);
                setSnapPreview(null);
                return;
            }

            if (isHoveringSketchHandleRef.current) {
                setCreatePreviewPoint(null);
                setSnapPreview(null);
                return;
            }

            const target: [number, number] = [latlng.lat, latlng.lng];
            const previousPreview = createPreviewPointRef.current;
            const insertAt = drawingPointsRef.current.length;
            const anchorPoint = insertAt > 0 ? drawingPointsRef.current[insertAt - 1] : null;
            const buildCandidate = (pt: [number, number]) => [
                ...drawingPointsRef.current.slice(0, insertAt),
                pt,
                ...drawingPointsRef.current.slice(insertAt),
            ];
            const editPreviewValidator = (pt: [number, number]) => isPointAllowed(pt, editingId);

            const resolved = resolvePreviewPoint(target, previousPreview, buildCandidate, editingId, anchorPoint, true, editPreviewValidator);
            if (!resolved) {
                setCreatePreviewPoint(null);
                setSnapPreview(null);
                return;
            }

            if (previousPreview && pointDistanceSq(previousPreview, resolved) < 1e-16) return;

            const previewLatLng = L.latLng(resolved[0], resolved[1]);
            setSnapPreview(previewLatLng);
            setCreatePreviewPoint(resolved);
        };

        let moveRaf: number | null = null;
        let pendingMoveLatLng: L.LatLng | null = null;

        const moveHandler = (e: L.LeafletMouseEvent) => {
            lastPreviewCursorRef.current = e.latlng;
            pendingMoveLatLng = e.latlng;
            if (moveRaf !== null) return;
            moveRaf = window.requestAnimationFrame(() => {
                moveRaf = null;
                const ll = pendingMoveLatLng;
                pendingMoveLatLng = null;
                if (!ll) return;
                computePreviewAt(ll);
            });
        };

        const clickHandler = (e: L.LeafletMouseEvent) => {
            if (drawingPointsRef.current.length < 2) return;
            if (isSketchClickSuppressed()) return;
            if (isHoveringSketchHandleRef.current) return;

            const original = e.originalEvent as MouseEvent | undefined;
            const target = original?.target as HTMLElement | null;
            if (target?.closest('.custom-vertex-icon, .custom-midpoint-icon')) return;

            const closingEdgeIndex = drawingPointsRef.current.length - 1;
            const previewPoint = createPreviewPointRef.current;
            insertSketchPoint(closingEdgeIndex, previewPoint ?? [e.latlng.lat, e.latlng.lng]);
        };

        map.on('mousemove', moveHandler);
        map.on('click', clickHandler);

        const mapAny = map as any;
        mapAny._closingInsertMoveHandler = moveHandler;
        mapAny._closingInsertClickHandler = clickHandler;

        return () => {
            if (moveRaf !== null) window.cancelAnimationFrame(moveRaf);
            clearClosingInsertHandlers();
            setCreatePreviewPoint(null);
            setSnapPreview(null);
        };
    }, [editingId, isCreating, closeLoopMidpointEnabled, getMap, insertSketchPoint, isPointAllowed, isSketchClickSuppressed, pointDistanceSq, resolvePreviewPoint, setSnapPreview]);

    const cleanupEdit = useCallback(() => {
        goIdle();
        setIsHoveringSketchHandle(false);
        setSnapPreview(null);
        clearGhost();
    }, [clearGhost, goIdle, setSnapPreview]);

    const startEdit = useCallback((id: string, canEdit: boolean, forceCoords?: [number, number][]) => {
        if (!canEdit) return;

        const poly = polygons.find(p => p.id === id);
        const rawCoords = forceCoords ?? poly?.coords;
        if (!rawCoords || rawCoords.length < 3) return;

        const coords = rawCoords.map(c => [c[0], c[1]] as [number, number]);
        const originalSnapshot = coords.map(c => [c[0], c[1]] as [number, number]);

        clearGhost();
        setSnapPreview(null);
        setIsHoveringSketchHandle(false);
        setCloseLoopMidpointEnabled(false);

        const parentForEdit = poly?.parentId ?? selectedParentId;
        const ignoreIds = [id, ...getDescendantIds(id, polygons)];
        const snapped = updateGhost(coords, parentForEdit, ignoreIds, {
            edgeSnap: true,
            autoCorrect: autoCorrectEnabledRef.current,
        });
        beginEdit(id, originalSnapshot, snapped || coords);

        getMap()?.closePopup?.();
    }, [polygons, clearGhost, setSnapPreview, selectedParentId, updateGhost, getMap, beginEdit]);

    const finishEdit = useCallback(async (_forceParam: boolean | any = false) => {
        if (!editingId) return;

        const currentPoly = polygons.find(p => p.id === editingId);
        const parentId = currentPoly?.parentId || selectedParentId;
        const newCoords = drawingPointsRef.current;
        if (!newCoords || newCoords.length < 3) return;

        const ignoreIds = [editingId, ...getDescendantIds(editingId, polygons)];
        // commit the displayed ghost so the save matches what's on screen
        // recomputing here with different params would save a different shape
        const displayedGhost = ghostCoordsRef.current;
        const canUseDisplayedGhost =
            autoCorrectEnabledRef.current &&
            !isHoveringSketchHandleRef.current &&
            Array.isArray(displayedGhost) &&
            displayedGhost.length >= 3;
        const finalCoords = canUseDisplayedGhost
            ? displayedGhost
            : (updateGhost(newCoords, parentId, ignoreIds, {
                edgeSnap: false,
                autoCorrect: autoCorrectEnabledRef.current,
            }) || newCoords);

        if (!autoCorrectEnabledRef.current) {
            const overlapping = detectOverlaps(editingId, finalCoords, parentId ?? null);
            if (overlapping.length > 0) {
                const fixedCoords = updateGhost(newCoords, parentId, ignoreIds, {
                    edgeSnap: true,
                    autoCorrect: true,
                }) || finalCoords;
                flagOverlap({
                    polygonId: editingId,
                    overlappingPolygons: overlapping,
                    originalCoords: finalCoords,
                    fixedCoords,
                    isNewPolygon: false,
                    areaNameSnapshot: currentPoly?.name || t('map.defaultPolygonName'),
                    selectedPeriodIdSnapshot: currentPoly?.periodId ? String(currentPoly.periodId) : '',
                });
                return;
            }
        }

        clearGhost();
        const coordsToSave = finalCoords;
        let alreadyUpdated = false;

        // skip persistence for unsaved drafts, they live entirely client-side
        if (!editingId.startsWith('poly-')) {
            try {
                const defaultName = t('map.defaultPolygonName');
                const overrides = pickManualEditOverrides({ manualEditContext });

                const result = await saveParcelCoords({
                    parcelId: editingId,
                    coords: coordsToSave,
                    currentPoly,
                    contextType,
                    parcelsEndpoint,
                    defaultName,
                    ...overrides,
                });

                if (result.ok) {
                    const updateFn = (prev: PolygonData[]) => prev.map(p => p.id === editingId
                        ? { ...p, name: result.finalName, periodId: result.finalPeriodId, coords: coordsToSave, version: (p.version || 0) + 1 }
                        : p
                    );
                    setPolygons(updateFn);
                    setAllPolygons(updateFn);
                    alreadyUpdated = true;

                    // re-fit children to the new parent shape
                    const childrenToUpdate = polygons.filter(p =>
                        String(p.parentId) === String(editingId) && !p.id.startsWith('poly-')
                    );
                    for (const child of childrenToUpdate) {
                        try {
                            const childResult = await autoCorrectChild({
                                child,
                                parentCoords: coordsToSave,
                                contextType,
                                parcelsEndpoint,
                                defaultName,
                            });
                            if (childResult.ok && childResult.coords) {
                                const finalChildCoords = childResult.coords;
                                const updateChildFn = (prev: PolygonData[]) => prev.map(p =>
                                    p.id === child.id
                                        ? { ...p, coords: finalChildCoords, version: (p.version || 0) + 1 }
                                        : p
                                );
                                setPolygons(updateChildFn);
                                setAllPolygons(updateChildFn);
                            }
                        } catch (e) {
                            console.error("Error auto-correcting child on save:", e);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to update parcel:", err);
            }
        }

        // re-open the create modal for a new polygon
        if (manualEditContext?.isNewPolygon) {
            setAreaName(manualEditContext.areaNameSnapshot || t('map.defaultPolygonName'));
            setSelectedPeriodId(manualEditContext.selectedPeriodIdSnapshot || '');
            setModal({ open: true, coords: coordsToSave });
            dismissOverlap();
        }

        if (!manualEditContext?.isNewPolygon && !alreadyUpdated) {
            updatePolygon(editingId, coordsToSave, true);
        }

        clearManualEdit();
        setSelectedParentId(null);
        setCloseLoopMidpointEnabled(true);
        cleanupEdit();
        getMap()?.closePopup?.();
    }, [editingId, polygons, selectedParentId, updateGhost, clearGhost, detectOverlaps, contextType, parcelsEndpoint, manualEditContext, t, updatePolygon, cleanupEdit, getMap, setSelectedParentId, flagOverlap, dismissOverlap, clearManualEdit, setAreaName, setSelectedPeriodId, setModal]);

    const cancelEdit = useCallback(() => {
        if (!editingId) return;
        // snapshot the original before cleanupEdit clears the editing state
        const original = originalCoordsRef.current;

        if (manualEditContext && manualEditContext.warning.polygonId === editingId) {
            cleanupEdit();
            if (manualEditContext.isNewPolygon) {
                setPolygons(prev => prev.filter(p => p.id !== editingId));
                setAreaName(manualEditContext.areaNameSnapshot);
                setSelectedPeriodId(manualEditContext.selectedPeriodIdSnapshot);
                setModal({ open: true, coords: manualEditContext.originalCoords });
            } else {
                setRenamingId(editingId);
            }
            restoreOverlapFromContext(manualEditContext.warning);
            setCloseLoopMidpointEnabled(true);
            getMap()?.closePopup?.();
            return;
        }

        if (original && editingId.startsWith('poly-')) {
            updatePolygon(editingId, original, true);
        }
        setCloseLoopMidpointEnabled(true);
        cleanupEdit();
        setSelectedParentId(null);
        getMap()?.closePopup?.();
    }, [editingId, manualEditContext, cleanupEdit, getMap, setPolygons, setAreaName, setSelectedParentId, updatePolygon, restoreOverlapFromContext, setModal, setRenamingId, setSelectedPeriodId, originalCoordsRef]);

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
        }
    }, [contextType, editingId, cleanupEdit, setPolygons, setAllPolygons]);
    const startCreate = useCallback(() => {
        beginCreate();
        setIsHoveringSketchHandle(false);
        setCloseLoopMidpointEnabled(true);

        // pointer-down is more reliable than click, which some devices drop on tiny drags
        const map = getMap();
        if (!map) return;

        const mapAny = map as any;
        mapAny._sketchWasDoubleClickZoomEnabled = map.doubleClickZoom.enabled();
        if (mapAny._sketchWasDoubleClickZoomEnabled) map.doubleClickZoom.disable();

        const addPoint = (latlng: L.LatLng) => {
            const prev = drawingPointsRef.current;
            const fallback = prev.length > 0 ? prev[prev.length - 1] : undefined;
            const cursorTarget: [number, number] = [latlng.lat, latlng.lng];
            const rawTarget = clampPointToParentBoundary(cursorTarget, parentIdRef.current);
            const previewPoint = createPreviewPointRef.current;
            const buildCandidate = (pt: [number, number]) => [...prev, pt];
            const createPreviewValidator = (pt: [number, number]) => isPointAllowed(pt, null);

            const resolved = resolvePreviewPoint(rawTarget, previewPoint, buildCandidate, null, fallback ?? null, true, createPreviewValidator);
            if (!resolved) return;

            commitDrawingPoints([...prev, resolved]);
        };

        let pointerDown = false;
        let downX = 0;
        let downY = 0;
        let downOnVertex = false;
        let downTs = 0;
        let suppressNextClick = false;
        let lastPlacedTs = 0;
        let lastPlacedLat = Number.NaN;
        let lastPlacedLng = Number.NaN;
        const LONG_PRESS_MS = 260;

        const maybeAddPoint = (latlng: L.LatLng, ts?: number) => {
            if (isSketchClickSuppressed()) return;
            const canCursorInsert = drawingPointsRef.current.length < 3 || closeLoopMidpointEnabledRef.current;
            if (!canCursorInsert) return;
            if (isHoveringSketchHandleRef.current) return;

            const stamp = typeof ts === 'number' ? ts : Date.now();
            const sameSpot = Math.abs(latlng.lat - lastPlacedLat) < 1e-8 && Math.abs(latlng.lng - lastPlacedLng) < 1e-8;
            if (sameSpot && stamp - lastPlacedTs < 150) return;
            lastPlacedTs = stamp;
            lastPlacedLat = latlng.lat;
            lastPlacedLng = latlng.lng;
            addPoint(latlng);
        };

        const downHandler = (e: L.LeafletMouseEvent) => {
            const original = e.originalEvent as MouseEvent | undefined;
            const target = original?.target as HTMLElement | null;
            downOnVertex = !!target?.closest('.custom-vertex-icon, .custom-midpoint-icon');
            if (downOnVertex) {
                pointerDown = false;
                return;
            }
            pointerDown = true;
            suppressNextClick = false;
            downX = original?.clientX ?? 0;
            downY = original?.clientY ?? 0;
            downTs = original?.timeStamp ?? Date.now();
        };

        const upHandler = (e: L.LeafletMouseEvent) => {
            if (!pointerDown) return;
            pointerDown = false;
            if (downOnVertex) {
                downOnVertex = false;
                return;
            }

            const original = e.originalEvent as MouseEvent | undefined;
            const upX = original?.clientX ?? downX;
            const upY = original?.clientY ?? downY;
            const movedPx = Math.hypot(upX - downX, upY - downY);
            const upTs = original?.timeStamp ?? Date.now();
            const pressDuration = upTs - downTs;
            const isLongPress = pressDuration >= LONG_PRESS_MS;
            if (movedPx > 8 || isLongPress) {
                suppressNextClick = true;
                return;
            }

            maybeAddPoint(e.latlng, original?.timeStamp);
        };

        const clickHandler = (e: L.LeafletMouseEvent) => {
            if (suppressNextClick) {
                suppressNextClick = false;
                return;
            }
            if (isSketchClickSuppressed()) return;
            const original = e.originalEvent as MouseEvent | undefined;
            const target = original?.target as HTMLElement | null;
            if (target?.closest('.custom-vertex-icon, .custom-midpoint-icon')) return;
            maybeAddPoint(e.latlng, original?.timeStamp);
        };

        const computePreviewAt = (latlng: L.LatLng) => {
            const canCursorInsert = drawingPointsRef.current.length < 3 || closeLoopMidpointEnabledRef.current;
            if (!canCursorInsert || isHoveringSketchHandleRef.current) {
                setSnapPreview(null);
                setCreatePreviewPoint(null);
                return;
            }

            const anchorPoint = drawingPointsRef.current.length > 0
                ? drawingPointsRef.current[drawingPointsRef.current.length - 1]
                : null;
            const cursorTarget: [number, number] = [latlng.lat, latlng.lng];
            const target = clampPointToParentBoundary(cursorTarget, parentIdRef.current);
            const previousPreview = createPreviewPointRef.current;
            const buildCandidate = (pt: [number, number]) => [...drawingPointsRef.current, pt];
            const createPreviewValidator = (pt: [number, number]) => isPointAllowed(pt, null);

            const resolved = resolvePreviewPoint(target, previousPreview, buildCandidate, null, anchorPoint, true, createPreviewValidator);
            if (!resolved) {
                setSnapPreview(null);
                setCreatePreviewPoint(null);
                return;
            }

            if (previousPreview && pointDistanceSq(previousPreview, resolved) < 1e-16) return;

            const previewLatLng = L.latLng(resolved[0], resolved[1]);
            setSnapPreview(previewLatLng);
            setCreatePreviewPoint(resolved);
        };

        let moveRaf: number | null = null;
        let pendingMoveLatLng: L.LatLng | null = null;

        const moveHandler = (e: L.LeafletMouseEvent) => {
            lastPreviewCursorRef.current = e.latlng;
            pendingMoveLatLng = e.latlng;
            if (moveRaf !== null) return;
            moveRaf = window.requestAnimationFrame(() => {
                moveRaf = null;
                const ll = pendingMoveLatLng;
                pendingMoveLatLng = null;
                if (!ll) return;
                computePreviewAt(ll);
            });
        };

        map.on('mousedown', downHandler);
        map.on('mouseup', upHandler);
        map.on('click', clickHandler);
        map.on('mousemove', moveHandler);

        const cancelMoveRaf = () => {
            if (moveRaf !== null) {
                window.cancelAnimationFrame(moveRaf);
                moveRaf = null;
            }
            pendingMoveLatLng = null;
        };

        // stored for cleanup
        (map as any)._sketchDownHandler = downHandler;
        (map as any)._sketchUpHandler = upHandler;
        (map as any)._sketchClickHandler = clickHandler;
        (map as any)._sketchMoveHandler = moveHandler;
        (map as any)._sketchCancelMoveRaf = cancelMoveRaf;
    }, [beginCreate, clampPointToParentBoundary, commitDrawingPoints, getMap, isPointAllowed, pointDistanceSq, resolvePreviewPoint]);

    const cancelCreate = useCallback((options?: { preserveSelectedParent?: boolean }) => {
        const map = getMap();
        if (map) {
            if ((map as any)._sketchDownHandler) map.off('mousedown', (map as any)._sketchDownHandler);
            if ((map as any)._sketchUpHandler) map.off('mouseup', (map as any)._sketchUpHandler);
            if ((map as any)._sketchClickHandler) map.off('click', (map as any)._sketchClickHandler);
            if ((map as any)._sketchMoveHandler) map.off('mousemove', (map as any)._sketchMoveHandler);
            if ((map as any)._sketchCancelMoveRaf) (map as any)._sketchCancelMoveRaf();
            delete (map as any)._sketchDownHandler;
            delete (map as any)._sketchUpHandler;
            delete (map as any)._sketchClickHandler;
            delete (map as any)._sketchMoveHandler;
            delete (map as any)._sketchCancelMoveRaf;

            const mapAny = map as any;
            if (mapAny._sketchWasDoubleClickZoomEnabled) map.doubleClickZoom.enable();
            delete mapAny._sketchWasDoubleClickZoomEnabled;

            setSnapPreview(null);
        }
        goIdle();
        suppressSketchClickUntilRef.current = 0;
        setIsHoveringSketchHandle(false);
        clearGhostRef.current();
        setCloseLoopMidpointEnabled(true);
        if (!options?.preserveSelectedParent) {
            setSelectedParentId(null);
        }
        setAreaName("");
        if (createdLayerRef.current) map?.removeLayer(createdLayerRef.current);
        createdLayerRef.current = null;
        createHandlerRef.current = null;
    }, [getMap, goIdle, setAreaName, setSelectedParentId, setSnapPreview]);

    const finishCreate = useCallback((handleCreated: (e: any) => void) => {
        const coords = drawingPointsRef.current;
        if (coords.length < 3) {
            cancelCreate();
            return;
        }
        const map = getMap();
        if (!map) return;

        // commit the displayed ghost, recompute only as fallback
        const displayedGhost = ghostCoordsRef.current;
        const snapped =
            (autoCorrectEnabledRef.current && !isHoveringSketchHandleRef.current && displayedGhost.length >= 3)
                ? displayedGhost
                : (updateGhostRef.current(coords, parentIdRef.current, [], {
                    edgeSnap: false,
                    autoCorrect: autoCorrectEnabledRef.current,
                }) || coords);
        handleCreated({ layer: L.polygon(snapped) });

        cancelCreate({ preserveSelectedParent: true });
    }, [cancelCreate, getMap]);

    const removeLastSketchPoint = useCallback(() => {
        if (!isCreating && !editingId) return;
        const prev = drawingPointsRef.current;
        let next = prev;
        if (isCreating) next = prev.slice(0, -1);
        else if (prev.length > 3) next = prev.slice(0, -1);
        if (next !== prev) commitDrawingPoints(next);
        setIsHoveringSketchHandle(false);
        if (isCreating) {
            setCreatePointCount(prev => Math.max(0, prev - 1));
        }
    }, [commitDrawingPoints, isCreating, editingId]);

    const removeSketchPoint = useCallback((index: number) => {
        if (!isCreating && !editingId) return;

        const prev = drawingPointsRef.current;
        if (index < 0 || index >= prev.length) return;
        if (editingId && prev.length <= 3) return;

        const next = prev.filter((_, i) => i !== index);
        commitDrawingPoints(next);
        setIsHoveringSketchHandle(false);
        if (isCreating) {
            setCreatePointCount(next.length);
        }
    }, [commitDrawingPoints, isCreating, editingId]);

    return {
        editingId, setEditingId,
        isCreating, setIsCreating,
        createPointCount, setCreatePointCount,
        drawingPoints,
        ghostCoords,
        createPreviewPoint,
        autoCorrectEnabled, setAutoCorrectEnabled,
        edgeSnapEnabled,
        closeLoopMidpointEnabled, setCloseLoopMidpointEnabled,
        setIsHoveringSketchHandle,
        suppressSketchClickTemporarily,
        constrainSketchPoint,
        moveSketchPoint, insertSketchPoint,
        sketchInsertPreview, previewSketchInsertion, clearSketchInsertPreview,
        removeLastSketchPoint, removeSketchPoint,
        startCreate, cancelCreate, finishCreate,
        overlapWarning, setOverlapWarning,
        showPreview, setShowPreview,
        pendingManualEditId, setPendingManualEditId,
        manualEditContext, setManualEditContext,
        previewVisibility, setPreviewVisibility,
        createdLayerRef, createHandlerRef,
        detectOverlaps, updatePolygon, cleanupEdit, startEdit, finishEdit, cancelEdit, deletePolygon,
    };
}
