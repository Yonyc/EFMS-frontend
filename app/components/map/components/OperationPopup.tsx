import React from "react";
import { createPortal } from "react-dom";
import type { 
    PolygonData, 
    OperationTypeDto, 
    UnitDto, 
    ProductDto, 
    ToolDto, 
    ParcelOperationDto, 
    OperationProductInputState 
} from "../types";

interface OperationPopupProps {
    operationPopup: { x: number; y: number; polygonId: string };
    popupCoords: { left: number; top: number } | null;
    isMobile: boolean;
    startDrag: (e: React.MouseEvent) => void;
    polygons: PolygonData[];
    t: any;
    preferTopRight: boolean;
    setPreferTopRight: (val: boolean) => void;
    closeOperationPopup: () => void;
    operationError: string | null;
    operationLoading: boolean;
    canEditPolygon: (id: string) => boolean;
    currentParcelId: string | null;
    operationTypeId: string;
    setOperationTypeId: (val: string) => void;
    operationTypes: OperationTypeDto[];
    operationDate: string;
    setOperationDate: (val: string) => void;
    operationDurationMinutes: string;
    setOperationDurationMinutes: (val: string) => void;
    handleAddOperationLine: () => void;
    operationLines: OperationProductInputState[];
    handleRemoveOperationLine: (index: number) => void;
    updateOperationLine: (index: number, field: string, value: string) => void;
    units: UnitDto[];
    products: ProductDto[];
    tools: ToolDto[];
    handleSaveOperation: () => Promise<void>;
    resetOperationForm: () => void;
    parcelOperations: ParcelOperationDto[];
}

const OperationPopup = React.memo((props: OperationPopupProps) => {
    const {
        operationPopup, popupCoords, isMobile, startDrag, polygons, t,
        preferTopRight, setPreferTopRight, closeOperationPopup,
        operationError, operationLoading, canEditPolygon, currentParcelId,
        operationTypeId, setOperationTypeId, operationTypes,
        operationDate, setOperationDate, operationDurationMinutes,
        setOperationDurationMinutes, handleAddOperationLine,
        operationLines, handleRemoveOperationLine, updateOperationLine,
        units, products, tools, handleSaveOperation, resetOperationForm,
        parcelOperations
    } = props;

    if (!popupCoords) return null;

    const popupStyle = isMobile
        ? {
            left: 0,
            top: 0, // logic handled by caller
            width: '100vw',
            maxWidth: '100vw',
            height: 'auto',
            maxHeight: '80vh',
        }
        : { left: popupCoords.left, top: popupCoords.top };

    // old code had complex math here 
    // keeping it simple by passing it in
    // trying to keep jsx same

    return createPortal(
        <div
            className="fixed z-[120000] w-[420px] max-w-[94vw] max-h-[82vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/95 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur"
            style={popupStyle}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="cursor-move" onMouseDown={startDrag}>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-200">{t('operations.title', { defaultValue: 'Parcel operations' })}</p>
                    <h3 className="text-lg font-semibold text-white">{polygons.find(p => p.id === operationPopup.polygonId)?.name || t('map.unnamedParcel')}</h3>
                </div>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs font-semibold text-slate-200">
                        <input
                            type="checkbox"
                            checked={preferTopRight}
                            onChange={(e) => setPreferTopRight(e.target.checked)}
                            className="h-4 w-4 rounded border-white/30 bg-white/10 text-indigo-500"
                        />
                        {t('operations.pinTopRight', { defaultValue: 'Open top-right' })}
                    </label>
                    <button
                        type="button"
                        onClick={closeOperationPopup}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/10"
                    >
                        ×
                    </button>
                </div>
            </div>

            {operationError && (
                <div className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-100">
                    {operationError}
                </div>
            )}

            {operationLoading && (
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-indigo-300/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-50">
                    <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-indigo-200" aria-hidden="true" />
                    {t('common.loading', { defaultValue: 'Loading...' })}
                </div>
            )}

            <div className="space-y-3">
                {canEditPolygon(currentParcelId ?? operationPopup.polygonId) ? <>
                    <select
                        value={operationTypeId}
                        onChange={(e) => setOperationTypeId(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-300"
                    >
                        <option value="">{t('operations.selectTypePlaceholder', { defaultValue: 'Select operation type' })}</option>
                        {operationTypes.map(type => (
                            <option key={type.id} value={type.id}>{type.name}</option>
                        ))}
                    </select>

                    <div className="grid grid-cols-2 gap-3">
                        <input
                            type="datetime-local"
                            value={operationDate}
                            onChange={(e) => setOperationDate(e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-300"
                        />
                        <input
                            type="number"
                            min="0"
                            placeholder={t('operations.durationLabel', { defaultValue: 'Duration (minutes)' })}
                            value={operationDurationMinutes}
                            onChange={(e) => setOperationDurationMinutes(e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-300"
                        />
                    </div>

                    <div className="flex items-center justify-between text-sm text-slate-100">
                        <span>{t('operations.productsTools', { defaultValue: 'Products & Tools' })}</span>
                        <button
                            type="button"
                            onClick={handleAddOperationLine}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
                        >
                            + {t('common.add', { defaultValue: 'Add' })}
                        </button>
                    </div>

                    <div className="flex flex-col gap-2">
                        {operationLines.map((line, index) => (
                            <div key={index} className="grid grid-cols-5 gap-2 text-sm">
                                <select
                                    value={line.productId}
                                    onChange={(e) => updateOperationLine(index, 'productId', e.target.value)}
                                    className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-white outline-none focus:border-indigo-300"
                                >
                                    <option value="">{t('common.select', { defaultValue: 'Select' })}</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    min="0"
                                    placeholder={t('common.quantity', { defaultValue: 'Qty' })}
                                    value={line.quantity}
                                    onChange={(e) => updateOperationLine(index, 'quantity', e.target.value)}
                                    className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-white outline-none focus:border-indigo-300"
                                />
                                <select
                                    value={line.unitId}
                                    onChange={(e) => updateOperationLine(index, 'unitId', e.target.value)}
                                    className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-white outline-none focus:border-indigo-300"
                                >
                                    <option value="">{t('operations.unit', { defaultValue: 'Unit' })}</option>
                                    {units.map(u => (
                                        <option key={u.id} value={u.id}>{u.value}</option>
                                    ))}
                                </select>
                                <select
                                    value={line.toolId}
                                    onChange={(e) => updateOperationLine(index, 'toolId', e.target.value)}
                                    className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-white outline-none focus:border-indigo-300"
                                >
                                    <option value="">{t('operations.tool', { defaultValue: 'Tool' })}</option>
                                    {tools.map(tl => (
                                        <option key={tl.id} value={tl.id}>{tl.name}</option>
                                    ))}
                                </select>
                                <div className="flex items-center justify-end">
                                    {operationLines.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveOperationLine(index)}
                                            className="text-xs font-semibold text-rose-200 hover:text-rose-100"
                                        >
                                            {t('common.delete', { defaultValue: 'Remove' })}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={resetOperationForm}
                            disabled={operationLoading}
                            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                        >
                            {t('common.cancel', { defaultValue: 'Cancel' })}
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveOperation}
                            disabled={!currentParcelId || operationLoading || (currentParcelId ? !canEditPolygon(currentParcelId) : false)}
                            className="rounded-xl border border-indigo-400/70 bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-indigo-500 disabled:opacity-60"
                        >
                            {operationLoading ? t('common.loading', { defaultValue: 'Loading...' }) : t('operations.submit', { defaultValue: 'Save operation' })}
                        </button>
                    </div>
                </> : <></>}

                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">{t('operations.history', { defaultValue: 'History' })}</p>
                    <div className="mt-2 flex max-h-56 flex-col gap-2 overflow-y-auto">
                        {parcelOperations.length === 0 && (
                            <div className="text-sm text-slate-200/80">{t('operations.emptyHistory', { defaultValue: 'No operations yet' })}</div>
                        )}
                        {parcelOperations.map(op => (
                            <div key={op.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="font-semibold text-white">{op.typeName || t('operations.selectTypePlaceholder', { defaultValue: 'Operation' })}</div>
                                        <div className="text-xs text-slate-200/80">{op.date ? new Date(op.date).toLocaleString() : ''}</div>
                                    </div>
                                    {op.durationSeconds != null && (
                                        <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white">
                                            {(op.durationSeconds / 60).toFixed(0)} min
                                        </span>
                                    )}
                                </div>
                                {op.products && op.products.length > 0 && (
                                    <div className="mt-2 border-t border-white/10 pt-2 text-sm text-white">
                                        {op.products.map(p => (
                                            <div key={p.id || `${p.productId}-${p.toolId}`} className="flex items-center justify-between">
                                                <span>
                                                    <strong>{p.productName || t('operations.product', { defaultValue: 'Product' })}</strong>
                                                    {p.quantity != null && (
                                                        <span className="text-slate-200/80"> {p.quantity}{p.unitValue ? ` ${p.unitValue}` : ''}</span>
                                                    )}
                                                </span>
                                                {p.toolName && (
                                                    <span className="rounded-full bg-indigo-500/20 px-2 py-1 text-[11px] font-semibold text-indigo-100">{p.toolName}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
});

export default OperationPopup;
