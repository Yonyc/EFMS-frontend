import { useTranslation } from "react-i18next";
import { FunnelIcon } from "@heroicons/react/24/outline";
import type { OverlapWarning, ParcelSearchFilters } from "../types";
import { hasActiveSearchFilters } from "../utils/map";

interface MapToolbarProps {
    isImportMode: boolean;
    allowCreate: boolean;
    isSearchOpen: boolean;
    setIsSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
    appliedFilters: ParcelSearchFilters;
    overlapWarning: OverlapWarning | null;
    showPreview: boolean;
    setShowPreview: React.Dispatch<React.SetStateAction<boolean>>;
    previewVisibility: { original: boolean; fixed: boolean };
    setPreviewVisibility: React.Dispatch<React.SetStateAction<{ original: boolean; fixed: boolean }>>;
    editingId: string | null;
    isCreating: boolean;
    isInspecting: boolean;
    createPointCount: number;
    createHandlerRef: React.RefObject<any>;
    startCreate: () => void;
    finishCreate: () => void;
    cancelCreate: () => void;
    validateInspection: () => void;
    cancelInspection: () => void;
    finishEdit: () => void;
    cancelEdit: () => void;
}

const toolbarButtonBase = "inline-flex items-center justify-center rounded-2xl border px-3 py-2 text-sm font-semibold shadow-lg shadow-900/10 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-200";

export function MapToolbar({
    isImportMode,
    allowCreate,
    isSearchOpen,
    setIsSearchOpen,
    appliedFilters,
    overlapWarning,
    showPreview,
    setShowPreview,
    previewVisibility,
    setPreviewVisibility,
    editingId,
    isCreating,
    isInspecting,
    createPointCount,
    createHandlerRef,
    startCreate,
    finishCreate,
    cancelCreate,
    validateInspection,
    cancelInspection,
    finishEdit,
    cancelEdit,
}: MapToolbarProps) {
    const { t } = useTranslation();

    return (
        <div data-tour-id="map-toolbar" className="pointer-events-auto absolute top-4 right-4 z-[2000] flex flex-wrap justify-end gap-2">
            {!isImportMode && (
                <button
                    type="button"
                    onClick={() => setIsSearchOpen(prev => !prev)}
                    title={t('map.searchFilters.title')}
                    className={`${toolbarButtonBase} border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50`}
                >
                    <FunnelIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('map.searchFilters.button')}</span>
                    {hasActiveSearchFilters(appliedFilters) && (
                        <span className="ml-1 h-2 w-2 rounded-full bg-emerald-500" />
                    )}
                </button>
            )}

            {overlapWarning && showPreview ? (
                <>
                    <button
                        type="button"
                        onClick={() => setShowPreview(false)}
                        title={t('map.preview.back')}
                        className={`${toolbarButtonBase} border-indigo-500 bg-indigo-600 text-white hover:-translate-y-0.5 hover:bg-indigo-500`}
                    >
                        <span className="text-base">👁️</span>
                        {t('map.preview.back')}
                    </button>
                    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-900/80 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100 shadow-2xl shadow-slate-900/30 backdrop-blur">
                        <button
                            type="button"
                            onClick={() => setPreviewVisibility(prev => ({ ...prev, original: !prev.original }))}
                            disabled={!overlapWarning.originalCoords?.length}
                            className={`rounded-2xl px-3 py-1 transition ${previewVisibility.original ? 'bg-rose-500 text-white' : 'text-slate-100 hover:text-white'} ${overlapWarning.originalCoords?.length ? '' : 'cursor-not-allowed opacity-40'}`}
                        >
                            {t('map.preview.original')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setPreviewVisibility(prev => ({ ...prev, fixed: !prev.fixed }))}
                            disabled={!overlapWarning.fixedCoords?.length}
                            className={`rounded-2xl px-3 py-1 transition ${previewVisibility.fixed ? 'bg-emerald-500 text-white' : 'text-slate-100 hover:text-white'} ${overlapWarning.fixedCoords?.length ? '' : 'cursor-not-allowed opacity-40'}`}
                        >
                            {t('map.preview.fixed')}
                        </button>
                    </div>
                </>
            ) : (allowCreate && !editingId && !isCreating && !overlapWarning && (
                <button
                    type="button"
                    onClick={startCreate}
                    title={t('map.toolbar.addTitle')}
                    className={`${toolbarButtonBase} border-indigo-500 bg-indigo-600 text-lg text-white hover:-translate-y-0.5 hover:bg-indigo-500`}
                >
                    +
                </button>
            ))}

            {allowCreate && isInspecting && !overlapWarning && (
                <>
                    <button
                        type="button"
                        onClick={validateInspection}
                        title={t('map.toolbar.confirmInspection')}
                        className={`${toolbarButtonBase} border-emerald-500 bg-emerald-500 text-white hover:-translate-y-0.5 hover:bg-emerald-400`}
                    >
                        {t('common.confirm')} ✓
                    </button>
                    <button
                        type="button"
                        onClick={cancelInspection}
                        title={t('map.toolbar.cancelInspection')}
                        className={`${toolbarButtonBase} border-rose-500 bg-rose-500 text-white hover:-translate-y-0.5 hover:bg-rose-400`}
                    >
                        ✕
                    </button>
                </>
            )}

            {allowCreate && isCreating && (
                <>
                    <button
                        type="button"
                        onClick={finishCreate}
                        title={t('map.toolbar.finishDrawing')}
                        disabled={createPointCount < 3}
                        className={`${toolbarButtonBase} border-emerald-500 bg-emerald-500 text-white ${createPointCount < 3 ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5 hover:bg-emerald-400'}`}
                    >
                        ✓
                    </button>
                    <button
                        type="button"
                        onClick={cancelCreate}
                        title={t('map.toolbar.cancelDrawing')}
                        className={`${toolbarButtonBase} border-rose-500 bg-rose-500 text-white hover:-translate-y-0.5 hover:bg-rose-400`}
                    >
                        ✕
                    </button>
                    <button
                        type="button"
                        onClick={() => createHandlerRef.current?.deleteLastVertex?.()}
                        title={t('map.toolbar.removeLastPoint')}
                        className={`${toolbarButtonBase} border-slate-300 bg-white text-slate-600 hover:-translate-y-0.5 hover:bg-slate-50`}
                    >
                        -
                    </button>
                </>
            )}

            {editingId && (
                <>
                    <button
                        type="button"
                        onClick={finishEdit}
                        title={t('map.toolbar.saveEdit')}
                        className={`${toolbarButtonBase} border-emerald-500 bg-emerald-500 text-white hover:-translate-y-0.5 hover:bg-emerald-400`}
                    >
                        ✓
                    </button>
                    <button
                        type="button"
                        onClick={cancelEdit}
                        title={t('map.toolbar.cancelEdit')}
                        className={`${toolbarButtonBase} border-rose-500 bg-rose-500 text-white hover:-translate-y-0.5 hover:bg-rose-400`}
                    >
                        ✕
                    </button>
                </>
            )}
        </div>
    );
}
