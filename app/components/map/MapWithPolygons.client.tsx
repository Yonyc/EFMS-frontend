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

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="relative h-full w-full">
            {/* Modals */}
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
                    startEdit={startEdit}
                    deletePolygon={deletePolygon}
                    approveSingleParcel={approveSingleParcel}
                    loadParcelOperations={loadParcelOperations}
                    setOperationPopup={setOperationPopup}
                    setPopupCoords={setPopupCoords}
                    setSelectedId={setSelectedId}
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
                    <MapContainer style={{ height: "100%", width: "100%" }} center={center} zoom={15} maxZoom={19} zoomControl={false}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxNativeZoom={20} attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>' />
                        <ZoomControl position="bottomright" />
                        <MapEvents />
                        <style>{`
                            .leaflet-control-container .leaflet-draw, .leaflet-draw-toolbar { display: none !important; }
                            .leaflet-interactive { transition: filter 0.5s ease-out !important; }
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
                                            <Tooltip direction="center" offset={[0, 0]} opacity={1} permanent={isSelected} className="polygon-tooltip">
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                                                    <span style={{ display: 'inline-block', padding: '3px 8px', fontSize: '0.8rem', fontWeight: '600', color: '#fff', background: polyColor, borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                        {poly.name}
                                                    </span>
                                                    {isImportMode && poly.validationStatus && (
                                                        <span style={{ display: 'inline-block', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 600, color: '#0f172a', background: 'rgba(255,255,255,0.85)', borderRadius: '999px', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
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
                                        <Polygon positions={overlapWarning.originalCoords} pathOptions={{ color: '#ff5252', opacity: 0.7, fillOpacity: 0.15, dashArray: '10 5', weight: 3 }} />
                                    )}
                                    {previewVisibility.fixed && overlapWarning.fixedCoords && (
                                        <Polygon positions={overlapWarning.fixedCoords} pathOptions={{ color: '#4caf50', opacity: 0.9, fillOpacity: 0.3, weight: 3 }} />
                                    )}
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
                    createPointCount={createPointCount}
                    createHandlerRef={createHandlerRef}
                    startCreate={startCreate}
                    finishCreate={finishCreate}
                    cancelCreate={cancelCreate}
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
