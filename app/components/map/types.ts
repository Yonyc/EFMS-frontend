export interface PolygonData {
    id: string;
    name: string;
    coords: [number, number][];
    visible: boolean;
    color?: string;
    version?: number;
    active?: boolean;
    startValidity?: string;
    endValidity?: string;
    farmId?: number;
    periodId?: number | null;
    validationStatus?: string;
    convertedParcelId?: number | null;
    parentId?: string | null;
}

export interface EditState {
    layer: any;
    handler: any;
    tempGroup: any;
    listeners: { edit?: any; mousemove?: { map: any; listener: any } };
}

export interface OverlapWarning {
    polygonId: string;
    overlappingPolygons: { id: string; name: string }[];
    originalCoords: [number, number][];
    fixedCoords: [number, number][] | null;
    isNewPolygon?: boolean;
}

export interface ManualEditContext {
    warning: OverlapWarning;
    areaNameSnapshot: string;
}

export interface OperationTypeDto { id: number; name: string; }
export interface UnitDto { id: number; value: string; }
export interface ProductDto { id: number; name: string; }
export interface ToolDto { id: number; name: string; }
export interface OperationProductInputState { productId: string; quantity: string; unitId: string; toolId: string; }
export interface OperationProductDto {
    id: number;
    quantity?: number;
    productId?: number;
    productName?: string;
    unitId?: number;
    unitValue?: string;
    toolId?: number;
    toolName?: string;
}
export interface ParcelOperationDto {
    id: number;
    date?: string;
    durationSeconds?: number;
    typeId?: number;
    typeName?: string;
    products?: OperationProductDto[];
}

export interface PeriodDto { id: number; name?: string; startDate?: string; endDate?: string; }

export interface ParcelSearchFilters {
    periodId: string;
    toolId: string;
    productId: string;
    startDate: string;
    endDate: string;
    useMapArea: boolean;
    usePolygon: boolean;
}

export type MapContextType = 'farm' | 'import';
