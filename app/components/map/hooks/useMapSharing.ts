import { useState, useCallback } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "~/utils/api";
import { useTranslation } from "react-i18next";
import type { ParcelShareDto } from "../types";

interface UseMapSharingProps {
    resolvedContextId: string | undefined;
    contextType: string;
}

export function useMapSharing({ resolvedContextId, contextType }: UseMapSharingProps) {
    const { t } = useTranslation();
    const [shareParcelId, setShareParcelId] = useState<string | null>(null);
    const [shareList, setShareList] = useState<ParcelShareDto[]>([]);
    const [shareUsername, setShareUsername] = useState('');
    const [shareRole, setShareRole] = useState('VIEWER');
    const [shareError, setShareError] = useState('');
    const [shareLoading, setShareLoading] = useState(false);

    const loadParcelShares = useCallback(async (parcelId: string) => {
        if (contextType !== 'farm' || !resolvedContextId) return;
        setShareLoading(true);
        setShareError('');
        try {
            const res = await apiGet(`/farm/${resolvedContextId}/parcels/${parcelId}/shares`);
            if (!res.ok) throw new Error('failed');
            const data = await res.json();
            setShareList(data);
        } catch (err) {
            console.error('Failed to load parcel shares', err);
            setShareError(t('map.sharing.errors.loadFailed', { defaultValue: 'Unable to load shares' }));
        } finally {
            setShareLoading(false);
        }
    }, [contextType, resolvedContextId, t]);

    const openShareModal = useCallback(async (parcelId: string) => {
        setShareParcelId(parcelId);
        setShareUsername('');
        setShareRole('VIEWER');
        await loadParcelShares(parcelId);
    }, [loadParcelShares]);

    const closeShareModal = useCallback(() => {
        setShareParcelId(null);
        setShareList([]);
        setShareUsername('');
        setShareRole('VIEWER');
        setShareError('');
    }, []);

    const handleAddShare = useCallback(async (e?: { preventDefault: () => void }) => {
        if (e) e.preventDefault();
        if (!shareParcelId || !resolvedContextId) return;
        if (!shareUsername.trim()) {
            setShareError(t('map.sharing.errors.usernameRequired', { defaultValue: 'Enter a username to share' }));
            return;
        }
        setShareError('');
        try {
            const res = await apiPost(`/farm/${resolvedContextId}/parcels/${shareParcelId}/shares`, {
                username: shareUsername.trim(),
                role: shareRole,
            });
            if (!res.ok) throw new Error('failed');
            const created = await res.json();
            setShareList(prev => {
                const exists = prev.some(item => item.userId === created.userId);
                return exists ? prev.map(item => item.userId === created.userId ? created : item) : [...prev, created];
            });
            setShareUsername('');
            setShareRole('VIEWER');
        } catch (err) {
            console.error('Failed to add share', err);
            setShareError(t('map.sharing.errors.saveFailed', { defaultValue: 'Unable to save share' }));
        }
    }, [resolvedContextId, shareParcelId, shareRole, shareUsername, t]);

    const handleUpdateShare = useCallback(async (userId: number, role: string) => {
        if (!shareParcelId || !resolvedContextId) return;
        setShareError('');
        try {
            const res = await apiPut(`/farm/${resolvedContextId}/parcels/${shareParcelId}/shares/${userId}`, { role });
            if (!res.ok) throw new Error('failed');
            const updated = await res.json();
            setShareList(prev => prev.map(item => item.userId === userId ? updated : item));
        } catch (err) {
            console.error('Failed to update share', err);
            setShareError(t('map.sharing.errors.saveFailed', { defaultValue: 'Unable to save share' }));
        }
    }, [resolvedContextId, shareParcelId, t]);

    const handleRemoveShare = useCallback(async (userId: number) => {
        if (!shareParcelId || !resolvedContextId) return;
        setShareError('');
        try {
            const res = await apiDelete(`/farm/${resolvedContextId}/parcels/${shareParcelId}/shares/${userId}`);
            if (!res.ok) throw new Error('failed');
            setShareList(prev => prev.filter(item => item.userId !== userId));
        } catch (err) {
            console.error('Failed to remove share', err);
            setShareError(t('map.sharing.errors.saveFailed', { defaultValue: 'Unable to save share' }));
        }
    }, [resolvedContextId, shareParcelId, t]);

    return {
        shareParcelId,
        setShareParcelId,
        shareList,
        shareUsername,
        setShareUsername,
        shareRole,
        setShareRole,
        shareError,
        setShareError,
        shareLoading,
        openShareModal,
        closeShareModal,
        handleAddShare,
        handleUpdateShare,
        handleRemoveShare
    };
}
