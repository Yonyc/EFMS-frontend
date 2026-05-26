import { apiPut, apiPatch } from "~/utils/api";
import { coordsToWKT } from "./mapUtils";
import { intersectPolygon, polygonSignedArea } from "./geometry";
import type { PolygonData, ManualEditContext } from "../types";

function normalizeParentParcelId(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function extractFarmId(parcelsEndpoint: string): number | null {
    const match = parcelsEndpoint.match(/\/farm\/([^\/]+)/);
    return match ? Number(match[1]) : null;
}

async function readErrorDetails(response: Response): Promise<string> {
    try {
        return await response.text();
    } catch {
        return '';
    }
}

interface SaveParcelOptions {
    parcelId: string;
    coords: [number, number][];
    currentPoly: PolygonData | undefined;
    contextType: string;
    parcelsEndpoint: string;
    defaultName: string;
    // overrides come from a stashed manual-edit context after the overlap modal flow
    nameOverride?: string;
    periodIdOverride?: number | null;
}

export interface SaveParcelResult {
    ok: boolean;
    finalName: string;
    finalPeriodId: number | null;
}

// save edited parcel coords, returns the persisted name/period for store update
export async function saveParcelCoords(opts: SaveParcelOptions): Promise<SaveParcelResult> {
    const { parcelId, coords, currentPoly, contextType, parcelsEndpoint, defaultName, nameOverride, periodIdOverride } = opts;
    const isImportMode = contextType === 'import';

    if (isImportMode) {
        const payload = { geodata: coordsToWKT(coords), validationNotes: "Manual edit" };
        const response = await apiPatch(`/imports/parcels/${parcelId}`, payload);
        if (!response.ok) {
            const details = await readErrorDetails(response);
            console.error("Failed to update parcel", { status: response.status, statusText: response.statusText, details });
            return { ok: false, finalName: '', finalPeriodId: null };
        }
        return {
            ok: true,
            finalName: currentPoly?.name || defaultName,
            finalPeriodId: currentPoly?.periodId ? Number(currentPoly.periodId) : null,
        };
    }

    const currentName = currentPoly?.name || defaultName;
    const periodIdNum = currentPoly?.periodId ? Number(currentPoly.periodId) : null;
    const payload: any = {
        geodata: coordsToWKT(coords),
        name: currentName.trim() || defaultName,
        active: true,
        periodId: (periodIdNum && periodIdNum > 0) ? periodIdNum : null,
        parentParcelId: normalizeParentParcelId(currentPoly?.parentId),
        startValidity: new Date().toISOString(),
        endValidity: null,
    };

    if (contextType === 'farm') {
        const farmId = extractFarmId(parcelsEndpoint);
        if (farmId !== null) payload.farmId = farmId;
    }

    if (nameOverride !== undefined) {
        const trimmed = nameOverride.trim();
        if (trimmed) payload.name = trimmed;
    }
    if (periodIdOverride !== undefined) {
        payload.periodId = periodIdOverride;
    }

    const response = await apiPut(`${parcelsEndpoint}/${parcelId}`, payload);
    if (!response.ok) {
        const details = await readErrorDetails(response);
        console.error("Failed to update parcel", { status: response.status, statusText: response.statusText, details });
        return { ok: false, finalName: '', finalPeriodId: null };
    }

    return { ok: true, finalName: payload.name, finalPeriodId: payload.periodId };
}

interface AutoCorrectChildOptions {
    child: PolygonData;
    parentCoords: [number, number][];
    contextType: string;
    parcelsEndpoint: string;
    defaultName: string;
}

export interface AutoCorrectChildResult {
    ok: boolean;
    coords: [number, number][] | null;
}

// reshape a child to fit inside its newly-edited parent, picks the largest intersection ring
export async function autoCorrectChild(opts: AutoCorrectChildOptions): Promise<AutoCorrectChildResult> {
    const { child, parentCoords, contextType, parcelsEndpoint, defaultName } = opts;
    const isImportMode = contextType === 'import';

    const intersections = intersectPolygon(child.coords, parentCoords);
    if (!intersections || intersections.length === 0) return { ok: false, coords: null };

    intersections.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)));
    const finalChildCoords = intersections[0];
    const childWkt = coordsToWKT(finalChildCoords);

    let response: Response;
    if (isImportMode) {
        response = await apiPatch(`/imports/parcels/${child.id}`, {
            geodata: childWkt,
            validationNotes: "Auto-correct (parent edit)",
        });
    } else {
        const childPeriodIdNum = child.periodId ? Number(child.periodId) : null;
        const childPayload: any = {
            geodata: childWkt,
            name: (child.name || defaultName).trim() || defaultName,
            active: true,
            periodId: (childPeriodIdNum && childPeriodIdNum > 0) ? childPeriodIdNum : null,
            parentParcelId: normalizeParentParcelId(child.parentId),
            startValidity: new Date().toISOString(),
            endValidity: null,
        };
        if (contextType === 'farm') {
            const farmId = extractFarmId(parcelsEndpoint);
            if (farmId !== null) childPayload.farmId = farmId;
        }
        response = await apiPut(`${parcelsEndpoint}/${child.id}`, childPayload);
    }

    if (!response.ok) {
        const details = await readErrorDetails(response);
        console.error("Failed to auto-correct child on save", {
            childId: child.id,
            status: response.status,
            statusText: response.statusText,
            details,
        });
        return { ok: false, coords: null };
    }

    return { ok: true, coords: finalChildCoords };
}

interface PickNameOverrideArgs {
    manualEditContext: ManualEditContext | null;
}

// pull name/period overrides from a stashed manual-edit context, undefined when no overrides
export function pickManualEditOverrides({ manualEditContext }: PickNameOverrideArgs): {
    nameOverride?: string;
    periodIdOverride?: number | null;
} {
    if (!manualEditContext || manualEditContext.isNewPolygon) return {};
    const out: { nameOverride?: string; periodIdOverride?: number | null } = {};
    const snpName = (manualEditContext.areaNameSnapshot || '').trim();
    if (snpName) out.nameOverride = snpName;
    if (manualEditContext.selectedPeriodIdSnapshot) {
        const snpPeriodNum = Number(manualEditContext.selectedPeriodIdSnapshot);
        out.periodIdOverride = snpPeriodNum > 0 ? snpPeriodNum : null;
    }
    return out;
}
