import React from 'react';
import { useTranslation } from 'react-i18next';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { PeriodDto, ToolDto, ProductDto, ParcelSearchFilters } from '../types';

interface SearchPanelProps {
    isSearchOpen: boolean;
    setIsSearchOpen: (open: boolean) => void;
    searchDraft: ParcelSearchFilters;
    setSearchDraft: React.Dispatch<React.SetStateAction<ParcelSearchFilters>>;
    periods: PeriodDto[];
    tools: ToolDto[];
    products: ProductDto[];
    isDrawing: boolean;
    onStartDraw: () => void;
    onCancelDraw: () => void;
    onClearPolygon?: () => void;
    onApply: () => void;
}

export function SearchPanel({
    isSearchOpen,
    setIsSearchOpen,
    searchDraft,
    setSearchDraft,
    periods,
    tools,
    products,
    isDrawing,
    onStartDraw,
    onCancelDraw,
    onClearPolygon,
    onApply
}: SearchPanelProps) {
    const { t } = useTranslation();

    if (!isSearchOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">{t('map.search.title')}</h3>
                        <p className="text-sm text-slate-500 mt-0.5">{t('map.search.subtitle')}</p>
                    </div>
                    <button
                        onClick={() => setIsSearchOpen(false)}
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t('map.search.period')}</label>
                            <select
                                className="w-full h-12 rounded-xl border-slate-200 bg-slate-50 text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                                value={searchDraft.periodId}
                                onChange={(event) => setSearchDraft(prev => ({ ...prev, periodId: event.target.value }))}
                            >
                                <option value="">{t('map.search.allPeriods')}</option>
                                {periods.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t('map.search.tool')}</label>
                            <select
                                className="w-full h-12 rounded-xl border-slate-200 bg-slate-50 text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                                value={searchDraft.toolId}
                                onChange={(event) => setSearchDraft(prev => ({ ...prev, toolId: event.target.value }))}
                            >
                                <option value="">{t('map.search.allTools')}</option>
                                {tools.map(tool => (
                                    <option key={tool.id} value={tool.id}>{tool.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t('map.search.product')}</label>
                        <select
                            className="w-full h-12 rounded-xl border-slate-200 bg-slate-50 text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                            value={searchDraft.productId}
                            onChange={(event) => setSearchDraft(prev => ({ ...prev, productId: event.target.value }))}
                        >
                            <option value="">{t('map.search.allProducts')}</option>
                            {products.map(product => (
                                <option key={product.id} value={product.id}>{product.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t('map.search.startDate')}</label>
                            <input
                                type="date"
                                className="w-full h-12 rounded-xl border-slate-200 bg-slate-50 text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                                value={searchDraft.startDate}
                                onChange={(event) => setSearchDraft(prev => ({ ...prev, startDate: event.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t('map.search.endDate')}</label>
                            <input
                                type="date"
                                className="w-full h-12 rounded-xl border-slate-200 bg-slate-50 text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                                value={searchDraft.endDate}
                                onChange={(event) => setSearchDraft(prev => ({ ...prev, endDate: event.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="pt-4 space-y-4">
                        <button
                            type="button"
                            onClick={() => setSearchDraft(prev => ({ ...prev, useMapArea: !prev.useMapArea }))}
                            className={`flex w-full items-center gap-3 rounded-2xl border p-4 transition-all duration-200 ${
                                searchDraft.useMapArea 
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm shadow-indigo-100' 
                                    : 'bg-white border-slate-100 text-slate-600 hover:border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            <div className={`h-6 w-6 shrink-0 flex items-center justify-center rounded-lg transition-colors ${searchDraft.useMapArea ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                {searchDraft.useMapArea && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <div className="text-left">
                                <span className="block text-sm font-bold">{t('map.search.useMapArea')}</span>
                                <span className="block text-xs text-slate-500">{t('map.search.useMapAreaDesc')}</span>
                            </div>
                        </button>

                        <div className={`rounded-2xl border p-4 transition-all duration-200 ${
                            searchDraft.usePolygon 
                                ? 'bg-indigo-50 border-indigo-200' 
                                : 'bg-white border-slate-100 hover:border-slate-200'
                        }`}>
                            <div className="flex w-full items-center gap-3 mb-4">
                                <div
                                    className={`h-6 w-6 shrink-0 flex items-center justify-center rounded-lg transition-colors ${searchDraft.usePolygon ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                                    onClick={() => setSearchDraft(prev => ({ ...prev, usePolygon: !prev.usePolygon }))}
                                >
                                    {searchDraft.usePolygon && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <div className="text-left">
                                    <span className={`block text-sm font-bold ${searchDraft.usePolygon ? 'text-indigo-700' : 'text-slate-600'}`}>{t('map.search.usePolygon')}</span>
                                    <span className="block text-xs text-slate-500">{t('map.search.usePolygonDesc')}</span>
                                </div>
                            </div>

                            {searchDraft.usePolygon && (
                                <div className="flex flex-col sm:flex-row gap-3 mt-4 animate-in slide-in-from-top-2 duration-200">
                                    {!isDrawing ? (
                                        <button
                                            type="button"
                                            onClick={onStartDraw}
                                            className="flex-1 h-11 flex items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition active:scale-95"
                                        >
                                            {onClearPolygon ? t('map.search.redrawPolygon') : t('map.search.drawPolygon')}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={onCancelDraw}
                                            className="flex-1 h-11 flex items-center justify-center rounded-xl bg-rose-50 text-sm font-bold text-rose-600 border border-rose-100 hover:bg-rose-100 transition active:scale-95"
                                        >
                                            {t('common.cancel')}
                                        </button>
                                    )}
                                    {onClearPolygon && (
                                        <button
                                            type="button"
                                            onClick={onClearPolygon}
                                            className="flex-1 h-11 flex items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600 hover:bg-slate-200 transition active:scale-95"
                                        >
                                            {t('map.search.clearPolygon')}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                    <button
                        type="button"
                        onClick={() => setIsSearchOpen(false)}
                        className="flex-1 h-12 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 transition active:scale-95"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={onApply}
                        className="flex-2 px-8 h-12 rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition active:scale-95"
                    >
                        {t('map.search.apply')}
                    </button>
                </div>
            </div>
        </div>
    );
}
