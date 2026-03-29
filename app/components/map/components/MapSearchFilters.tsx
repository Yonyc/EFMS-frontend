import React from "react";
import type { OperationTypeDto, ProductDto, ToolDto } from "../types";

interface MapSearchFiltersProps {
    isImportMode: boolean;
    isSearchOpen: boolean;
    searchDraft: {
        periodId: string;
        operationTypeId: string;
        productId: string;
        toolId: string;
        startDate: string;
        endDate: string;
        useMapArea: boolean;
        usePolygon: boolean;
    };
    setSearchDraft: React.Dispatch<React.SetStateAction<{
        periodId: string;
        operationTypeId: string;
        productId: string;
        toolId: string;
        startDate: string;
        endDate: string;
        useMapArea: boolean;
        usePolygon: boolean;
    }>>;
    tools: ToolDto[];
    products: ProductDto[];
    periods: any[];
    operationTypes: OperationTypeDto[];
    searchAreaCoords: [number, number][];
    isSearchDrawing: boolean;
    startSearchPolygon: () => void;
    cancelSearchPolygon: () => void;
    clearSearchPolygon: () => void;
    clearSearchFilters: () => void;
    applySearchFilters: () => void;
    t: any;
}

const MapSearchFilters = React.memo((props: MapSearchFiltersProps) => {
    const {
        isImportMode, isSearchOpen, searchDraft, setSearchDraft,
        tools, products, periods, operationTypes, searchAreaCoords, isSearchDrawing,
        startSearchPolygon, cancelSearchPolygon, clearSearchPolygon,
        clearSearchFilters, applySearchFilters, t
    } = props;

    if (isImportMode || !isSearchOpen) return null;

    return (
        <div className="pointer-events-auto absolute top-16 right-4 z-[2000] w-[320px] max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur-md">
            <div className="flex flex-col gap-4">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('map.searchFilters.periodLabel')}
                    <select
                        value={searchDraft.periodId}
                        onChange={(event) => setSearchDraft(prev => ({ ...prev, periodId: event.target.value }))}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
                    >
                        <option value="">{t('map.searchFilters.anyPeriod')}</option>
                        {periods.map((period) => (
                            <option key={period.id} value={String(period.id)}>
                                {period.name || `${period.startDate || ''} - ${period.endDate || ''}`}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('map.searchFilters.typeLabel')}
                    <select
                        value={searchDraft.operationTypeId}
                        onChange={(event) => setSearchDraft(prev => ({ ...prev, operationTypeId: event.target.value }))}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
                    >
                        <option value="">{t('map.searchFilters.anyType')}</option>
                        {operationTypes.map((type) => (
                            <option key={type.id} value={String(type.id)}>{type.name}</option>
                        ))}
                    </select>
                </label>

                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('map.searchFilters.toolLabel')}
                    <select
                        value={searchDraft.toolId}
                        onChange={(event) => setSearchDraft(prev => ({ ...prev, toolId: event.target.value }))}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
                    >
                        <option value="">{t('map.searchFilters.anyTool')}</option>
                        {tools.map((tool) => (
                            <option key={tool.id} value={String(tool.id)}>{tool.name}</option>
                        ))}
                    </select>
                </label>

                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('map.searchFilters.productLabel')}
                    <select
                        value={searchDraft.productId}
                        onChange={(event) => setSearchDraft(prev => ({ ...prev, productId: event.target.value }))}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
                    >
                        <option value="">{t('map.searchFilters.anyProduct')}</option>
                        {products.map((product) => (
                            <option key={product.id} value={String(product.id)}>{product.name}</option>
                        ))}
                    </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('map.searchFilters.startDate')}
                        <input
                            type="date"
                            value={searchDraft.startDate}
                            onChange={(event) => setSearchDraft(prev => ({ ...prev, startDate: event.target.value }))}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
                        />
                    </label>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('map.searchFilters.endDate')}
                        <input
                            type="date"
                            value={searchDraft.endDate}
                            onChange={(event) => setSearchDraft(prev => ({ ...prev, endDate: event.target.value }))}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
                        />
                    </label>
                </div>

                <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                        type="checkbox"
                        checked={searchDraft.useMapArea}
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
                            disabled={!searchAreaCoords.length}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400 disabled:opacity-50"
                        />
                        <span>
                            {t('map.searchFilters.usePolygon')}
                            <span className="mt-1 block text-xs text-slate-500">{t('map.searchFilters.usePolygonHint')}</span>
                        </span>
                    </label>
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={clearSearchFilters}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                    {t('map.searchFilters.clear')}
                </button>
                <button
                    type="button"
                    onClick={applySearchFilters}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500"
                >
                    {t('map.searchFilters.apply')}
                </button>
            </div>
        </div>
    );
});

export default MapSearchFilters;
