import {
    MapContainer,
    TileLayer,
    Polygon,
    FeatureGroup,
    useMapEvents,
    Tooltip,
    ZoomControl,
    CircleMarker
} from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import OverlapModal from "./components/OverlapModal";
import { SearchPanel } from "./components/SearchPanel";
import { OperationPopup } from "./components/OperationPopup";
import { PolygonContextMenu } from "./components/PolygonContextMenu";
import { RenameModal } from "./components/RenameModal";
import { AreaNameModal } from "./components/AreaNameModal";
import { PolygonSidebar } from "./components/PolygonSidebar";
import { MapToolbar } from "./components/MapToolbar";
import { useMapState } from "./hooks/useMapState";
import type { ParcelSearchFilters, MapContextType } from "./types";
import { clampToViewport, toWktPolygon } from "./utils/map";
import { useFarm } from "~/contexts/FarmContext";
import { useAuth } from "~/contexts/AuthContext";
import { apiPut } from "~/utils/api";

interface MapProps {
    farm_id?: string;
    contextId?: string;
    contextType?: MapContextType;
    allowCreate?: boolean;
    onApproveAll?: () => Promise<void>;
    approveLabel?: string;
}

export default function MapWithPolygons(props: MapProps) {
    const { t } = useTranslation();
    const isImportMode = props.contextType === 'import';
    const resolvedContextId = (isImportMode ? props.contextId : props.farm_id) || "";
    const parcelsEndpoint = isImportMode ? `/imports/${resolvedContextId}/parcels` : `/farm/${resolvedContextId}/parcels`;

    const {
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
        getPointCount,
        searchEndpoint,

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
        isInspecting,
        validateInspection,
        cancelInspection,
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
    } = useMapState({
        resolvedContextId,
        contextType: props.contextType || 'farm',
        isImportMode,
        parcelsEndpoint,
        onApproveAll: props.onApproveAll,
        approveLabel: props.approveLabel,
        farm_id: props.farm_id
    });

    const { user } = useAuth();
    const { selectedFarm } = useFarm();
    const allowCreate = !isImportMode;
    const contextType = props.contextType || 'farm';
    const farmAny = selectedFarm as any;
    const center: [number, number] = farmAny?.latitude && farmAny?.longitude
        ? [farmAny.latitude, farmAny.longitude]
        : [50.8503, 4.3517];

    const defaultSearchFilters: ParcelSearchFilters = useMemo(() => ({
        periodId: '', toolId: '', productId: '', startDate: '', endDate: '',
        useMapArea: false, usePolygon: false,
    }), []);

    const floatingMenuClasses = "fixed z-[10000] min-w-[14rem] rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-2xl shadow-slate-900/15 backdrop-blur";
    const floatingButtonClasses = "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-200";

    // ── Effects ────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(max-width: 768px)');
        const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
        handler(mq);
        mq.addEventListener ? mq.addEventListener('change', handler) : mq.addListener(handler as any);
        return () => {
            mq.removeEventListener ? mq.removeEventListener('change', handler) : mq.removeListener(handler as any);
        };
    }, []);

    const prefKey = useMemo(() => user ? `opsTopRight:${user.id}` : 'opsTopRight:anon', [user]);

    const persistPreferenceRemote = useCallback(async (next: boolean) => {
        try { await apiPut('/users/me/preferences', { operationsPopupTopRight: next }); }
        catch (err) { console.error('Failed to persist operations popup preference remotely', err); }
    }, []);

    useEffect(() => {
        if (user?.operationsPopupTopRight === undefined) return;
        setPreferTopRight(user.operationsPopupTopRight);
        try { localStorage.setItem(prefKey, user.operationsPopupTopRight ? '1' : '0'); }
        catch (err) { console.error('Failed to sync operations popup preference from profile', err); }
    }, [user?.operationsPopupTopRight, prefKey]);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(prefKey);
            if (stored) setPreferTopRight(stored === '1');
        } catch (err) { console.error('Failed to read operations popup preference', err); }
    }, [prefKey]);

    useEffect(() => {
        try { localStorage.setItem(prefKey, preferTopRight ? '1' : '0'); }
        catch (err) { console.error('Failed to persist operations popup preference', err); }
        persistPreferenceRemote(preferTopRight);
    }, [prefKey, preferTopRight, persistPreferenceRemote]);

    useEffect(() => {
        if (!isCreating) return;
        const tick = () => {
            setCreatePointCount(getPointCount(createHandlerRef.current));
            createRafRef.current = requestAnimationFrame(tick);
        };
        createRafRef.current = requestAnimationFrame(tick);
        return () => { createRafRef.current && cancelAnimationFrame(createRafRef.current); createRafRef.current = null; };
    }, [isCreating, createHandlerRef, setCreatePointCount, createRafRef, getPointCount]);

    useEffect(() => {
        if (!showPreview && overlapWarning?.isNewPolygon) reattachCreatedLayer();
    }, [showPreview, overlapWarning, reattachCreatedLayer]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault(); e.stopPropagation();
                if (overlapWarning) handleOverlapCancel();
                else if (isCreating) cancelCreate();
                else if (editingId) cancelEdit();
                else if (renamingId) { setRenamingId(null); setRenameValue(''); }
                else if (pendingDeleteId) setPendingDeleteId(null);
                else if (contextMenu) setContextMenu(null);
                else if (polygonContextMenu) closePolygonContextMenu();
            } else if (e.key === 'Enter') {
                if (isCreating && createPointCount >= 3) { e.preventDefault(); finishCreate(); }
                else if (editingId) { e.preventDefault(); finishEdit(); }
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (editingId) { e.preventDefault(); deletePolygon(editingId); }
                else if (selectedId && !renamingId && !pendingDeleteId) { e.preventDefault(); setPendingDeleteId(selectedId); }
            }
        };
        window.addEventListener('keydown', handleKey, { capture: true });
        return () => window.removeEventListener('keydown', handleKey, { capture: true });
    }, [isCreating, editingId, selectedId, renamingId, pendingDeleteId, contextMenu, polygonContextMenu, createPointCount, overlapWarning, cancelCreate, cancelEdit, finishCreate, finishEdit, deletePolygon, closePolygonContextMenu, handleOverlapCancel, setRenamingId, setRenameValue, setPendingDeleteId, setContextMenu]);

    // Manage z-indices of polygons based on parent/child depth
    useEffect(() => {
        if (!polygons || polygons.length === 0) return;
        
        const polyDepths: Record<string, number> = {};
        const getDepth = (id: string, currentDepth = 0): number => {
            if (polyDepths[id] !== undefined) return polyDepths[id];
            if (currentDepth > 20) return 20; 
            const poly = polygons.find(p => p.id === id);
            if (!poly || !poly.parentId) { polyDepths[id] = 0; return 0; }
            const depth = getDepth(poly.parentId, currentDepth + 1) + 1;
            polyDepths[id] = depth;
            return depth;
        };

        const sortedIds = [...polygons].sort((a, b) => getDepth(a.id) - getDepth(b.id)).map(p => p.id);
        
        // Wait a tick for React to finish rendering DOM nodes
        const timer = setTimeout(() => {
            sortedIds.forEach(id => {
                const layer = polygonLayersRef.current?.get(id);
                if (layer && (layer as any)._map) {
                    layer.bringToFront();
                }
            });
        }, 50);

        return () => clearTimeout(timer);
    }, [polygons, selectedId, isCreating]);

    useEffect(() => {
        if (!pendingManualEditId) return;
        const exists = polygons.some(p => p.id === pendingManualEditId);
        if (!exists) return;
        startEdit(pendingManualEditId);
        setPendingManualEditId(null);
    }, [pendingManualEditId, polygons, startEdit, setPendingManualEditId]);

    useEffect(() => {
        if (!selectedId) return;
        const layer = polygonLayersRef.current.get(selectedId);
        if (!layer) return;
        layer.setStyle({ dashArray: '10 5' });
        layer.getElement()?.classList.add('polygon-glow');
        return () => {
            const target = polygonLayersRef.current.get(selectedId);
            if (!target) return;
            target.setStyle({ dashArray: undefined, dashOffset: '0' });
            target.getElement()?.classList.remove('polygon-glow');
        };
    }, [selectedId, polygonLayersRef]);

    // ── Inner component ────────────────────────────────────────────────────────

    function MapEvents() {
        useMapEvents({
            contextmenu: e => {
                if (!editingId && !isCreating) {
                    e.originalEvent.preventDefault();
                    const { x, y } = clampToViewport(e.originalEvent.clientX, e.originalEvent.clientY, 240, 200, 12);
                    setContextMenu({ x, y });
                }
            },
            click: () => {
                if (editingId) return;
                setRenamingId(null); setRenameValue(''); setPendingDeleteId(null);
                setContextMenu(null); closePolygonContextMenu(); setSelectedId(null);
            },
            mousedown: () => { closePolygonContextMenu(); setContextMenu(null); },
            popupopen: e => editingId && e.popup?.remove?.()
        });
        return null;
    }

    // Handle selective styling for auto-fixed vertices
    useEffect(() => {
        if (!isInspecting || !createdLayerRef.current) return;
        const layer = createdLayerRef.current as any;
        
        const applyStyles = () => {
            const indices = (layer.fixedIndices as number[]) || overlapWarning?.fixedIndices || [];
            const markers = layer.editing?._markers;
            if (markers && indices) {
                markers.forEach((marker: any, idx: number) => {
                    if (marker && marker._icon) {
                        if (indices.includes(idx)) {
                            marker._icon.classList.add('leaflet-editing-icon-fixed');
                        } else {
                            marker._icon.classList.remove('leaflet-editing-icon-fixed');
                        }
                    }
                });
            }
        };

        // Apply immediately and with a slight delay for marker initialization
        const timer1 = setTimeout(applyStyles, 10);
        const timer2 = setTimeout(applyStyles, 100);
        const timer3 = setTimeout(applyStyles, 500); 
        
        layer.on('editvertex dragend addvertex', applyStyles);
        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);
            layer.off('editvertex dragend addvertex', applyStyles);
        };
    }, [isInspecting, overlapWarning, createdLayerRef]);

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="relative h-full w-full">
            {/* Modals */}
            {overlapWarning && !showPreview && (
                <OverlapModal
                    warning={overlapWarning!}
                    areaName={areaName}
                    onAreaNameChange={setAreaName}
                    onCancel={handleOverlapCancel}
                    onToggleAutoFix={handleToggleAutoFix}
                    onIgnore={handleOverlapIgnore}
                    onAccept={handleOverlapAccept}
                    onShowPreview={handleShowPreview}
                    onTweakFix={() => {}} 
                />
            )}
            {renamingId && (
                <RenameModal
                    renamingId={renamingId}
                    setRenamingId={setRenamingId}
                    renameValue={renameValue}
                    setRenameValue={setRenameValue}
                    renamePeriodId={renamePeriodId}
                    setRenamePeriodId={setRenamePeriodId}
                    periods={periods}
                    parcelsEndpoint={parcelsEndpoint}
                    setPolygons={setPolygons}
                />
            )}
            {modal.open && (
                <AreaNameModal
                    areaName={areaName}
                    setAreaName={setAreaName}
                    selectedPeriodId={selectedPeriodId}
                    setSelectedPeriodId={setSelectedPeriodId}
                    periods={periods}
                    onCancel={cancelModal}
                    onConfirm={confirmCreate}
                />
            )}

            {/* Floating menus */}
            {allowCreate && contextMenu && (
                <div className={floatingMenuClasses} style={{ left: contextMenu.x, top: contextMenu.y }}>
                    <button
                        type="button"
                        onClick={() => { setContextMenu(null); startCreate(); }}
                        className={`${floatingButtonClasses} text-indigo-700`}
                    >
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-base text-indigo-600">+</span>
                        {t('map.contextMenu.addPolygon')}
                    </button>
                </div>
            )}
            {polygonContextMenu && (
                <PolygonContextMenu
                    polygonContextMenu={polygonContextMenu}
                    polygons={polygons}
                    setPolygons={setPolygons}
                    periods={periods}
                    isImportMode={isImportMode}
                    contextType={contextType}
                    showColorPicker={showColorPicker}
                    setShowColorPicker={setShowColorPicker}
                    pendingDeleteId={pendingDeleteId}
                    setPendingDeleteId={setPendingDeleteId}
                    originalColorRef={originalColorRef}
                    parcelsEndpoint={parcelsEndpoint}
                    closePolygonContextMenu={closePolygonContextMenu}
                    startCreate={startCreate}
                    startEdit={startEdit}
                    deletePolygon={deletePolygon}
                    approveSingleParcel={approveSingleParcel}
                    loadParcelOperations={loadParcelOperations}
                    setOperationPopup={setOperationPopup}
                    setPopupCoords={setPopupCoords}
                    setSelectedId={setSelectedId}
                    setSelectedParentId={setSelectedParentId}
                    setCurrentParcelId={setCurrentParcelId}
                    setRenamingId={setRenamingId}
                    setRenameValue={setRenameValue}
                    setRenamePeriodId={setRenamePeriodId}
                />
            )}

            {/* Delete toast */}
            {pendingDeleteId && !polygonContextMenu && (
                <div className="fixed left-1/2 top-5 z-[10000] flex -translate-x-1/2 items-center gap-4 rounded-3xl bg-rose-500/95 px-6 py-4 text-white shadow-2xl shadow-rose-500/40 backdrop-blur">
                    <span className="text-sm font-semibold leading-snug">
                        {t('map.deletePrompt', { name: polygons.find(p => p.id === pendingDeleteId)?.name ?? '' })}
                    </span>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => { deletePolygon(pendingDeleteId); setPendingDeleteId(null); }} className="rounded-2xl bg-white/95 px-4 py-2 text-sm font-semibold text-rose-600 shadow-md transition hover:-translate-y-0.5">
                            {t('common.confirm')}
                        </button>
                        <button type="button" onClick={() => setPendingDeleteId(null)} className="rounded-2xl border border-white/60 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10">
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            )}

            {/* Operation popup */}
            <OperationPopup
                isOpen={!!operationPopup && !!popupCoords}
                polygonName={polygons.find(p => p.id === operationPopup?.polygonId)?.name || t('map.unnamedParcel')}
                coords={popupCoords || { left: 0, top: 0 }}
                isMobile={isMobile}
                mobileTop={(listBarRef.current?.getBoundingClientRect().bottom ?? 0) + 12}
                mobileHeight={typeof window !== 'undefined' ? `${Math.max(180, window.innerHeight - (listBarRef.current?.getBoundingClientRect().bottom ?? 0) - 24)}px` : undefined}
                preferTopRight={preferTopRight}
                pinnedTop={(listBarRef.current?.getBoundingClientRect().top ?? 64) + 8}
                setPreferTopRight={setPreferTopRight}
                operationError={operationError}
                operationLoading={operationLoading}
                operationTypeId={operationTypeId}
                setOperationTypeId={setOperationTypeId}
                operationDate={operationDate}
                setOperationDate={setOperationDate}
                operationDurationMinutes={operationDurationMinutes}
                setOperationDurationMinutes={setOperationDurationMinutes}
                operationLines={operationLines}
                operationTypes={operationTypes}
                units={units}
                products={products}
                tools={tools}
                parcelOperations={parcelOperations}
                onClose={closeOperationPopup}
                onStartDrag={startDrag}
                onAddLine={handleAddOperationLine}
                onUpdateLine={updateOperationLine}
                onRemoveLine={handleRemoveOperationLine}
                onReset={resetOperationForm}
                onSave={handleSaveOperation}
            />

            {/* Map area */}
            <div style={{ flex: 1, position: 'relative', minHeight: 0, height: '100%' }}>
                <PolygonSidebar
                    isListCollapsed={isListCollapsed}
                    setIsListCollapsed={setIsListCollapsed}
                    filteredPolygons={filteredPolygons}
                    polygons={polygons}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    showFilterMenu={showFilterMenu}
                    setShowFilterMenu={setShowFilterMenu}
                    filterOptions={filterOptions}
                    listFilter={listFilter}
                    setListFilter={setListFilter}
                    activeFilterLabel={activeFilterLabel}
                    isImportMode={isImportMode}
                    isApproving={isApproving}
                    approveFeedback={approveFeedback}
                    onApproveAll={props.onApproveAll}
                    approveLabel={props.approveLabel}
                    listBarRef={listBarRef}
                    togglePolygonVisibility={togglePolygonVisibility}
                    renamePolygonInline={renamePolygonInline}
                    focusPolygon={focusPolygon}
                    approveSingleParcel={approveSingleParcel}
                />

                <div data-tour-id="map-canvas" style={{ height: '100%', width: '100%', minHeight: 0 }}>
                    <MapContainer 
                        style={{ height: "100%", width: "100%" }} 
                        center={center} 
                        zoom={15} 
                        maxZoom={19} 
                        zoomControl={false}
                        className={isCreating ? "creating-parcel" : ""}
                    >
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxNativeZoom={20} attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>' />
                        <ZoomControl position="bottomright" />
                        <MapEvents />
                        <style>{`
                            .leaflet-control-container .leaflet-draw, .leaflet-draw-toolbar { display: none !important; }
                            .polygon-tooltip { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
                            .polygon-tooltip { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
                            .polygon-tooltip::before { display: none !important; }
                            .leaflet-tooltip-pane .leaflet-tooltip { background: transparent !important; border: none !important; box-shadow: none !important; }
                            @keyframes polygonDash { to { stroke-dashoffset: -60; } }
                            @keyframes polygonGlow {
                                0% { filter: drop-shadow(0 0 2px currentColor); }
                                50% { filter: drop-shadow(0 0 8px currentColor); }
                                100% { filter: drop-shadow(0 0 2px currentColor); }
                            }
                            .leaflet-overlay-pane .polygon-glow { stroke-dasharray: 10 5; animation: polygonDash 1.2s linear infinite, polygonGlow 2.4s ease-in-out infinite; }
                            
                            /* Snappy Preview Animation */
                            @keyframes ringPulse {
                                0% { transform: scale(0.6); opacity: 1; border-width: 3px; }
                                50% { transform: scale(1.6); opacity: 0; border-width: 1px; }
                                100% { transform: scale(0.6); opacity: 1; border-width: 3px; }
                            }
                            /* Force standard cursor when drawing */
                            .creating-parcel, 
                            .creating-parcel *, 
                            .leaflet-container.creating-parcel,
                            .leaflet-container.creating-parcel * {
                                cursor: default !important;
                            }
                            
                            /* Absolute placement for snapping ring */
                            .snappy-preview-marker-container {
                                pointer-events: none !important;
                                z-index: 2000000 !important;
                            }
                            .snappy-preview-ring {
                                width: 20px;
                                height: 20px;
                                border: 4px solid #4f46e5;
                                border-radius: 50%;
                                background: rgba(79, 70, 229, 0.4);
                                box-shadow: 0 0 10px rgba(79, 70, 229, 0.8), 0 0 20px rgba(79, 70, 229, 0.4);
                                animation: ringPulse 0.8s ease-in-out infinite;
                                pointer-events: none;
                            }
                            @keyframes ringPulse {
                                0% { transform: scale(0.9); opacity: 1; }
                                50% { transform: scale(1.3); opacity: 0.3; }
                                100% { transform: scale(0.9); opacity: 1; }
                            }
                            
                            /* Style Leaflet guide lines to be pretty indigo instead of hiding them */
                            .leaflet-draw-guide-dash {
                                stroke: #6366f1 !important;
                                stroke-opacity: 0.6 !important;
                            }

                            /* Pretty Drawing Points */
                            /* Main vertex handles - Blue */
                            .leaflet-editing-icon:not(.leaflet-editing-icon-ghost) {
                                background: #fff !important;
                                border: 2.5px solid #2563eb !important;
                                border-radius: 50% !important;
                                box-shadow: 0 3px 8px rgba(15,23,42,0.4) !important;
                                width: 14px !important;
                                height: 14px !important;
                                margin-left: -7px !important;
                                margin-top: -7px !important;
                                z-index: 2000 !important;
                                transition: none !important;
                            }
                            /* Intermediate 'Added' handles - Green */
                            .leaflet-editing-icon-ghost {
                                background: #fff !important;
                                border: 2px solid #10b981 !important;
                                border-radius: 50% !important;
                                width: 10px !important;
                                height: 10px !important;
                                margin-left: -5px !important;
                                margin-top: -5px !important;
                                opacity: 0.8 !important;
                                z-index: 1999 !important;
                                transition: none !important;
                            }
                            .leaflet-editing-icon:hover {
                                border-color: #3b82f6 !important;
                                background: #f8fafc !important;
                            }
                            .leaflet-draw-guide-dash {
                                background-color: rgba(79, 70, 229, 0.5) !important;
                            }
                            .leaflet-mouse-marker {
                                background: #fff !important;
                                border: 2px solid #2563eb !important;
                                border-radius: 50% !important;
                                box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4) !important;
                            }
                            /* Hide default Leaflet.Draw tooltips */
                            .leaflet-draw-tooltip {
                                display: none !important;
                            }
                            
                            /* Original vertices - Consistent Blue */
                            .leaflet-editing-icon {
                                border: 2.5px solid #2563eb !important;
                                border-radius: 50% !important;
                                background: #fff !important;
                                box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1) !important;
                            }

                            /* Fixed/Corrected vertices - Strong Green */
                            .leaflet-editing-icon-fixed {
                                border-color: #10b981 !important;
                                box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.2) !important;
                            }
                            .leaflet-editing-icon.leaflet-editing-icon-fixed {
                                border: 3px solid #10b981 !important;
                                background: #fff !important;
                                z-index: 2500 !important;
                            }
                        `}</style>

                        <FeatureGroup ref={featureGroupRef}>
                            <EditControl ref={editControlRef} position="topright" draw={{ rectangle: false, polyline: false, circle: false, marker: false, circlemarker: false, polygon: true }} onCreated={handleCreated} />

                            {(() => {
                                // Pre-calculate depth and descendant relationships
                                const polyDepths: Record<string, number> = {};
                                const getDepth = (id: string, currentDepth = 0): number => {
                                    if (polyDepths[id] !== undefined) return polyDepths[id];
                                    if (currentDepth > 20) return 20; // safe breaker
                                    const poly = polygons.find(p => p.id === id);
                                    if (!poly || !poly.parentId) { polyDepths[id] = 0; return 0; }
                                    const depth = getDepth(poly.parentId, currentDepth + 1) + 1;
                                    polyDepths[id] = depth;
                                    return depth;
                                };

                                const isDescendantOf = (childId: string, parentId: string, currentDepth = 0): boolean => {
                                    if (currentDepth > 20) return false;
                                    const poly = polygons.find(p => p.id === childId);
                                    if (!poly || !poly.parentId) return false;
                                    if (poly.parentId === parentId) return true;
                                    return isDescendantOf(poly.parentId, parentId, currentDepth + 1);
                                };

                                return polygons
                                    .filter(p => p.visible)
                                    .filter(poly => !(showPreview && overlapWarning?.polygonId === poly.id))
                                    .sort((a, b) => getDepth(a.id) - getDepth(b.id)) // Render parents first, children on top
                                    .map(poly => {
                                        const isThisEditing = editingId === poly.id;
                                        const isSelected = selectedId === poly.id;
                                        const polyColor = poly.color || '#3388ff';
                                        const depth = getDepth(poly.id);
                                        const polygonKey = isThisEditing
                                            ? `${poly.id}-editing-${poly.version}`
                                            : `${poly.id}-${poly.version}`;

                                    return (
                                        <Polygon
                                            key={polygonKey}
                                            positions={poly.coords}
                                            interactive={!isThisEditing && !editingId}
                                            pathOptions={{
                                                color: polyColor,
                                                opacity: isThisEditing ? 0.9 : (isSelected ? 1 : 0.8),
                                                fillOpacity: isSelected ? 0.4 : (0.15 + (Math.min(getDepth(poly.id), 3) * 0.1)),
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
                                                        const { x, y } = clampToViewport(e.originalEvent.clientX, e.originalEvent.clientY, 260, 260, 12);
                                                        setPolygonContextMenu({ x, y, polygonId: poly.id });
                                                        setSelectedId(poly.id);
                                                    }
                                                }
                                            }}
                                        >
                                            <Tooltip sticky className="polygon-tooltip" direction="center">
                                                <div className="rounded-lg bg-slate-900/90 px-2 py-1 text-xs font-semibold text-white shadow-xl backdrop-blur-sm">
                                                    {poly.name}
                                                    {poly.validationStatus && (
                                                        <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${
                                                            poly.validationStatus === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300' :
                                                                poly.validationStatus === 'REJECTED' ? 'bg-rose-500/20 text-rose-300' :
                                                                    'bg-amber-500/20 text-amber-300'
                                                        }`}>
                                                            {poly.validationStatus}
                                                        </span>
                                                    )}
                                                </div>
                                            </Tooltip>
                                        </Polygon>
                                    );
                                });
                            })()}

                            {overlapWarning && showPreview && (
                                <>
                                    {previewVisibility.original && (
                                        <>
                                            <Polygon positions={overlapWarning.originalCoords} pathOptions={{ color: '#ff5252', opacity: 0.7, fillOpacity: 0.15, dashArray: '10 5', weight: 3 }} />
                                            {overlapWarning.originalCoords.map((coord, i) => (
                                                <CircleMarker 
                                                    key={`orig-point-${i}`} 
                                                    center={coord} 
                                                    radius={6} 
                                                    pathOptions={{ color: '#fff', weight: 2, fillColor: '#ff5252', fillOpacity: 1, interactive: false }} 
                                                />
                                            ))}
                                        </>
                                    )}
                                    {/* Redundant React-rendered fixed preview removed to fix "doubled ghost" and lag */}
                                </>
                            )}

                        </FeatureGroup>
                    </MapContainer>
                </div>

                <MapToolbar
                    isImportMode={isImportMode}
                    allowCreate={allowCreate}
                    isSearchOpen={isSearchOpen}
                    setIsSearchOpen={setIsSearchOpen}
                    appliedFilters={appliedFilters}
                    overlapWarning={overlapWarning}
                    showPreview={showPreview}
                    setShowPreview={setShowPreview}
                    previewVisibility={previewVisibility}
                    setPreviewVisibility={setPreviewVisibility}
                    editingId={editingId}
                    isCreating={isCreating}
                    isInspecting={isInspecting}
                    createPointCount={createPointCount}
                    createHandlerRef={createHandlerRef}
                    startCreate={startCreate}
                    finishCreate={finishCreate}
                    cancelCreate={cancelCreate}
                    validateInspection={validateInspection}
                    cancelInspection={cancelInspection}
                    finishEdit={finishEdit}
                    cancelEdit={cancelEdit}
                />

                <SearchPanel
                    isSearchOpen={isSearchOpen}
                    setIsSearchOpen={setIsSearchOpen}
                    searchDraft={searchDraft}
                    setSearchDraft={setSearchDraft}
                    periods={periods}
                    tools={tools}
                    products={products}
                    isDrawing={isSearchDrawing}
                    onStartDraw={startSearchPolygon}
                    onCancelDraw={cancelSearchPolygon}
                    onClearPolygon={clearSearchPolygon}
                    onApply={applySearchFilters}
                />
            </div>
        </div>
    );
}
