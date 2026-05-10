import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

import { useFarm } from "~/contexts/FarmContext";
import { useAuth } from "~/contexts/AuthContext";
import { apiGet, apiPut } from "~/utils/api";

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

import "./styles/MapLayout.css";

import type { 
    OverlapWarning, PolygonData, MapContextType, MapWithPolygonsProps,
    PeriodDto, ParcelSearchFilters
} from "./types";
import { parseWktCoords, clampToViewport } from "./utils/mapUtils";

const normalizeParentId = (value: unknown): string | null => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? String(n) : null;
};

if (typeof window !== "undefined") {
    (window as any).type = (window as any).type || undefined;
}

export default function MapWithPolygons(props: MapWithPolygonsProps) {
    const { t } = useTranslation();
    const { selectedFarm } = useFarm();
    const { user } = useAuth();

    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => { setIsMounted(true); }, []);

    const center: [number, number] = [50.668333, 4.621278];
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
    const [preferTopRight, setPreferTopRight] = useState<boolean>(!!user?.operationsPopupTopRight);
    const [isMobile, setIsMobile] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [approveFeedback, setApproveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

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
    const { isSearchOpen, setIsSearchOpen, searchDraft, setSearchDraft, searchAreaCoords, isSearchDrawing, viewportBounds, setViewportBounds, hasActiveSearchFilters, searchEndpoint, applySearchFilters, clearSearchFilters, startSearchPolygon, cancelSearchPolygon, clearSearchPolygon } = search;
    const { operationTypes, units, products, tools, operationTypeId, setOperationTypeId, operationDate, setOperationDate, operationDurationMinutes, setOperationDurationMinutes, operationLines, handleAddOperationLine, handleRemoveOperationLine, updateOperationLine, operationError, operationLoading, parcelOperations, currentParcelId, setCurrentParcelId, operationPopup, setOperationPopup, loadOperationReferences, loadParcelOperations, handleSaveOperation, resetOperationForm, closeOperationPopup } = operations;
    const { shareParcelId, setShareParcelId, shareList, shareUsername, setShareUsername, shareRole, setShareRole, shareError, setShareError, shareLoading, openShareModal, closeShareModal, handleUpdateShare, handleRemoveShare } = sharing;
    const { isListCollapsed, setIsListCollapsed, listFilter, setListFilter, showFilterMenu, setShowFilterMenu, searchQuery, setSearchQuery, filterOptions, activeFilterLabel, filteredPolygons } = sidebarControl;
    const { loadPeriods, handleApproveAll, approveSingleParcel, handleRenameConfirm, togglePolygonVisibility, renamePolygonInline } = apiActions;
    const { confirmCreate, handleCreated } = coordination;

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

    // effects
    useEffect(() => {
        const fetchPolygons = async () => {
            try {
                const response = await apiGet(hasActiveSearchFilters ? searchEndpoint : parcelsEndpoint);
                if (response.ok) {
                    const data = await response.json();
                    const parsed: PolygonData[] = data.map((p: any) => ({
                        id: String(p.id), name: p.name || t('map.unnamedParcel'), coords: p.geodata ? parseWktCoords(p.geodata) : [],
                        visible: true, version: 0, color: p.color || '#3388ff', canEdit: p.canEdit ?? true, canShare: p.canShare ?? false,
                        active: p.active, startValidity: p.startValidity, endValidity: p.endValidity, farmId: p.farmId, periodId: p.periodId ?? null, validationStatus: p.validationStatus, convertedParcelId: p.convertedParcelId ?? null,
                        parentId: normalizeParentId(p.parentParcelId),
                    }));
                    setPolygons(parsed);
                    setAllPolygons(prev => {
                        const m = new Map(prev.map(i => [i.id, i]));
                        parsed.forEach(i => m.set(i.id, { ...m.get(i.id), ...i }));
                        return Array.from(m.values());
                    });
                }
            } catch (err) { console.error("Fetch polygons error", err); }
        };
        fetchPolygons();
    }, [hasActiveSearchFilters, searchEndpoint, parcelsEndpoint, t]);

    useEffect(() => { loadOperationReferences(); loadPeriods(); }, [loadOperationReferences, loadPeriods]);

    useEffect(() => {
        if (!isCreating) return;
        setCreatePointCount(editor.drawingPoints.length);
    }, [isCreating, editor.drawingPoints.length, setCreatePointCount]);

    useEffect(() => { if (!showPreview && overlapWarning?.isNewPolygon) reattachCreatedLayer(); }, [showPreview, overlapWarning, reattachCreatedLayer]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(max-width: 768px)');
        const h = (e: any) => setIsMobile(e.matches);
        h(mq);
        mq.addEventListener('change', h);
        return () => mq.removeEventListener('change', h);
    }, []);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (overlapWarning) { editor.setOverlapWarning(null); setShowPreview(false); }
                else if (isCreating) editor.cancelCreate();
                else if (editingId) editor.cancelEdit();
                else if (renamingId) { setRenamingId(null); setRenameValue(''); }
                else if (pendingDeleteId) setPendingDeleteId(null);
                else setContextMenu(null);
                closePolygonContextMenu();
            } else if (e.key === 'Enter' || e.key === 'v' || e.key === 'V') {
                if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
                if (pendingDeleteId) { deletePolygonSimple(pendingDeleteId); setPendingDeleteId(null); }
                else if (isCreating && createPointCount >= 3) editor.finishCreate(handleCreated);
                else if (editingId) editor.finishEdit();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
                if ((isCreating || !!editingId) && e.key === 'Backspace') {
                    e.preventDefault();
                    editor.removeLastSketchPoint();
                    return;
                }
                if (selectedId && !editingId && !isCreating) {
                    const canEdit = (polygons.find(p => p.id === selectedId) || allPolygons.find(p => p.id === selectedId))?.canEdit !== false;
                    if (canEdit) setPendingDeleteId(selectedId);
                }
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isCreating, editingId, renamingId, pendingDeleteId, createPointCount, overlapWarning, editor, closePolygonContextMenu, deletePolygonSimple, handleCreated]);

    useEffect(() => {
        if (!pendingManualEditId) return;
        if (polygons.some(p => p.id === pendingManualEditId)) {
            startEditSimple(pendingManualEditId);
            editor.setPendingManualEditId(null);
        }
    }, [pendingManualEditId, polygons, startEditSimple, editor]);

    if (!isMounted) return null;

    const drawOptions = { polygon: { allowIntersection: false, showArea: true, metric: true, shapeOptions: { color: '#3388ff' } }, rectangle: false, circle: false, circlemarker: false, marker: false, polyline: false };

    return (
        <div className="relative h-full w-full">
            {allowCreate && contextMenu && (
                <div className="fixed z-[10000] min-w-[14rem] rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-2xl backdrop-blur" style={{ left: contextMenu.x, top: contextMenu.y }}>
                    <button type="button" onClick={() => { setContextMenu(null); setSelectedParentId(null); editor.startCreate(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-slate-100">
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
                    handleColorSelect={async (c) => { await renamePolygonInline(polygonContextMenu.polygonId, c); }} handleColorHover={() => {}} handleColorLeave={() => {}} pendingDeleteId={pendingDeleteId} setPendingDeleteId={setPendingDeleteId} deletePolygon={deletePolygonSimple}
                    addChild={(parentId) => {
                        setSelectedParentId(parentId);
                        editor.startCreate();
                    }}
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

            {pendingDeleteId && !polygonContextMenu && (
                <div className="absolute left-1/2 top-4 z-[10000] flex -translate-x-1/2 items-center gap-4 rounded-3xl bg-rose-500/95 px-6 py-4 text-white shadow-2xl backdrop-blur">
                    <span className="text-sm font-semibold">{t('map.deletePrompt', { name: polygons.find(p => p.id === pendingDeleteId)?.name ?? '' })}</span>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => { deletePolygonSimple(pendingDeleteId); setPendingDeleteId(null); }} className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-rose-600"> {t('common.confirm')} </button>
                        <button type="button" onClick={() => setPendingDeleteId(null)} className="rounded-2xl border border-white/60 px-4 py-2 text-sm font-semibold text-white"> {t('common.cancel')} </button>
                    </div>
                </div>
            )}

            {operationPopup && (
                <OperationPopup
                    operationPopup={operationPopup} popupCoords={draggable.popupCoords} isMobile={isMobile} startDrag={draggable.startDrag} polygons={polygons} t={t} preferTopRight={preferTopRight} setPreferTopRight={setPreferTopRight} closeOperationPopup={closeOperationPopup} operationError={operationError} operationLoading={operationLoading}
                    canEditPolygon={(id) => (polygons.find(p => p.id === id) || allPolygons.find(p => p.id === id))?.canEdit !== false}
                    currentParcelId={currentParcelId} operationTypeId={operationTypeId} setOperationTypeId={setOperationTypeId} operationTypes={operationTypes} operationDate={operationDate} setOperationDate={setOperationDate} operationDurationMinutes={operationDurationMinutes} setOperationDurationMinutes={setOperationDurationMinutes} handleAddOperationLine={handleAddOperationLine} operationLines={operationLines} handleRemoveOperationLine={handleRemoveOperationLine} updateOperationLine={updateOperationLine} units={units} products={products} tools={tools} handleSaveOperation={handleSaveOperation} resetOperationForm={resetOperationForm} parcelOperations={parcelOperations}
                />
            )}

            <MapModals
                t={t} renamingId={renamingId} setRenamingId={setRenamingId} renameValue={renameValue} setRenameValue={setRenameValue} renamePeriodId={renamePeriodId} setRenamePeriodId={setRenamePeriodId} handleRenameConfirm={handleRenameConfirm} periods={periods}
                isAreaModalOpen={modal.open} areaName={areaName} setAreaName={setAreaName} selectedPeriodId={selectedPeriodId} setSelectedPeriodId={setSelectedPeriodId} handleAreaConfirm={confirmCreate} handleAreaCancel={cancelModal}
                sharing={sharing} allPolygons={allPolygons} tools={tools} products={products}
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
                        center={center} polygons={polygons} editingId={editingId} selectedId={selectedId} setSelectedId={setSelectedId} isCreating={isCreating} drawOptions={drawOptions} handleCreated={handleCreated} overlapWarning={overlapWarning} showPreview={showPreview} previewVisibility={previewVisibility} pendingManualEditId={pendingManualEditId}
                        featureGroupRef={featureGroupRef as any} editControlRef={editControlRef} polygonLayersRef={polygonLayersRef} setPolygonContextMenu={setPolygonContextMenu} setRenamingId={setRenamingId} setRenameValue={setRenameValue} setPendingDeleteId={setPendingDeleteId} setContextMenu={setContextMenu} closePolygonContextMenu={closePolygonContextMenu} viewportDebounceRef={viewportDebounceRef} setViewportBounds={setViewportBounds} hasActiveSearchFilters={hasActiveSearchFilters} isImportMode={isImportMode} contextType={contextType}
                        drawingPoints={editor.drawingPoints}
                        ghostCoords={editor.ghostCoords}
                        createPreviewPoint={editor.createPreviewPoint}
                        autoCorrectEnabled={editor.autoCorrectEnabled}
                        setIsHoveringSketchHandle={editor.setIsHoveringSketchHandle}
                        suppressSketchClickTemporarily={editor.suppressSketchClickTemporarily}
                        moveSketchPoint={editor.moveSketchPoint}
                        insertSketchPoint={editor.insertSketchPoint}
                        removeSketchPoint={editor.removeSketchPoint}
                    />
                </div>

                <div data-tour-id="map-toolbar" className="pointer-events-auto absolute top-4 right-4 z-[2000] flex flex-wrap justify-end gap-2">
                    <MapToolbar
                        showPreview={showPreview} setShowPreview={setShowPreview} overlapWarning={overlapWarning} setPreviewVisibility={setPreviewVisibility} previewVisibility={previewVisibility} allowCreate={allowCreate} editingId={editingId} isCreating={isCreating} createPointCount={createPointCount} 
                        startCreate={() => { setSelectedParentId(null); editor.startCreate(); }} finishCreate={() => editor.finishCreate(handleCreated)} cancelCreate={() => editor.cancelCreate()} finishEdit={() => editor.finishEdit()} cancelEdit={() => editor.cancelEdit()} setIsSearchOpen={setIsSearchOpen} hasActiveSearchFilters={hasActiveSearchFilters} onDeleteLastVertex={onDeleteLastVertex} t={t}
                        autoCorrectEnabled={editor.autoCorrectEnabled}
                        toggleAutoCorrect={() => editor.setAutoCorrectEnabled(!editor.autoCorrectEnabled)}
                        closeLoopMidpointEnabled={editor.closeLoopMidpointEnabled}
                        toggleCloseLoopMidpoint={() => editor.setCloseLoopMidpointEnabled(!editor.closeLoopMidpointEnabled)}
                    />
                </div>
            </div>

            <MapSearchFilters
                isSearchOpen={isSearchOpen} isImportMode={isImportMode} searchDraft={searchDraft} setSearchDraft={setSearchDraft} tools={tools} products={products} periods={periods} operationTypes={operationTypes} searchAreaCoords={searchAreaCoords} isSearchDrawing={isSearchDrawing}
                startSearchPolygon={() => startSearchPolygon(isCreating, editingId)} cancelSearchPolygon={cancelSearchPolygon} clearSearchPolygon={clearSearchPolygon} clearSearchFilters={clearSearchFilters} applySearchFilters={applySearchFilters} t={t}
                disabled={isCreating || !!editingId}
            />
        </div>
    );
}
