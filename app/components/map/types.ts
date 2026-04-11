export interface OperationTypeDto { id: number; name: string; }
export interface OperationTypeGroupDto { id: number; name: string; operationTypes: OperationTypeDto[]; }
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
export interface ParcelShareDto { userId: number; username: string; role: string; }

export interface ParcelSearchFilters {
    periodId: string;
    operationTypeId: string;
    toolId: string;
    productId: string;
    startDate: string;
    endDate: string;
    useMapArea: boolean;
    usePolygon: boolean;
}

export type MapContextType = 'farm' | 'import';

export interface MapWithPolygonsProps {
    farm_id?: string;
    contextId?: string;
    contextType?: MapContextType;
    allowCreate?: boolean;
    onApproveAll?: () => Promise<void>;
    approveLabel?: string;
    importMode?: boolean; 
}

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
    canEdit?: boolean;
    canShare?: boolean;
    validationStatus?: string;
    convertedParcelId?: number | null;
    parentId?: string | null;
}

export interface EditState {
    layer: any;
    handler: any;
    tempGroup: any;
    listeners: { 
        edit?: any; 
        mousemove?: { map: any; listener: any } 
    };
}

export interface OverlapWarning {
    polygonId: string;
    overlappingPolygons: { id: string; name: string }[];
    originalCoords: [number, number][];
    fixedCoords: [number, number][] | null;
    isNewPolygon?: boolean;
    areaNameSnapshot?: string;
    selectedPeriodIdSnapshot?: string;
}

export interface ManualEditContext {
    warning: OverlapWarning;
    isNewPolygon?: boolean;
    polygonId: string;
    originalCoords: [number, number][];
    areaNameSnapshot: string;
    selectedPeriodIdSnapshot: string;
}
