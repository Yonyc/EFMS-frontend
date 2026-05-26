import React from "react";
import type { OverlapWarning } from "../types";

interface MapToolbarProps {
    showPreview: boolean;
    setShowPreview: (val: boolean) => void;
    overlapWarning: OverlapWarning | null;
    setPreviewVisibility: (val: (prev: { original: boolean; fixed: boolean }) => { original: boolean; fixed: boolean }) => void;
    previewVisibility: { original: boolean; fixed: boolean };
    allowCreate: boolean;
    editingId: string | null;
    isCreating: boolean;
    startCreate: () => void;
    finishCreate: () => void;
    cancelCreate: () => void;
    createPointCount: number;
    onDeleteLastVertex: () => void;
    autoCorrectEnabled: boolean;
    toggleAutoCorrect: () => void;
    closeLoopMidpointEnabled: boolean;
    toggleCloseLoopMidpoint: () => void;
    finishEdit: () => void;
    cancelEdit: () => void;
    t: any;
    // 1 = top level, max can be Infinity for all
    minLayer?: number;
    setMinLayer?: (val: number) => void;
    maxLayer?: number;
    setMaxLayer?: (val: number) => void;
    // gates the family-scope toggle
    familyScopeAvailable?: boolean;
    restrictToFamily?: boolean;
    setRestrictToFamily?: (val: boolean) => void;
    // search props
    setIsSearchOpen?: (val: boolean | ((prev: boolean) => boolean)) => void;
    hasActiveSearchFilters?: boolean;
    isImportMode?: boolean;
    onRemoveLastHover?: (hovering: boolean) => void;
}

type Variant = "neutral" | "primary" | "success" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
    neutral: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    primary: "border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-500",
    success: "border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-500",
    danger: "border-rose-500 bg-rose-600 text-white hover:bg-rose-500",
};

// shared button shape so the toolbar reads as a uniform set
const TOOL_BUTTON_BASE =
    "inline-flex h-10 min-w-[2.5rem] items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold shadow-md shadow-slate-900/10 transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";

interface ToolButtonProps {
    onClick: () => void;
    title: string;
    icon?: React.ReactNode;
    label?: string;
    variant?: Variant;
    active?: boolean;
    disabled?: boolean;
    badge?: boolean;
    onHoverChange?: (hovering: boolean) => void;
}

const ToolButton = ({
    onClick, title, icon, label, variant = "neutral", active = false, disabled = false, badge = false, onHoverChange,
}: ToolButtonProps) => {
    // active toggle wins over the base variant so toggles read consistently
    const stateClasses = active
        ? "border-indigo-400 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
        : VARIANT_CLASSES[variant];
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            aria-label={title}
            aria-pressed={active}
            disabled={disabled}
            onMouseEnter={onHoverChange ? () => onHoverChange(true) : undefined}
            onMouseLeave={onHoverChange ? () => onHoverChange(false) : undefined}
            onFocus={onHoverChange ? () => onHoverChange(true) : undefined}
            onBlur={onHoverChange ? () => onHoverChange(false) : undefined}
            className={`${TOOL_BUTTON_BASE} ${stateClasses}`}
        >
            {icon != null && <span className="text-base leading-none">{icon}</span>}
            {label && <span className="hidden sm:inline">{label}</span>}
            {badge && <span className="ml-0.5 h-2 w-2 rounded-full bg-emerald-500" />}
        </button>
    );
};

const MapToolbar = React.memo((props: MapToolbarProps) => {
    const {
        showPreview, setShowPreview, overlapWarning, setPreviewVisibility,
        previewVisibility, allowCreate, editingId, isCreating,
        startCreate, finishCreate, cancelCreate, createPointCount,
        onDeleteLastVertex, autoCorrectEnabled, toggleAutoCorrect,
        closeLoopMidpointEnabled, toggleCloseLoopMidpoint,
        finishEdit, cancelEdit, t,
        minLayer = 1, setMinLayer,
        maxLayer = 1, setMaxLayer,
        familyScopeAvailable = false, restrictToFamily = false, setRestrictToFamily,
        setIsSearchOpen, hasActiveSearchFilters, isImportMode,
        onRemoveLastHover
    } = props;

    const isBusy = isCreating || !!editingId;

    const editingToggles = (
        <>
            <ToolButton
                onClick={toggleAutoCorrect}
                title={t('map.toolbar.toggleAutoCorrect', { defaultValue: 'Toggle auto overlap correction' })}
                icon="🔧"
                label={autoCorrectEnabled ? t('map.toolbar.autoCorrectOn') : t('map.toolbar.autoCorrectOff')}
                active={autoCorrectEnabled}
            />
            <ToolButton
                onClick={toggleCloseLoopMidpoint}
                title={t('map.toolbar.toggleCloseLoopMidpoint', { defaultValue: 'Toggle cursor add point on closing edge' })}
                icon="🔗"
                label={closeLoopMidpointEnabled ? t('map.toolbar.closeLoopMidpointOn') : t('map.toolbar.closeLoopMidpointOff')}
                active={closeLoopMidpointEnabled}
            />
        </>
    );

    return (
        <div className="pointer-events-auto flex flex-col items-stretch gap-2">
            {/* view controls. pinned to the bottom of the toolbar via order-last. */}
            <div className="order-last flex flex-col items-stretch gap-2">
            {!isImportMode && setIsSearchOpen && !isBusy && (
                <ToolButton
                    onClick={() => setIsSearchOpen(prev => !prev)}
                    title={t('map.searchFilters.title')}
                    icon="🔍"
                    label={t('map.searchFilters.button')}
                    badge={!!hasActiveSearchFilters}
                />
            )}
            {setMaxLayer && setMinLayer && (() => {
                const title = t('map.toolbar.layersTitle', { defaultValue: 'Choose which parcel layers to display' });
                const layerOptions = [1, 2, 3, 4];
                const allValue = "all";
                const selectCls = "h-7 rounded-lg bg-transparent px-1 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300";
                const maxStr = Number.isFinite(maxLayer) ? String(maxLayer) : allValue;
                // bump the other end if the range crosses, so it stays valid
                const onMinChange = (v: number) => {
                    setMinLayer(v);
                    if (Number.isFinite(maxLayer) && v > maxLayer) setMaxLayer(v);
                };
                const onMaxChange = (raw: string) => {
                    const v = raw === allValue ? Number.POSITIVE_INFINITY : Number(raw);
                    setMaxLayer(v);
                    if (Number.isFinite(v) && v < minLayer) setMinLayer(v);
                };
                return (
                    <div
                        title={title}
                        className="inline-flex h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 shadow-md shadow-slate-900/10"
                    >
                        <span className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {t('map.toolbar.layersLabel', { defaultValue: 'Layers' })}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">
                            {t('map.toolbar.layersFrom', { defaultValue: 'From' })}
                        </span>
                        <select
                            value={minLayer}
                            onChange={(e) => onMinChange(Number(e.target.value))}
                            title={title}
                            aria-label={t('map.toolbar.layersFrom', { defaultValue: 'From' })}
                            className={selectCls}
                        >
                            {layerOptions.map(n => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">
                            {t('map.toolbar.layersTo', { defaultValue: 'To' })}
                        </span>
                        <select
                            value={maxStr}
                            onChange={(e) => onMaxChange(e.target.value)}
                            title={title}
                            aria-label={t('map.toolbar.layersTo', { defaultValue: 'To' })}
                            className={selectCls}
                        >
                            {layerOptions.map(n => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                            <option value={allValue}>{t('map.toolbar.layersAll', { defaultValue: 'All' })}</option>
                        </select>
                    </div>
                );
            })()}
            {familyScopeAvailable && setRestrictToFamily && (
                <ToolButton
                    onClick={() => setRestrictToFamily(!restrictToFamily)}
                    title={restrictToFamily
                        ? t('map.toolbar.scopeShowAll', { defaultValue: 'Show all' })
                        : t('map.toolbar.scopeFamilyOnly', { defaultValue: 'Hide other parcels' })}
                    icon="👁️"
                    label={restrictToFamily
                        ? t('map.toolbar.scopeShowAll', { defaultValue: 'Show all' })
                        : t('map.toolbar.scopeFamilyOnly', { defaultValue: 'Hide other parcels' })}
                    active={restrictToFamily}
                />
            )}
            </div>

            {/* Contextual actions. */}
            {showPreview && overlapWarning ? (
                <>
                    <ToolButton
                        onClick={() => setShowPreview(false)}
                        title={t('map.preview.back')}
                        icon="👁️"
                        label={t('map.preview.back')}
                        variant="primary"
                    />
                    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-md shadow-slate-900/10">
                        <button
                            type="button"
                            onClick={() => setPreviewVisibility(prev => ({ ...prev, original: !prev.original }))}
                            disabled={!overlapWarning.originalCoords?.length}
                            className={`h-8 flex-1 rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition ${previewVisibility.original ? 'bg-rose-500 text-white' : 'text-slate-600 hover:bg-slate-100'} ${overlapWarning.originalCoords?.length ? '' : 'cursor-not-allowed opacity-40'}`}
                        >
                            {t('map.preview.original')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setPreviewVisibility(prev => ({ ...prev, fixed: !prev.fixed }))}
                            disabled={!overlapWarning.fixedCoords?.length}
                            className={`h-8 flex-1 rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition ${previewVisibility.fixed ? 'bg-emerald-500 text-white' : 'text-slate-600 hover:bg-slate-100'} ${overlapWarning.fixedCoords?.length ? '' : 'cursor-not-allowed opacity-40'}`}
                        >
                            {t('map.preview.fixed')}
                        </button>
                    </div>
                </>
            ) : allowCreate && !editingId && !isCreating ? (
                <ToolButton
                    onClick={startCreate}
                    title={t('map.toolbar.addTitle')}
                    icon="➕"
                    label={t('map.toolbar.addTitle')}
                    variant="primary"
                />
            ) : null}

            {allowCreate && isCreating && (
                <>
                    {editingToggles}
                    <ToolButton
                        onClick={finishCreate}
                        title={t('map.toolbar.finishDrawing')}
                        icon="✓"
                        label={t('map.toolbar.finishDrawing')}
                        variant="success"
                        disabled={createPointCount < 3}
                    />
                    <ToolButton
                        onClick={cancelCreate}
                        title={t('map.toolbar.cancelDrawing')}
                        icon="✕"
                        label={t('map.toolbar.cancelDrawing')}
                        variant="danger"
                    />
                    <ToolButton
                        onClick={onDeleteLastVertex}
                        title={t('map.toolbar.removeLastPoint')}
                        icon="↩️"
                        label={t('map.toolbar.removeLastPoint')}
                        onHoverChange={onRemoveLastHover}
                    />
                </>
            )}

            {editingId && (
                <>
                    {editingToggles}
                    <ToolButton
                        onClick={() => finishEdit()}
                        title={t('map.toolbar.saveEdit')}
                        icon="✓"
                        label={t('map.toolbar.saveEdit')}
                        variant="success"
                    />
                    <ToolButton
                        onClick={cancelEdit}
                        title={t('map.toolbar.cancelEdit')}
                        icon="✕"
                        label={t('map.toolbar.cancelEdit')}
                        variant="danger"
                    />
                    <ToolButton
                        onClick={onDeleteLastVertex}
                        title={t('map.toolbar.removeLastPoint')}
                        icon="↩️"
                        label={t('map.toolbar.removeLastPoint')}
                        onHoverChange={onRemoveLastHover}
                    />
                </>
            )}
        </div>
    );
});

export default MapToolbar;
