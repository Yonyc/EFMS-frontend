import React, { useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { SearchableSelect } from "./SearchableSelect";
import { useDateTimeFormatter } from "~/utils/datetime";
import { buildLocalizedPath } from "~/utils/locale";
import { useCurrentLocale } from "~/hooks/useCurrentLocale";
import type {
    PolygonData,
    OperationTypeDto,
    UnitDto,
    ProductDto,
    ToolDto,
    ParcelOperationDto,
    OperationProductInputState,
    AttachmentDto
} from "../types";
import type { PeriodDto } from "../types";
import { PeriodPicker } from "./PeriodPicker";

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
    operationPeriodId: string;
    setOperationPeriodId: (val: string) => void;
    availablePeriods: PeriodDto[];
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
    hasMore: boolean;
    loadMoreOperations: () => Promise<void>;
    productHasMore: boolean;
    productLoading: boolean;
    loadMoreProducts: () => void;
    toolHasMore: boolean;
    toolLoading: boolean;
    loadMoreTools: () => void;
    opTypeHasMore: boolean;
    opTypeLoading: boolean;
    loadMoreOpTypes: () => void;
    addOperationAttachment: (operationId: number, att: AttachmentDto) => void;
    removeOperationAttachment: (operationId: number, attachmentId: number) => void;
    farmId: number;
    allPolygons: PolygonData[];
    extraParcelIds: string[];
    setExtraParcelIds: (ids: string[]) => void;
    setOperationError: (msg: string | null) => void;
}

const OperationPopup = React.memo((props: OperationPopupProps) => {
    const { formatDateTime } = useDateTimeFormatter();
    const locale = useCurrentLocale();
    const {
        operationPopup, popupCoords, isMobile, startDrag, polygons, t,
        preferTopRight, setPreferTopRight, closeOperationPopup,
        operationError, operationLoading, canEditPolygon, currentParcelId,
        operationTypeId, setOperationTypeId, operationTypes,
        operationDate, setOperationDate, operationDurationMinutes,
        setOperationDurationMinutes, operationPeriodId, setOperationPeriodId, availablePeriods,
        handleAddOperationLine,
        operationLines, handleRemoveOperationLine, updateOperationLine,
        units, products, tools, handleSaveOperation, resetOperationForm,
        parcelOperations, hasMore, loadMoreOperations,
        productHasMore, productLoading, loadMoreProducts,
        toolHasMore, toolLoading, loadMoreTools,
        opTypeHasMore, opTypeLoading, loadMoreOpTypes,
        addOperationAttachment, removeOperationAttachment, farmId,
        allPolygons, extraParcelIds, setExtraParcelIds, setOperationError,
    } = props;

    // Multi-parcel targeting
    const anchorParcelId = currentParcelId ?? operationPopup.polygonId;
    const parcelById = useMemo(() => {
        const m = new Map<string, PolygonData>();
        for (const p of polygons) m.set(p.id, p);
        for (const p of allPolygons) if (!m.has(p.id)) m.set(p.id, p);
        return m;
    }, [polygons, allPolygons]);
    const targetParcelIds = useMemo(
        () => Array.from(new Set([anchorParcelId, ...extraParcelIds])),
        [anchorParcelId, extraParcelIds]
    );
    const parcelName = (id: string) => parcelById.get(id)?.name || t('map.unnamedParcel');
    const addParcelOptions = useMemo(() => {
        const seen = new Set(targetParcelIds);
        return Array.from(parcelById.values())
            .filter(p => !seen.has(p.id) && p.canEdit !== false)
            .map(p => ({ value: p.id, label: p.name || t('map.unnamedParcel') }));
    }, [parcelById, targetParcelIds, t]);

    /** Names of targeted parcels that are NOT active during the selected period. */
    const inactiveParcelNames = useMemo(() => {
        if (!operationPeriodId) return [] as string[]; // backend resolves/validates when blank
        const bad: string[] = [];
        for (const id of targetParcelIds) {
            const poly = parcelById.get(id);
            const pps = poly?.parcelPeriods ?? [];
            if (pps.length === 0) continue; // no period info loaded, let backend decide
            const ok = pps.some(pp => String(pp.periodId) === operationPeriodId && pp.active !== false);
            if (!ok) bad.push(parcelName(id));
        }
        return bad;
    }, [targetParcelIds, parcelById, operationPeriodId]);

    const onSaveClick = () => {
        if (inactiveParcelNames.length > 0) {
            setOperationError(t('operations.inactiveParcels', {
                defaultValue: 'These parcels are not active during the selected period: {{names}}',
                names: inactiveParcelNames.join(', '),
            }));
            return;
        }
        void handleSaveOperation();
    };

    const historyRef = useRef<HTMLDivElement>(null);
    const hasMoreRef = useRef(hasMore);
    const loadingRef = useRef(operationLoading);

    useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
    useEffect(() => { loadingRef.current = operationLoading; }, [operationLoading]);

    // re-attaches when the parcel changes because loadMoreOperations is recreated each time
    useEffect(() => {
        const el = historyRef.current;
        if (!el) return;
        const onScroll = () => {
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80
                    && hasMoreRef.current && !loadingRef.current) {
                void loadMoreOperations();
            }
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [loadMoreOperations]);

    const productLabel = (product: ProductDto) => {
        if (product.official) {
            const auth = product.officialAuthNumber ? ` (${product.officialAuthNumber})` : '';
            return t('products.officialLabel', { defaultValue: 'Official: {{name}}{{auth}}', name: product.name, auth });
        }
        return product.name;
    };

    const isProductExpired = (product: ProductDto): boolean => {
        const dateStr = product.officialUseToleratedTo ?? product.officialDateTo;
        if (!dateStr) return false;
        return new Date(dateStr) < new Date();
    };

    const opTypeOptions = useMemo(() => [
        { value: "", label: t('operations.selectTypePlaceholder', { defaultValue: 'Select operation type' }) },
        ...operationTypes.map(type => ({ value: String(type.id), label: type.name })),
    ], [operationTypes, t]);

    const productOptions = useMemo(() => [
        { value: "", label: t('operations.selectProduct', { defaultValue: 'Select product' }) },
        ...products.map(p => ({ value: String(p.id), label: productLabel(p) })),
    ], [products, t]);

    const toolOptions = useMemo(() => [
        { value: "", label: t('operations.tool', { defaultValue: 'Tool' }) },
        ...tools.map(tl => ({ value: String(tl.id), label: tl.name })),
    ], [tools, t]);

    const noResults = t('common.noResults', { defaultValue: 'No results' });

    if (!popupCoords) return null;

    const popupStyle = isMobile
        ? { left: 0, top: 0, width: '100vw', maxWidth: '100vw', height: 'auto', maxHeight: '80vh' }
        : { left: popupCoords.left, top: popupCoords.top };

    return createPortal(
        <div
            className="fixed z-[120000] w-[440px] max-w-[94vw] max-h-[88vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/95 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur"
            style={popupStyle}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="cursor-move min-w-0 flex-1" onMouseDown={startDrag}>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-200">
                        {t('operations.title', { defaultValue: 'Parcel operations' })}
                    </p>
                    <h3 className="text-lg font-semibold text-white">
                        {polygons.find(p => p.id === operationPopup.polygonId)?.name || t('map.unnamedParcel')}
                    </h3>
                    {(currentParcelId || operationPopup.polygonId) && (
                        <Link
                            to={buildLocalizedPath(locale, `/parcels/${currentParcelId || operationPopup.polygonId}`)}
                            className="text-xs text-indigo-300 hover:text-indigo-100 underline-offset-2 hover:underline"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            {t('parcels.viewDetails', { defaultValue: 'View parcel details' })}
                        </Link>
                    )}
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

            <div className="space-y-3">
                {/* New operation form */}
                {canEditPolygon(currentParcelId ?? operationPopup.polygonId) && (
                    <>
                        {/* Target parcels */}
                        <div className="space-y-1.5">
                            <span className="text-xs font-semibold text-slate-200">
                                {t('operations.targetParcels', { defaultValue: 'Target parcels' })}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {targetParcelIds.map(id => {
                                    const isAnchor = id === anchorParcelId;
                                    return (
                                        <span key={id} className="inline-flex items-center gap-1 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-200">
                                            {parcelName(id)}
                                            {!isAnchor && (
                                                <button
                                                    type="button"
                                                    onClick={() => setExtraParcelIds(extraParcelIds.filter(x => x !== id))}
                                                    className="text-indigo-300 hover:text-white"
                                                    aria-label={t('common.remove', { defaultValue: 'Remove' })}
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </span>
                                    );
                                })}
                            </div>
                            <SearchableSelect
                                value=""
                                onChange={(val) => { if (val && !targetParcelIds.includes(val)) setExtraParcelIds([...extraParcelIds, val]); }}
                                options={addParcelOptions}
                                placeholder={t('operations.addParcel', { defaultValue: 'Add a parcel…' })}
                                noResultsText={noResults}
                            />
                        </div>

                        <SearchableSelect
                            value={operationTypeId}
                            onChange={setOperationTypeId}
                            options={opTypeOptions}
                            placeholder={t('operations.selectTypePlaceholder', { defaultValue: 'Select operation type' })}
                            noResultsText={noResults}
                            hasMore={opTypeHasMore}
                            loading={opTypeLoading}
                            onLoadMore={loadMoreOpTypes}
                        />

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

                        {availablePeriods.length > 0 && (
                            <div className="flex items-center gap-2 text-xs text-slate-200">
                                <span>{t('operations.periodLabel', { defaultValue: 'Period' })}</span>
                                <PeriodPicker
                                    periods={availablePeriods}
                                    value={operationPeriodId}
                                    onChange={setOperationPeriodId}
                                    includeAll
                                    size="compact"
                                />
                                <span className="text-[10px] text-slate-400">
                                    {t('operations.periodHint', { defaultValue: 'Defaults to your farm preference. Leave blank to auto-resolve from the date.' })}
                                </span>
                            </div>
                        )}

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
                            {operationLines.map((line, index) => {
                                const selectedUnit = line.unitId ? units.find(u => String(u.id) === line.unitId) : null;
                                const selectedProduct = line.productId ? products.find(p => String(p.id) === line.productId) : null;
                                const productExpired = selectedProduct ? isProductExpired(selectedProduct) : false;
                                return (
                                    <div key={index} className="rounded-xl border border-white/8 bg-white/3 p-2">
                                        <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
                                            <SearchableSelect
                                                value={line.productId}
                                                onChange={(val) => updateOperationLine(index, 'productId', val)}
                                                options={productOptions}
                                                placeholder={t('operations.selectProduct', { defaultValue: 'Select product' })}
                                                noResultsText={noResults}
                                                hasMore={productHasMore}
                                                loading={productLoading}
                                                onLoadMore={loadMoreProducts}
                                            />
                                            {operationLines.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveOperationLine(index)}
                                                    className="text-xs font-semibold text-rose-300 hover:text-rose-100 px-1"
                                                >
                                                    {t('common.delete', { defaultValue: 'Remove' })}
                                                </button>
                                            )}
                                        </div>
                                        {productExpired && (
                                            <div className="mb-2 flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-300">
                                                <span className="mt-px shrink-0">⚠</span>
                                                <span>
                                                    {t('operations.productExpiredWarning', {
                                                        defaultValue: 'This product\'s use authorisation has expired ({{date}}).',
                                                        date: selectedProduct!.officialUseToleratedTo ?? selectedProduct!.officialDateTo,
                                                    })}
                                                </span>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder={t('common.quantity', { defaultValue: 'Qty' })}
                                                value={line.quantity}
                                                onChange={(e) => updateOperationLine(index, 'quantity', e.target.value)}
                                                className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-sm text-white outline-none focus:border-indigo-300"
                                            />
                                            <span className="text-sm text-slate-300 font-medium min-w-[2rem] text-center">
                                                {selectedUnit?.value ?? '—'}
                                            </span>
                                            <SearchableSelect
                                                value={line.toolId}
                                                onChange={(val) => updateOperationLine(index, 'toolId', val)}
                                                options={toolOptions}
                                                placeholder={t('operations.tool', { defaultValue: 'Tool' })}
                                                noResultsText={noResults}
                                                hasMore={toolHasMore}
                                                loading={toolLoading}
                                                onLoadMore={loadMoreTools}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
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
                                onClick={onSaveClick}
                                disabled={!currentParcelId || operationLoading || (currentParcelId ? !canEditPolygon(currentParcelId) : false)}
                                className="rounded-xl border border-indigo-400/70 bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-indigo-500 disabled:opacity-60"
                            >
                                {operationLoading
                                    ? t('common.loading', { defaultValue: 'Loading...' })
                                    : t('operations.submit', { defaultValue: 'Save operation' })}
                            </button>
                        </div>

                        <div className="border-t border-white/10" />
                    </>
                )}

                {/* History */}
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">
                        {t('operations.history', { defaultValue: 'History' })}
                    </p>

                    <div ref={historyRef} className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-0.5">
                        {parcelOperations.length === 0 && operationLoading && (
                            <>
                                {[0, 1, 2].map(i => (
                                    <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 animate-pulse">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="space-y-1.5 flex-1">
                                                <div className="h-3.5 w-2/5 rounded bg-white/15" />
                                                <div className="h-2.5 w-1/3 rounded bg-white/10" />
                                            </div>
                                            <div className="h-6 w-12 rounded-full bg-white/10" />
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                        {parcelOperations.length === 0 && !operationLoading && (
                            <div className="text-sm text-slate-200/80">
                                {t('operations.emptyHistory', { defaultValue: 'No operations yet' })}
                            </div>
                        )}

                        {parcelOperations.map(op => (
                            <div key={op.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="font-semibold text-white">
                                            {op.typeName || t('operations.selectTypePlaceholder', { defaultValue: 'Operation' })}
                                        </div>
                                        <div className="text-xs text-slate-200/80">
                                            {formatDateTime(op.date)}
                                        </div>
                                    </div>
                                    {op.durationSeconds != null && (
                                        <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white">
                                            {(op.durationSeconds / 60).toFixed(0)} min
                                        </span>
                                    )}
                                </div>

                                {(op.products && op.products.length > 0) && (
                                    <div className="mt-2 border-t border-white/10 pt-2 text-sm text-white space-y-1.5">
                                        {op.products.map(p => {
                                            const name = p.productName || t('operations.product', { defaultValue: 'Product' });
                                            const auth = p.officialAuthNumber ? ` (${p.officialAuthNumber})` : '';
                                            const isOfficial = Boolean(
                                                p.officialAuthNumber || p.officialVersionTag || p.officialDecisionCode || p.officialProductTypeCodes
                                            );
                                            const label = isOfficial
                                                ? t('products.officialLabel', { defaultValue: 'Official: {{name}}{{auth}}', name, auth })
                                                : name;
                                            const details: string[] = [];
                                            if (p.officialDecisionCode)
                                                details.push(`${t('products.decision', { defaultValue: 'Decision' })}: ${p.officialDecisionCode}`);
                                            if (p.officialDateFrom || p.officialDateTo)
                                                details.push(`${t('products.validity', { defaultValue: 'Validity' })}: ${[p.officialDateFrom, p.officialDateTo].filter(Boolean).join(' - ')}`);
                                            if (p.officialUserGroupCode)
                                                details.push(`${t('products.userGroup', { defaultValue: 'User group' })}: ${p.officialUserGroupCode}`);

                                            return (
                                                <div key={p.id ?? `${p.productId}-${p.toolId}`} className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="font-semibold text-white">{label}</div>
                                                        {p.quantity != null && (
                                                            <div className="text-slate-200/80">
                                                                {p.quantity}{p.unitValue ? ` ${p.unitValue}` : ''}
                                                            </div>
                                                        )}
                                                        {details.length > 0 && (
                                                            <div className="mt-0.5 text-[11px] text-slate-200/70">{details.join(' · ')}</div>
                                                        )}
                                                    </div>
                                                    {p.toolName && (
                                                        <span className="rounded-full bg-indigo-500/20 px-2 py-1 text-[11px] font-semibold text-indigo-100">
                                                            {p.toolName}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Attachment indicator */}
                                {op.attachments && op.attachments.length > 0 && (
                                    <div className="mt-2 flex items-center gap-1 border-t border-white/10 pt-2 text-[11px] text-slate-400">
                                        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                        </svg>
                                        {op.attachments.length} {t('attachments.count', { defaultValue: 'attachment(s)', count: op.attachments.length })}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Loading indicator / end sentinel */}
                        {operationLoading && (
                            <div className="flex items-center justify-center gap-2 py-3 text-sm text-indigo-200">
                                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-indigo-300" />
                                {t('common.loading', { defaultValue: 'Loading...' })}
                            </div>
                        )}
                        {!operationLoading && hasMore && (
                            <button
                                type="button"
                                onClick={() => void loadMoreOperations()}
                                className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition-colors"
                            >
                                {t('common.loadMore', { defaultValue: 'Load more' })}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
});

export default OperationPopup;
