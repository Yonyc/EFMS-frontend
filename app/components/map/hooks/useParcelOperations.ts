import { useState, useCallback, useRef } from "react";
import { apiGet, apiPost, apiDelete, apiRequest, getPageMeta } from "~/utils/api";
import type {
    OperationTypeDto, UnitDto, ProductDto, ToolDto, ParcelOperationDto,
    OperationProductInputState, AttachmentDto
} from "../types";

interface UseParcelOperationsProps {
    farmId: number;
    resolvedContextId: string;
    contextType: string;
    canEditPolygon: (id: string) => boolean;
    t: any;
}

const HISTORY_PAGE_SIZE = 10;
const RESOURCE_PAGE_SIZE = 30;

const nowForInput = () => {
    const d = new Date();
    d.setSeconds(0, 0);
    // Subtract timezone offset so the value reflects the local wall-clock time,
    // not UTC — required because datetime-local inputs use no timezone context.
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function useParcelOperations({
    farmId, resolvedContextId, contextType, canEditPolygon, t
}: UseParcelOperationsProps) {
    const [operationTypes, setOperationTypes] = useState<OperationTypeDto[]>([]);
    const [units, setUnits] = useState<UnitDto[]>([]);
    const [products, setProducts] = useState<ProductDto[]>([]);
    const [tools, setTools] = useState<ToolDto[]>([]);
    const [operationTypeId, setOperationTypeId] = useState<string>("");
    const [operationDate, setOperationDate] = useState<string>(nowForInput);
    const [operationDurationMinutes, setOperationDurationMinutes] = useState<string>("");
    
    const [operationPeriodId, setOperationPeriodId] = useState<string>("");
    const [operationLines, setOperationLines] = useState<OperationProductInputState[]>([{ productId: "", quantity: "", unitId: "", toolId: "" }]);
    const [operationError, setOperationError] = useState<string | null>(null);
    const [operationLoading, setOperationLoading] = useState(false);
    const [parcelOperations, setParcelOperations] = useState<ParcelOperationDto[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [currentParcelId, setCurrentParcelId] = useState<string | null>(null);
    
    const [operationExtraParcelIds, setOperationExtraParcelIds] = useState<string[]>([]);
    const [operationPopup, setOperationPopup] = useState<{ x: number; y: number; polygonId: string } | null>(null);

    // Paginated resource state
    const [productHasMore, setProductHasMore] = useState(false);
    const [productLoading, setProductLoading] = useState(false);
    const [toolHasMore, setToolHasMore] = useState(false);
    const [toolLoading, setToolLoading] = useState(false);
    const [opTypeHasMore, setOpTypeHasMore] = useState(false);
    const [opTypeLoading, setOpTypeLoading] = useState(false);

    // Refs to avoid stale closures in load-more callbacks
    const currentPageRef = useRef(0);
    const productPageRef = useRef(-1);
    const toolPageRef = useRef(-1);
    const opTypePageRef = useRef(-1);

    const resetOperationForm = useCallback(() => {
        setOperationTypeId("");
        setOperationPeriodId("");
        setOperationDate(nowForInput());
        setOperationDurationMinutes("");
        setOperationLines([{ productId: "", quantity: "", unitId: "", toolId: "" }]);
        setOperationExtraParcelIds([]);
        setOperationError(null);
    }, []);

    const closeOperationPopup = useCallback(() => {
        setOperationPopup(null);
        setCurrentParcelId(null);
        setParcelOperations([]);
        setHasMore(false);
        currentPageRef.current = 0;
        resetOperationForm();
    }, [resetOperationForm]);

    const fetchProducts = useCallback(async (page: number) => {
        if (contextType !== 'farm' || !resolvedContextId) return;
        setProductLoading(true);
        try {
            const res = await apiGet(`/farm/${resolvedContextId}/products?page=${page}&size=${RESOURCE_PAGE_SIZE}&includeOfficial=true`);
            if (res.ok) {
                const data = await res.json();
                const pm = getPageMeta(data);
                setProducts(prev => page === 0 ? (data.content ?? []) : [...prev, ...(data.content ?? [])]);
                productPageRef.current = pm.number;
                setProductHasMore(pm.number < pm.totalPages - 1);
            }
        } catch (err) {
            console.error("Failed to load products", err);
        } finally {
            setProductLoading(false);
        }
    }, [contextType, resolvedContextId]);

    const fetchTools = useCallback(async (page: number) => {
        if (contextType !== 'farm' || !resolvedContextId) return;
        setToolLoading(true);
        try {
            const res = await apiGet(`/farm/${resolvedContextId}/tools?page=${page}&size=${RESOURCE_PAGE_SIZE}`);
            if (res.ok) {
                const data = await res.json();
                const pm = getPageMeta(data);
                setTools(prev => page === 0 ? (data.content ?? []) : [...prev, ...(data.content ?? [])]);
                toolPageRef.current = pm.number;
                setToolHasMore(pm.number < pm.totalPages - 1);
            }
        } catch (err) {
            console.error("Failed to load tools", err);
        } finally {
            setToolLoading(false);
        }
    }, [contextType, resolvedContextId]);

    const fetchOpTypes = useCallback(async (page: number) => {
        if (contextType !== 'farm' || !resolvedContextId) return;
        setOpTypeLoading(true);
        try {
            const res = await apiGet(`/operations/types?farmId=${farmId}&page=${page}&size=${RESOURCE_PAGE_SIZE}`);
            if (res.ok) {
                const data = await res.json();
                const pm = getPageMeta(data);
                setOperationTypes(prev => page === 0 ? (data.content ?? []) : [...prev, ...(data.content ?? [])]);
                opTypePageRef.current = pm.number;
                setOpTypeHasMore(pm.number < pm.totalPages - 1);
            }
        } catch (err) {
            console.error("Failed to load operation types", err);
        } finally {
            setOpTypeLoading(false);
        }
    }, [farmId, contextType, resolvedContextId]);

    const loadMoreProducts = useCallback(() => {
        if (!productHasMore || productLoading) return;
        void fetchProducts(productPageRef.current + 1);
    }, [fetchProducts, productHasMore, productLoading]);

    const loadMoreTools = useCallback(() => {
        if (!toolHasMore || toolLoading) return;
        void fetchTools(toolPageRef.current + 1);
    }, [fetchTools, toolHasMore, toolLoading]);

    const loadMoreOpTypes = useCallback(() => {
        if (!opTypeHasMore || opTypeLoading) return;
        void fetchOpTypes(opTypePageRef.current + 1);
    }, [fetchOpTypes, opTypeHasMore, opTypeLoading]);

    const loadOperationReferences = useCallback(async () => {
        if (contextType !== 'farm' || !resolvedContextId) return;
        try {
            const unitsRes = await apiGet(`/units?farmId=${farmId}`);
            if (unitsRes.ok) setUnits(await unitsRes.json());
        } catch (err) {
            console.error("Failed to load units", err);
        }
        void fetchProducts(0);
        void fetchTools(0);
        void fetchOpTypes(0);
    }, [farmId, contextType, resolvedContextId, fetchProducts, fetchTools, fetchOpTypes]);

    const loadParcelOperations = useCallback(async (parcelId: string, page = 0) => {
        if (contextType !== 'farm' || !resolvedContextId) return;
        setOperationLoading(true);
        setOperationError(null);
        try {
            const res = await apiGet(`/farm/${resolvedContextId}/parcels/${parcelId}/operations?page=${page}&size=${HISTORY_PAGE_SIZE}`);
            if (!res.ok) throw new Error("failed");
            const data = await res.json();
            if (data && data.content !== undefined) {
                setParcelOperations(prev => page === 0 ? data.content : [...prev, ...data.content]);
                const pm = getPageMeta(data);
                setHasMore(pm.number < pm.totalPages - 1);
                currentPageRef.current = pm.number;
            } else {
                setParcelOperations(data || []);
                setHasMore(false);
                currentPageRef.current = 0;
            }
        } catch (err) {
            console.error(err);
            setOperationError(t('operations.errorLoad', { defaultValue: 'Unable to load operations' }));
        } finally {
            setOperationLoading(false);
        }
    }, [contextType, resolvedContextId, t]);

    const loadMoreOperations = useCallback(async () => {
        if (!currentParcelId || !hasMore || operationLoading) return;
        await loadParcelOperations(currentParcelId, currentPageRef.current + 1);
    }, [currentParcelId, hasMore, operationLoading, loadParcelOperations]);

    const handleAddOperationLine = useCallback(() => {
        setOperationLines(prev => [...prev, { productId: "", quantity: "", unitId: "", toolId: "" }]);
    }, []);

    const handleRemoveOperationLine = useCallback((index: number) => {
        setOperationLines(prev => prev.filter((_, i) => i !== index));
    }, []);

    const updateOperationLine = useCallback((index: number, key: string, value: string) => {
        setOperationLines(prev => prev.map((line, i) => {
            if (i !== index) return line;
            const updated = { ...line, [key]: value };
            if (key === 'productId') {
                const product = value ? products.find(p => String(p.id) === value) : null;
                // Always sync unit from product
                updated.unitId = product?.unitId ? String(product.unitId) : "";
                // Auto-fill tool from the product's default op type (only if no tool already set)
                if (product?.defaultOperationTypeId && !line.toolId) {
                    const opType = operationTypes.find(t => t.id === product.defaultOperationTypeId);
                    if (opType?.defaultToolId) {
                        updated.toolId = String(opType.defaultToolId);
                    }
                }
            }
            return updated;
        }));
        // Auto-fill op type at the form level (only if nothing selected yet)
        if (key === 'productId' && value && !operationTypeId) {
            const product = products.find(p => String(p.id) === value);
            if (product?.defaultOperationTypeId) {
                setOperationTypeId(String(product.defaultOperationTypeId));
            }
        }
    }, [products, operationTypes, operationTypeId, setOperationTypeId]);

    const handleSaveOperation = useCallback(async () => {
        if (!currentParcelId) return;
        if (!canEditPolygon(currentParcelId)) {
            setOperationError(t('operations.errorSave', { defaultValue: 'Not allowed to edit this parcel' }));
            return;
        }
        setOperationLoading(true);
        setOperationError(null);
        try {
            const productsPayload = operationLines
                .filter(line => line.productId)
                .map(line => ({
                    productId: Number(line.productId),
                    quantity: line.quantity ? Number(line.quantity) : undefined,
                    unitId: line.unitId ? Number(line.unitId) : undefined,
                    toolId: line.toolId ? Number(line.toolId) : undefined,
                }));

            let parcelPeriodId: number | undefined;
            if (operationPeriodId) {
                try {
                    const parcelRes = await apiGet(`/parcels/${currentParcelId}`);
                    if (parcelRes.ok) {
                        const parcelDto = await parcelRes.json();
                        const match = (parcelDto?.parcelPeriods ?? []).find(
                            (pp: any) => String(pp.periodId) === operationPeriodId
                        );
                        if (match?.id) parcelPeriodId = Number(match.id);
                    }
                } catch (_) {}
            }

            // The popup's parcel anchors the URL; the full set (incl. extras) goes in the body.
            const targetIds = Array.from(new Set([currentParcelId, ...operationExtraParcelIds]));

            const payload: any = {
                typeId: operationTypeId ? Number(operationTypeId) : undefined,
                // Send as naive local datetime — backend uses LocalDateTime (no tz).
                // Appending ":00" satisfies Jackson's ISO-8601 seconds requirement.
                date: operationDate ? operationDate + ":00" : undefined,
                durationSeconds: operationDurationMinutes ? Number(operationDurationMinutes) * 60 : undefined,
                products: productsPayload,
                parcelIds: targetIds.map(Number),
                parcelPeriodId,
            };

            const res = await apiPost(`/farm/${farmId}/parcels/${currentParcelId}/operations`, payload);
            if (!res.ok) {
                // Surface the backend reason (e.g. a parcel inactive during the period) when present.
                const body = await res.text().catch(() => "");
                throw new Error(body || "failed");
            }

            resetOperationForm();
            // Reload from page 0 to show the new operation at top
            await loadParcelOperations(currentParcelId, 0);
        } catch (err: any) {
            console.error(err);
            const msg = err?.message && err.message !== "failed" ? err.message : null;
            setOperationError(msg || t('operations.errorCreate', { defaultValue: 'Failed to save operation' }));
        } finally {
            setOperationLoading(false);
        }
    }, [currentParcelId, operationExtraParcelIds, operationLines, operationTypeId, operationDate, operationDurationMinutes, operationPeriodId, farmId, loadParcelOperations, resetOperationForm, t, canEditPolygon]);

    const addOperationAttachment = useCallback((operationId: number, att: AttachmentDto) => {
        setParcelOperations(prev => prev.map(op =>
            op.id === operationId
                ? { ...op, attachments: [...(op.attachments ?? []), att] }
                : op
        ));
    }, []);

    const removeOperationAttachment = useCallback((operationId: number, attachmentId: number) => {
        setParcelOperations(prev => prev.map(op =>
            op.id === operationId
                ? { ...op, attachments: (op.attachments ?? []).filter(a => a.id !== attachmentId) }
                : op
        ));
    }, []);

    return {
        operationTypes, units, products, tools,
        operationTypeId, setOperationTypeId,
        operationDate, setOperationDate,
        operationDurationMinutes, setOperationDurationMinutes,
        operationPeriodId, setOperationPeriodId,
        operationLines, handleAddOperationLine, handleRemoveOperationLine, updateOperationLine,
        operationError, operationLoading, parcelOperations,
        hasMore, loadMoreOperations,
        productHasMore, productLoading, loadMoreProducts,
        toolHasMore, toolLoading, loadMoreTools,
        opTypeHasMore, opTypeLoading, loadMoreOpTypes,
        addOperationAttachment, removeOperationAttachment,
        currentParcelId, setCurrentParcelId,
        operationExtraParcelIds, setOperationExtraParcelIds, setOperationError,
        operationPopup, setOperationPopup,
        loadOperationReferences, loadParcelOperations, handleSaveOperation, resetOperationForm, closeOperationPopup
    };
}
