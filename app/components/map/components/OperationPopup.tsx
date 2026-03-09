import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { 
    OperationTypeDto, 
    UnitDto, 
    ProductDto, 
    ToolDto, 
    OperationProductInputState, 
    ParcelOperationDto 
} from '../types';

interface OperationPopupProps {
    isOpen: boolean;
    polygonName: string;
    coords: { left: number; top: number };
    isMobile: boolean;
    mobileTop: number;
    mobileHeight?: string;
    preferTopRight: boolean;
    pinnedTop?: number;
    setPreferTopRight: (value: boolean) => void;
    operationError: string | null;
    operationLoading: boolean;
    operationTypeId: string;
    setOperationTypeId: (value: string) => void;
    operationDate: string;
    setOperationDate: (value: string) => void;
    operationDurationMinutes: string;
    setOperationDurationMinutes: (value: string) => void;
    operationLines: OperationProductInputState[];
    operationTypes: OperationTypeDto[];
    units: UnitDto[];
    products: ProductDto[];
    tools: ToolDto[];
    parcelOperations: ParcelOperationDto[];
    onClose: () => void;
    onStartDrag: (e: React.MouseEvent) => void;
    onAddLine: () => void;
    onUpdateLine: (index: number, field: keyof OperationProductInputState, value: string) => void;
    onRemoveLine: (index: number) => void;
    onReset: () => void;
    onSave: () => void;
}

export function OperationPopup({
    isOpen,
    polygonName,
    coords,
    isMobile,
    mobileTop,
    mobileHeight,
    preferTopRight,
    pinnedTop = 16,
    setPreferTopRight,
    operationError,
    operationLoading,
    operationTypeId,
    setOperationTypeId,
    operationDate,
    setOperationDate,
    operationDurationMinutes,
    setOperationDurationMinutes,
    operationLines,
    operationTypes,
    units,
    products,
    tools,
    parcelOperations,
    onClose,
    onStartDrag,
    onAddLine,
    onUpdateLine,
    onRemoveLine,
    onReset,
    onSave
}: OperationPopupProps) {
    const { t } = useTranslation();

    if (!isOpen) return null;

    const POPUP_MARGIN = 16;

    const popupStyle: React.CSSProperties = isMobile
        ? {
            left: 0,
            top: mobileTop,
            width: '100vw',
            maxWidth: '100vw',
            height: mobileHeight,
            maxHeight: mobileHeight,
        }
        : preferTopRight
        ? { right: POPUP_MARGIN, top: pinnedTop, left: 'auto' }
        : { left: coords.left, top: coords.top };

    return createPortal(
        <div
            className="fixed z-[120000] w-[420px] max-w-[94vw] max-h-[82vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/95 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur"
            style={popupStyle}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="cursor-move" onMouseDown={onStartDrag}>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-200">{t('operations.title', { defaultValue: 'Parcel operations' })}</p>
                    <h3 className="text-lg font-semibold text-white">{polygonName}</h3>
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
                        onClick={onClose}
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
                <select
                    value={operationTypeId}
                    onChange={(e) => setOperationTypeId(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-300"
                >
                    <option value="">{t('operations.selectTypePlaceholder', { defaultValue: 'Select operation type' })}</option>
                    {operationTypes.map(type => (
                        <option key={type.id} value={String(type.id)}>{type.name}</option>
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
                        onClick={onAddLine}
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
                                onChange={(e) => onUpdateLine(index, 'productId', e.target.value)}
                                className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-white outline-none focus:border-indigo-300"
                            >
                                <option value="">{t('common.select', { defaultValue: 'Select' })}</option>
                                {products.map(p => (
                                    <option key={p.id} value={String(p.id)}>{p.name}</option>
                                ))}
                            </select>
                            <input
                                type="number"
                                min="0"
                                placeholder={t('common.quantity', { defaultValue: 'Qty' })}
                                value={line.quantity}
                                onChange={(e) => onUpdateLine(index, 'quantity', e.target.value)}
                                className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-white outline-none focus:border-indigo-300"
                            />
                            <select
                                value={line.unitId}
                                onChange={(e) => onUpdateLine(index, 'unitId', e.target.value)}
                                className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-white outline-none focus:border-indigo-300"
                            >
                                <option value="">{t('operations.unit', { defaultValue: 'Unit' })}</option>
                                {units.map(u => (
                                    <option key={u.id} value={String(u.id)}>{u.value}</option>
                                ))}
                            </select>
                            <select
                                value={line.toolId}
                                onChange={(e) => onUpdateLine(index, 'toolId', e.target.value)}
                                className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-white outline-none focus:border-indigo-300"
                            >
                                <option value="">{t('operations.tool', { defaultValue: 'Tool' })}</option>
                                {tools.map(tl => (
                                    <option key={tl.id} value={String(tl.id)}>{tl.name}</option>
                                ))}
                            </select>
                            <div className="flex items-center justify-end">
                                {operationLines.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => onRemoveLine(index)}
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
                        onClick={onReset}
                        disabled={operationLoading}
                        className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                    >
                        {t('common.cancel', { defaultValue: 'Cancel' })}
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={operationLoading}
                        className="rounded-xl border border-indigo-400/70 bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-indigo-500 disabled:opacity-60"
                    >
                        {operationLoading ? t('common.loading', { defaultValue: 'Loading...' }) : t('operations.submit', { defaultValue: 'Save operation' })}
                    </button>
                </div>

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
}
