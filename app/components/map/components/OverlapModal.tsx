import { useTranslation } from "react-i18next";
import type { OverlapWarning } from "../types";

interface OverlapModalProps {
    warning: OverlapWarning;
    areaName: string;
    onAreaNameChange: (value: string) => void;
    onCancel: () => void;
    onManualEdit: () => void;
    onEditOriginal: () => void;
    onIgnore: () => void;
    onAccept: () => void;
    onShowPreview: () => void;
}

export default function OverlapModal({
    warning,
    areaName,
    onAreaNameChange,
    onCancel,
    onManualEdit,
    onEditOriginal,
    onIgnore,
    onAccept,
    onShowPreview
}: OverlapModalProps) {
    const { t } = useTranslation();
    const overlapCount = warning.overlappingPolygons.length;
    const verticesCount = warning.fixedCoords?.length ?? 0;
    const areaPercentage = Math.round(
        ((warning.fixedCoords?.length ?? 0) / (warning.originalCoords?.length || 1)) * 100
    );

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="flex w-full max-w-lg flex-col gap-6 rounded-3xl bg-white p-8 shadow-2xl shadow-slate-900/20 ring-1 ring-slate-200">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-2xl text-amber-500 ring-1 ring-amber-200">
                        ⚠️
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">{t('map.overlap.title')}</h2>
                        <p className="text-sm text-slate-500">
                            {t('map.overlap.description', { count: overlapCount })}
                        </p>
                    </div>
                </div>

                {warning.isNewPolygon && (
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('map.overlap.polygonNameLabel')}</label>
                        <input 
                            type="text" 
                            value={areaName} 
                            onChange={e => onAreaNameChange(e.target.value)} 
                            placeholder={t('map.overlap.polygonNamePlaceholder')}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                            autoFocus 
                        />
                    </div>
                )}
                
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('map.overlap.conflictingWith') || 'Conflicting with'}</p>
                    <ul className="space-y-1.5">
                        {warning.overlappingPolygons.map(op => (
                            <li key={op.id} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                {op.name}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="space-y-3">
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-100">
                        <div className="flex items-center gap-2 font-bold text-emerald-700">
                            <span className="text-lg">✓</span>
                            {t('map.overlap.autoFixTitle')}
                        </div>
                        <p className="mt-1 leading-relaxed opacity-90">
                            {t('map.overlap.autoFixMessage', { vertices: verticesCount, percentage: areaPercentage })}
                        </p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={onShowPreview}
                            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:border-slate-300 active:scale-95"
                        >
                            <span>👁️</span>
                            {t('map.overlap.previewButton')}
                        </button>
                        {warning.isNewPolygon ? (
                            <button 
                                onClick={onManualEdit} 
                                className="flex items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 hover:border-indigo-200 active:scale-95"
                            >
                                <span>🛠️</span>
                                {t('map.overlap.manualEdit')}
                            </button>
                        ) : (
                            <button 
                                onClick={onEditOriginal} 
                                className="flex items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 hover:border-indigo-200 active:scale-95"
                            >
                                <span>✏️</span>
                                {t('map.overlap.continueEditing')}
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                    <button 
                        onClick={onCancel} 
                        className="order-3 sm:order-1 flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 active:scale-95"
                    >
                        {t('common.cancel')}
                    </button>
                    
                    <button 
                        onClick={onIgnore} 
                        className="order-2 sm:order-2 flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition hover:bg-amber-600 active:scale-95"
                    >
                        {t('map.overlap.allowOverlap')}
                    </button>
                    
                    <button 
                        onClick={onAccept} 
                        className="order-1 sm:order-3 flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 active:scale-95"
                    >
                        {t('map.overlap.applyShrink')}
                    </button>
                </div>
            </div>
        </div>
    );
}
