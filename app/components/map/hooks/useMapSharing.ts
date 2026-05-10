import { useState, useCallback } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "~/utils/api";
import { useTranslation } from "react-i18next";
import type { ParcelShareDto, ResearchZoneShareDto, PolygonData, ParcelSearchFilters } from "../types";
import { toWktPolygon } from "../utils/mapUtils";

interface UseMapSharingProps {
resolvedContextId: string | undefined;
    contextType: string;
    allPolygons: PolygonData[];
    searchDraft: ParcelSearchFilters;
    searchAreaCoords: [number, number][];
    viewportBounds: { minLat: number; minLng: number; maxLat: number; maxLng: number } | null;
}

export function useMapSharing(props: UseMapSharingProps) {
    const { resolvedContextId, contextType } = props;
    const { t } = useTranslation();
    const [shareParcelId, setShareParcelId] = useState<string | null>(null);
    const [shareList, setShareList] = useState<ParcelShareDto[]>([]);
    const [shareUsername, setShareUsername] = useState('');
    const [shareRole, setShareRole] = useState('VIEWER');
    const [shareError, setShareError] = useState('');
    const [shareLoading, setShareLoading] = useState(false);


    const [researchShares, setResearchShares] = useState<ResearchZoneShareDto[]>([]);
    const [researchShareUsername, setResearchShareUsername] = useState('');
    const [researchSharePeriodIds, setResearchSharePeriodIds] = useState<string[]>([]);
    const [researchShareToolIds, setResearchShareToolIds] = useState<string[]>([]);
    const [researchShareProductIds, setResearchShareProductIds] = useState<string[]>([]);
    const [researchShareFilterStartDate, setResearchShareFilterStartDate] = useState('');
    const [researchShareFilterEndDate, setResearchShareFilterEndDate] = useState('');
    const [researchShareStartAt, setResearchShareStartAt] = useState('');
    const [researchShareEndAt, setResearchShareEndAt] = useState('');
    const [researchShareMode, setResearchShareMode] = useState<'direct' | 'link'>('direct');
    const [researchShareMaxUsers, setResearchShareMaxUsers] = useState('');
    const [researchShareFeedback, setResearchShareFeedback] = useState('');
    const [researchShareLastLink, setResearchShareLastLink] = useState('');
    const [researchShareLoading, setResearchShareLoading] = useState(false);
    const [quickShareLink, setQuickShareLink] = useState('');
    const [quickShareFeedback, setQuickShareFeedback] = useState('');
    const [filterShareModalOpen, setFilterShareModalOpen] = useState(false);
    const [filterShareZoneWkt, setFilterShareZoneWkt] = useState<string | null>(null);

    const boundsToWktPolygon = useCallback((bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => {
        const ring: [number, number][] = [
            [bounds.minLat, bounds.minLng],
            [bounds.maxLat, bounds.minLng],
            [bounds.maxLat, bounds.maxLng],
            [bounds.minLat, bounds.maxLng],
            [bounds.minLat, bounds.minLng],
        ];
        return `POLYGON((${ring.map(p => `${p[1]} ${p[0]}`).join(', ')}))`;
    }, []);

    const buildResearchShareUrl = (token: string) => {
        if (typeof window === 'undefined') return '';
        const url = new URL(window.location.href);
        url.searchParams.set('researchShareToken', token);
        return url.toString();
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Failed to copy', err);
            return false;
        }
    };

    const loadResearchShares = useCallback(async () => {
        if (contextType !== 'farm' || !props.resolvedContextId) return;
        try {
            const res = await apiGet(`/farm/${props.resolvedContextId}/research-shares`);
            if (!res.ok) throw new Error('failed');
            const data = await res.json();
            setResearchShares(data);
        } catch (err) {
            console.error('Failed to load research shares', err);
        }
    }, [contextType, props.resolvedContextId]);

    const handleCreateResearchShare = useCallback(async (e: any) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!shareParcelId || !props.resolvedContextId) return;
        const zone = props.allPolygons.find(p => p.id === shareParcelId);
        if (!zone || !zone.coords.length) {
            setResearchShareFeedback('Unable to create share: parcel zone is missing geometry.');
            return;
        }
        const zoneWkt = toWktPolygon(zone.coords);
        if (!zoneWkt) {
            setResearchShareFeedback('Unable to create share: invalid polygon geometry.');
            return;
        }

        setResearchShareLoading(true);
        setResearchShareFeedback('');
        try {
            const basePayload = {
                zoneWkt,
                periodIds: researchSharePeriodIds.length ? researchSharePeriodIds.map(Number) : undefined,
                toolIds: researchShareToolIds.length ? researchShareToolIds.map(Number) : undefined,
                productIds: researchShareProductIds.length ? researchShareProductIds.map(Number) : undefined,
                filterStartDate: researchShareFilterStartDate || undefined,
                filterEndDate: researchShareFilterEndDate || undefined,
                shareStartAt: researchShareStartAt ? new Date(researchShareStartAt).toISOString() : undefined,
                shareEndAt: researchShareEndAt ? new Date(researchShareEndAt).toISOString() : undefined,
            };

            if (researchShareMode === 'direct') {
                const usernames = researchShareUsername
                    .split(/[\n,;]+/)
                    .map((value) => value.trim())
                    .filter(Boolean);

                if (!usernames.length) {
                    setResearchShareFeedback('Please provide at least one username for direct sharing.');
                    return;
                }

                const createdShares: ResearchZoneShareDto[] = [];
                for (const username of usernames) {
                    const res = await apiPost(`/farm/${props.resolvedContextId}/research-shares`, {
                        ...basePayload,
                        username,
                        maxUsers: undefined,
                    });
                    if (!res.ok) throw new Error('failed');
                    const created = await res.json();
                    createdShares.push(created);
                }

                setResearchShares(prev => [...createdShares, ...prev]);
                setResearchShareUsername('');
                setResearchShareLastLink('');
                setResearchShareFeedback(`${createdShares.length} direct share(s) created.`);
            } else {
                const payload = {
                    ...basePayload,
                    username: undefined,
                    maxUsers: researchShareMaxUsers ? Number(researchShareMaxUsers) : undefined,
                };
                const res = await apiPost(`/farm/${props.resolvedContextId}/research-shares`, payload);
                if (!res.ok) throw new Error('failed');
                const created = await res.json();
                setResearchShares(prev => [created, ...prev]);
                const link = buildResearchShareUrl(created.shareToken);
                setResearchShareLastLink(link);
                if (link) {
                    const copied = await copyToClipboard(link);
                    setResearchShareFeedback(copied ? 'Share link created and copied to clipboard.' : `Share created. Link: ${link}`);
                } else {
                    setResearchShareFeedback(`Share created. Token: ${created.shareToken}`);
                }
            }
        } catch (err) {
            console.error('Failed to create research share', err);
            setResearchShareFeedback('Unable to create research share.');
        } finally {
            setResearchShareLoading(false);
        }
    }, [shareParcelId, props.resolvedContextId, props.allPolygons, researchSharePeriodIds, researchShareToolIds, researchShareProductIds, researchShareFilterStartDate, researchShareFilterEndDate, researchShareStartAt, researchShareEndAt, researchShareMode, researchShareUsername, researchShareMaxUsers]);

    const handleRemoveResearchShare = useCallback(async (shareId: number) => {
        if (!props.resolvedContextId) return;
        try {
            const res = await apiDelete(`/farm/${props.resolvedContextId}/research-shares/${shareId}`);
            if (!res.ok) throw new Error('failed');
            setResearchShares(prev => prev.filter(item => item.id !== shareId));
        } catch (err) {
            console.error('Failed to delete research share', err);
            setResearchShareFeedback('Unable to delete research share.');
        }
    }, [props.resolvedContextId]);

    const handleQuickShareCurrentFilter = useCallback(async () => {
        if (contextType !== 'farm' || !props.resolvedContextId) return;

        let zoneWkt: string | null = null;
        if (props.searchDraft.usePolygon && props.searchAreaCoords.length) {
            zoneWkt = toWktPolygon(props.searchAreaCoords);
        } else if (props.searchDraft.useMapArea && props.viewportBounds) {
            zoneWkt = boundsToWktPolygon(props.viewportBounds);
        }

        if (!zoneWkt) {
            setQuickShareFeedback('To share this filter, draw a polygon or enable map area first.');
            return;
        }

        setQuickShareFeedback('');

        setFilterShareZoneWkt(zoneWkt);
        setResearchShareMode('link');
        setResearchShareUsername('');
        setResearchShareMaxUsers('');
        setResearchSharePeriodIds([...props.searchDraft.periodIds]);
        setResearchShareToolIds([...props.searchDraft.toolIds]);
        setResearchShareProductIds([...props.searchDraft.productIds]);
        setResearchShareFilterStartDate(props.searchDraft.startDate || '');
        setResearchShareFilterEndDate(props.searchDraft.endDate || '');
        setResearchShareStartAt('');
        setResearchShareEndAt('');
        setResearchShareFeedback('');
        setResearchShareLastLink('');
        setFilterShareModalOpen(true);
    }, [contextType, props.resolvedContextId, props.searchDraft, props.searchAreaCoords, props.viewportBounds, boundsToWktPolygon]);

    const handleCreateFilterResearchShare = useCallback(async (e: any) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!props.resolvedContextId || !filterShareZoneWkt) return;

        setResearchShareLoading(true);
        setResearchShareFeedback('');
        try {
            const basePayload = {
                zoneWkt: filterShareZoneWkt,
                periodIds: researchSharePeriodIds.length ? researchSharePeriodIds.map(Number) : undefined,
                toolIds: researchShareToolIds.length ? researchShareToolIds.map(Number) : undefined,
                productIds: researchShareProductIds.length ? researchShareProductIds.map(Number) : undefined,
                filterStartDate: researchShareFilterStartDate || undefined,
                filterEndDate: researchShareFilterEndDate || undefined,
                shareStartAt: researchShareStartAt ? new Date(researchShareStartAt).toISOString() : undefined,
                shareEndAt: researchShareEndAt ? new Date(researchShareEndAt).toISOString() : undefined,
            };

            if (researchShareMode === 'direct') {
                const usernames = researchShareUsername
                    .split(/[\n,;]+/)
                    .map((value) => value.trim())
                    .filter(Boolean);

                if (!usernames.length) {
                    setResearchShareFeedback('Please provide at least one username for direct sharing.');
                    return;
                }

                const createdShares: ResearchZoneShareDto[] = [];
                for (const username of usernames) {
                    const res = await apiPost(`/farm/${props.resolvedContextId}/research-shares`, {
                        ...basePayload,
                        username,
                        maxUsers: undefined,
                    });
                    if (!res.ok) throw new Error('failed');
                    const created = await res.json();
                    createdShares.push(created);
                }

                setResearchShareUsername('');
                setResearchShareLastLink('');
                setResearchShareFeedback(`${createdShares.length} direct share(s) created.`);
            } else {
                const payload = {
                    ...basePayload,
                    username: undefined,
                    maxUsers: researchShareMaxUsers ? Number(researchShareMaxUsers) : undefined,
                };
                const res = await apiPost(`/farm/${props.resolvedContextId}/research-shares`, payload);
                if (!res.ok) throw new Error('failed');
                const created = await res.json();
                const link = buildResearchShareUrl(created.shareToken);
                setResearchShareLastLink(link);
                if (link) {
                    const copied = await copyToClipboard(link);
                    setResearchShareFeedback(copied ? 'Share link created and copied to clipboard.' : `Share created. Link: ${link}`);
                } else {
                    setResearchShareFeedback(`Share created. Token: ${created.shareToken}`);
                }
            }
        } catch (err) {
            console.error('Failed to create filter research share', err);
            setResearchShareFeedback('Unable to create share.');
        } finally {
            setResearchShareLoading(false);
        }
    }, [props.resolvedContextId, filterShareZoneWkt, researchSharePeriodIds, researchShareToolIds, researchShareProductIds, researchShareFilterStartDate, researchShareFilterEndDate, researchShareStartAt, researchShareEndAt, researchShareMode, researchShareUsername, researchShareMaxUsers]);


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
handleRemoveShare,
        researchShares,
        setResearchShares,
        researchShareUsername,
        setResearchShareUsername,
        researchSharePeriodIds,
        setResearchSharePeriodIds,
        researchShareToolIds,
        setResearchShareToolIds,
        researchShareProductIds,
        setResearchShareProductIds,
        researchShareFilterStartDate,
        setResearchShareFilterStartDate,
        researchShareFilterEndDate,
        setResearchShareFilterEndDate,
        researchShareStartAt,
        setResearchShareStartAt,
        researchShareEndAt,
        setResearchShareEndAt,
        researchShareMode,
        setResearchShareMode,
        researchShareMaxUsers,
        setResearchShareMaxUsers,
        researchShareFeedback,
        setResearchShareFeedback,
        researchShareLastLink,
        setResearchShareLastLink,
        researchShareLoading,
        quickShareLink,
        quickShareFeedback,
        setQuickShareFeedback,
        filterShareModalOpen,
        setFilterShareModalOpen,
        filterShareZoneWkt,
        setFilterShareZoneWkt,
        loadResearchShares,
        handleCreateResearchShare,
        handleRemoveResearchShare,
        handleQuickShareCurrentFilter,
        handleCreateFilterResearchShare
    };

}
