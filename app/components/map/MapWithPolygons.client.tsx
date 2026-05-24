import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

// class helpers need to be null-safe because leaflet's drag path passes targets without a className
if (typeof window !== "undefined" && !(window as any).__leafletPatched) {
    (window as any).__leafletPatched = true;
    const isClassable = (el: any) => el && (typeof el.className !== "undefined" || typeof el.classList !== "undefined");
    const origAdd = L.DomUtil.addClass;
    const origRemove = L.DomUtil.removeClass;
    const origHas = L.DomUtil.hasClass;
    L.DomUtil.addClass = function (el: HTMLElement, name: string) {
        if (!isClassable(el)) return;
        return origAdd.call(this, el, name);
    };
    L.DomUtil.removeClass = function (el: HTMLElement, name: string) {
        if (!isClassable(el)) return;
        return origRemove.call(this, el, name);
    };
    L.DomUtil.hasClass = function (el: HTMLElement, name: string) {
        if (!isClassable(el)) return false;
        return origHas.call(this, el, name);
    };
}

import { useFarm } from "~/contexts/FarmContext";
import { useAuth } from "~/contexts/AuthContext";
import { apiPut, apiPatch } from "~/utils/api";

// components
import MapLayerManager from "./components/MapLayerManager";
import MapToolbar from "./components/MapToolbar";
import MapSidebar from "./components/MapSidebar";
import MapModals from "./components/MapModals";
import OperationPopup from "./components/OperationPopup";
import PolygonContextMenu from "./components/PolygonContextMenu";
import MapSearchFilters from "./components/MapSearchFilters";

// hooks
import { useParcelOperations } from "./hooks/useParcelOperations";
import { useParcelSearch } from "./hooks/useParcelSearch";
import { usePolygonEditor } from "./hooks/usePolygonEditor";
import { useMapSharing } from "./hooks/useMapSharing";
import { useDraggablePopup } from "./hooks/useDraggablePopup";
import { useMapSidebarControls } from "./hooks/useMapSidebarControls";
import { useMapApiActions } from "./hooks/useMapApiActions";
import { useOverlapCoordination } from "./hooks/useOverlapCoordination";
import { useSnappyEditing } from "./hooks/useSnappyEditing";
import { useUserPreferences } from "./hooks/useUserPreferences";
import { useParcelData } from "./hooks/useParcelData";
import { useFamilyScope } from "./hooks/useFamilyScope";
import { useMapKeyboard } from "./hooks/useMapKeyboard";
import { useMobileMatch } from "./hooks/useMobileMatch";

import "./styles/MapLayout.css";

import type {
    PolygonData, MapContextType, MapWithPolygonsProps,
    PeriodDto, ParcelSearchFilters
} from "./types";

if (typeof window !== "undefined") {
    (window as any).type = (window as any).type || undefined;
}

// hoisted so the reference stays stable across renders and MapLayerManager's memo can hit
const DRAW_OPTIONS = { polygon: { allowIntersection: false, showArea: true, metric: true, shapeOptions: { color: '#3388ff' } }, rectangle: false, circle: false, circlemarker: false, marker: false, polyline: false } as const;
const MAP_CENTER: [number, number] = [50.668333, 4.621278];

export default function MapWithPolygons(props: MapWithPolygonsProps) {
    const { t } = useTranslation();
    const { selectedFarm } = useFarm();
    const { user } = useAuth();

    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => { setIsMounted(true); }, []);

    const center = MAP_CENTER;
    const POPUP_WIDTH = 420;
    const POPUP_HEIGHT = 520;
    const POPUP_PADDING = 12;

    const resolvedContextId = props.contextId ?? props.farm_id;
    if (!resolvedContextId) throw new Error("MapWithPolygons requires contextId or farm_id");

    const contextType: MapContextType = props.contextType ?? 'farm';
    const allowCreate = props.allowCreate ?? true;
    const isImportMode = props.importMode ?? (contextType === 'import');
    const basePath = isImportMode ? `/imports/${resolvedContextId}` : `/farm/${resolvedContextId}`;
    const parcelsEndpoint = `${basePath}/parcels`;

    const defaultSearchFilters = useMemo<ParcelSearchFilters>(() => {
        if (props.initialSharePayload) {
            return {
                periodIds: props.initialSharePayload.periodIds?.map(String) || [],
                toolIds: props.initialSharePayload.toolIds?.map(String) || [],
                productIds: props.initialSharePayload.productIds?.map(String) || [],
                startDate: props.initialSharePayload.filterStartDate || '',
                endDate: props.initialSharePayload.filterEndDate || '',
                useMapArea: false,
                usePolygon: !!props.initialSharePayload.zoneWkt,
            };
        }
        return {
            periodIds: [], toolIds: [], productIds: [], startDate: '', endDate: '', useMapArea: false, usePolygon: false,
        };
    }, [props.initialSharePayload]);

    // states
    const [polygons, setPolygons] = useState<PolygonData[]>([]);
    const [allPolygons, setAllPolygons] = useState<PolygonData[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [renamePeriodId, setRenamePeriodId] = useState<string>("");
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [modal, setModal] = useState<{ open: boolean; coords: [number, number][] | null }>({ open: false, coords: null });
    const [areaName, setAreaName] = useState("");
    const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [polygonContextMenu, setPolygonContextMenu] = useState<{
        x: number;
        y: number;
        polygonId: string;
        mapRect?: { left: number; top: number; right: number; bottom: number };
    } | null>(null);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [periods, setPeriods] = useState<PeriodDto[]>([]);
    const [isApproving, setIsApproving] = useState(false);
    const [approveFeedback, setApproveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
    const [highlightLastPoint, setHighlightLastPoint] = useState(false);
    const isMobile = useMobileMatch();

    const prefs = useUserPreferences(user);
    const { preferTopRight, setPreferTopRight, minLayer, setMinLayer, maxLayer, setMaxLayer } = prefs;

    // refs
    const originalColorRef = useRef<string | null>(null);
    const listBarRef = useRef<HTMLDivElement>(null);
    const polygonLayersRef = useRef<Map<string, L.Polygon>>(new Map());
    const viewportDebounceRef = useRef<number | null>(null);
    const featureGroupRef = useRef<L.FeatureGroup>(null);
    const editControlRef = useRef<any>(null);
    const areaNameRef = useRef<string>("");
    const renameValueRef = useRef<string>("");

    // sync states to refs
    useEffect(() => { areaNameRef.current = areaName; }, [areaName]);
    useEffect(() => { renameValueRef.current = renameValue; }, [renameValue]);

    const getMap = useCallback(() => (featureGroupRef.current as any)?._map || (featureGroupRef.current as any)?.getMap?.(), []);

    const { updateGhost, clearGhost, setSnapPreview } = useSnappyEditing({ polygons, getMap });

    // init hooks
    const editor = usePolygonEditor({
        polygons, setPolygons, setAllPolygons, parcelsEndpoint, contextType, getMap, t, areaName, setAreaName, setModal, setRenamingId, setSelectedPeriodId, setRenameValue, setRenamePeriodId,
        selectedParentId, setSelectedParentId, updateGhost, clearGhost, setSnapPreview
    });
    const search = useParcelSearch({ parcelsEndpoint, contextType, isImportMode, getMap, defaultSearchFilters, initialSharePayload: props.initialSharePayload });
    const operations = useParcelOperations({ farmId: Number(props.farm_id), resolvedContextId, contextType, canEditPolygon: (id: string) => (polygons.find(p => p.id === id) || allPolygons.find(p => p.id === id))?.canEdit !== false, t });
    const sharing = useMapSharing({ resolvedContextId, contextType, allPolygons, searchDraft: search.searchDraft, searchAreaCoords: search.searchAreaCoords, viewportBounds: search.viewportBounds });
    const draggable = useDraggablePopup({ getMap, preferTopRight, POPUP_WIDTH, POPUP_HEIGHT, POPUP_PADDING, isMobile, activePopup: operations.operationPopup });
    const sidebarControl = useMapSidebarControls({ polygons, allPolygons, isImportMode });

    const apiActions = useMapApiActions({
        parcelsEndpoint, contextType, resolvedContextId, selectedFarmId: selectedFarm?.id, setPolygons, setAllPolygons, setPeriods, setApproveFeedback, setIsApproving, t,
        masterCleanup: () => masterCleanup(), canEditPolygon: (id) => (polygons.find(p => p.id === id) || allPolygons.find(p => p.id === id))?.canEdit !== false,
        renamingId, setRenamingId, renameValue, renameValueRef, renamePeriodId, setRenamePeriodId, overlapWarning: editor.overlapWarning, setOverlapWarning: editor.setOverlapWarning, finishEdit: (force) => editor.finishEdit(force)
    });

    const coordination = useOverlapCoordination({
        parcelsEndpoint, polygons, setPolygons, setAllPolygons, overlapWarning: editor.overlapWarning, setOverlapWarning: editor.setOverlapWarning, modal, setModal, areaName, areaNameRef, renameValueRef, selectedPeriodId, renameValue, renamePeriodId,
        showPreview: editor.showPreview, setShowPreview: editor.setShowPreview, setPendingManualEditId: editor.setPendingManualEditId, setManualEditContext: editor.setManualEditContext, setRenamingId,
        masterCleanup: () => masterCleanup(), detachCreatedLayer: () => detachCreatedLayer(), getMap, detectOverlaps: editor.detectOverlaps, updatePolygon: editor.updatePolygon, startEditSimple: (id, coords) => startEditSimple(id, coords),
        createHandlerRef: editor.createHandlerRef, createdLayerRef: editor.createdLayerRef, setIsCreating: editor.setIsCreating,
        contextType, resolvedContextId, selectedParentId, setSelectedParentId, setAreaName, autoCorrectEnabled: editor.autoCorrectEnabled, t
    });

    // grab hook stuff
    const {
        editingId, isCreating, createPointCount, setCreatePointCount,
        overlapWarning, showPreview, setShowPreview, pendingManualEditId,
        previewVisibility, setPreviewVisibility, createHandlerRef, createdLayerRef
    } = editor;
    const { isSearchOpen, setIsSearchOpen, searchDraft, setSearchDraft, searchAreaCoords, isSearchDrawing, viewportBounds, setViewportBounds, hasActiveSearchFilters, searchEndpoint, viewportEndpoint, applySearchFilters, clearSearchFilters, startSearchPolygon, cancelSearchPolygon, clearSearchPolygon, handleSearchCreated } = search;
    const { operationTypes, units, products, tools, operationTypeId, setOperationTypeId, operationDate, setOperationDate, operationDurationMinutes, setOperationDurationMinutes, operationLines, handleAddOperationLine, handleRemoveOperationLine, updateOperationLine, operationError, operationLoading, parcelOperations, currentParcelId, setCurrentParcelId, operationPopup, setOperationPopup, operationsPage, setOperationsPage, operationsTotalPages, loadOperationReferences, loadParcelOperations, handleSaveOperation, resetOperationForm, closeOperationPopup } = operations;
    const { shareParcelId, setShareParcelId, shareList, shareError, shareLoading, openShareModal, closeShareModal, handleUpdateShare, handleRemoveShare } = sharing;
    const { isListCollapsed, setIsListCollapsed, listFilter, setListFilter, showFilterMenu, setShowFilterMenu, searchQuery, setSearchQuery, filterOptions, activeFilterLabel, filteredPolygons } = sidebarControl;
    const { loadPeriods, handleApproveAll, approveSingleParcel, handleRenameConfirm, togglePolygonVisibility, renamePolygonInline } = apiActions;
    const { confirmCreate, handleCreated } = coordination;

    // route the search-area polygon ourselves so it doesn't open the naming modal
    const isSearchDrawingRef = useRef(isSearchDrawing);
    useEffect(() => { isSearchDrawingRef.current = isSearchDrawing; }, [isSearchDrawing]);
    const handleAnyCreated = useCallback((e: any) => {
        if (isSearchDrawingRef.current) {
            handleSearchCreated(e.layer);
            return;
        }
        handleCreated(e);
    }, [handleCreated, handleSearchCreated]);

    // close the filter so it doesn't cover the toolbar
    const handleStartCreate = useCallback((parentId: string | null) => {
        setSelectedParentId(parentId);
        setIsSearchOpen(false);
        editor.startCreate();
    }, [editor, setIsSearchOpen]);

    // helpers
    const detachCreatedLayer = useCallback(() => {
        const layer = createdLayerRef.current;
        const fg = featureGroupRef.current;
        if (layer && fg) fg.removeLayer(layer);
        createdLayerRef.current = null;
    }, [createdLayerRef]);

    const cancelModal = useCallback(() => {
        if (createdLayerRef.current) getMap()?.removeLayer(createdLayerRef.current);
        createdLayerRef.current = null;
        setModal({ open: false, coords: null });
        setAreaName("");
        setSelectedPeriodId("");
        setSelectedParentId(null);
    }, [getMap, createdLayerRef, setSelectedParentId]);

    const onDeleteLastVertex = useCallback(() => {
        editor.removeLastSketchPoint();
    }, [editor]);

    const focusPolygon = useCallback(async (id: string) => {
        const map = getMap();
        if (!map) return;
        const polygon = polygons.find(p => p.id === id) || allPolygons.find(p => p.id === id);
        if (!polygon || !polygon.coords.length) return;
        setPolygons(prev => prev.map(p => p.id === id ? { ...p, visible: true } : p));
        setSelectedId(id);
        const bounds = L.latLngBounds(polygon.coords.map(([lat, lng]) => [lat, lng] as [number, number]));
        if (bounds.isValid()) map.flyToBounds(bounds, { maxZoom: 18, padding: [80, 80] });
        else map.flyTo(polygon.coords[0], 17);
    }, [allPolygons, polygons, getMap]);

    const deletePolygonSimple = useCallback(async (id: string) => {
        const canEdit = (polygons.find(p => p.id === id) || allPolygons.find(p => p.id === id))?.canEdit !== false;
        await editor.deletePolygon(id, canEdit);
    }, [polygons, allPolygons, editor]);

    const startEditSimple = useCallback((id: string, coords?: [number, number][]) => {
        const canEdit = (polygons.find(p => p.id === id) || allPolygons.find(p => p.id === id))?.canEdit !== false;
        editor.startEdit(id, canEdit, coords);
    }, [polygons, allPolygons, editor]);

    const masterCleanup = useCallback(() => {
        detachCreatedLayer();
        editor.cleanupEdit();
        if (editControlRef.current) {
            const h = (editControlRef.current as any)._tool;
            if (h?.disable) h.disable();
        }
        editor.setIsCreating(false);
        editor.setCreatePointCount(0);
        const map = getMap();
        if (map) map.eachLayer((l: any) => { if (l._isDrawingLayer || l._isMarker || l.options?.className?.includes('leaflet-draw')) map.removeLayer(l); });
    }, [getMap, editor, detachCreatedLayer]);

    const reattachCreatedLayer = useCallback(() => {
        const layer = createdLayerRef.current;
        const map = getMap();
        if (layer && map && !map.hasLayer?.(layer)) map.addLayer(layer);
    }, [getMap, createdLayerRef]);

    const closePolygonContextMenu = useCallback(() => {
        setPolygonContextMenu(null); setPendingDeleteId(null); setShowColorPicker(false); originalColorRef.current = null;
    }, []);

    const canSharePolygon = useCallback((id: string) => (polygons.find(p => p.id === id) || allPolygons.find(p => p.id === id))?.canShare === true, [allPolygons, polygons]);

    useParcelData({
        contextType, isImportMode, resolvedContextId,
        hasActiveSearchFilters, viewportEndpoint, searchEndpoint,
        setPolygons, setAllPolygons, t,
    });

    const { familyRootId, restrictToFamily, setRestrictToFamily } = useFamilyScope({
        polygons, isCreating, selectedParentId, editingId,
        minLayer, maxLayer, setMinLayer, setMaxLayer,
        layerOverrideRef: prefs.layerOverrideRef,
    });

    useEffect(() => { loadOperationReferences(); loadPeriods(); }, [loadOperationReferences, loadPeriods]);

    useEffect(() => {
        if (!isCreating) return;
        setCreatePointCount(editor.drawingPoints.length);
    }, [isCreating, editor.drawingPoints.length, setCreatePointCount]);

    useEffect(() => { if (!showPreview && overlapWarning?.isNewPolygon) reattachCreatedLayer(); }, [showPreview, overlapWarning, reattachCreatedLayer]);

    // close the filter when edit/create starts from somewhere else
    useEffect(() => {
        if (isCreating || editingId) setIsSearchOpen(false);
    }, [isCreating, editingId, setIsSearchOpen]);

    useMapKeyboard({
        isCreating, editingId, renamingId, pendingDeleteId, createPointCount,
        overlapWarning, selectedId, polygons, allPolygons,
        setOverlapWarning: editor.setOverlapWarning, setShowPreview,
        setRenamingId, setRenameValue, setPendingDeleteId, setContextMenu,
        closePolygonContextMenu,
        cancelCreate: editor.cancelCreate, cancelEdit: editor.cancelEdit,
        finishCreate: () => editor.finishCreate(handleCreated), finishEdit: () => editor.finishEdit(),
        removeLastSketchPoint: editor.removeLastSketchPoint,
        deletePolygonSimple,
    });

    useEffect(() => {
        if (!pendingManualEditId) return;
        if (polygons.some(p => p.id === pendingManualEditId)) {
            startEditSimple(pendingManualEditId);
            editor.setPendingManualEditId(null);
        }
    }, [pendingManualEditId, polygons, startEditSimple, editor]);

    if (!isMounted) return null;

    return (
        <div className="relative h-full w-full">
            {allowCreate && contextMenu && (
                <div className="fixed z-[10000] min-w-[14rem] rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-2xl backdrop-blur" style={{ left: contextMenu.x, top: contextMenu.y }}>
                    <button type="button" onClick={() => { setContextMenu(null); handleStartCreate(null); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-slate-100">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">+</span>
                        {t('map.contextMenu.addPolygon')}
                    </button>
                </div>
            )}

            {polygonContextMenu && (
                <PolygonContextMenu
                    polygonContextMenu={polygonContextMenu} polygons={polygons} t={t} isImportMode={isImportMode} showColorPicker={showColorPicker} setShowColorPicker={setShowColorPicker}
                    canEditPolygon={(id) => (polygons.find(p => p.id === id) || allPolygons.find(p => p.id === id))?.canEdit !== false}
                    closePolygonContextMenu={closePolygonContextMenu} setRenamingId={setRenamingId} setRenameValue={setRenameValue} setRenamePeriodId={setRenamePeriodId} contextType={contextType} setSelectedId={setSelectedId} setCurrentParcelId={setCurrentParcelId} loadParcelOperations={loadParcelOperations} setOperationPopup={setOperationPopup} canSharePolygon={canSharePolygon} openShareModal={openShareModal} startEdit={startEditSimple} approveSingleParcel={approveSingleParcel}
                    handleColorSelect={async (c) => {
                        const pid = polygonContextMenu.polygonId;
                        const target = polygons.find(p => p.id === pid) || allPolygons.find(p => p.id === pid);
                        if (!target || target.canEdit === false) return;
                        setPolygons(prev => prev.map(p => p.id === pid ? { ...p, color: c, version: (p.version || 0) + 1 } : p));
                        setAllPolygons(prev => prev.map(p => p.id === pid ? { ...p, color: c, version: (p.version || 0) + 1 } : p));
                        if (pid.startsWith('poly-')) return;
                        try {
                            let res;
                            if (isImportMode) {
                                res = await apiPatch(`/imports/parcels/${pid}`, { color: c });
                            } else {
                                const periodIdNum = target.periodId ? Number(target.periodId) : null;
                                const payload: any = {
                                    color: c,
                                    name: (target.name || t('map.defaultPolygonName')).trim() || t('map.defaultPolygonName'),
                                    periodId: (periodIdNum && periodIdNum > 0) ? periodIdNum : null,
                                    active: true,
                                    startValidity: new Date().toISOString(),
                                    endValidity: null,
                                };
                                if (contextType === 'farm') payload.farmId = Number(resolvedContextId);
                                res = await apiPut(`${parcelsEndpoint}/${pid}`, payload);
                            }
                            if (!res.ok) console.error("Failed to update parcel color on server:", res.status, res.statusText);
                        } catch (err) {
                            console.error("Failed to update parcel color:", err);
                        }
                    }} handleColorHover={() => { }} handleColorLeave={() => { }} pendingDeleteId={pendingDeleteId} setPendingDeleteId={setPendingDeleteId} deletePolygon={deletePolygonSimple}
                    addChild={(parentId) => handleStartCreate(parentId)}
                    selectParent={(childId) => {
                        const child = polygons.find(p => String(p.id) === String(childId));
                        if (child?.parentId) {
                            const pId = String(child.parentId);
                            setSelectedId(pId);
                            const parentLayer = polygonLayersRef.current.get(pId);
                            if (parentLayer) {
                                const map = getMap();
                                if (map) map.fitBounds(parentLayer.getBounds(), { padding: [50, 50] });
                            }
                        }
                    }}
                />
            )}

            {(() => {
                if (!pendingDeleteId || polygonContextMenu) return null;
                const children = polygons.filter(p => String(p.parentId) === String(pendingDeleteId));
                if (children.length > 0) {
                    return (
                        <div className="absolute left-1/2 top-4 z-[10000] flex flex-col -translate-x-1/2 items-center gap-4 rounded-3xl bg-rose-500/95 px-6 py-4 text-white shadow-2xl backdrop-blur">
                            <span className="text-sm font-semibold">
                                {t('map.deletePromptChildren', { name: polygons.find(p => p.id === pendingDeleteId)?.name ?? '', count: children.length })}
                            </span>
                            <div className="flex gap-2">
                                <button type="button" onClick={async () => {
                                    for (const child of children) {
                                        await apiPatch(`${parcelsEndpoint}/${child.id}`, { parentParcelId: null });
                                        setPolygons(prev => prev.map(p => p.id === child.id ? { ...p, parentId: null } : p));
                                        setAllPolygons(prev => prev.map(p => p.id === child.id ? { ...p, parentId: null } : p));
                                    }
                                    deletePolygonSimple(pendingDeleteId);
                                    setPendingDeleteId(null);
                                }} className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-rose-600"> {t('map.orphanChildren', 'Make Orphans')} </button>
                                <button type="button" onClick={async () => {
                                    for (const child of children) { await deletePolygonSimple(child.id); }
                                    deletePolygonSimple(pendingDeleteId);
                                    setPendingDeleteId(null);
                                }} className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-rose-600"> {t('map.deleteChildrenToo', 'Delete All')} </button>
                                <button type="button" onClick={() => setPendingDeleteId(null)} className="rounded-2xl border border-white/60 px-4 py-2 text-sm font-semibold text-white"> {t('common.cancel')} </button>
                            </div>
                        </div>
                    );
                }
                return (
                    <div className="absolute left-1/2 top-4 z-[10000] flex -translate-x-1/2 items-center gap-4 rounded-3xl bg-rose-500/95 px-6 py-4 text-white shadow-2xl backdrop-blur">
                        <span className="text-sm font-semibold">{t('map.deletePrompt', { name: polygons.find(p => p.id === pendingDeleteId)?.name ?? '' })}</span>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => { deletePolygonSimple(pendingDeleteId); setPendingDeleteId(null); }} className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-rose-600"> {t('common.confirm')} </button>
                            <button type="button" onClick={() => setPendingDeleteId(null)} className="rounded-2xl border border-white/60 px-4 py-2 text-sm font-semibold text-white"> {t('common.cancel')} </button>
                        </div>
                    </div>
                );
            })()}

            {operationPopup && (
                <OperationPopup
                    operationPopup={operationPopup} popupCoords={draggable.popupCoords} isMobile={isMobile} startDrag={draggable.startDrag} polygons={polygons} t={t} preferTopRight={preferTopRight} setPreferTopRight={setPreferTopRight} closeOperationPopup={closeOperationPopup} operationError={operationError} operationLoading={operationLoading}
                    canEditPolygon={(id) => (polygons.find(p => p.id === id) || allPolygons.find(p => p.id === id))?.canEdit !== false}
                    currentParcelId={currentParcelId} operationTypeId={operationTypeId} setOperationTypeId={setOperationTypeId} operationTypes={operationTypes} operationDate={operationDate} setOperationDate={setOperationDate} operationDurationMinutes={operationDurationMinutes} setOperationDurationMinutes={setOperationDurationMinutes} handleAddOperationLine={handleAddOperationLine} operationLines={operationLines} handleRemoveOperationLine={handleRemoveOperationLine} updateOperationLine={updateOperationLine} units={units} products={products} tools={tools} handleSaveOperation={handleSaveOperation} resetOperationForm={resetOperationForm} parcelOperations={parcelOperations}
                    operationsPage={operationsPage} setOperationsPage={setOperationsPage} operationsTotalPages={operationsTotalPages} loadParcelOperations={loadParcelOperations}
                />
            )}

            <MapModals
                t={t} renamingId={renamingId} setRenamingId={setRenamingId} renameValue={renameValue} setRenameValue={setRenameValue} renamePeriodId={renamePeriodId} setRenamePeriodId={setRenamePeriodId} handleRenameConfirm={handleRenameConfirm} periods={periods}
                isAreaModalOpen={modal.open} areaName={areaName} setAreaName={setAreaName} selectedPeriodId={selectedPeriodId} setSelectedPeriodId={setSelectedPeriodId} handleAreaConfirm={confirmCreate} handleAreaCancel={cancelModal}
                sharing={sharing} currentUsername={user?.username} allPolygons={allPolygons} tools={tools} products={products}
            />

            <div className="flex h-full w-full min-h-0 relative">
                <div className="absolute top-6 left-6 z-[1000] pointer-events-none flex justify-start w-full gap-4">
                    <MapSidebar
                        isListCollapsed={isListCollapsed} setIsListCollapsed={setIsListCollapsed} listBarRef={listBarRef} t={t} filteredPolygons={filteredPolygons} searchQuery={searchQuery} setSearchQuery={setSearchQuery} showFilterMenu={showFilterMenu} setShowFilterMenu={setShowFilterMenu} activeFilterLabel={activeFilterLabel} filterOptions={filterOptions} listFilter={listFilter} setListFilter={setListFilter}
                        handleApproveAll={handleApproveAll} approveLabel={props.approveLabel} isApproving={isApproving} approveFeedback={approveFeedback}
                        togglePolygonVisibility={togglePolygonVisibility} renamePolygonInline={renamePolygonInline} focusPolygon={focusPolygon} isImportMode={isImportMode} approveSingleParcel={approveSingleParcel} allPolygons={allPolygons} onApproveAll={props.onApproveAll}
                    />
                </div>

                <div data-tour-id="map-canvas" className="h-full w-full min-h-0">
                    <MapLayerManager
                        center={center} polygons={polygons} editingId={editingId} selectedId={selectedId} setSelectedId={setSelectedId} isCreating={isCreating} drawOptions={DRAW_OPTIONS} handleCreated={handleAnyCreated} overlapWarning={overlapWarning} showPreview={showPreview} previewVisibility={previewVisibility} pendingManualEditId={pendingManualEditId}
                        featureGroupRef={featureGroupRef as any} editControlRef={editControlRef} polygonLayersRef={polygonLayersRef} setPolygonContextMenu={setPolygonContextMenu} setRenamingId={setRenamingId} setRenameValue={setRenameValue} setPendingDeleteId={setPendingDeleteId} setContextMenu={setContextMenu} closePolygonContextMenu={closePolygonContextMenu} viewportDebounceRef={viewportDebounceRef} setViewportBounds={setViewportBounds} hasActiveSearchFilters={hasActiveSearchFilters} isImportMode={isImportMode} contextType={contextType}
                        drawingPoints={editor.drawingPoints}
                        ghostCoords={editor.ghostCoords}
                        createPreviewPoint={editor.createPreviewPoint}
                        autoCorrectEnabled={editor.autoCorrectEnabled}
                        setIsHoveringSketchHandle={editor.setIsHoveringSketchHandle}
                        suppressSketchClickTemporarily={editor.suppressSketchClickTemporarily}
                        moveSketchPoint={editor.moveSketchPoint}
                        insertSketchPoint={editor.insertSketchPoint}
                        sketchInsertPreview={editor.sketchInsertPreview}
                        previewSketchInsertion={editor.previewSketchInsertion}
                        clearSketchInsertPreview={editor.clearSketchInsertPreview}
                        removeSketchPoint={editor.removeSketchPoint}
                        minLayer={minLayer}
                        maxLayer={maxLayer}
                        restrictToFamilyId={restrictToFamily ? familyRootId : null}
                        highlightLastPoint={highlightLastPoint}
                    />
                </div>

                <div data-tour-id="map-toolbar" className="pointer-events-auto absolute top-4 right-4 z-[1200] flex flex-col items-end gap-2">
                    <MapSearchFilters
                        isSearchOpen={isSearchOpen}
                        isImportMode={isImportMode}
                        onClose={() => setIsSearchOpen(false)}
                        searchDraft={searchDraft}
                        setSearchDraft={setSearchDraft}
                        tools={tools}
                        products={products}
                        periods={periods}
                        operationTypes={operationTypes}
                        searchAreaCoords={searchAreaCoords}
                        isSearchDrawing={isSearchDrawing}
                        startSearchPolygon={() => startSearchPolygon(isCreating, editingId)}
                        cancelSearchPolygon={cancelSearchPolygon}
                        clearSearchPolygon={clearSearchPolygon}
                        clearSearchFilters={clearSearchFilters}
                        applySearchFilters={applySearchFilters}
                        hasActiveSearchFilters={hasActiveSearchFilters}
                        disabled={isCreating || !!editingId}
                        t={t}
                    />
                    {!isSearchOpen && (
                        <MapToolbar
                            showPreview={showPreview} setShowPreview={setShowPreview} overlapWarning={overlapWarning} setPreviewVisibility={setPreviewVisibility} previewVisibility={previewVisibility} allowCreate={allowCreate} editingId={editingId} isCreating={isCreating} createPointCount={createPointCount}
                            startCreate={() => handleStartCreate(null)} finishCreate={() => editor.finishCreate(handleCreated)} cancelCreate={() => editor.cancelCreate()} finishEdit={() => editor.finishEdit()} cancelEdit={() => editor.cancelEdit()} setIsSearchOpen={setIsSearchOpen} hasActiveSearchFilters={hasActiveSearchFilters} onDeleteLastVertex={onDeleteLastVertex} t={t}
                            autoCorrectEnabled={editor.autoCorrectEnabled}
                            toggleAutoCorrect={() => editor.setAutoCorrectEnabled(!editor.autoCorrectEnabled)}
                            closeLoopMidpointEnabled={editor.closeLoopMidpointEnabled}
                            toggleCloseLoopMidpoint={() => editor.setCloseLoopMidpointEnabled(!editor.closeLoopMidpointEnabled)}
                            minLayer={minLayer}
                            setMinLayer={setMinLayer}
                            maxLayer={maxLayer}
                            setMaxLayer={setMaxLayer}
                            familyScopeAvailable={!!familyRootId}
                            restrictToFamily={restrictToFamily}
                            setRestrictToFamily={setRestrictToFamily}
                            onRemoveLastHover={setHighlightLastPoint}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
