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
