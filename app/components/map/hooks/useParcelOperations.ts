import { useState, useCallback } from "react";
import { apiGet, apiPost } from "~/utils/api";
import type { 
    OperationTypeDto, UnitDto, ProductDto, ToolDto, ParcelOperationDto, 
    OperationProductInputState, PolygonData 
} from "../types";

interface UseParcelOperationsProps {
    farmId: number;
    resolvedContextId: string;
    contextType: string;
    canEditPolygon: (id: string) => boolean;
    t: any;
}

export function useParcelOperations({ 
    farmId, resolvedContextId, contextType, canEditPolygon, t 
}: UseParcelOperationsProps) {
    const [operationTypes, setOperationTypes] = useState<OperationTypeDto[]>([]);
    const [units, setUnits] = useState<UnitDto[]>([]);
    const [products, setProducts] = useState<ProductDto[]>([]);
    const [tools, setTools] = useState<ToolDto[]>([]);
    const [operationTypeId, setOperationTypeId] = useState<string>("");
    const [operationDate, setOperationDate] = useState<string>("");
    const [operationDurationMinutes, setOperationDurationMinutes] = useState<string>("");
    const [operationLines, setOperationLines] = useState<OperationProductInputState[]>([{ productId: "", quantity: "", unitId: "", toolId: "" }]);
    const [operationError, setOperationError] = useState<string | null>(null);
    const [operationLoading, setOperationLoading] = useState(false);
    const [parcelOperations, setParcelOperations] = useState<ParcelOperationDto[]>([]);
    const [currentParcelId, setCurrentParcelId] = useState<string | null>(null);
    const [operationPopup, setOperationPopup] = useState<{ x: number; y: number; polygonId: string } | null>(null);

    const resetOperationForm = useCallback(() => {
        setOperationTypeId("");
        setOperationDate("");
        setOperationDurationMinutes("");
        setOperationLines([{ productId: "", quantity: "", unitId: "", toolId: "" }]);
        setOperationError(null);
    }, []);

    const closeOperationPopup = useCallback(() => {
        setOperationPopup(null);
        setCurrentParcelId(null);
        resetOperationForm();
    }, [resetOperationForm]);

    const loadOperationReferences = useCallback(async () => {
        if (contextType !== 'farm' || !resolvedContextId) return;
        try {
            const [typesRes, unitsRes, productsRes, toolsRes] = await Promise.all([
                apiGet(`/operations/types`),
                apiGet(`/units`),
                apiGet(`/farm/${resolvedContextId}/products`),
                apiGet(`/farm/${resolvedContextId}/tools`),
            ]);

            if (typesRes.ok) setOperationTypes(await typesRes.json());
            if (unitsRes.ok) setUnits(await unitsRes.json());
            if (productsRes.ok) setProducts(await productsRes.json());
            if (toolsRes.ok) setTools(await toolsRes.json());
        } catch (err) {
            console.error("Failed to load operation references", err);
        }
    }, [contextType, resolvedContextId]);

    const loadParcelOperations = useCallback(async (parcelId: string) => {
        if (contextType !== 'farm' || !resolvedContextId) return;
        setOperationLoading(true);
        setOperationError(null);
        try {
            const res = await apiGet(`/farm/${resolvedContextId}/parcels/${parcelId}/operations`);
            if (!res.ok) throw new Error("failed");
            const data = await res.json();
            setParcelOperations(data);
        } catch (err) {
            console.error(err);
            setOperationError(t('operations.errorLoad', { defaultValue: 'Unable to load operations' }));
        } finally {
            setOperationLoading(false);
        }
    }, [contextType, resolvedContextId, t]);

    const handleAddOperationLine = useCallback(() => {
        setOperationLines(prev => [...prev, { productId: "", quantity: "", unitId: "", toolId: "" }]);
    }, []);

    const handleRemoveOperationLine = useCallback((index: number) => {
        setOperationLines(prev => prev.filter((_, i) => i !== index));
    }, []);

    const updateOperationLine = useCallback((index: number, key: string, value: string) => {
        setOperationLines(prev => prev.map((line, i) => i === index ? { ...line, [key]: value } : line));
    }, []);

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

            const payload: any = {
                typeId: operationTypeId ? Number(operationTypeId) : undefined,
                date: operationDate ? new Date(operationDate).toISOString() : undefined,
                durationSeconds: operationDurationMinutes ? Number(operationDurationMinutes) * 60 : undefined,
                products: productsPayload,
            };

            const res = await apiPost(`/farm/${farmId}/parcels/${currentParcelId}/operations`, payload);
            if (!res.ok) throw new Error("failed");

            resetOperationForm();
            await loadParcelOperations(currentParcelId);
        } catch (err) {
            console.error(err);
            setOperationError(t('operations.errorCreate', { defaultValue: 'Failed to save operation' }));
        } finally {
            setOperationLoading(false);
        }
    }, [currentParcelId, operationLines, operationTypeId, operationDate, operationDurationMinutes, farmId, loadParcelOperations, resetOperationForm, t, canEditPolygon]);

    return {
        operationTypes, units, products, tools,
        operationTypeId, setOperationTypeId,
        operationDate, setOperationDate,
        operationDurationMinutes, setOperationDurationMinutes,
        operationLines, handleAddOperationLine, handleRemoveOperationLine, updateOperationLine,
        operationError, operationLoading, parcelOperations,
        currentParcelId, setCurrentParcelId,
        operationPopup, setOperationPopup,
        loadOperationReferences, loadParcelOperations, handleSaveOperation, resetOperationForm, closeOperationPopup
    };
}
