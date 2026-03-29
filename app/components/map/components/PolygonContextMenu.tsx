import React from "react";
import type { PolygonData } from "../types";

interface PolygonContextMenuProps {
    polygonContextMenu: { x: number; y: number; polygonId: string };
    canEditPolygon: (id: string) => boolean;
    polygons: PolygonData[];
    closePolygonContextMenu: () => void;
    setRenamingId: (id: string | null) => void;
    setRenameValue: (val: string) => void;
    setRenamePeriodId: (val: string) => void;
    contextType: string;
    setSelectedId: (id: string | null) => void;
    setCurrentParcelId: (id: string | null) => void;
    loadParcelOperations: (id: string) => Promise<void>;
    setOperationPopup: (val: { x: number; y: number; polygonId: string } | null) => void;
    isImportMode: boolean;
    canSharePolygon: (id: string) => boolean;
    openShareModal: (id: string) => void;
    startEdit: (id: string) => void;
    approveSingleParcel: (id: string) => Promise<void>;
    showColorPicker: boolean;
    setShowColorPicker: (val: boolean) => void;
    handleColorSelect: (color: string) => Promise<void>;
    handleColorHover: (color: string) => void;
    handleColorLeave: () => void;
    t: any;
    pendingDeleteId: string | null;
    setPendingDeleteId: (id: string | null) => void;
    deletePolygon: (id: string) => Promise<void>;
}

const PolygonContextMenu = React.memo((props: PolygonContextMenuProps) => {
    const {
        polygonContextMenu, canEditPolygon, polygons, closePolygonContextMenu,
        setRenamingId, setRenameValue, setRenamePeriodId,
        contextType, setSelectedId, setCurrentParcelId, loadParcelOperations, setOperationPopup,
        isImportMode, canSharePolygon, openShareModal,
        startEdit, approveSingleParcel,
        showColorPicker, setShowColorPicker,
        handleColorSelect, handleColorHover, handleColorLeave,
        t, pendingDeleteId, setPendingDeleteId, deletePolygon
    } = props;

    const floatingMenuClasses = "pointer-events-auto absolute z-[1100] min-w-[220px] rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-2xl shadow-slate-900/15 backdrop-blur-md transition-all duration-200";
    const floatingButtonClasses = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-slate-50 active:scale-95";

    return (
        <div
            className={`${floatingMenuClasses} overflow-hidden`}
            style={{ left: polygonContextMenu.x, top: polygonContextMenu.y }}
        >
            <div className="flex flex-col gap-1 p-1">
                {canEditPolygon(polygonContextMenu.polygonId) && (
                    <button
                        type="button"
                        onClick={() => {
                            const poly = polygons.find(p => p.id === polygonContextMenu.polygonId);
                            closePolygonContextMenu();
                            setRenamingId(polygonContextMenu.polygonId);
                            setRenameValue(poly?.name || "");
                            setRenamePeriodId(poly?.periodId ? String(poly.periodId) : "");
                        }}
                        className={`${floatingButtonClasses} text-slate-800`}
                    >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">✏️</span>
                        {t('map.polygonMenu.rename')}
                    </button>
                )}
                {contextType === 'farm' && (
                    <button
                        type="button"
                        onClick={async () => {
                            const { x, y, polygonId } = polygonContextMenu;
                            closePolygonContextMenu();
                            setSelectedId(polygonId);
                            setCurrentParcelId(polygonId);
                            await loadParcelOperations(polygonId);
                            setOperationPopup({ x: x + 10, y: y + 10, polygonId });
                        }}
                        className={`${floatingButtonClasses} text-slate-800`}
                    >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">📋</span>
                        {t('operations.title', { defaultValue: 'Parcel operations' })}
                    </button>
                )}
                {contextType === 'farm' && !isImportMode && canSharePolygon(polygonContextMenu.polygonId) && (
                    <button
                        type="button"
                        onClick={() => {
                            const { polygonId } = polygonContextMenu;
                            closePolygonContextMenu();
                            openShareModal(polygonId);
                        }}
                        className={`${floatingButtonClasses} text-slate-800`}
                    >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">🤝</span>
                        {t('map.sharing.open', { defaultValue: 'Share parcel' })}
                    </button>
                )}
                {canEditPolygon(polygonContextMenu.polygonId) && (
                    <button
                        type="button"
                        onClick={() => {
                            closePolygonContextMenu();
                            startEdit(polygonContextMenu.polygonId);
                        }}
                        className={`${floatingButtonClasses} text-slate-800`}
                    >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">🔧</span>
                        {t('map.polygonMenu.edit')}
                    </button>
                )}
                {isImportMode && (
                    <button
                        type="button"
                        onClick={() => { closePolygonContextMenu(); approveSingleParcel(polygonContextMenu.polygonId); }}
                        className={`${floatingButtonClasses} text-emerald-700`}
                    >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-base text-emerald-600">✅</span>
                        {t('imports.map.approveOne', { defaultValue: 'Approve parcel' })}
                    </button>
                )}
                {canEditPolygon(polygonContextMenu.polygonId) && (!showColorPicker ? (
                    <button
                        type="button"
                        onClick={() => {
                            if (!canEditPolygon(polygonContextMenu.polygonId)) return;
                            setShowColorPicker(true);
                        }}
                        className={`${floatingButtonClasses} text-slate-800`}
                    >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">🎨</span>
                        {t('map.polygonMenu.color')}
                    </button>
                ) : (
                    <div className="rounded-2xl bg-slate-50/80 p-3">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t('map.polygonMenu.color')}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {['#3388ff', '#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf', '#ff8b94', '#b4a7d6', '#ffa07a'].map(color => {
                                const isCurrent = polygons.find(p => p.id === polygonContextMenu.polygonId)?.color === color;
                                return (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => handleColorSelect(color)}
                                        onMouseEnter={() => handleColorHover(color)}
                                        onMouseLeave={() => handleColorLeave()}
                                        className={`h-7 w-7 rounded-full border-2 border-white shadow-md transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-200 ${isCurrent ? 'ring-2 ring-indigo-400' : ''}`}
                                        style={{ background: color }}
                                    />
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowColorPicker(false)}
                            className="mt-3 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:bg-white"
                        >
                            {t('common.cancel', { defaultValue: 'Cancel' })}
                        </button>
                    </div>
                ))}
                {canEditPolygon(polygonContextMenu.polygonId) && (
                    <button
                        type="button"
                        onClick={() => {
                            if (pendingDeleteId === polygonContextMenu.polygonId) {
                                deletePolygon(pendingDeleteId);
                                setPendingDeleteId(null);
                                closePolygonContextMenu();
                            } else {
                                setPendingDeleteId(polygonContextMenu.polygonId);
                            }
                        }}
                        className={`${floatingButtonClasses} ${pendingDeleteId === polygonContextMenu.polygonId ? 'bg-rose-500 text-white hover:!bg-rose-600 hover:!text-white' : 'text-rose-600 hover:bg-rose-50'}`}
                    >
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-base ${pendingDeleteId === polygonContextMenu.polygonId ? 'bg-white/20 text-white' : 'bg-rose-50 text-rose-600'}`}>🗑️</span>
                        {pendingDeleteId === polygonContextMenu.polygonId ? t('common.confirm') : t('common.delete')}
                    </button>
                )}
            </div>
        </div>
    );
});

export default PolygonContextMenu;
