import { useCallback } from "react";
import { apiGet, apiRequest, apiPut, apiPatch } from "~/utils/api";
import type { PolygonData, PeriodDto } from "../types";

interface UseMapApiActionsProps {
    parcelsEndpoint: string;
    contextType: string;
    resolvedContextId: string | undefined;
    selectedFarmId: string | undefined;
    setPolygons: React.Dispatch<React.SetStateAction<PolygonData[]>>;
    setAllPolygons: React.Dispatch<React.SetStateAction<PolygonData[]>>;
    setPeriods: (p: PeriodDto[]) => void;
    setApproveFeedback: (f: { type: 'success' | 'error'; message: string } | null) => void;
    setIsApproving: (a: boolean) => void;
    t: any;
    masterCleanup: () => void;
    canEditPolygon: (id: string) => boolean;
    renamingId: string | null;
    setRenamingId: (id: string | null) => void;
    renameValue: string;
    renameValueRef: React.MutableRefObject<string>;
    renamePeriodId: string;
    setRenamePeriodId: (id: string) => void;
    overlapWarning: any;
    setOverlapWarning: (w: any) => void;
    finishEdit: (force?: boolean) => Promise<void>;
}

export function useMapApiActions({
    parcelsEndpoint, contextType, resolvedContextId, selectedFarmId,
    setPolygons, setAllPolygons, setPeriods, setApproveFeedback, setIsApproving, t,
    masterCleanup, canEditPolygon, renamingId, setRenamingId,
    renameValue, renameValueRef, renamePeriodId, setRenamePeriodId,
    overlapWarning, setOverlapWarning, finishEdit
}: UseMapApiActionsProps) {

    const loadPeriods = useCallback(async () => {
        if (contextType !== 'farm' || !resolvedContextId) return;
        try {
            const res = await apiGet(`/farm/${resolvedContextId}/periods`);
            if (res.ok) {
                setPeriods(await res.json());
            } else {
                setPeriods([]);
            }
        } catch (err) {
            console.error("Failed to load periods", err);
            setPeriods([]);
        }
    }, [contextType, resolvedContextId, setPeriods]);

    const handleApproveAll = useCallback(async (onApproveAll?: () => Promise<void>, approveLabel?: string) => {
        if (!onApproveAll) return;
        setIsApproving(true);
        setApproveFeedback(null);
        try {
            await onApproveAll();
            setApproveFeedback({ 
                type: 'success', 
                message: approveLabel || t('imports.map.approveSuccess', { defaultValue: 'Import list approved' }) 
            });
        } catch (err) {
            console.error('Failed to approve import list:', err);
            setApproveFeedback({ 
                type: 'error', 
                message: t('imports.map.approveError', { defaultValue: 'Unable to approve import list' }) 
            });
        } finally {
            setIsApproving(false);
        }
    }, [setIsApproving, setApproveFeedback, t]);

    const approveSingleParcel = useCallback(async (id: string) => {
        if (!selectedFarmId) {
            setApproveFeedback({ 
                type: 'error', 
                message: t('imports.map.approveFarmRequired', { defaultValue: 'Select a farm before approving.' }) 
            });
            return;
        }
        try {
            const response = await apiRequest(`/imported-parcels/${id}/validate`, {
                method: 'PATCH',
                body: JSON.stringify({ validationStatus: 'APPROVED', farmId: Number(selectedFarmId) }),
            });
            if (!response.ok) throw new Error(`Approve failed: ${response.status}`);
            const updated = await response.json();
            setPolygons(prev => prev.map(p => p.id === String(id) ? { ...p, validationStatus: updated?.validationStatus || 'APPROVED', convertedParcelId: updated?.convertedParcelId ?? p.convertedParcelId } : p));
            setApproveFeedback({ type: 'success', message: t('imports.map.approveOneSuccess', { defaultValue: 'Parcel approved' }) });
        } catch (err) {
            console.error('Failed to approve parcel', err);
            setApproveFeedback({ type: 'error', message: t('imports.map.approveError', { defaultValue: 'Unable to approve parcel' }) });
        }
    }, [selectedFarmId, setApproveFeedback, t, setPolygons]);

    const handleRenameConfirm = useCallback(async () => {
        masterCleanup();
        if (!renamingId) return;
        if (renamingId.startsWith('poly-') || !canEditPolygon(renamingId)) {
            setRenamingId(null);
            setRenamePeriodId("");
            return;
        }

        const currentName = renameValueRef.current || renameValue;
        const resolvedName = (currentName || t('map.defaultPolygonName')).trim() || t('map.defaultPolygonName');
        
        setPolygons(prev => prev.map(p => p.id === renamingId ? { ...p, name: resolvedName, periodId: renamePeriodId ? Number(renamePeriodId) : null, version: (p.version || 0) + 1 } : p));
        setAllPolygons(prev => prev.map(p => p.id === renamingId ? { ...p, name: resolvedName, periodId: renamePeriodId ? Number(renamePeriodId) : null, version: (p.version || 0) + 1 } : p));

        try {
            if (contextType === 'import') {
                console.log("[Map] Renaming imported parcels is not supported by backend DTO (no name field). Local update only.");
                setRenamingId(null);
                return;
            }

            const periodIdNum = renamePeriodId ? Number(renamePeriodId) : null;
            const payload: any = { 
                name: resolvedName, 
                periodId: (periodIdNum && periodIdNum > 0) ? periodIdNum : null,
                active: true,
                startValidity: new Date().toISOString(),
                endValidity: null
            };
            if (contextType === 'farm') payload.farmId = Number(resolvedContextId);
            
            const response = await apiPut(`${parcelsEndpoint}/${renamingId}`, payload);
            if (!response.ok) {
                console.error("Failed to rename parcel on server:", response.statusText);
            }
        } catch (err) {
            console.error("Failed to update parcel name:", err);
        }
        setRenamingId(null);
        setRenamePeriodId("");
        setOverlapWarning(null);
    }, [masterCleanup, renamingId, canEditPolygon, setRenamingId, setRenamePeriodId, setOverlapWarning, renameValueRef, renameValue, t, setPolygons, renamePeriodId, parcelsEndpoint, contextType, resolvedContextId, setAllPolygons]);

    const togglePolygonVisibility = useCallback((id: string) => {
        setPolygons(prev => prev.map(p => p.id === id ? { ...p, visible: !p.visible } : p));
        setAllPolygons(prev => prev.map(p => p.id === id ? { ...p, visible: !p.visible } : p));
    }, [setPolygons, setAllPolygons]);

    const renamePolygonInline = useCallback((id: string, name: string) => {
        if (!canEditPolygon(id)) return;
        setPolygons(prev => prev.map(p => p.id === id ? { ...p, name } : p));
        setAllPolygons(prev => prev.map(p => p.id === id ? { ...p, name } : p));
    }, [canEditPolygon, setPolygons, setAllPolygons]);

    return {
        loadPeriods, handleApproveAll, approveSingleParcel, handleRenameConfirm, togglePolygonVisibility, renamePolygonInline
    };
}
