import React from "react";
import type { OperationTypeDto, ProductDto, ToolDto, ParcelSearchFilters, ShareFilterOptions } from "../types";
import MultiSelectCombobox from "../../MultiSelectCombobox";

interface MapSearchFiltersProps {
    isImportMode: boolean;
    isSearchOpen: boolean;
    onClose: () => void;
    searchDraft: ParcelSearchFilters;
    setSearchDraft: React.Dispatch<React.SetStateAction<ParcelSearchFilters>>;
    tools: ToolDto[];
    products: ProductDto[];
    periods: any[];
    operationTypes: OperationTypeDto[];
    
    shareFilterOptions?: ShareFilterOptions[];
    searchAreaCoords: [number, number][];
    isSearchDrawing: boolean;
    startSearchPolygon: () => void;
    cancelSearchPolygon: () => void;
    clearSearchPolygon: () => void;
    clearSearchFilters: () => void;
    applySearchFilters: () => void;
    hasActiveSearchFilters: boolean;
    onShareFilter?: () => void;
    shareFilterFeedback?: string;
    disabled?: boolean;
    t: any;
}

const MapSearchFilters = React.memo((props: MapSearchFiltersProps) => {
    const {
        isImportMode, isSearchOpen, onClose,
        searchDraft, setSearchDraft,
        tools, products, periods, operationTypes, shareFilterOptions, searchAreaCoords, isSearchDrawing,
        startSearchPolygon, cancelSearchPolygon, clearSearchPolygon,
        clearSearchFilters, applySearchFilters,
        onShareFilter, shareFilterFeedback,
        disabled, t
    } = props;

    const productLabel = (product: ProductDto) => {
        if (product.official) {
            const auth = product.officialAuthNumber ? ` (${product.officialAuthNumber})` : '';
            return t('products.officialLabel', { defaultValue: 'Official: {{name}}{{auth}}', name: product.name, auth });
        }
        return product.name;
    };

    const shareScoped = !!(shareFilterOptions && shareFilterOptions.length > 0);
    const activeShare = shareScoped
        ? shareFilterOptions!.find(s => String(s.shareId) === searchDraft.selectedShareId)
        : undefined;

    const periodOptions = (shareScoped && activeShare)
        ? activeShare.periods.map(o => ({ value: String(o.id), label: o.label }))
        : periods.map((p) => ({ value: String(p.id), label: p.name || `${p.startDate || ''} - ${p.endDate || ''}` }));
    const typeOptions = (shareScoped && activeShare)
        ? activeShare.operationTypes.map(o => ({ value: String(o.id), label: o.label }))
        : operationTypes.map((type) => ({ value: String(type.id), label: type.name }));
    const toolOptions = (shareScoped && activeShare)
        ? activeShare.tools.map(o => ({ value: String(o.id), label: o.label }))
        : tools.map((tl) => ({ value: String(tl.id), label: tl.name }));
    const productOptions = (shareScoped && activeShare)
        ? activeShare.products.map(o => ({ value: String(o.id), label: o.label }))
        : products.map((p) => ({ value: String(p.id), label: productLabel(p) }));

    const selectShare = (shareId: string) => {
        setSearchDraft(prev => ({
            ...prev,
            selectedShareId: shareId,
            periodIds: [], operationTypeIds: [], toolIds: [], productIds: [],
        }));
    };

    if (isImportMode || !isSearchOpen) return null;

    const header = (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-2">
            <span className="text-sm font-semibold text-slate-800">
                {t('map.searchFilters.title')}
            </span>
            <button
                type="button"
                onClick={onClose}
                title={t('common.close', { defaultValue: 'Close' })}
                aria-label={t('common.close', { defaultValue: 'Close' })}
                className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
                ✕
            </button>
        </div>
    );

    return (
        <div className={`pointer-events-auto flex max-h-[calc(100vh-6rem)] w-[320px] max-w-[90vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl shadow-slate-900/15 backdrop-blur-md ${disabled ? 'opacity-60' : ''}`}>
            {header}
            <div className="flex-1 overflow-y-auto p-4">
                    <div className="flex flex-col gap-4">
                        {shareScoped && (
                            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-3">
                                <label className="block text-xs font-semibold uppercase tracking-wide text-indigo-600">
                                    {t('map.searchFilters.shareScope', { defaultValue: 'Shared zone' })}
                                </label>
                                <p className="mt-0.5 text-xs text-slate-500">
                                    {t('map.searchFilters.shareScopeHint', { defaultValue: 'Pick a zone you have access to, then filter within it.' })}
                                </p>
                                <select
                                    value={searchDraft.selectedShareId ?? ''}
                                    onChange={(e) => selectShare(e.target.value)}
                                    disabled={disabled}
                                    className="mt-2 w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
                                >
                                    <option value="">{t('map.searchFilters.shareScopePlaceholder', { defaultValue: 'Select a shared zone…' })}</option>
                                    {shareFilterOptions!.map((s) => (
                                        <option key={s.shareId} value={String(s.shareId)}>{s.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <MultiSelectCombobox
                            label={t('map.searchFilters.periodLabel')}
                            options={periodOptions}
                            selectedValues={searchDraft.periodIds}
                            onChange={(next) => setSearchDraft(prev => ({ ...prev, periodIds: next }))}
                            placeholder={t('map.searchFilters.anyPeriod')}
                            disabled={disabled || (shareScoped && !activeShare)}
                        />

                        <MultiSelectCombobox
                            label={t('map.searchFilters.typeLabel')}
                            options={typeOptions}
                            selectedValues={searchDraft.operationTypeIds}
                            onChange={(next) => setSearchDraft(prev => ({ ...prev, operationTypeIds: next }))}
                            placeholder={t('map.searchFilters.anyType')}
                            disabled={disabled || (shareScoped && !activeShare)}
                        />

                        <MultiSelectCombobox
                            label={t('map.searchFilters.toolLabel')}
                            options={toolOptions}
                            selectedValues={searchDraft.toolIds}
                            onChange={(next) => setSearchDraft(prev => ({ ...prev, toolIds: next }))}
                            placeholder={t('map.searchFilters.anyTool')}
                            disabled={disabled || (shareScoped && !activeShare)}
                        />

                        <MultiSelectCombobox
                            label={t('map.searchFilters.productLabel')}
                            options={productOptions}
                            selectedValues={searchDraft.productIds}
                            onChange={(next) => setSearchDraft(prev => ({ ...prev, productIds: next }))}
                            placeholder={t('map.searchFilters.anyProduct')}
                            disabled={disabled || (shareScoped && !activeShare)}
                        />

                        <div className="grid grid-cols-2 gap-3">
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {t('map.searchFilters.startDate')}
                                <input
                                    type="date"
                                    value={searchDraft.startDate}
                                    disabled={disabled}
                                    onChange={(event) => setSearchDraft(prev => ({ ...prev, startDate: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
                                />
                            </label>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {t('map.searchFilters.endDate')}
                                <input
                                    type="date"
                                    value={searchDraft.endDate}
                                    disabled={disabled}
                                    onChange={(event) => setSearchDraft(prev => ({ ...prev, endDate: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
                                />
                            </label>
                        </div>

                        <label className="flex items-start gap-2 text-sm text-slate-700">
                            <input
                                type="checkbox"
                                checked={searchDraft.useMapArea}
                                disabled={disabled}
                                onChange={(event) => setSearchDraft(prev => ({ ...prev, useMapArea: event.target.checked }))}
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                            />
                            <span>
                                {t('map.searchFilters.mapAreaLabel')}
                                <span className="mt-1 block text-xs text-slate-500">{t('map.searchFilters.mapAreaHint')}</span>
                            </span>
                        </label>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('map.searchFilters.polygonLabel')}</p>
                                    <p className="text-xs text-slate-500">
                                        {searchAreaCoords.length ? t('map.searchFilters.polygonReady') : t('map.searchFilters.polygonEmpty')}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={searchAreaCoords.length ? clearSearchPolygon : startSearchPolygon}
                                    disabled={disabled}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                                >
                                    {searchAreaCoords.length ? t('map.searchFilters.clearPolygon') : t('map.searchFilters.drawPolygon')}
                                </button>
                            </div>
                            {isSearchDrawing && (
                                <div className="mt-2 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                    <span>{t('map.searchFilters.drawingHint')}</span>
                                    <button
                                        type="button"
                                        onClick={cancelSearchPolygon}
                                        disabled={disabled}
                                        className="font-semibold text-amber-800 hover:underline"
                                    >
                                        {t('map.searchFilters.cancelDraw')}
                                    </button>
                                </div>
                            )}
                            <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={searchDraft.usePolygon}
                                    onChange={(event) => setSearchDraft(prev => ({ ...prev, usePolygon: event.target.checked }))}
                                    disabled={disabled || !searchAreaCoords.length}
                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400 disabled:opacity-50"
                                />
                                <span>
                                    {t('map.searchFilters.usePolygon')}
                                    <span className="mt-1 block text-xs text-slate-500">{t('map.searchFilters.usePolygonHint')}</span>
                                </span>
                            </label>
                        </div>
                    </div>

                    {onShareFilter && (
                        <div className="mt-4 border-t border-slate-200 pt-3">
                            <button
                                type="button"
                                onClick={onShareFilter}
                                disabled={disabled}
                                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100 disabled:opacity-50"
                            >
                                <span aria-hidden>🔗</span>
                                {t('map.searchFilters.shareFilter', { defaultValue: 'Share current filter' })}
                            </button>
                            {shareFilterFeedback && (
                                <p className="mt-1.5 text-xs text-slate-500">{shareFilterFeedback}</p>
                            )}
                        </div>
                    )}

            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 p-4">
                <button
                    type="button"
                    onClick={clearSearchFilters}
                    disabled={disabled}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                    {t('map.searchFilters.clear')}
                </button>
                <button
                    type="button"
                    onClick={applySearchFilters}
                    disabled={disabled}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500"
                >
                    {t('map.searchFilters.apply')}
                </button>
            </div>
        </div>
    );
});

export default MapSearchFilters;
