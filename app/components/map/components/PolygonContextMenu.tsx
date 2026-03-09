import { useTranslation } from "react-i18next";
import { apiPut } from "~/utils/api";
import type { PolygonData, PeriodDto } from "../types";

interface PolygonContextMenuProps {
    polygonContextMenu: { x: number; y: number; polygonId: string };
    polygons: PolygonData[];
    setPolygons: React.Dispatch<React.SetStateAction<PolygonData[]>>;
    periods: PeriodDto[];
    isImportMode: boolean;
    contextType: string;
    showColorPicker: boolean;
    setShowColorPicker: React.Dispatch<React.SetStateAction<boolean>>;
    pendingDeleteId: string | null;
    setPendingDeleteId: React.Dispatch<React.SetStateAction<string | null>>;
    originalColorRef: React.MutableRefObject<string | null>;
    parcelsEndpoint: string;
    closePolygonContextMenu: () => void;
    startEdit: (id: string) => void;
    deletePolygon: (id: string) => void;
    approveSingleParcel: (id: string) => void;
    loadParcelOperations: (id: string) => Promise<void>;
    setOperationPopup: React.Dispatch<React.SetStateAction<{ x: number; y: number; polygonId: string } | null>>;
    setPopupCoords: React.Dispatch<React.SetStateAction<{ left: number; top: number } | null>>;
    setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
    setCurrentParcelId: React.Dispatch<React.SetStateAction<string | null>>;
    setRenamingId: React.Dispatch<React.SetStateAction<string | null>>;
    setRenameValue: React.Dispatch<React.SetStateAction<string>>;
    setRenamePeriodId: React.Dispatch<React.SetStateAction<string>>;
}

const COLORS = ['#3388ff', '#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf', '#ff8b94', '#b4a7d6', '#ffa07a'];

const floatingMenuClasses = "fixed z-[10000] min-w-[14rem] rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-2xl shadow-slate-900/15 backdrop-blur";
const floatingButtonClasses = "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-200";

export function PolygonContextMenu({
    polygonContextMenu,
    polygons,
    setPolygons,
    isImportMode,
    contextType,
    showColorPicker,
    setShowColorPicker,
    pendingDeleteId,
    setPendingDeleteId,
    originalColorRef,
    parcelsEndpoint,
    closePolygonContextMenu,
    startEdit,
    deletePolygon,
    approveSingleParcel,
    loadParcelOperations,
    setOperationPopup,
    setPopupCoords,
    setSelectedId,
    setCurrentParcelId,
    setRenamingId,
    setRenameValue,
    setRenamePeriodId,
}: PolygonContextMenuProps) {
    const { t } = useTranslation();
    const { x, y, polygonId } = polygonContextMenu;

    return (
        <div
            className={`${floatingMenuClasses} overflow-hidden`}
            style={{ left: x, top: y }}
        >
            <div className="flex flex-col gap-1 p-1">
                <button
                    type="button"
                    onClick={() => {
                        const poly = polygons.find(p => p.id === polygonId);
                        closePolygonContextMenu();
                        setRenamingId(polygonId);
                        setRenameValue(poly?.name || "");
                        setRenamePeriodId(poly?.periodId ? String(poly.periodId) : "");
                    }}
                    className={`${floatingButtonClasses} text-slate-800`}
                >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">✏️</span>
                    {t('map.polygonMenu.rename')}
                </button>

                {contextType === 'farm' && (
                    <button
                        type="button"
                        onClick={async () => {
                            closePolygonContextMenu();
                            setSelectedId(polygonId);
                            setCurrentParcelId(polygonId);
                            await loadParcelOperations(polygonId);
                            setOperationPopup({ x: x + 10, y: y + 10, polygonId });
                            setPopupCoords({ left: x + 10, top: y + 10 });
                        }}
                        className={`${floatingButtonClasses} text-slate-800`}
                    >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">📋</span>
                        {t('operations.title', { defaultValue: 'Parcel operations' })}
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => { closePolygonContextMenu(); startEdit(polygonId); }}
                    className={`${floatingButtonClasses} text-slate-800`}
                >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">🔧</span>
                    {t('map.polygonMenu.edit')}
                </button>

                {isImportMode && (
                    <button
                        type="button"
                        onClick={() => { closePolygonContextMenu(); approveSingleParcel(polygonId); }}
                        className={`${floatingButtonClasses} text-emerald-700`}
                    >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-base text-emerald-600">✅</span>
                        {t('imports.map.approveOne', { defaultValue: 'Approve parcel' })}
                    </button>
                )}

                {!showColorPicker ? (
                    <button
                        type="button"
                        onClick={() => setShowColorPicker(true)}
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
                            {COLORS.map(color => {
                                const isCurrent = polygons.find(p => p.id === polygonId)?.color === color;
                                return (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={async () => {
                                            setPolygons(prev => prev.map(p => p.id === polygonId ? { ...p, color } : p));
                                            originalColorRef.current = null;
                                            closePolygonContextMenu();
                                            try {
                                                await apiPut(`${parcelsEndpoint}/${polygonId}`, { color });
                                            } catch (err) {
                                                console.error("Failed to update parcel color:", err);
                                            }
                                        }}
                                        onMouseEnter={() => {
                                            if (!originalColorRef.current) {
                                                originalColorRef.current = polygons.find(p => p.id === polygonId)?.color || '#3388ff';
                                            }
                                            setPolygons(prev => prev.map(p => p.id === polygonId ? { ...p, color } : p));
                                        }}
                                        onMouseLeave={() => {
                                            if (originalColorRef.current) {
                                                const saved = originalColorRef.current;
                                                setPolygons(prev => prev.map(p => p.id === polygonId ? { ...p, color: saved } : p));
                                            }
                                        }}
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
                            {t('common.cancel')}
                        </button>
                    </div>
                )}

                <button
                    type="button"
                    onClick={() => {
                        if (pendingDeleteId === polygonId) {
                            deletePolygon(pendingDeleteId);
                            closePolygonContextMenu();
                        } else {
                            setPendingDeleteId(polygonId);
                        }
                    }}
                    className={`${floatingButtonClasses} ${pendingDeleteId === polygonId ? 'bg-rose-500 text-white hover:!bg-rose-600 hover:!text-white' : 'text-rose-600 hover:bg-rose-50'}`}
                >
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-base ${pendingDeleteId === polygonId ? 'bg-white/20 text-white' : 'bg-rose-50 text-rose-600'}`}>🗑️</span>
                    {pendingDeleteId === polygonId ? t('common.confirm') : t('common.delete')}
                </button>
            </div>
        </div>
    );
}
