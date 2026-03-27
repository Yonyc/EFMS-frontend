import { useTranslation } from "react-i18next";
import type { OverlapWarning } from "../types";

interface OverlapModalProps {
    warning: OverlapWarning;
    areaName: string;
    onAreaNameChange: (value: string) => void;
    onCancel: () => void;
    onToggleAutoFix: () => void;
    onIgnore: () => void;
    onAccept: () => void;
    onShowPreview: () => void;
    onTweakFix: () => void;
}

export default function OverlapModal({
    warning,
    areaName,
    onAreaNameChange,
    onCancel,
    onToggleAutoFix,
    onIgnore,
    onAccept,
    onShowPreview,
    onTweakFix
}: OverlapModalProps) {
    const { t } = useTranslation();
    const overlapCount = warning.overlappingPolygons.length;
    const isAutoFix = warning.isAutoFixEnabled ?? true;

    return (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[2000] -translate-x-1/2 w-full max-w-2xl px-4">
            <div className="pointer-events-auto flex items-center justify-between gap-6 rounded-3xl bg-white/95 p-4 shadow-2xl backdrop-blur-xl ring-1 ring-slate-200/50">
                <div className="flex items-center gap-4 pl-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-xl text-amber-600 shadow-sm transition-transform hover:scale-110">
                        ⚠️
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-slate-900 leading-tight tracking-tight">
                            {t('map.overlap.title') || 'Boundary Overlap'}
                        </h3>
                        <p className="text-[11px] font-semibold text-slate-500">
                            {overlapCount > 0 
                                ? t('map.overlap.activeTweak', { count: overlapCount }) || `${overlapCount} overlaps detected`
                                : 'Clipping applied to boundaries'
                            }
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* AUTO-FIX TOGGLE */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 ring-1 ring-slate-100">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Auto-Fix</span>
                        <button 
                            onClick={onToggleAutoFix}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isAutoFix ? 'bg-indigo-600' : 'bg-slate-200'}`}
                        >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isAutoFix ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    <button 
                        onClick={onAccept} 
                        className="group flex h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-600 pl-6 pr-5 text-xs font-black text-white shadow-lg shadow-indigo-600/25 transition-all hover:bg-indigo-500 active:scale-95"
                    >
                        {t('common.save') || 'Save'}
                        <span className="transition-transform group-hover:translate-x-0.5">→</span>
                    </button>

                    <div className="h-8 w-px bg-slate-200" />

                    <div className="flex flex-col items-start gap-0.5">
                        <button 
                            onClick={onIgnore} 
                            className="text-[10px] font-black text-amber-600 transition-colors hover:text-amber-700 hover:underline"
                        >
                            {t('map.overlap.allowOverlapShort') || 'Force Allow'}
                        </button>
                        <button 
                            onClick={onCancel} 
                            className="text-[10px] font-black text-slate-400 transition-colors hover:text-rose-500"
                        >
                            {t('map.overlap.discard') || 'Discard'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
