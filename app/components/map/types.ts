export interface AttachmentDto { id: number; originalFilename: string; url: string; mimeType?: string; fileSize?: number; createdAt?: string; }
export interface OperationTypeDto { id: number; name: string; defaultToolId?: number; defaultToolName?: string; }
export interface OperationTypeGroupDto { id: number; name: string; operationTypes: OperationTypeDto[]; }
export interface UnitDto { id: number; value: string; }
export interface ProductDto {
    id: number;
    name: string;
    official?: boolean;
    officialCurrent?: boolean;
    officialAuthNumber?: string;
    officialVersionTag?: string;
    officialDecisionCode?: string;
    officialDecisionCodeEn?: string;
    officialDateFirstAuthorization?: string;
    officialDateFrom?: string;
    officialDateTo?: string;
    officialUserGroupCode?: string;
    officialUserGroupEn?: string;
    officialFormulationTypeCode?: string;
    officialFormulationTypeEn?: string;
    officialProductTypeCodes?: string;
    officialProductTypeEn?: string;
    officialImportedAt?: string;
    officialSaleTo?: string;
    officialUseToleratedTo?: string;
    productTypeId?: number;
    unitId?: number;
    defaultOperationTypeId?: number;
    farmId?: number;
}
export interface ToolDto {
    id: number;
    name: string;
    categoryId?: number;
    categoryName?: string;
    farmId?: number;
}
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
    officialAuthNumber?: string;
    officialDecisionCode?: string;
    officialDateFrom?: string;
    officialDateTo?: string;
    officialUserGroupCode?: string;
    officialFormulationTypeCode?: string;
    officialProductTypeCodes?: string;
    officialVersionTag?: string;
}
export interface ParcelOperationDto {
    id: number;
    date?: string;
    durationSeconds?: number;
    typeId?: number;
    typeName?: string;
    parcelId?: number;
    parcelName?: string;
    products?: OperationProductDto[];
    attachments?: AttachmentDto[];
}

export interface PeriodDto { id: number; name?: string; startDate?: string; endDate?: string; }
export interface ParcelShareDto { userId: number; username: string; role: string; includeChildren?: boolean; }
export interface ResearchZoneShareDto {
    id: number;
    userId?: number | null;
    username?: string | null;
    shareToken: string;
    zoneWkt: string;
    periodId?: number | null;
    periodIds?: number[];
    operationTypeId?: number | null;
    operationTypeIds?: number[];
    toolId?: number | null;
    toolIds?: number[];
    productId?: number | null;
    productIds?: number[];
    filterStartDate?: string | null;
    filterEndDate?: string | null;
    shareStartAt?: string | null;
    shareEndAt?: string | null;
    maxUsers?: number | null;
    claimedUsers?: number | null;
}

export interface ParcelSearchFilters {
    periodIds: string[];
    operationTypeIds: string[];
    toolIds: string[];
    productIds: string[];
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
    initialSharePayload?: any;
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
