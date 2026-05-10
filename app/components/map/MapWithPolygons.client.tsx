import {
    MapContainer,
    TileLayer,
    Polygon,
    Marker,
    Popup,
    FeatureGroup,
    useMapEvents,
    Tooltip,
    ZoomControl,
} from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { useEffect, useRef, useState, useCallback, useMemo, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeftIcon, ChevronRightIcon, FunnelIcon, XMarkIcon } from "@heroicons/react/24/outline";
import PolygonList from "./PolygonList";
import OverlapModal from "./components/OverlapModal";
import { checkOverlap, fixOverlap } from "./utils/geometry";
import type { EditState, ManualEditContext, OverlapWarning, PolygonData } from "./types";
import { apiDelete, apiGet, apiPost, apiPut, apiRequest } from "~/utils/api";
import { useFarm } from "~/contexts/FarmContext";
import { useAuth } from "~/contexts/AuthContext";

interface OperationTypeDto { id: number; name: string; }
interface UnitDto { id: number; value: string; }
interface ProductDto { id: number; name: string; }
interface ToolDto { id: number; name: string; }
interface OperationProductInputState { productId: string; quantity: string; unitId: string; toolId: string; }
interface OperationProductDto {
    id: number;
    quantity?: number;
    productId?: number;
    productName?: string;
    unitId?: number;
    unitValue?: string;
    toolId?: number;
    toolName?: string;
}
interface ParcelOperationDto {
    id: number;
    date?: string;
    durationSeconds?: number;
    typeId?: number;
    typeName?: string;
    products?: OperationProductDto[];
}

interface PeriodDto { id: number; name?: string; startDate?: string; endDate?: string; }
interface ParcelShareDto { userId: number; username: string; role: string; }
interface ResearchZoneShareDto {
    id: number;
    userId?: number | null;
    username?: string | null;
    shareToken: string;
    zoneWkt: string;
    periodId?: number | null;
    periodIds?: number[];
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

interface ParcelSearchFilters {
    periodIds: string[];
    toolIds: string[];
    productIds: string[];
    startDate: string;
    endDate: string;
    useMapArea: boolean;
    usePolygon: boolean;
}

type MapContextType = 'farm' | 'import';

interface MapWithPolygonsProps {
    farm_id?: string;
    contextId?: string;
    contextType?: MapContextType;
    allowCreate?: boolean;
    onApproveAll?: () => Promise<void>;
    approveLabel?: string;
    importMode?: boolean; // when true, show statuses and allow single approval
    initialSharePayload?: any;
}

export default function MapWithPolygons(props: MapWithPolygonsProps) {
    const { t } = useTranslation();
    const { selectedFarm } = useFarm();
    const { user } = useAuth();
    const center: [number, number] = [50.668333, 4.621278];
    const POPUP_WIDTH = 420;
    const POPUP_HEIGHT = 520;
    const POPUP_PADDING = 12;
    const resolvedContextId = props.contextId ?? props.farm_id;
    if (!resolvedContextId) {
        throw new Error("MapWithPolygons requires either contextId or farm_id");
    }
    const contextType: MapContextType = props.contextType ?? 'farm';
    const allowCreate = props.allowCreate ?? true;
    const isImportMode = props.importMode ?? (contextType === 'import');
    const basePath = isImportMode ? `/imports/${resolvedContextId}` : `/farm/${resolvedContextId}`;
    const parcelsEndpoint = `${basePath}/parcels`;

    // State
    const [polygons, setPolygons] = useState<PolygonData[]>([]);
    const [allPolygons, setAllPolygons] = useState<PolygonData[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [createPointCount, setCreatePointCount] = useState(0);
    const [modal, setModal] = useState<{ open: boolean; coords: [number, number][] | null }>({ open: false, coords: null });
    const [areaName, setAreaName] = useState("");
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [polygonContextMenu, setPolygonContextMenu] = useState<{ x: number; y: number; polygonId: string } | null>(null);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [overlapWarning, setOverlapWarning] = useState<OverlapWarning | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [pendingManualEditId, setPendingManualEditId] = useState<string | null>(null);
    const [manualEditContext, setManualEditContext] = useState<ManualEditContext | null>(null);
    const [previewVisibility, setPreviewVisibility] = useState<{ original: boolean; fixed: boolean }>({ original: false, fixed: true });
    const [isListCollapsed, setIsListCollapsed] = useState(false);
    const [listFilter, setListFilter] = useState<Array<'visible' | 'hidden' | 'approved' | 'unapproved' | 'onscreen'>>([]);
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
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
    const researchShareToken = useMemo(() => {
        if (typeof window === 'undefined') return '';
        return new URLSearchParams(window.location.search).get('researchShareToken') || '';
    }, []);
    const defaultSearchFilters = useMemo<ParcelSearchFilters>(() => {
        if (props.initialSharePayload) {
            return {
                periodIds: props.initialSharePayload.periodIds?.map(String) || [],
                toolIds: props.initialSharePayload.toolIds?.map(String) || [],
                productIds: props.initialSharePayload.productIds?.map(String) || [],
                startDate: props.initialSharePayload.filterStartDate || '',
                endDate: props.initialSharePayload.filterEndDate || '',
                useMapArea: false,
                usePolygon: !!props.initialSharePayload.zoneWkt,
            };
        }
        return {
            periodIds: [],
            toolIds: [],
            productIds: [],
            startDate: '',
            endDate: '',
            useMapArea: false,
            usePolygon: false,
        };
    }, [props.initialSharePayload]);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchDraft, setSearchDraft] = useState<ParcelSearchFilters>(defaultSearchFilters);
    const [appliedFilters, setAppliedFilters] = useState<ParcelSearchFilters>(defaultSearchFilters);
    const [appliedBounds, setAppliedBounds] = useState<{ minLat: number; minLng: number; maxLat: number; maxLng: number } | null>(null);
    const [searchAreaCoords, setSearchAreaCoords] = useState<[number, number][]>(() => {
        if (!props.initialSharePayload?.zoneWkt) return [];
        try {
            const wkt = props.initialSharePayload.zoneWkt.trim();
            const coordsSource = wkt.match(/POLYGON\s*\(\s*\(\s*([^)]*?)\s*\)\s*/i)?.[1] ??
                wkt.match(/MULTIPOLYGON\s*\(\s*\(\s*\(\s*([^)]*?)\s*\)\s*/i)?.[1];
            if (!coordsSource) return [];
            return coordsSource.split(',').map((pair: string) => pair.replace(/[()]/g, '').trim()).map((pair: string) => {
                const [lngStr, latStr] = pair.split(/\s+/).filter(Boolean);
                const lng = Number(lngStr);
                const lat = Number(latStr);
                if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng] as [number, number];
                return null;
            }).filter((val: any): val is [number, number] => Array.isArray(val));
        } catch { return []; }
    });
    const [isSearchDrawing, setIsSearchDrawing] = useState(false);
    const [appliedPolygonWkt, setAppliedPolygonWkt] = useState<string | null>(props.initialSharePayload?.zoneWkt || null);
    const [viewportBounds, setViewportBounds] = useState<{ minLat: number; minLng: number; maxLat: number; maxLng: number } | null>(null);
    const [isApproving, setIsApproving] = useState(false);
    const [approveFeedback, setApproveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [operationPopup, setOperationPopup] = useState<{ x: number; y: number; polygonId: string } | null>(null);
    const [popupCoords, setPopupCoords] = useState<{ left: number; top: number } | null>(null);
    const [currentParcelId, setCurrentParcelId] = useState<string | null>(null);
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
    const [periods, setPeriods] = useState<PeriodDto[]>([]);
    const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
    const [renamePeriodId, setRenamePeriodId] = useState<string>("");
    const [preferTopRight, setPreferTopRight] = useState<boolean>(!!user?.operationsPopupTopRight);
    const [isMobile, setIsMobile] = useState(false);
    const [dragState, setDragState] = useState<{ active: boolean; offsetX: number; offsetY: number }>({ active: false, offsetX: 0, offsetY: 0 });
    const originalColorRef = useRef<string | null>(null);
    const listBarRef = useRef<HTMLDivElement>(null);
    const polygonLayersRef = useRef<Map<string, L.Polygon>>(new Map());
    const searchDrawHandlerRef = useRef<any>(null);
    const searchAreaLayerRef = useRef<L.Polygon | null>(null);
    const viewportDebounceRef = useRef<number | null>(null);

    // Refs
    const featureGroupRef = useRef<L.FeatureGroup>(null);
    const editControlRef = useRef<any>(null);
    const createHandlerRef = useRef<any>(null);
    const createdLayerRef = useRef<any>(null);
    const createRafRef = useRef<number | null>(null);
    const editStateRef = useRef<EditState | null>(null);
    const originalCoordsRef = useRef<Record<string, [number, number][]>>({});

    const floatingMenuClasses = "fixed z-[10000] min-w-[14rem] rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-2xl shadow-slate-900/15 backdrop-blur";
    const floatingButtonClasses = "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-200";
    const toolbarButtonBase = "inline-flex items-center justify-center rounded-2xl border px-3 py-2 text-sm font-semibold shadow-lg shadow-slate-900/10 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-200";

    const getMap = () => (featureGroupRef.current as any)?._map || (featureGroupRef.current as any)?.getMap?.();

    const clampToViewport = useCallback((left: number, top: number, width: number, height: number) => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : width;
        const vh = typeof window !== 'undefined' ? window.innerHeight : height;
        const x = Math.max(POPUP_PADDING, Math.min(left, vw - width - POPUP_PADDING));
        const y = Math.max(POPUP_PADDING, Math.min(top, vh - height - POPUP_PADDING));
        return { x, y };
    }, [POPUP_PADDING]);

    const clampToRect = useCallback((left: number, top: number, width: number, height: number, rect: DOMRect) => {
        const x = Math.max(rect.left + POPUP_PADDING, Math.min(left, rect.right - width - POPUP_PADDING));
        const y = Math.max(rect.top + POPUP_PADDING, Math.min(top, rect.bottom - height - POPUP_PADDING));
        return { x, y };
    }, [POPUP_PADDING]);

    const toWktPolygon = useCallback((coords: [number, number][]) => {
        if (coords.length < 3) return null;
        const ring = coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
            ? coords
            : [...coords, coords[0]];
        const points = ring.map(([lat, lng]) => `${lng} ${lat}`).join(', ');
        return `POLYGON((${points}))`;
    }, []);

    const boundsToWktPolygon = useCallback((bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => {
        const ring: [number, number][] = [
            [bounds.minLat, bounds.minLng],
            [bounds.minLat, bounds.maxLng],
            [bounds.maxLat, bounds.maxLng],
            [bounds.maxLat, bounds.minLng],
            [bounds.minLat, bounds.minLng],
        ];
        const points = ring.map(([lat, lng]) => `${lng} ${lat}`).join(', ');
        return `POLYGON((${points}))`;
    }, []);

    const togglePolygonVisibility = useCallback((id: string) => {
        setPolygons(prev => prev.map(p => p.id === id ? { ...p, visible: !p.visible } : p));
        setAllPolygons(prev => prev.map(p => p.id === id ? { ...p, visible: !p.visible } : p));
    }, []);

    const canEditPolygon = useCallback((id: string) => {
        const polygon = polygons.find(p => p.id === id) || allPolygons.find(p => p.id === id);
        return polygon?.canEdit !== false;
    }, [allPolygons, polygons]);

    const canSharePolygon = useCallback((id: string) => {
        const polygon = polygons.find(p => p.id === id) || allPolygons.find(p => p.id === id);
        return polygon?.canShare === true;
    }, [allPolygons, polygons]);

    const renamePolygonInline = useCallback((id: string, name: string) => {
        if (!canEditPolygon(id)) return;
        setPolygons(prev => prev.map(p => p.id === id ? { ...p, name } : p));
        setAllPolygons(prev => prev.map(p => p.id === id ? { ...p, name } : p));
    }, [canEditPolygon]);

    const focusPolygon = useCallback(async (id: string) => {
        const map = getMap();
        if (!map) return;

        const polygon = polygons.find(p => p.id === id) || allPolygons.find(p => p.id === id);
        if (!polygon) return;

        const ensureCoords = async () => {
            if (polygon.coords?.length) return polygon.coords;
            try {
                const response = await apiGet(`/parcels/${id}`);
                if (!response.ok) return null;
                const data = await response.json();
                if (!data?.geodata) return null;
                const coords = parseWktCoords(typeof data.geodata === 'string' ? data.geodata : String(data.geodata));
                if (!coords.length) return null;
                setAllPolygons(prev => prev.map(p => p.id === id ? { ...p, coords } : p));
                setPolygons(prev => prev.map(p => p.id === id ? { ...p, coords, visible: true } : p));
                return coords;
            } catch (err) {
                console.error('Failed to load parcel geometry:', err);
                return null;
            }
        };

        const coords = await ensureCoords();
        if (!coords?.length) return;

        setPolygons(prev => prev.map(p => p.id === id ? { ...p, visible: true } : p));
        setSelectedId(id);

        const bounds = L.latLngBounds(coords.map(([lat, lng]) => [lat, lng] as [number, number]));
        if (bounds.isValid()) {
            map.flyToBounds(bounds, { maxZoom: 18, padding: [80, 80] });
        } else {
            map.flyTo(coords[0], 17);
        }
    }, [allPolygons, polygons]);

    const filterOptions = useMemo(() => {
        const base = [
            { key: 'all', label: t('map.polygonList.filters.all', { defaultValue: 'All' }) },
            { key: 'onscreen', label: t('map.polygonList.filters.onScreen', { defaultValue: 'On screen' }) },
            { key: 'visible', label: t('map.polygonList.filters.visible', { defaultValue: 'Visible' }) },
            { key: 'hidden', label: t('map.polygonList.filters.hidden', { defaultValue: 'Hidden' }) },
        ];
        if (isImportMode) {
            base.push({ key: 'approved', label: t('map.polygonList.filters.approved', { defaultValue: 'Approved' }) });
            base.push({ key: 'unapproved', label: t('map.polygonList.filters.unapproved', { defaultValue: 'Unapproved' }) });
        }
        return base;
    }, [isImportMode, t]);

    const activeFilterLabel = useMemo(() => {
        if (!listFilter.length) {
            return t('map.polygonList.filters.all', { defaultValue: 'All' });
        }
        return t('map.polygonList.filters.selected', { defaultValue: '{{count}} selected', count: listFilter.length });
    }, [listFilter, t]);

    const filteredPolygons = useMemo(() => {
        let next = allPolygons;
        const visibilityFilters = listFilter.filter(filter => filter === 'visible' || filter === 'hidden');
        const statusFilters = listFilter.filter(filter => filter === 'approved' || filter === 'unapproved');
        const screenFilters = listFilter.filter(filter => filter === 'onscreen');
        const onScreenIds = new Set(polygons.map(p => p.id));

        if (visibilityFilters.length === 1) {
            next = next.filter(p => visibilityFilters[0] === 'visible' ? p.visible : !p.visible);
        }

        if (statusFilters.length === 1) {
            next = next.filter(p => {
                const status = (p.validationStatus || '').toUpperCase();
                const isApproved = status === 'APPROVED' || status === 'CONVERTED';
                return statusFilters[0] === 'approved' ? isApproved : !isApproved;
            });
        }

        if (screenFilters.length) {
            next = next.filter(p => onScreenIds.has(p.id));
        }

        if (searchQuery.trim()) {
            const needle = searchQuery.trim().toLowerCase();
            next = next.filter(p => (p.name || '').toLowerCase().includes(needle));
        }

        return next;
    }, [allPolygons, listFilter, polygons, searchQuery]);

    const hasActiveSearchFilters = useMemo(() => (
        appliedFilters.periodIds.length > 0 ||
        appliedFilters.toolIds.length > 0 ||
        appliedFilters.productIds.length > 0 ||
        Boolean(appliedFilters.startDate) ||
        Boolean(appliedFilters.endDate) ||
        appliedFilters.useMapArea ||
        appliedFilters.usePolygon
    ), [appliedFilters]);

    const searchEndpoint = useMemo(() => {
        if (!hasActiveSearchFilters) {
            if (!researchShareToken) return parcelsEndpoint;
            return `${parcelsEndpoint}?shareToken=${encodeURIComponent(researchShareToken)}`;
        }
        const params = new URLSearchParams();
        for (const periodId of appliedFilters.periodIds) params.append('periodIds', periodId);
        for (const toolId of appliedFilters.toolIds) params.append('toolIds', toolId);
        for (const productId of appliedFilters.productIds) params.append('productIds', productId);
        if (appliedFilters.startDate) params.set('startDate', appliedFilters.startDate);
        if (appliedFilters.endDate) params.set('endDate', appliedFilters.endDate);
        if (appliedFilters.usePolygon && appliedPolygonWkt) params.set('polygonWkt', appliedPolygonWkt);
        if (researchShareToken) params.set('shareToken', researchShareToken);
        if (appliedFilters.useMapArea && appliedBounds) {
            params.set('minLat', String(appliedBounds.minLat));
            params.set('minLng', String(appliedBounds.minLng));
            params.set('maxLat', String(appliedBounds.maxLat));
            params.set('maxLng', String(appliedBounds.maxLng));
        }
        const query = params.toString();
        return `${parcelsEndpoint}/search${query ? `?${query}` : ''}`;
    }, [appliedBounds, appliedFilters, appliedPolygonWkt, hasActiveSearchFilters, parcelsEndpoint, researchShareToken]);

    const viewportEndpoint = useMemo(() => {
        if (!viewportBounds || contextType !== 'farm' || isImportMode || hasActiveSearchFilters) return null;
        const params = new URLSearchParams({
            minLat: String(viewportBounds.minLat),
            minLng: String(viewportBounds.minLng),
            maxLat: String(viewportBounds.maxLat),
            maxLng: String(viewportBounds.maxLng),
        });
        if (researchShareToken) params.set('shareToken', researchShareToken);
        return `${parcelsEndpoint}/viewport?${params.toString()}`;
    }, [contextType, hasActiveSearchFilters, isImportMode, parcelsEndpoint, researchShareToken, viewportBounds]);

    const buildResearchShareUrl = useCallback((token: string) => {
        if (typeof window === 'undefined') return '';
        const shareUrl = new URL(window.location.href);
        shareUrl.searchParams.set('researchShareToken', token);
        return shareUrl.toString();
    }, []);

    const copyToClipboard = useCallback(async (text: string) => {
        if (!text) return false;
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            return false;
        }
    }, []);

    const applyCurrentFiltersToShareRules = useCallback(() => {
        const source = hasActiveSearchFilters ? appliedFilters : searchDraft;
        setResearchSharePeriodIds([...source.periodIds]);
        setResearchShareToolIds([...source.toolIds]);
        setResearchShareProductIds([...source.productIds]);
        setResearchShareFilterStartDate(source.startDate || '');
        setResearchShareFilterEndDate(source.endDate || '');
        setResearchShareFeedback('Share rules prefilled from current filter settings.');
    }, [appliedFilters, hasActiveSearchFilters, searchDraft]);

    const handleQuickShareCurrentFilter = useCallback(async () => {
        if (contextType !== 'farm' || !resolvedContextId || isImportMode) return;

        let zoneWkt: string | null = null;
        if (searchDraft.usePolygon && searchAreaCoords.length) {
            zoneWkt = toWktPolygon(searchAreaCoords);
        } else if (searchDraft.useMapArea && viewportBounds) {
            zoneWkt = boundsToWktPolygon(viewportBounds);
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
        setResearchSharePeriodIds([...searchDraft.periodIds]);
        setResearchShareToolIds([...searchDraft.toolIds]);
        setResearchShareProductIds([...searchDraft.productIds]);
        setResearchShareFilterStartDate(searchDraft.startDate || '');
        setResearchShareFilterEndDate(searchDraft.endDate || '');
        setResearchShareStartAt('');
        setResearchShareEndAt('');
        setResearchShareFeedback('');
        setResearchShareLastLink('');
        setFilterShareModalOpen(true);
    }, [boundsToWktPolygon, contextType, isImportMode, resolvedContextId, searchAreaCoords, searchDraft, toWktPolygon, viewportBounds]);

    const handleCreateFilterResearchShare = useCallback(async (e: FormEvent) => {
        e.preventDefault();
        if (!resolvedContextId || !filterShareZoneWkt) return;

        setResearchShareLoading(true);
        setResearchShareFeedback('');
        try {
            const basePayload = {
                zoneWkt: filterShareZoneWkt,
                periodIds: researchSharePeriodIds.length ? researchSharePeriodIds.map(Number) : undefined,
                toolIds: researchShareToolIds.length ? researchShareToolIds.map(Number) : undefined,
                productIds: researchShareProductIds.length ? researchShareProductIds.map(Number) : undefined,
                periodId: researchSharePeriodIds.length === 1 ? Number(researchSharePeriodIds[0]) : undefined,
                toolId: researchShareToolIds.length === 1 ? Number(researchShareToolIds[0]) : undefined,
                productId: researchShareProductIds.length === 1 ? Number(researchShareProductIds[0]) : undefined,
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

                for (const username of usernames) {
                    const res = await apiPost(`/farm/${resolvedContextId}/research-shares`, {
                        ...basePayload,
                        username,
                        maxUsers: undefined,
                    });
                    if (!res.ok) throw new Error('failed');
                }

                setResearchShareUsername('');
                setResearchShareLastLink('');
                setResearchShareFeedback(`${usernames.length} direct share(s) created.`);
            } else {
                const payload = {
                    ...basePayload,
                    username: undefined,
                    maxUsers: researchShareMaxUsers ? Number(researchShareMaxUsers) : undefined,
                };

                const res = await apiPost(`/farm/${resolvedContextId}/research-shares`, payload);
                if (!res.ok) throw new Error('failed');
                const created = await res.json();
                const link = buildResearchShareUrl(created.shareToken);
                setQuickShareLink(link);
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
            setResearchShareFeedback('Unable to create research share.');
        } finally {
            setResearchShareLoading(false);
        }
    }, [buildResearchShareUrl, copyToClipboard, filterShareZoneWkt, researchShareEndAt, researchShareFilterEndDate, researchShareFilterStartDate, researchShareMaxUsers, researchShareMode, researchSharePeriodIds, researchShareProductIds, researchShareStartAt, researchShareToolIds, researchShareUsername, resolvedContextId]);

    useEffect(() => {
        if (!approveFeedback) return;
        const timer = setTimeout(() => setApproveFeedback(null), 4000);
        return () => clearTimeout(timer);
    }, [approveFeedback]);

    const handleApproveAll = useCallback(async () => {
        if (!props.onApproveAll) return;
        setIsApproving(true);
        setApproveFeedback(null);
        try {
            await props.onApproveAll();
            setApproveFeedback({ type: 'success', message: props.approveLabel || t('imports.map.approveSuccess', { defaultValue: 'Import list approved' }) });
        } catch (err) {
            console.error('Failed to approve import list:', err);
            setApproveFeedback({ type: 'error', message: t('imports.map.approveError', { defaultValue: 'Unable to approve import list' }) });
        } finally {
            setIsApproving(false);
        }
    }, [props.onApproveAll, props.approveLabel, t]);

    const applySearchFilters = useCallback(() => {
        const normalizedDraft = searchDraft.startDate && searchDraft.endDate
            ? { ...searchDraft, periodIds: [] }
            : searchDraft;
        setAppliedFilters(normalizedDraft);
        if (searchDraft.usePolygon) {
            setAppliedPolygonWkt(toWktPolygon(searchAreaCoords));
        } else {
            setAppliedPolygonWkt(null);
        }
        if (searchDraft.useMapArea) {
            const map = getMap();
            if (map?.getBounds) {
                const bounds = map.getBounds();
                const southWest = bounds.getSouthWest();
                const northEast = bounds.getNorthEast();
                setAppliedBounds({
                    minLat: southWest.lat,
                    minLng: southWest.lng,
                    maxLat: northEast.lat,
                    maxLng: northEast.lng,
                });
            } else {
                setAppliedBounds(null);
            }
        } else {
            setAppliedBounds(null);
        }
        setIsSearchOpen(false);
    }, [searchAreaCoords, searchDraft, toWktPolygon]);

    const clearSearchFilters = useCallback(() => {
        setSearchDraft(defaultSearchFilters);
        setAppliedFilters(defaultSearchFilters);
        setAppliedBounds(null);
        setAppliedPolygonWkt(null);
        setSearchAreaCoords([]);
        const map = getMap();
        if (map && searchAreaLayerRef.current) {
            map.removeLayer(searchAreaLayerRef.current);
            searchAreaLayerRef.current = null;
        }
        setIsSearchOpen(false);
    }, [defaultSearchFilters]);

    const approveSingleParcel = useCallback(async (id: string) => {
        if (!isImportMode) return;
        if (!selectedFarm?.id) {
            setApproveFeedback({ type: 'error', message: t('imports.map.approveFarmRequired', { defaultValue: 'Select a farm before approving.' }) });
            return;
        }
        try {
            const response = await apiRequest(`/imported-parcels/${id}/validate`, {
                method: 'PATCH',
                body: JSON.stringify({ validationStatus: 'APPROVED', farmId: Number(selectedFarm.id) }),
            });
            if (!response.ok) {
                throw new Error(`Approve failed: ${response.status}`);
            }
            const updated = await response.json();
            setPolygons(prev => prev.map(p => p.id === String(id) ? { ...p, validationStatus: updated?.validationStatus || 'APPROVED', convertedParcelId: updated?.convertedParcelId ?? p.convertedParcelId } : p));
            setApproveFeedback({ type: 'success', message: t('imports.map.approveOneSuccess', { defaultValue: 'Parcel approved' }) });
        } catch (err) {
            console.error('Failed to approve parcel', err);
            setApproveFeedback({ type: 'error', message: t('imports.map.approveError', { defaultValue: 'Unable to approve parcel' }) });
        }
    }, [isImportMode, t]);

    const extractCoords = (layer: any): [number, number][] => {
        const raw = layer?.getLatLngs?.();
        if (!raw) return [];
        const ring = Array.isArray(raw) ? (Array.isArray(raw[0]) ? raw[0] : raw) : [raw];
        return ring.map((ll: any) => [ll.lat, ll.lng]);
    };

    const coordsToWKT = (coords: [number, number][]): string => {
        // Convert Leaflet format [lat, lng] to WKT format "POLYGON((lng lat, lng lat, ...))"
        const wktCoords = coords.map(([lat, lng]) => `${lng} ${lat}`).join(', ');
        // Close the polygon by adding the first coordinate at the end if not already closed
        const firstCoord = coords[0];
        const lastCoord = coords[coords.length - 1];
        const needsClosing = firstCoord[0] !== lastCoord[0] || firstCoord[1] !== lastCoord[1];
        const closedWktCoords = needsClosing ? `${wktCoords}, ${firstCoord[1]} ${firstCoord[0]}` : wktCoords;
        return `POLYGON((${closedWktCoords}))`;
    };

    const parseWktCoords = (wktInput?: string | null): [number, number][] => {
        if (!wktInput) return [];
        const wkt = wktInput.trim();
        const polygonMatch = wkt.match(/POLYGON\s*\(\s*\(\s*([^)]*?)\s*\)\s*/i);
        const multiPolygonMatch = wkt.match(/MULTIPOLYGON\s*\(\s*\(\s*\(\s*([^)]*?)\s*\)\s*/i);
        const coordsSource = polygonMatch?.[1] ?? multiPolygonMatch?.[1];

        if (!coordsSource) return [];

        return coordsSource
            .split(',')
            .map((pair) => pair.replace(/[()]/g, '').trim())
            .map((pair) => {
                const [lngStr, latStr] = pair.split(/\s+/).filter(Boolean);
                const lng = Number(lngStr);
                const lat = Number(latStr);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    return [lat, lng] as [number, number];
                }
                return null;
            })
            .filter((val): val is [number, number] => Array.isArray(val));
    };

    const detectOverlaps = (id: string, coords: [number, number][]): { id: string; name: string }[] => {
        const overlapping: { id: string; name: string }[] = [];

        for (const poly of polygons) {
            if (poly.id === id) continue;
            if (!poly.visible) continue;

            if (checkOverlap(coords, poly.coords)) {
                overlapping.push({ id: poly.id, name: poly.name });
            }
        }

        return overlapping;
    };

    const updatePolygon = useCallback((id: string, coords: [number, number][], incrementVersion: boolean = true) => {
        setPolygons(prev => prev.map(p => p.id === id ? { ...p, coords, version: incrementVersion ? (p.version || 0) + 1 : p.version } : p));
    }, []);

    const cleanupEdit = useCallback(() => {
        const state = editStateRef.current;
        if (!state) return;

        state.listeners.edit && state.layer?.off('edit', state.listeners.edit);
        state.listeners.mousemove && state.listeners.mousemove.map?.off('mousemove', state.listeners.mousemove.listener);
        state.handler?.disable?.();
        state.tempGroup && getMap()?.removeLayer(state.tempGroup);

        editStateRef.current = null;
    }, []);

    const setupEditListeners = useCallback((layer: any, id: string) => {
        const handleUpdate = () => updatePolygon(id, extractCoords(layer), false);
        layer.on('edit', handleUpdate);

        const map = getMap();
        let moveListener: any = null;
        if (map) {
            let lastUpdate = 0;
            moveListener = () => {
                const now = Date.now();
                if (now - lastUpdate < 16) return; // ~60fps
                lastUpdate = now;
                handleUpdate();
            };
            map.on('mousemove', moveListener);
        }

        if (editStateRef.current) {
            editStateRef.current.listeners = {
                edit: handleUpdate,
                mousemove: moveListener ? { map, listener: moveListener } : undefined
            };
        }
    }, [updatePolygon]);

    const startEdit = useCallback((id: string) => {
        if (editingId && editingId !== id) return;
        if (!canEditPolygon(id)) return;

        const poly = polygons.find(p => p.id === id);
        const fg = featureGroupRef.current;
        if (!poly || !fg) return;

        let targetLayer: any = null;
        fg.eachLayer((l: any) => { if (l?.options?.customId === id) targetLayer = l; });
        if (!targetLayer) return;

        originalCoordsRef.current[id] = extractCoords(targetLayer);
        getMap()?.closePopup?.();

        const clone = L.polygon(poly.coords as L.LatLngExpression[], { color: 'blue' });
        (clone as any).options = { ...clone.options, customId: id };
        const tmpGroup = new L.FeatureGroup().addLayer(clone);
        getMap()?.addLayer(tmpGroup);

        const EditHandler = (L as any).EditToolbar?.Edit || (L as any).EditToolbarEdit;
        if (!EditHandler) return;

        const handler = new EditHandler(getMap(), { featureGroup: tmpGroup });
        if (handler._selectedLayers) {
            handler._selectedLayers.clearLayers?.();
            handler._selectedLayers.addLayer(clone);
        }

        editStateRef.current = { layer: clone, handler, tempGroup: tmpGroup, listeners: {} };
        setupEditListeners(clone, id);
        handler.enable();
        setEditingId(id);
    }, [polygons, editingId, setupEditListeners, canEditPolygon]);

    const finishEdit = useCallback(async () => {
        const state = editStateRef.current;
        if (!state || !editingId) return;

        const newCoords = extractCoords(state.layer);
        const overlapping = detectOverlaps(editingId, newCoords);
        const manualContextActive = manualEditContext?.warning.polygonId === editingId;

        if (overlapping.length > 0) {
            const otherPolygons = polygons.filter(p => overlapping.some(o => o.id === p.id));
            const fixedCoords = fixOverlap(newCoords, otherPolygons);
            cleanupEdit();
            setEditingId(null);
            delete originalCoordsRef.current[editingId];
            if (manualContextActive) {
                setManualEditContext(null);
            }
            getMap()?.closePopup?.();

            setOverlapWarning({
                polygonId: editingId,
                overlappingPolygons: overlapping,
                originalCoords: newCoords,
                fixedCoords
            });
            setShowPreview(false);
            return;
        }

        // Send PUT request to backend to update the polygon
        try {
            const payload = {
                geodata: coordsToWKT(newCoords),
            };

            const response = await apiPut(`${parcelsEndpoint}/${editingId}`, payload);
            if (response.ok) {
                console.log("Polygon updated successfully on backend");
            } else {
                console.error("Failed to update parcel:", response.statusText);
            }
        } catch (err) {
            console.error("Failed to update parcel:", err);
        }

        updatePolygon(editingId, newCoords, true);
        delete originalCoordsRef.current[editingId];
        cleanupEdit();
        setEditingId(null);
        getMap()?.closePopup?.();

        if (manualContextActive) {
            setManualEditContext(null);
        }
    }, [editingId, polygons, updatePolygon, cleanupEdit, manualEditContext, parcelsEndpoint]);

    const cancelEdit = useCallback(() => {
        const state = editStateRef.current;
        if (!state || !editingId) return;

        if (manualEditContext && manualEditContext.warning.polygonId === editingId) {
            cleanupEdit();
            setEditingId(null);
            delete originalCoordsRef.current[editingId];
            setPolygons(prev => prev.filter(p => p.id !== editingId));
            setOverlapWarning(manualEditContext.warning);
            setAreaName(manualEditContext.areaNameSnapshot);
            setShowPreview(false);
            setManualEditContext(null);
            setPendingManualEditId(null);
            getMap()?.closePopup?.();
            return;
        }

        const original = originalCoordsRef.current[editingId];
        if (original) {
            state.layer.setLatLngs?.(original);
            updatePolygon(editingId, original, true);
            delete originalCoordsRef.current[editingId];
        }

        cleanupEdit();
        setEditingId(null);
        getMap()?.closePopup?.();
    }, [editingId, manualEditContext, updatePolygon, cleanupEdit]);

    const deletePolygon = useCallback(async (id: string) => {
        if (!canEditPolygon(id)) return;
        if (contextType === 'farm') {
            try {
                const response = await apiDelete(`/parcels/${id}`);
                if (!response.ok) {
                    console.error("Failed to delete parcel:", response.statusText);
                    return;
                }
            } catch (err) {
                console.error("Failed to delete parcel:", err);
                return;
            }
        }

        setPolygons(prev => prev.filter(p => p.id !== id));
        if (id === editingId) {
            cleanupEdit();
            setEditingId(null);
        }
    }, [canEditPolygon, contextType, editingId, cleanupEdit]);

    const closePolygonContextMenu = useCallback(() => {
        setPolygonContextMenu(null);
        setPendingDeleteId(null);
        setShowColorPicker(false);
        originalColorRef.current = null;
    }, []);

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
    }, [contextType, resolvedContextId]);

    const loadParcelOperations = useCallback(async (parcelId: string) => {
        if (contextType !== 'farm' || !resolvedContextId) return;
        setOperationLoading(true);
        setOperationError(null);
        try {
            let url = `/farm/${resolvedContextId}/parcels/${parcelId}/operations`;
            if (researchShareToken) {
                url += `?shareToken=${encodeURIComponent(researchShareToken)}`;
            }
            const res = await apiGet(url);
            if (!res.ok) throw new Error("failed");
            const data = await res.json();
            setParcelOperations(data);
        } catch (err) {
            console.error(err);
            setOperationError(t('operations.errorLoad', { defaultValue: 'Unable to load operations' }));
        } finally {
            setOperationLoading(false);
        }
    }, [contextType, resolvedContextId, t, researchShareToken]);

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

    const loadResearchShares = useCallback(async () => {
        if (contextType !== 'farm' || !resolvedContextId) return;
        try {
            const res = await apiGet(`/farm/${resolvedContextId}/research-shares`);
            if (!res.ok) throw new Error('failed');
            const data = await res.json();
            setResearchShares(data);
        } catch (err) {
            console.error('Failed to load research shares', err);
        }
    }, [contextType, resolvedContextId]);

    const openShareModal = useCallback(async (parcelId: string) => {
        setShareParcelId(parcelId);
        setShareUsername('');
        setShareRole('VIEWER');
        setResearchShareUsername('');
        setResearchSharePeriodIds([]);
        setResearchShareToolIds([]);
        setResearchShareProductIds([]);
        setResearchShareFilterStartDate('');
        setResearchShareFilterEndDate('');
        setResearchShareStartAt('');
        setResearchShareEndAt('');
        setResearchShareMaxUsers('');
        setResearchShareMode('direct');
        setResearchShareFeedback('');
        setResearchShareLastLink('');
        await loadParcelShares(parcelId);
        await loadResearchShares();
    }, [loadParcelShares, loadResearchShares]);

    const closeShareModal = useCallback(() => {
        setShareParcelId(null);
        setShareList([]);
        setShareUsername('');
        setShareRole('VIEWER');
        setShareError('');
        setResearchShares([]);
        setResearchShareUsername('');
        setResearchSharePeriodIds([]);
        setResearchShareToolIds([]);
        setResearchShareProductIds([]);
        setResearchShareFilterStartDate('');
        setResearchShareFilterEndDate('');
        setResearchShareStartAt('');
        setResearchShareEndAt('');
        setResearchShareMode('direct');
        setResearchShareMaxUsers('');
        setResearchShareFeedback('');
        setResearchShareLastLink('');
    }, []);

    const handleAddShare = useCallback(async (e: FormEvent) => {
        e.preventDefault();
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

    const handleCreateResearchShare = useCallback(async (e: FormEvent) => {
        e.preventDefault();
        if (!shareParcelId || !resolvedContextId) return;
        const zone = allPolygons.find(p => p.id === shareParcelId);
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
                periodId: researchSharePeriodIds.length === 1 ? Number(researchSharePeriodIds[0]) : undefined,
                toolId: researchShareToolIds.length === 1 ? Number(researchShareToolIds[0]) : undefined,
                productId: researchShareProductIds.length === 1 ? Number(researchShareProductIds[0]) : undefined,
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
                    const res = await apiPost(`/farm/${resolvedContextId}/research-shares`, {
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
                const res = await apiPost(`/farm/${resolvedContextId}/research-shares`, payload);
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
    }, [allPolygons, buildResearchShareUrl, copyToClipboard, researchShareEndAt, researchShareFilterEndDate, researchShareFilterStartDate, researchShareMaxUsers, researchShareMode, researchSharePeriodIds, researchShareProductIds, researchShareStartAt, researchShareToolIds, researchShareUsername, resolvedContextId, shareParcelId, toWktPolygon]);

    const handleRemoveResearchShare = useCallback(async (shareId: number) => {
        if (!resolvedContextId) return;
        try {
            const res = await apiDelete(`/farm/${resolvedContextId}/research-shares/${shareId}`);
            if (!res.ok) throw new Error('failed');
            setResearchShares(prev => prev.filter(item => item.id !== shareId));
        } catch (err) {
            console.error('Failed to delete research share', err);
            setResearchShareFeedback('Unable to delete research share.');
        }
    }, [resolvedContextId]);

    const handleAddOperationLine = useCallback(() => {
        setOperationLines(prev => [...prev, { productId: "", quantity: "", unitId: "", toolId: "" }]);
    }, []);

    const handleRemoveOperationLine = useCallback((index: number) => {
        setOperationLines(prev => prev.filter((_, i) => i !== index));
    }, []);

    const updateOperationLine = useCallback((index: number, key: keyof OperationProductInputState, value: string) => {
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

            const res = await apiPost(`/farm/${props.farm_id}/parcels/${currentParcelId}/operations`, payload);
            if (!res.ok) throw new Error("failed");

            resetOperationForm();
            await loadParcelOperations(currentParcelId);
        } catch (err) {
            console.error(err);
            setOperationError(t('operations.errorCreate', { defaultValue: 'Failed to save operation' }));
        } finally {
            setOperationLoading(false);
        }
    }, [currentParcelId, operationLines, operationTypeId, operationDate, operationDurationMinutes, props.farm_id, loadParcelOperations, resetOperationForm, t, canEditPolygon]);

    const handleOverlapIgnore = useCallback(async () => {
        if (!overlapWarning) return;

        if (overlapWarning.isNewPolygon) {
            // For new polygons, create with the original coords
            createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
            createdLayerRef.current = null;

            const newPoly: PolygonData = {
                id: overlapWarning.polygonId,
                name: areaName || t('map.defaultPolygonName'),
                coords: overlapWarning.originalCoords,
                version: 0,
                visible: true,
                color: '#3388ff',
                periodId: selectedPeriodId ? Number(selectedPeriodId) : null,
            };

            // Send POST request to backend
            try {
                const payload = {
                    name: newPoly.name,
                    active: true,
                    startValidity: new Date().toISOString(),
                    endValidity: null,
                    geodata: coordsToWKT(newPoly.coords),
                    color: newPoly.color,
                    periodId: selectedPeriodId ? Number(selectedPeriodId) : undefined,
                };

                const response = await apiPost(parcelsEndpoint, payload);
                if (response.ok) {
                    const createdParcel = await response.json();
                    // Update the polygon with the backend-generated ID
                    newPoly.id = String(createdParcel.id);
                    setPolygons(prev => [...prev, newPoly]);
                } else {
                    console.error("Failed to create parcel:", response.statusText);
                    // Still add locally with temp ID for now
                    // TODO: Consider removing if backend creation fails
                    setPolygons(prev => [...prev, newPoly]);
                }
            } catch (err) {
                console.error("Failed to create parcel:", err);
                // Still add locally with temp ID for now
                // TODO: Consider removing if backend creation fails
                setPolygons(prev => [...prev, newPoly]);
            }

            setModal({ open: false, coords: null });
            setAreaName("");
            setSelectedPeriodId("");
        } else {
            // For edited polygons

            // Send PUT request to backend to update the polygon
            try {
                const payload = {
                    geodata: coordsToWKT(overlapWarning.originalCoords),
                };

                const response = await apiPut(`${parcelsEndpoint}/${overlapWarning.polygonId}`, payload);
                if (response.ok) {
                    console.log("Polygon updated successfully on backend");
                } else {
                    console.error("Failed to update parcel:", response.statusText);
                }
            } catch (err) {
                console.error("Failed to update parcel:", err);
            }

            updatePolygon(overlapWarning.polygonId, overlapWarning.originalCoords, true);
            delete originalCoordsRef.current[overlapWarning.polygonId];
            cleanupEdit();
            setEditingId(null);
            getMap()?.closePopup?.();
        }

        setOverlapWarning(null);
        setShowPreview(false);
    }, [overlapWarning, areaName, updatePolygon, cleanupEdit, parcelsEndpoint, selectedPeriodId, t]);

    const handleOverlapAccept = useCallback(async () => {
        if (!overlapWarning || !overlapWarning.fixedCoords) {
            console.error("No overlap warning or fixed coords!");
            return;
        }

        console.log("Accepting fixed coords:", overlapWarning.fixedCoords);
        console.log("For polygon:", overlapWarning.polygonId);

        if (overlapWarning.isNewPolygon) {
            // For new polygons, create with the fixed coords
            createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
            createdLayerRef.current = null;

            const newPoly: PolygonData = {
                id: overlapWarning.polygonId,
                name: areaName || t('map.defaultPolygonName'),
                coords: overlapWarning.fixedCoords,
                version: 0,
                visible: true,
                color: '#3388ff',
                periodId: selectedPeriodId ? Number(selectedPeriodId) : null,
            };

            console.log("Creating new polygon:", newPoly);

            // Send POST request to backend
            try {
                const payload = {
                    name: newPoly.name,
                    active: true,
                    startValidity: new Date().toISOString(),
                    endValidity: null,
                    geodata: coordsToWKT(newPoly.coords),
                    color: newPoly.color,
                    periodId: selectedPeriodId ? Number(selectedPeriodId) : undefined,
                };

                const response = await apiPost(parcelsEndpoint, payload);
                if (response.ok) {
                    const createdParcel = await response.json();
                    // Update the polygon with the backend-generated ID
                    newPoly.id = String(createdParcel.id);
                    setPolygons(prev => {
                        const updated = [...prev, newPoly];
                        console.log("Updated polygons:", updated);
                        return updated;
                    });
                } else {
                    console.error("Failed to create parcel:", response.statusText);
                    // Still add locally with temp ID for now
                    setPolygons(prev => {
                        const updated = [...prev, newPoly];
                        console.log("Updated polygons:", updated);
                        return updated;
                    });
                }
            } catch (err) {
                console.error("Failed to create parcel:", err);
                // Still add locally with temp ID for now
                setPolygons(prev => {
                    const updated = [...prev, newPoly];
                    console.log("Updated polygons:", updated);
                    return updated;
                });
            }
        } else {
            // For edited polygons
            console.log("Updating existing polygon");

            // Send PUT request to backend to update the polygon
            try {
                const payload = {
                    geodata: coordsToWKT(overlapWarning.fixedCoords),
                };

                const response = await apiPut(`${parcelsEndpoint}/${overlapWarning.polygonId}`, payload);
                if (response.ok) {
                    console.log("Polygon updated successfully on backend");
                } else {
                    console.error("Failed to update parcel:", response.statusText);
                }
            } catch (err) {
                console.error("Failed to update parcel:", err);
            }

            updatePolygon(overlapWarning.polygonId, overlapWarning.fixedCoords, true);
            delete originalCoordsRef.current[overlapWarning.polygonId];
            cleanupEdit();
            setEditingId(null);
            getMap()?.closePopup?.();
        }

        setModal({ open: false, coords: null });
        setAreaName("");
        setSelectedPeriodId("");
        setOverlapWarning(null);
        setShowPreview(false);
    }, [overlapWarning, areaName, updatePolygon, cleanupEdit, parcelsEndpoint, selectedPeriodId, t]);

    const handleOverlapCancel = useCallback(() => {
        if (overlapWarning?.isNewPolygon) {
            createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
            createdLayerRef.current = null;
            setModal({ open: false, coords: null });
            setAreaName("");
            setPendingManualEditId(null);
        }

        setOverlapWarning(null);
        setShowPreview(false);
    }, [overlapWarning]);

    const handleOverlapEditOriginal = useCallback(() => {
        if (!overlapWarning) return;

        const polygonId = overlapWarning.polygonId;
        setOverlapWarning(null);
        setShowPreview(false);

        // For new polygons, this doesn't make sense, so just cancel
        if (overlapWarning.isNewPolygon) {
            setModal({ open: true, coords: overlapWarning.originalCoords });
        } else {
            startEdit(polygonId);
        }
    }, [overlapWarning, startEdit]);

    const handleOverlapManualEdit = useCallback(() => {
        if (!overlapWarning?.isNewPolygon) return;

        setManualEditContext({
            warning: overlapWarning,
            areaNameSnapshot: areaName,
        });

        const newPoly: PolygonData = {
            id: overlapWarning.polygonId,
            name: areaName || t('map.defaultPolygonName'),
            coords: overlapWarning.originalCoords,
            version: 0,
            visible: true,
            color: '#3388ff',
            periodId: selectedPeriodId ? Number(selectedPeriodId) : null,
        };

        createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
        createdLayerRef.current = null;

        setPolygons(prev => [...prev, newPoly]);
        setPendingManualEditId(newPoly.id);
        setModal({ open: false, coords: null });
        setOverlapWarning(null);
        setShowPreview(false);
    }, [overlapWarning, areaName, selectedPeriodId, t]);

    useEffect(() => {
        loadOperationReferences();
    }, [loadOperationReferences]);

    useEffect(() => {
        loadPeriods();
    }, [loadPeriods]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(max-width: 768px)');
        const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
        handler(mq);
        mq.addEventListener ? mq.addEventListener('change', handler) : mq.addListener(handler as any);
        return () => {
            mq.removeEventListener ? mq.removeEventListener('change', handler) : mq.removeListener(handler as any);
        };
    }, []);

    const prefKey = useMemo(() => user ? `opsTopRight:${user.id}` : 'opsTopRight:anon', [user]);

    const persistPreferenceRemote = useCallback(async (next: boolean) => {
        try {
            await apiPut('/users/me/preferences', { operationsPopupTopRight: next });
        } catch (err) {
            console.error('Failed to persist operations popup preference remotely', err);
        }
    }, []);

    useEffect(() => {
        if (user?.operationsPopupTopRight === undefined) return;
        setPreferTopRight(user.operationsPopupTopRight);
        try {
            localStorage.setItem(prefKey, user.operationsPopupTopRight ? '1' : '0');
        } catch (err) {
            console.error('Failed to sync operations popup preference from profile', err);
        }
    }, [user?.operationsPopupTopRight, prefKey]);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(prefKey);
            if (stored) setPreferTopRight(stored === '1');
        } catch (err) {
            console.error('Failed to read operations popup preference', err);
        }
    }, [prefKey]);

    useEffect(() => {
        try {
            localStorage.setItem(prefKey, preferTopRight ? '1' : '0');
        } catch (err) {
            console.error('Failed to persist operations popup preference', err);
        }
        persistPreferenceRemote(preferTopRight);
    }, [prefKey, preferTopRight, persistPreferenceRemote]);

    useEffect(() => {
        if (!operationPopup) {
            setPopupCoords(null);
            return;
        }
        const mapRect = getMap()?.getContainer?.()?.getBoundingClientRect?.();
        if (preferTopRight && mapRect) {
            const pos = clampToRect(mapRect.right - POPUP_WIDTH - POPUP_PADDING, mapRect.top + POPUP_PADDING, POPUP_WIDTH, POPUP_HEIGHT, mapRect);
            setPopupCoords({ left: pos.x, top: pos.y });
            return;
        }
        const fallbackPos = clampToRect(operationPopup.x, operationPopup.y, POPUP_WIDTH, POPUP_HEIGHT, mapRect ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight));
        setPopupCoords({ left: fallbackPos.x, top: fallbackPos.y });
    }, [operationPopup, preferTopRight, clampToRect, POPUP_WIDTH, POPUP_HEIGHT, POPUP_PADDING]);

    const startDrag = useCallback((e: React.MouseEvent) => {
        if (!popupCoords || isMobile) return;
        e.preventDefault();
        setDragState({ active: true, offsetX: e.clientX - popupCoords.left, offsetY: e.clientY - popupCoords.top });
    }, [popupCoords, isMobile]);

    useEffect(() => {
        if (!dragState.active) return;
        const handleMove = (e: MouseEvent) => {
            const nextLeft = e.clientX - dragState.offsetX;
            const nextTop = e.clientY - dragState.offsetY;
            const pos = clampToViewport(nextLeft, nextTop, POPUP_WIDTH, POPUP_HEIGHT);
            setPopupCoords({ left: pos.x, top: pos.y });
        };
        const handleUp = () => setDragState(prev => ({ ...prev, active: false }));
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [dragState.active, dragState.offsetX, dragState.offsetY, clampToViewport, POPUP_WIDTH, POPUP_HEIGHT]);

    // Creation
    const getPointCount = (handler: any) => {
        if (!handler) return 0;
        return handler._markers?.length || handler._poly?.getLatLngs()[0]?.length ||
            handler._shape?.getLatLngs()[0]?.length || handler._polyline?.getLatLngs()[0]?.length || 0;
    };

    const startCreate = useCallback(() => {
        if (!allowCreate) return;
        const drawMode = editControlRef.current?._toolbars?.draw?._modes?.polygon?.handler;
        const handler = drawMode || (getMap() && (L as any).Draw?.Polygon ? new (L as any).Draw.Polygon(getMap(), {}) : null);
        if (!handler) return;

        handler.enable();
        createHandlerRef.current = handler;
        setIsCreating(true);
        setCreatePointCount(0);
    }, [allowCreate]);

    const finishCreate = useCallback(() => {
        if (getPointCount(createHandlerRef.current) < 3) return;
        createHandlerRef.current?.completeShape?.() || createHandlerRef.current?._finishShape?.() || createHandlerRef.current?.finishDrawing?.();
    }, []);

    const cancelCreate = useCallback(() => {
        createHandlerRef.current?.disable?.();
        createHandlerRef.current = null;
        setIsCreating(false);
        setCreatePointCount(0);
        createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
        createdLayerRef.current = null;
    }, []);

    const startSearchPolygon = useCallback(() => {
        if (isCreating || editingId) return;
        const handler = getMap() && (L as any).Draw?.Polygon ? new (L as any).Draw.Polygon(getMap(), { allowIntersection: false, showArea: false }) : null;
        if (!handler) return;
        handler.enable();
        searchDrawHandlerRef.current = handler;
        setIsSearchDrawing(true);
    }, [editingId, isCreating]);

    const cancelSearchPolygon = useCallback(() => {
        searchDrawHandlerRef.current?.disable?.();
        searchDrawHandlerRef.current = null;
        setIsSearchDrawing(false);
    }, []);

    const clearSearchPolygon = useCallback(() => {
        setSearchAreaCoords([]);
        const map = getMap();
        if (map && searchAreaLayerRef.current) {
            map.removeLayer(searchAreaLayerRef.current);
            searchAreaLayerRef.current = null;
        }
        setSearchDraft(prev => ({ ...prev, usePolygon: false }));
    }, []);

    const handleCreated = useCallback((e: any) => {
        if (isSearchDrawing) {
            const coords = e.layer.getLatLngs()[0].map((ll: L.LatLng) => [ll.lat, ll.lng]) as [number, number][];
            const map = getMap();
            if (map) {
                if (searchAreaLayerRef.current) {
                    map.removeLayer(searchAreaLayerRef.current);
                }
                e.layer.setStyle?.({ color: '#f97316', weight: 2, fillOpacity: 0.08, dashArray: '6 6' });
                e.layer.addTo(map);
                searchAreaLayerRef.current = e.layer;
            }
            setSearchAreaCoords(coords);
            setIsSearchDrawing(false);
            searchDrawHandlerRef.current?.disable?.();
            searchDrawHandlerRef.current = null;
            setSearchDraft(prev => ({ ...prev, usePolygon: true }));
            return;
        }
        const coords = e.layer.getLatLngs()[0].map((ll: L.LatLng) => [ll.lat, ll.lng]) as [number, number][];
        createdLayerRef.current = e.layer;
        setModal({ open: true, coords });
        createHandlerRef.current = null;
        setIsCreating(false);
    }, [isSearchDrawing]);

    const confirmCreate = useCallback(async () => {
        const coords = modal.coords;
        if (!coords) return;

        const tempId = `poly-${Date.now()}`;
        const overlapping = detectOverlaps(tempId, coords);

        if (overlapping.length > 0) {
            const otherPolygons = polygons.filter(p => overlapping.some(o => o.id === p.id));
            const fixedCoords = fixOverlap(coords, otherPolygons);

            setModal({ open: false, coords: null });
            setOverlapWarning({
                polygonId: tempId,
                overlappingPolygons: overlapping,
                originalCoords: coords,
                fixedCoords,
                isNewPolygon: true
            });
            setShowPreview(false);
            return;
        }

        createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
        createdLayerRef.current = null;

        const newPoly: PolygonData = {
            id: tempId,
            name: areaName || t('map.defaultPolygonName'),
            coords,
            version: 0,
            visible: true,
            color: '#3388ff',
            periodId: selectedPeriodId ? Number(selectedPeriodId) : null,
            canEdit: true,
            canShare: false,
        };

        // Send POST request to backend
        try {
            const payload = {
                name: newPoly.name,
                active: true,
                startValidity: new Date().toISOString(),
                endValidity: null,
                geodata: coordsToWKT(newPoly.coords),
                color: newPoly.color,
                periodId: selectedPeriodId ? Number(selectedPeriodId) : undefined,
            };

            const response = await apiPost(parcelsEndpoint, payload);
            if (response.ok) {
                const createdParcel = await response.json();
                // Update the polygon with the backend-generated ID
                newPoly.id = String(createdParcel.id);
                newPoly.canEdit = createdParcel.canEdit ?? true;
                newPoly.canShare = createdParcel.canShare ?? false;
                setPolygons(prev => [...prev, newPoly]);
            } else {
                console.error("Failed to create parcel:", response.statusText);
                // Still add locally with temp ID for now
                setPolygons(prev => [...prev, newPoly]);
            }
        } catch (err) {
            console.error("Failed to create parcel:", err);
            // Still add locally with temp ID for now
            setPolygons(prev => [...prev, newPoly]);
        }

        setModal({ open: false, coords: null });
        setAreaName("");
        setSelectedPeriodId("");
    }, [modal.coords, areaName, polygons, parcelsEndpoint, selectedPeriodId, t]);

    const cancelModal = useCallback(() => {
        createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
        createdLayerRef.current = null;
        setModal({ open: false, coords: null });
        setAreaName("");
        setSelectedPeriodId("");
    }, []);

    const detachCreatedLayer = useCallback(() => {
        const layer = createdLayerRef.current;
        const map = getMap();
        if (layer && map?.hasLayer?.(layer)) {
            map.removeLayer(layer);
        }
    }, []);

    const reattachCreatedLayer = useCallback(() => {
        const layer = createdLayerRef.current;
        const map = getMap();
        if (layer && map && !map.hasLayer?.(layer)) {
            map.addLayer(layer);
        }
    }, []);

    const handleShowPreview = useCallback(() => {
        if (!overlapWarning) return;
        if (overlapWarning.isNewPolygon) {
            detachCreatedLayer();
        }
        setPreviewVisibility({ original: false, fixed: true });
        setShowPreview(true);
    }, [overlapWarning, detachCreatedLayer]);

    // Effects
    useEffect(() => {
        const fetchPolygons = async () => {
            try {
                const endpoint = viewportEndpoint || searchEndpoint;
                const response = await apiGet(endpoint);
                if (response.ok) {
                    let data = await response.json();
                    // If initial viewport query yields no rows, fall back to full-access query.
                    // This prevents shared users from seeing an empty map when their shared zones
                    // are outside the current map bounds.
                    if (!hasActiveSearchFilters && viewportEndpoint && Array.isArray(data) && data.length === 0) {
                        const fallbackResponse = await apiGet(searchEndpoint);
                        if (fallbackResponse.ok) {
                            data = await fallbackResponse.json();
                        }
                    }
                    const parsed: PolygonData[] = data.map((p: any) => {
                        // Parse geodata WKT string to coordinates
                        let coords: [number, number][] = [];
                        try {
                            if (p.geodata) {
                                coords = parseWktCoords(typeof p.geodata === 'string' ? p.geodata : String(p.geodata));
                                if (!coords.length) {
                                    console.warn('Invalid WKT format for parcel:', p.id, p.geodata);
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing geodata for parcel:', p.id, e);
                        }

                        return {
                            id: String(p.id),
                            name: p.name || t('map.unnamedParcel'),
                            coords,
                            visible: true,
                            version: 0,
                            color: p.color || '#3388ff',
                            canEdit: p.canEdit !== undefined ? p.canEdit : true,
                            canShare: p.canShare ?? false,
                            // Store additional API fields for reference
                            active: p.active,
                            startValidity: p.startValidity,
                            endValidity: p.endValidity,
                            farmId: p.farmId,
                            periodId: p.periodId ?? null,
                            validationStatus: p.validationStatus,
                            convertedParcelId: p.convertedParcelId ?? null,
                        };
                    });
                    setPolygons(parsed);
                    setAllPolygons(prev => {
                        if (!prev.length) return parsed;
                        const map = new Map(prev.map(item => [item.id, item]));
                        parsed.forEach((item: PolygonData) => {
                            map.set(item.id, { ...map.get(item.id), ...item });
                        });
                        return Array.from(map.values());
                    });
                } else {
                    console.error("Failed to fetch polygons:", response.statusText);
                    setPolygons([]);
                }
            } catch (err) {
                console.error("Failed to fetch polygons:", err);
                setPolygons([]);
            }
        };

        fetchPolygons();
    }, [contextType, hasActiveSearchFilters, isImportMode, parcelsEndpoint, searchEndpoint, t, viewportEndpoint]);


    useEffect(() => {
        if (contextType !== 'farm' || !resolvedContextId || isImportMode) return;
        const fetchAll = async () => {
            try {
                const tokenQuery = researchShareToken ? `?shareToken=${encodeURIComponent(researchShareToken)}` : '';
                const response = await apiGet(`/farm/${resolvedContextId}/parcels/all${tokenQuery}`);
                if (response.ok) {
                    const data = await response.json();
                    const parsed: PolygonData[] = data.map((p: any) => ({
                        id: String(p.id),
                        name: p.name || t('map.unnamedParcel'),
                        coords: [],
                        visible: true,
                        version: 0,
                        color: p.color || '#3388ff',
                        canEdit: p.canEdit !== undefined ? p.canEdit : true,
                        canShare: p.canShare ?? false,
                        active: p.active,
                        farmId: p.farmId,
                        periodId: p.periodId ?? null,
                        validationStatus: p.validationStatus,
                        convertedParcelId: p.convertedParcelId ?? null,
                    }));
                    setAllPolygons(parsed);
                } else {
                    console.error('Failed to fetch full parcel list:', response.statusText);
                }
            } catch (err) {
                console.error('Failed to fetch full parcel list:', err);
            }
        };

        fetchAll();
    }, [contextType, resolvedContextId, isImportMode, researchShareToken, t]);

    useEffect(() => {
        if (!isCreating) return;
        const tick = () => {
            setCreatePointCount(getPointCount(createHandlerRef.current));
            createRafRef.current = requestAnimationFrame(tick);
        };
        createRafRef.current = requestAnimationFrame(tick);
        return () => {
            createRafRef.current && cancelAnimationFrame(createRafRef.current);
            createRafRef.current = null;
        };
    }, [isCreating]);

    useEffect(() => {
        if (!showPreview && overlapWarning?.isNewPolygon) {
            reattachCreatedLayer();
        }
    }, [showPreview, overlapWarning, reattachCreatedLayer]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (overlapWarning) { setOverlapWarning(null); setShowPreview(false); }
                else if (isCreating) cancelCreate();
                else if (editingId) cancelEdit();
                else if (renamingId) { setRenamingId(null); setRenameValue(''); }
                else if (pendingDeleteId) setPendingDeleteId(null);
                else if (contextMenu) setContextMenu(null);
                else if (polygonContextMenu) closePolygonContextMenu();
            } else if (e.key === 'Enter') {
                if (isCreating && createPointCount >= 3) {
                    e.preventDefault();
                    finishCreate();
                } else if (editingId) {
                    e.preventDefault();
                    finishEdit();
                }
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (editingId) {
                    e.preventDefault();
                    if (canEditPolygon(editingId)) {
                        deletePolygon(editingId);
                    }
                } else if (selectedId && !renamingId && !pendingDeleteId) {
                    e.preventDefault();
                    if (canEditPolygon(selectedId)) {
                        setPendingDeleteId(selectedId);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKey, { capture: true });
        return () => window.removeEventListener('keydown', handleKey, { capture: true });
    }, [isCreating, editingId, selectedId, renamingId, pendingDeleteId, contextMenu, polygonContextMenu, createPointCount, overlapWarning, cancelCreate, cancelEdit, finishCreate, finishEdit, deletePolygon, closePolygonContextMenu, canEditPolygon]);

    useEffect(() => {
        if (!pendingManualEditId) return;
        const exists = polygons.some(p => p.id === pendingManualEditId);
        if (!exists) return;
        startEdit(pendingManualEditId);
        setPendingManualEditId(null);
    }, [pendingManualEditId, polygons, startEdit]);

    // Components
    function MapEvents() {
        const updateViewport = (map: L.Map) => {
            if (hasActiveSearchFilters || isImportMode || contextType !== 'farm') return;
            const bounds = map.getBounds().pad(0.2);
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            setViewportBounds({
                minLat: sw.lat,
                minLng: sw.lng,
                maxLat: ne.lat,
                maxLng: ne.lng,
            });
        };

        const map = useMapEvents({
            load: e => {
                if (viewportDebounceRef.current) window.clearTimeout(viewportDebounceRef.current);
                viewportDebounceRef.current = window.setTimeout(() => updateViewport(e.target), 150);
            },
            moveend: e => {
                if (viewportDebounceRef.current) window.clearTimeout(viewportDebounceRef.current);
                viewportDebounceRef.current = window.setTimeout(() => updateViewport(e.target), 150);
            },
            zoomend: e => {
                if (viewportDebounceRef.current) window.clearTimeout(viewportDebounceRef.current);
                viewportDebounceRef.current = window.setTimeout(() => updateViewport(e.target), 150);
            },
            contextmenu: e => {
                if (!editingId && !isCreating) {
                    e.originalEvent.preventDefault();
                    const { x, y } = clampToViewport(e.originalEvent.clientX, e.originalEvent.clientY, 240, 200);
                    setContextMenu({ x, y });
                }
            },
            click: () => {
                if (editingId) return;
                setRenamingId(null);
                setRenameValue('');
                setPendingDeleteId(null);
                setContextMenu(null);
                closePolygonContextMenu();
                setSelectedId(null);
            },
            mousedown: () => {
                closePolygonContextMenu();
                setContextMenu(null);
            },
            popupopen: e => editingId && e.popup?.remove?.()
        });

        useEffect(() => {
            if (hasActiveSearchFilters || isImportMode || contextType !== 'farm') return;
            if (viewportBounds) return;
            const map = getMap();
            if (!map?.getBounds) return;
            const bounds = map.getBounds().pad(0.2);
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            setViewportBounds({
                minLat: sw.lat,
                minLng: sw.lng,
                maxLat: ne.lat,
                maxLng: ne.lng,
            });
        }, [map]);

        const initialPanDone = useRef(false);
        useEffect(() => {
            if (!initialPanDone.current && props.initialSharePayload?.zoneWkt) {
                const coords = parseWktCoords(props.initialSharePayload.zoneWkt);
                if (coords.length > 0) {
                    initialPanDone.current = true;
                    map.flyToBounds(L.latLngBounds(coords), { padding: [80, 80], animate: false });
                }
            }
        }, [map]);

        return null;
    }

    // Highlight selected polygon without scanning all layers each frame
    useEffect(() => {
        if (!selectedId) return;

        const layer = polygonLayersRef.current.get(selectedId);
        if (!layer) return;

        layer.setStyle({ dashArray: '10 5' });
        const element = layer.getElement();
        if (element) {
            element.classList.add('polygon-glow');
        }

        return () => {
            const target = polygonLayersRef.current.get(selectedId);
            if (!target) return;
            target.setStyle({ dashArray: undefined, dashOffset: '0' });
            const el = target.getElement();
            if (el) {
                el.classList.remove('polygon-glow');
            }
        };
    }, [selectedId]);

    const isPreciseDateRangeSelected = Boolean(searchDraft.startDate && searchDraft.endDate);

    const periodFilterOptions = useMemo(() => periods.map((period) => ({
        value: String(period.id),
        label: period.name || `${period.startDate || ''} - ${period.endDate || ''}`,
    })), [periods]);

    const toolFilterOptions = useMemo(() => tools.map((tool) => ({
        value: String(tool.id),
        label: tool.name,
    })), [tools]);

    const productFilterOptions = useMemo(() => products.map((product) => ({
        value: String(product.id),
        label: product.name,
    })), [products]);

    function MultiSelectCombobox({
        label,
        options,
        selectedValues,
        onChange,
        placeholder,
        disabled = false,
    }: {
        label: string;
        options: Array<{ value: string; label: string }>;
        selectedValues: string[];
        onChange: (next: string[]) => void;
        placeholder: string;
        disabled?: boolean;
    }) {
        const [open, setOpen] = useState(false);
        const [query, setQuery] = useState('');

        const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
        const selectedLabels = useMemo(
            () => options.filter((option) => selectedSet.has(option.value)).map((option) => option.label),
            [options, selectedSet]
        );
        const filteredOptions = useMemo(() => {
            const needle = query.trim().toLowerCase();
            if (!needle) return options;
            return options.filter((option) => option.label.toLowerCase().includes(needle));
        }, [options, query]);

        useEffect(() => {
            if (disabled && open) {
                setOpen(false);
            }
        }, [disabled, open]);

        return (
            <label className={`block text-xs font-semibold uppercase tracking-wide ${disabled ? 'text-slate-400' : 'text-slate-500'}`}>
                {label}
                <div className="relative mt-1">
                    <button
                        type="button"
                        onClick={() => !disabled && setOpen((prev) => !prev)}
                        disabled={disabled}
                        className={`w-full rounded-xl border px-3 py-2 text-left text-sm focus:outline-none ${disabled
                            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                            : 'border-slate-200 bg-white text-slate-700 focus:border-indigo-300'
                            }`}
                    >
                        {selectedLabels.length > 0 ? selectedLabels.join(', ') : placeholder}
                    </button>
                    {open && (
                        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                            <input
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={t('map.polygonList.searchPlaceholder', { defaultValue: 'Search polygons' })}
                                className="mb-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-300 focus:outline-none"
                            />
                            <div className="max-h-40 overflow-auto">
                                {filteredOptions.map((option) => {
                                    const checked = selectedSet.has(option.value);
                                    return (
                                        <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => {
                                                    if (checked) {
                                                        onChange(selectedValues.filter((value) => value !== option.value));
                                                    } else {
                                                        onChange([...selectedValues, option.value]);
                                                    }
                                                }}
                                                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                                            />
                                            <span>{option.label}</span>
                                        </label>
                                    );
                                })}
                                {filteredOptions.length === 0 && (
                                    <p className="px-2 py-1.5 text-xs text-slate-400">No match</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </label>
        );
    }

    return (
        <div className="relative h-full w-full">
            {overlapWarning && !showPreview && (
                <OverlapModal
                    warning={overlapWarning}
                    areaName={areaName}
                    onAreaNameChange={setAreaName}
                    onCancel={handleOverlapCancel}
                    onManualEdit={handleOverlapManualEdit}
                    onEditOriginal={handleOverlapEditOriginal}
                    onIgnore={handleOverlapIgnore}
                    onAccept={handleOverlapAccept}
                    onShowPreview={handleShowPreview}
                />
            )}

            {allowCreate && contextMenu && (
                <div
                    className={floatingMenuClasses}
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button
                        type="button"
                        onClick={() => { setContextMenu(null); startCreate(); }}
                        className={`${floatingButtonClasses} text-indigo-700`}
                    >
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-base text-indigo-600">+</span>
                        {t('map.contextMenu.addPolygon')}
                    </button>
                </div>
            )}

            {polygonContextMenu && (
                <div
                    className={`${floatingMenuClasses} overflow-hidden`}
                    style={{ left: polygonContextMenu.x, top: polygonContextMenu.y }}
                >
                    <div className="flex flex-col gap-1 p-1">
                        {canEditPolygon(polygonContextMenu.polygonId) && (
                            <button
                                type="button"
                                onClick={() => {
                                    const poly = polygons.find(p => p.id === polygonContextMenu.polygonId);
                                    closePolygonContextMenu();
                                    setRenamingId(polygonContextMenu.polygonId);
                                    setRenameValue(poly?.name || "");
                                    setRenamePeriodId(poly?.periodId ? String(poly.periodId) : "");
                                }}
                                className={`${floatingButtonClasses} text-slate-800`}
                            >
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">✏️</span>
                                {t('map.polygonMenu.rename')}
                            </button>
                        )}
                        {contextType === 'farm' && (
                            <button
                                type="button"
                                onClick={async () => {
                                    const { x, y, polygonId } = polygonContextMenu;
                                    closePolygonContextMenu();
                                    setSelectedId(polygonId);
                                    setCurrentParcelId(polygonId);
                                    await loadParcelOperations(polygonId);
                                    setOperationPopup({ x: x + 10, y: y + 10, polygonId });
                                }}
                                className={`${floatingButtonClasses} text-slate-800`}
                            >
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">📋</span>
                                {t('operations.title', { defaultValue: 'Parcel operations' })}
                            </button>
                        )}
                        {contextType === 'farm' && !isImportMode && canSharePolygon(polygonContextMenu.polygonId) && (
                            <button
                                type="button"
                                onClick={() => {
                                    const { polygonId } = polygonContextMenu;
                                    closePolygonContextMenu();
                                    openShareModal(polygonId);
                                }}
                                className={`${floatingButtonClasses} text-slate-800`}
                            >
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">🤝</span>
                                {t('map.sharing.open', { defaultValue: 'Share parcel' })}
                            </button>
                        )}
                        {canEditPolygon(polygonContextMenu.polygonId) && (
                            <button
                                type="button"
                                onClick={() => {
                                    closePolygonContextMenu();
                                    startEdit(polygonContextMenu.polygonId);
                                }}
                                className={`${floatingButtonClasses} text-slate-800`}
                            >
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">🔧</span>
                                {t('map.polygonMenu.edit')}
                            </button>
                        )}
                        {isImportMode && (
                            <button
                                type="button"
                                onClick={() => { closePolygonContextMenu(); approveSingleParcel(polygonContextMenu.polygonId); }}
                                className={`${floatingButtonClasses} text-emerald-700`}
                            >
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-base text-emerald-600">✅</span>
                                {t('imports.map.approveOne', { defaultValue: 'Approve parcel' })}
                            </button>
                        )}
                        {canEditPolygon(polygonContextMenu.polygonId) && (!showColorPicker ? (
                            <button
                                type="button"
                                onClick={() => {
                                    if (!canEditPolygon(polygonContextMenu.polygonId)) return;
                                    setShowColorPicker(true);
                                }}
                                className={`${floatingButtonClasses} text-slate-800`}
                            >
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">🎨</span>
                                {t('map.polygonMenu.color')}
                            </button>
                        ) : (
                            <div className="rounded-2xl bg-slate-50/80 p-3">
                                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {t('map.polygonMenu.color')}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {['#3388ff', '#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf', '#ff8b94', '#b4a7d6', '#ffa07a'].map(color => {
                                        const isCurrent = polygons.find(p => p.id === polygonContextMenu.polygonId)?.color === color;
                                        return (
                                            <button
                                                key={color}
                                                type="button"
                                                onClick={async () => {
                                                    setPolygons(prev => prev.map(p => p.id === polygonContextMenu.polygonId ? { ...p, color } : p));
                                                    originalColorRef.current = null;
                                                    closePolygonContextMenu();

                                                    try {
                                                        const payload = { color };
                                                        const response = await apiPut(`${parcelsEndpoint}/${polygonContextMenu.polygonId}`, payload);
                                                        if (!response.ok) {
                                                            console.error("Failed to update parcel color:", response.statusText);
                                                        }
                                                    } catch (err) {
                                                        console.error("Failed to update parcel color:", err);
                                                    }
                                                }}
                                                onMouseEnter={() => {
                                                    if (!originalColorRef.current) {
                                                        const currentPoly = polygons.find(p => p.id === polygonContextMenu.polygonId);
                                                        originalColorRef.current = currentPoly?.color || '#3388ff';
                                                    }
                                                    setPolygons(prev => prev.map(p => p.id === polygonContextMenu.polygonId ? { ...p, color } : p));
                                                }}
                                                onMouseLeave={() => {
                                                    if (originalColorRef.current) {
                                                        setPolygons(prev => prev.map(p => p.id === polygonContextMenu.polygonId ? { ...p, color: originalColorRef.current! } : p));
                                                    }
                                                }}
                                                className={`h-7 w-7 rounded-full border-2 border-white shadow-md transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-200 ${isCurrent ? 'ring-2 ring-indigo-400' : ''}`}
                                                style={{ background: color }}
                                            />
                                        );
                                    })}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowColorPicker(false)}
                                    className="mt-3 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:bg-white"
                                >
                                    {t('common.cancel')}
                                </button>
                            </div>
                        ))}
                        {canEditPolygon(polygonContextMenu.polygonId) && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (pendingDeleteId === polygonContextMenu.polygonId) {
                                        deletePolygon(pendingDeleteId);
                                        closePolygonContextMenu();
                                    } else {
                                        setPendingDeleteId(polygonContextMenu.polygonId);
                                    }
                                }}
                                className={`${floatingButtonClasses} ${pendingDeleteId === polygonContextMenu.polygonId ? 'bg-rose-500 text-white hover:!bg-rose-600 hover:!text-white' : 'text-rose-600 hover:bg-rose-50'}`}
                            >
                                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-base ${pendingDeleteId === polygonContextMenu.polygonId ? 'bg-white/20 text-white' : 'bg-rose-50 text-rose-600'}`}>🗑️</span>
                                {pendingDeleteId === polygonContextMenu.polygonId ? t('common.confirm') : t('common.delete')}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {pendingDeleteId && !polygonContextMenu && (
                <div className="fixed left-1/2 top-5 z-[10000] flex -translate-x-1/2 items-center gap-4 rounded-3xl bg-rose-500/95 px-6 py-4 text-white shadow-2xl shadow-rose-500/40 backdrop-blur">
                    <span className="text-sm font-semibold leading-snug">
                        {t('map.deletePrompt', { name: polygons.find(p => p.id === pendingDeleteId)?.name ?? '' })}
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => { deletePolygon(pendingDeleteId); setPendingDeleteId(null); }}
                            className="rounded-2xl bg-white/95 px-4 py-2 text-sm font-semibold text-rose-600 shadow-md transition hover:-translate-y-0.5"
                        >
                            {t('common.confirm')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setPendingDeleteId(null)}
                            className="rounded-2xl border border-white/60 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            )}

            {operationPopup && popupCoords && (() => {
                const listRect = listBarRef.current?.getBoundingClientRect();
                const mobileTop = (listRect?.bottom ?? 0) + 12;
                const viewportH = typeof window !== 'undefined' ? window.innerHeight : undefined;
                const mobileHeight = viewportH ? Math.max(180, viewportH - mobileTop - 12) : undefined;
                const popupStyle = isMobile
                    ? {
                        left: 0,
                        top: mobileTop,
                        width: '100vw',
                        maxWidth: '100vw',
                        height: mobileHeight ? `${mobileHeight}px` : undefined,
                        maxHeight: mobileHeight ? `${mobileHeight}px` : undefined,
                    }
                    : { left: popupCoords.left, top: popupCoords.top };

                return createPortal(
                    <div
                        className="fixed z-[120000] w-[420px] max-w-[94vw] max-h-[82vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/95 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur"
                        style={popupStyle}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="cursor-move" onMouseDown={startDrag}>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-200">{t('operations.title', { defaultValue: 'Parcel operations' })}</p>
                                <h3 className="text-lg font-semibold text-white">{polygons.find(p => p.id === operationPopup.polygonId)?.name || t('map.unnamedParcel')}</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1 text-xs font-semibold text-slate-200">
                                    <input
                                        type="checkbox"
                                        checked={preferTopRight}
                                        onChange={(e) => setPreferTopRight(e.target.checked)}
                                        className="h-4 w-4 rounded border-white/30 bg-white/10 text-indigo-500"
                                    />
                                    {t('operations.pinTopRight', { defaultValue: 'Open top-right' })}
                                </label>
                                <button
                                    type="button"
                                    onClick={closeOperationPopup}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/10"
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        {operationError && (
                            <div className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-100">
                                {operationError}
                            </div>
                        )}

                        {operationLoading && (
                            <div className="mb-3 flex items-center gap-2 rounded-xl border border-indigo-300/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-50">
                                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-indigo-200" aria-hidden="true" />
                                {t('common.loading', { defaultValue: 'Loading...' })}
                            </div>
                        )}

                        <div className="space-y-3">
                            {canEditPolygon(currentParcelId ?? operationPopup.polygonId) ? <>
                                <select
                                    value={operationTypeId}
                                    onChange={(e) => setOperationTypeId(e.target.value)}
                                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-300"
                                >
                                    <option value="">{t('operations.selectTypePlaceholder', { defaultValue: 'Select operation type' })}</option>
                                    {operationTypes.map(type => (
                                        <option key={type.id} value={type.id}>{type.name}</option>
                                    ))}
                                </select>

                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        type="datetime-local"
                                        value={operationDate}
                                        onChange={(e) => setOperationDate(e.target.value)}
                                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-300"
                                    />
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder={t('operations.durationLabel', { defaultValue: 'Duration (minutes)' })}
                                        value={operationDurationMinutes}
                                        onChange={(e) => setOperationDurationMinutes(e.target.value)}
                                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-300"
                                    />
                                </div>

                                <div className="flex items-center justify-between text-sm text-slate-100">
                                    <span>{t('operations.productsTools', { defaultValue: 'Products & Tools' })}</span>
                                    <button
                                        type="button"
                                        onClick={handleAddOperationLine}
                                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
                                    >
                                        + {t('common.add', { defaultValue: 'Add' })}
                                    </button>
                                </div>

                                <div className="flex flex-col gap-2">
                                    {operationLines.map((line, index) => (
                                        <div key={index} className="grid grid-cols-5 gap-2 text-sm">
                                            <select
                                                value={line.productId}
                                                onChange={(e) => updateOperationLine(index, 'productId', e.target.value)}
                                                className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-white outline-none focus:border-indigo-300"
                                            >
                                                <option value="">{t('common.select', { defaultValue: 'Select' })}</option>
                                                {products.map(p => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder={t('common.quantity', { defaultValue: 'Qty' })}
                                                value={line.quantity}
                                                onChange={(e) => updateOperationLine(index, 'quantity', e.target.value)}
                                                className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-white outline-none focus:border-indigo-300"
                                            />
                                            <select
                                                value={line.unitId}
                                                onChange={(e) => updateOperationLine(index, 'unitId', e.target.value)}
                                                className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-white outline-none focus:border-indigo-300"
                                            >
                                                <option value="">{t('operations.unit', { defaultValue: 'Unit' })}</option>
                                                {units.map(u => (
                                                    <option key={u.id} value={u.id}>{u.value}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={line.toolId}
                                                onChange={(e) => updateOperationLine(index, 'toolId', e.target.value)}
                                                className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-white outline-none focus:border-indigo-300"
                                            >
                                                <option value="">{t('operations.tool', { defaultValue: 'Tool' })}</option>
                                                {tools.map(tl => (
                                                    <option key={tl.id} value={tl.id}>{tl.name}</option>
                                                ))}
                                            </select>
                                            <div className="flex items-center justify-end">
                                                {operationLines.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveOperationLine(index)}
                                                        className="text-xs font-semibold text-rose-200 hover:text-rose-100"
                                                    >
                                                        {t('common.delete', { defaultValue: 'Remove' })}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={resetOperationForm}
                                        disabled={operationLoading}
                                        className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                                    >
                                        {t('common.cancel', { defaultValue: 'Cancel' })}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveOperation}
                                        disabled={!currentParcelId || operationLoading || (currentParcelId ? !canEditPolygon(currentParcelId) : false)}
                                        className="rounded-xl border border-indigo-400/70 bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-indigo-500 disabled:opacity-60"
                                    >
                                        {operationLoading ? t('common.loading', { defaultValue: 'Loading...' }) : t('operations.submit', { defaultValue: 'Save operation' })}
                                    </button>
                                </div>
                            </> : <></>}

                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">{t('operations.history', { defaultValue: 'History' })}</p>
                                <div className="mt-2 flex max-h-56 flex-col gap-2 overflow-y-auto">
                                    {parcelOperations.length === 0 && (
                                        <div className="text-sm text-slate-200/80">{t('operations.emptyHistory', { defaultValue: 'No operations yet' })}</div>
                                    )}
                                    {parcelOperations.map(op => (
                                        <div key={op.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="font-semibold text-white">{op.typeName || t('operations.selectTypePlaceholder', { defaultValue: 'Operation' })}</div>
                                                    <div className="text-xs text-slate-200/80">{op.date ? new Date(op.date).toLocaleString() : ''}</div>
                                                </div>
                                                {op.durationSeconds != null && (
                                                    <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white">
                                                        {(op.durationSeconds / 60).toFixed(0)} min
                                                    </span>
                                                )}
                                            </div>
                                            {op.products && op.products.length > 0 && (
                                                <div className="mt-2 border-t border-white/10 pt-2 text-sm text-white">
                                                    {op.products.map(p => (
                                                        <div key={p.id || `${p.productId}-${p.toolId}`} className="flex items-center justify-between">
                                                            <span>
                                                                <strong>{p.productName || t('operations.product', { defaultValue: 'Product' })}</strong>
                                                                {p.quantity != null && (
                                                                    <span className="text-slate-200/80"> {p.quantity}{p.unitValue ? ` ${p.unitValue}` : ''}</span>
                                                                )}
                                                            </span>
                                                            {p.toolName && (
                                                                <span className="rounded-full bg-indigo-500/20 px-2 py-1 text-[11px] font-semibold text-indigo-100">{p.toolName}</span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                );
            })()}
            {renamingId && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10001 }}>
                    <div style={{ background: "#fff", padding: "2rem", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.3)", minWidth: 400, display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                        <h2 style={{ margin: 0, color: '#222', fontSize: "1.5rem" }}>{t('map.renameModal.title')}</h2>
                        <input type="text" value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={async e => {
                            if (e.key === "Enter") {
                                if (!canEditPolygon(renamingId)) {
                                    setRenamingId(null);
                                    setRenamePeriodId("");
                                    return;
                                }
                                setPolygons(prev => prev.map(p => p.id === renamingId ? { ...p, name: renameValue, periodId: renamePeriodId ? Number(renamePeriodId) : null } : p));

                                // Send PUT request to backend to update the name
                                try {
                                    const payload = {
                                        name: renameValue,
                                        periodId: renamePeriodId ? Number(renamePeriodId) : null,
                                    };

                                    const response = await apiPut(`${parcelsEndpoint}/${renamingId}`, payload);
                                    if (response.ok) {
                                        console.log("Polygon name updated successfully on backend");
                                    } else {
                                        console.error("Failed to update parcel name:", response.statusText);
                                    }
                                } catch (err) {
                                    console.error("Failed to update parcel name:", err);
                                }

                                setRenamingId(null);
                                setRenamePeriodId("");
                            } else if (e.key === "Escape") {
                                setRenamingId(null);
                                setRenamePeriodId("");
                            }
                        }} placeholder={t('map.renameModal.placeholder')} style={{ padding: "0.75rem", fontSize: "1rem", borderRadius: 4, border: "1px solid #ccc", color: "#222" }} autoFocus />
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.95rem", color: "#333" }}>
                            {t('map.renameModal.periodLabel', { defaultValue: 'Period' })}
                            <select
                                value={renamePeriodId}
                                onChange={(e) => setRenamePeriodId(e.target.value)}
                                style={{ padding: "0.7rem", fontSize: "1rem", borderRadius: 4, border: "1px solid #ccc", color: "#222" }}
                            >
                                <option value="">{t('map.renameModal.periodPlaceholder', { defaultValue: 'No period' })}</option>
                                {periods.map(period => (
                                    <option key={period.id} value={String(period.id)}>
                                        {period.name || `${period.startDate || ''} - ${period.endDate || ''}`}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
                            <button onClick={() => { setRenamingId(null); setRenamePeriodId(""); }} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: 500, color: "#333" }}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                            <button onClick={async () => {
                                if (!canEditPolygon(renamingId)) {
                                    setRenamingId(null);
                                    setRenamePeriodId("");
                                    return;
                                }
                                setPolygons(prev => prev.map(p => p.id === renamingId ? { ...p, name: renameValue, periodId: renamePeriodId ? Number(renamePeriodId) : null } : p));

                                // Send PUT request to backend to update the name
                                try {
                                    const payload = {
                                        name: renameValue,
                                        periodId: renamePeriodId ? Number(renamePeriodId) : null,
                                    };

                                    const response = await apiPut(`${parcelsEndpoint}/${renamingId}`, payload);
                                    if (response.ok) {
                                        console.log("Polygon name updated successfully on backend");
                                    } else {
                                        console.error("Failed to update parcel name:", response.statusText);
                                    }
                                } catch (err) {
                                    console.error("Failed to update parcel name:", err);
                                }

                                setRenamingId(null);
                                setRenamePeriodId("");
                            }} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "none", background: "#007bff", color: "#fff", cursor: "pointer", fontWeight: 500 }}>{t('common.confirm', { defaultValue: 'Confirm' })}</button>
                        </div>
                    </div>
                </div>
            )}

            {modal.open && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10001 }}>
                    <div style={{ background: "#fff", padding: "2rem", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.3)", minWidth: 400, display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                        <h2 style={{ margin: 0, color: '#222', fontSize: "1.5rem" }}>{t('map.areaModal.title')}</h2>
                        <input type="text" value={areaName} onChange={e => setAreaName(e.target.value)} onKeyDown={e => e.key === "Enter" && confirmCreate()} placeholder={t('map.areaModal.placeholder')} style={{ padding: "0.75rem", fontSize: "1rem", borderRadius: 4, border: "1px solid #ccc", color: "#222" }} autoFocus />
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.95rem", color: "#333" }}>
                            {t('map.areaModal.periodLabel', { defaultValue: 'Period' })}
                            <select
                                value={selectedPeriodId}
                                onChange={(e) => setSelectedPeriodId(e.target.value)}
                                style={{ padding: "0.7rem", fontSize: "1rem", borderRadius: 4, border: "1px solid #ccc", color: "#222" }}
                            >
                                <option value="">{t('map.areaModal.periodPlaceholder', { defaultValue: 'No period' })}</option>
                                {periods.map(period => (
                                    <option key={period.id} value={String(period.id)}>
                                        {period.name || `${period.startDate || ''} - ${period.endDate || ''}`}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
                            <button onClick={cancelModal} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: 500, color: "#333" }}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                            <button onClick={confirmCreate} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "none", background: "#007bff", color: "#fff", cursor: "pointer", fontWeight: 500 }}>{t('common.confirm', { defaultValue: 'Confirm' })}</button>
                        </div>
                    </div>
                </div>
            )}
            <div style={{ flex: 1, position: 'relative', minHeight: 0, height: '100%' }}>
                <div
                    style={{
                        position: 'absolute',
                        top: '1.5rem',
                        left: '1.5rem',
                        zIndex: 1000,
                        pointerEvents: 'none',
                        display: 'flex',
                        justifyContent: 'flex-start',
                        width: '100%',
                        gap: '1rem',
                    }}
                >
                    <div
                        style={{
                            width: isListCollapsed ? 'auto' : '320px',
                            pointerEvents: 'auto',
                            transition: 'width 0.25s ease',
                        }}
                        data-tour-id="map-polygon-list"
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.75rem',
                                background: 'rgba(15, 23, 42, 0.9)',
                                color: '#fff',
                                borderRadius: isListCollapsed ? '999px' : '1.25rem',
                                padding: isListCollapsed ? '0.45rem' : '0.6rem 0.6rem 0.6rem 1.1rem',
                                boxShadow: '0 18px 35px rgba(15,23,42,0.35)',
                                backdropFilter: 'blur(6px)',
                            }}
                            ref={listBarRef}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    overflow: 'hidden',
                                    opacity: isListCollapsed ? 0 : 1,
                                    maxWidth: isListCollapsed ? 0 : '100%',
                                    transition: 'opacity 0.2s ease, max-width 0.2s ease',
                                }}
                            >
                                <span style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                                    {t('map.polygonList.title', { defaultValue: 'Polygons' })}
                                </span>
                                <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.15)', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                                    {filteredPolygons.length}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsListCollapsed(!isListCollapsed)}
                                aria-label={t('map.polygonList.toggle', { defaultValue: 'Toggle polygon list' })}
                                style={{
                                    border: 'none',
                                    borderRadius: '999px',
                                    background: '#fff',
                                    color: '#0f172a',
                                    width: '2.5rem',
                                    height: '2.5rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    boxShadow: '0 10px 30px rgba(15,23,42,0.25)',
                                    transition: 'transform 0.2s ease',
                                }}
                                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                {isListCollapsed ? (
                                    <ChevronRightIcon width={20} height={20} />
                                ) : (
                                    <ChevronLeftIcon width={20} height={20} />
                                )}
                            </button>
                        </div>
                        {!isListCollapsed && (
                            <div
                                style={{
                                    marginTop: '0.75rem',
                                    background: 'rgba(255,255,255,0.95)',
                                    borderRadius: '1.5rem',
                                    padding: '1.25rem',
                                    boxShadow: '0 30px 60px rgba(15,23,42,0.25)',
                                    maxHeight: '65vh',
                                    overflowY: 'auto',
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="search"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder={t('map.polygonList.searchPlaceholder', { defaultValue: 'Search polygons' })}
                                            style={{
                                                width: '100%',
                                                borderRadius: '999px',
                                                border: '1px solid rgba(15,23,42,0.15)',
                                                padding: '0.65rem 3rem 0.65rem 1rem',
                                                fontSize: '0.9rem',
                                                outline: 'none',
                                                boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.08)',
                                                color: '#0f172a',
                                            }}
                                        />
                                        {searchQuery && (
                                            <button
                                                type="button"
                                                onClick={() => setSearchQuery('')}
                                                aria-label={t('map.polygonList.clearSearch', { defaultValue: 'Clear search' })}
                                                style={{
                                                    position: 'absolute',
                                                    right: '0.6rem',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    border: 'none',
                                                    background: 'transparent',
                                                    color: '#94a3b8',
                                                    cursor: 'pointer',
                                                    fontSize: '1.1rem',
                                                    lineHeight: 1,
                                                }}
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowFilterMenu(prev => !prev)}
                                            aria-expanded={showFilterMenu}
                                            style={{
                                                border: 'none',
                                                borderRadius: '999px',
                                                padding: '0.35rem 0.85rem',
                                                fontSize: '0.85rem',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                background: 'rgba(15,23,42,0.08)',
                                                color: '#0f172a',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            {t('map.polygonList.filters.label', { defaultValue: 'Filters' })}:
                                            <span style={{ fontWeight: 600 }}>{activeFilterLabel}</span>
                                            <span aria-hidden>▾</span>
                                        </button>
                                        {showFilterMenu && (
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    top: '120%',
                                                    left: 0,
                                                    zIndex: 20,
                                                    minWidth: '180px',
                                                    borderRadius: '0.75rem',
                                                    border: '1px solid rgba(15,23,42,0.12)',
                                                    background: '#fff',
                                                    boxShadow: '0 12px 30px rgba(15,23,42,0.15)',
                                                    padding: '0.35rem',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '0.15rem',
                                                }}
                                            >
                                                {filterOptions.map(option => (
                                                    <button
                                                        key={option.key}
                                                        type="button"
                                                        onClick={() => {
                                                            if (option.key === 'all') {
                                                                setListFilter([]);
                                                                setShowFilterMenu(false);
                                                                return;
                                                            }
                                                            setListFilter(prev => {
                                                                const exists = prev.includes(option.key as 'visible' | 'hidden' | 'approved' | 'unapproved' | 'onscreen');
                                                                if (exists) {
                                                                    return prev.filter(item => item !== option.key);
                                                                }
                                                                return [...prev, option.key as 'visible' | 'hidden' | 'approved' | 'unapproved' | 'onscreen'];
                                                            });
                                                        }}
                                                        style={{
                                                            border: 'none',
                                                            borderRadius: '0.6rem',
                                                            padding: '0.45rem 0.6rem',
                                                            fontSize: '0.85rem',
                                                            fontWeight: 500,
                                                            cursor: 'pointer',
                                                            textAlign: 'left',
                                                            background: option.key === 'all'
                                                                ? (listFilter.length === 0 ? 'rgba(15,23,42,0.08)' : 'transparent')
                                                                : (listFilter.includes(option.key as 'visible' | 'hidden' | 'approved' | 'unapproved' | 'onscreen') ? 'rgba(15,23,42,0.08)' : 'transparent'),
                                                            color: '#0f172a',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                        }}
                                                    >
                                                        <span>{option.label}</span>
                                                        {(option.key === 'all' && listFilter.length === 0) && <span aria-hidden>✓</span>}
                                                        {option.key !== 'all' && listFilter.includes(option.key as 'visible' | 'hidden' | 'approved' | 'unapproved' | 'onscreen') && <span aria-hidden>✓</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {props.onApproveAll && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                                        <button
                                            type="button"
                                            onClick={handleApproveAll}
                                            disabled={isApproving}
                                            style={{
                                                border: 'none',
                                                borderRadius: '1rem',
                                                padding: '0.75rem 1rem',
                                                fontWeight: 600,
                                                fontSize: '0.95rem',
                                                cursor: isApproving ? 'not-allowed' : 'pointer',
                                                background: isApproving ? 'rgba(15,23,42,0.2)' : '#0f172a',
                                                color: '#fff',
                                                boxShadow: '0 20px 40px rgba(15,23,42,0.25)',
                                                transition: 'background 0.2s ease, transform 0.2s ease',
                                            }}
                                        >
                                            {props.approveLabel || t('imports.map.approveButton', { defaultValue: 'Approve import list' })}
                                        </button>
                                        {approveFeedback && (
                                            <span style={{ fontSize: '0.85rem', color: approveFeedback.type === 'success' ? '#15803d' : '#dc2626' }}>
                                                {approveFeedback.message}
                                            </span>
                                        )}
                                    </div>
                                )}
                                <PolygonList
                                    polygons={filteredPolygons}
                                    onToggle={togglePolygonVisibility}
                                    onRename={renamePolygonInline}
                                    onFocus={focusPolygon}
                                    onApproveSingle={isImportMode ? approveSingleParcel : undefined}
                                    showStatus={isImportMode}
                                    emptyLabel={allPolygons.length ? t('map.polygonList.emptyFiltered', { defaultValue: 'No polygons match this filter' }) : undefined}
                                />
                            </div>
                        )}
                    </div>
                </div>
                <div data-tour-id="map-canvas" style={{ height: '100%', width: '100%', minHeight: 0 }}>
                    <MapContainer
                        style={{ height: "100%", width: "100%" }}
                        center={center}
                        zoom={15}
                        maxZoom={19}
                        zoomControl={false}
                    >
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxNativeZoom={20} attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>' />
                        <ZoomControl position="bottomright" />
                        <MapEvents />
                        <style>{`
                        .leaflet-control-container .leaflet-draw, .leaflet-draw-toolbar { display: none !important; }
                        
                        /* Smooth transitions for polygon animations */
                        .leaflet-interactive {
                            transition: filter 0.5s ease-out !important;
                        }
                        
                        .polygon-tooltip {
                            background: transparent !important;
                            border: none !important;
                            box-shadow: none !important;
                            padding: 0 !important;
                        }
                        .polygon-tooltip::before {
                            display: none !important;
                        }
                        .leaflet-tooltip-pane .leaflet-tooltip {
                            background: transparent !important;
                            border: none !important;
                            box-shadow: none !important;
                        }

                        @keyframes polygonDash {
                            to { stroke-dashoffset: -60; }
                        }

                        @keyframes polygonGlow {
                            0% { filter: drop-shadow(0 0 2px currentColor); }
                            50% { filter: drop-shadow(0 0 8px currentColor); }
                            100% { filter: drop-shadow(0 0 2px currentColor); }
                        }

                        .leaflet-overlay-pane .polygon-glow {
                            stroke-dasharray: 10 5;
                            animation: polygonDash 1.2s linear infinite, polygonGlow 2.4s ease-in-out infinite;
                        }
                    `}</style>

                        <FeatureGroup ref={featureGroupRef}>
                            <EditControl ref={editControlRef} position="topright" draw={{ rectangle: false, polyline: false, circle: false, marker: false, circlemarker: false, polygon: true }} onCreated={handleCreated} />

                            {polygons
                                .filter(p => p.visible)
                                .filter(poly => !(showPreview && overlapWarning?.polygonId === poly.id))
                                .map(poly => {
                                    const isThisEditing = editingId === poly.id;
                                    const isSelected = selectedId === poly.id;
                                    const polyColor = poly.color || '#3388ff';
                                    const showPermanentTooltip = isSelected;
                                    const polygonKey = isThisEditing
                                        ? `${poly.id}-editing-${poly.version}`
                                        : `${poly.id}-${isSelected ? 'selected' : 'normal'}`;

                                    return (
                                        <Polygon
                                            key={polygonKey}
                                            positions={poly.coords}
                                            interactive={!isThisEditing && !editingId}
                                            pathOptions={{
                                                color: polyColor,
                                                opacity: isThisEditing ? 0.9 : (isSelected ? 1 : 0.8),
                                                fillOpacity: isSelected ? 0.35 : 0.2,
                                                dashArray: isThisEditing ? '8 6' : undefined,
                                                weight: isThisEditing ? 4 : (isSelected ? 3 : 2)
                                            }}
                                            eventHandlers={{
                                                add: e => {
                                                    const layer = e.target as L.Polygon;
                                                    (layer.options as any).customId = poly.id;
                                                    polygonLayersRef.current.set(poly.id, layer);
                                                },
                                                remove: e => {
                                                    const id = (e.target as any)?.options?.customId;
                                                    if (id) polygonLayersRef.current.delete(id as string);
                                                },
                                                click: e => {
                                                    L.DomEvent.stopPropagation(e as any);
                                                    if (!editingId && !isCreating && selectedId !== poly.id) {
                                                        setSelectedId(poly.id);
                                                    }
                                                },
                                                contextmenu: e => {
                                                    L.DomEvent.stopPropagation(e as any);
                                                    if (!editingId) {
                                                        e.originalEvent.preventDefault();
                                                        const { x, y } = clampToViewport(e.originalEvent.clientX, e.originalEvent.clientY, 260, 260);
                                                        setPolygonContextMenu({
                                                            x,
                                                            y,
                                                            polygonId: poly.id
                                                        });
                                                        setSelectedId(poly.id);
                                                    }
                                                }
                                            }}
                                        >
                                            <Tooltip
                                                direction="center"
                                                offset={[0, 0]}
                                                opacity={1}
                                                permanent={showPermanentTooltip}
                                                className="polygon-tooltip"
                                            >
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '3px 8px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: '600',
                                                        color: '#fff',
                                                        background: polyColor,
                                                        borderRadius: '4px',
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.5px'
                                                    }}>
                                                        {poly.name}
                                                    </span>
                                                    {isImportMode && poly.validationStatus && (
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '2px 6px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 600,
                                                            color: '#0f172a',
                                                            background: 'rgba(255,255,255,0.85)',
                                                            borderRadius: '999px',
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                                        }}>
                                                            {poly.validationStatus}
                                                        </span>
                                                    )}
                                                </div>
                                            </Tooltip>
                                        </Polygon>
                                    );
                                })}

                            {/* Preview polygons for overlap fix */}
                            {overlapWarning && showPreview && (
                                <>
                                    {previewVisibility.original && (
                                        <Polygon
                                            positions={overlapWarning.originalCoords}
                                            pathOptions={{
                                                color: '#ff5252',
                                                opacity: 0.7,
                                                fillOpacity: 0.15,
                                                dashArray: '10 5',
                                                weight: 3
                                            }}
                                        />
                                    )}
                                    {previewVisibility.fixed && overlapWarning.fixedCoords && (
                                        <Polygon
                                            positions={overlapWarning.fixedCoords}
                                            pathOptions={{
                                                color: '#4caf50',
                                                opacity: 0.9,
                                                fillOpacity: 0.3,
                                                weight: 3
                                            }}
                                        />
                                    )}
                                </>
                            )}
                        </FeatureGroup>
                    </MapContainer>
                </div>

                <div data-tour-id="map-toolbar" className="pointer-events-auto absolute top-4 right-4 z-[2000] flex flex-wrap justify-end gap-2">
                    {!isImportMode && (
                        <button
                            type="button"
                            onClick={() => setIsSearchOpen(prev => !prev)}
                            title={t('map.searchFilters.title')}
                            className={`${toolbarButtonBase} border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50`}
                        >
                            <FunnelIcon className="h-4 w-4" />
                            <span className="hidden sm:inline">{t('map.searchFilters.button')}</span>
                            {hasActiveSearchFilters && (
                                <span className="ml-1 h-2 w-2 rounded-full bg-emerald-500" />
                            )}
                        </button>
                    )}
                    {overlapWarning && showPreview ? (
                        <>
                            <button
                                type="button"
                                onClick={() => setShowPreview(false)}
                                title={t('map.preview.back')}
                                className={`${toolbarButtonBase} border-indigo-500 bg-indigo-600 text-white hover:-translate-y-0.5 hover:bg-indigo-500`}
                            >
                                <span className="text-base">👁️</span>
                                {t('map.preview.back')}
                            </button>
                            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-900/80 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100 shadow-2xl shadow-slate-900/30 backdrop-blur">
                                <button
                                    type="button"
                                    onClick={() => setPreviewVisibility(prev => ({ ...prev, original: !prev.original }))}
                                    disabled={!overlapWarning.originalCoords?.length}
                                    className={`rounded-2xl px-3 py-1 transition ${previewVisibility.original ? 'bg-rose-500 text-white' : 'text-slate-100 hover:text-white'} ${overlapWarning.originalCoords?.length ? '' : 'cursor-not-allowed opacity-40'}`}
                                >
                                    {t('map.preview.original')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewVisibility(prev => ({ ...prev, fixed: !prev.fixed }))}
                                    disabled={!overlapWarning.fixedCoords?.length}
                                    className={`rounded-2xl px-3 py-1 transition ${previewVisibility.fixed ? 'bg-emerald-500 text-white' : 'text-slate-100 hover:text-white'} ${overlapWarning.fixedCoords?.length ? '' : 'cursor-not-allowed opacity-40'}`}
                                >
                                    {t('map.preview.fixed')}
                                </button>
                            </div>
                        </>
                    ) : (allowCreate && !editingId && !isCreating && (
                        <button
                            type="button"
                            onClick={startCreate}
                            title={t('map.toolbar.addTitle')}
                            className={`${toolbarButtonBase} border-indigo-500 bg-indigo-600 text-lg text-white hover:-translate-y-0.5 hover:bg-indigo-500`}
                        >
                            +
                        </button>
                    ))}
                    {allowCreate && isCreating && (
                        <>
                            <button
                                type="button"
                                onClick={finishCreate}
                                title={t('map.toolbar.finishDrawing')}
                                disabled={createPointCount < 3}
                                className={`${toolbarButtonBase} border-emerald-500 bg-emerald-500 text-white ${createPointCount < 3 ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5 hover:bg-emerald-400'}`}
                            >
                                ✓
                            </button>
                            <button
                                type="button"
                                onClick={cancelCreate}
                                title={t('map.toolbar.cancelDrawing')}
                                className={`${toolbarButtonBase} border-rose-500 bg-rose-500 text-white hover:-translate-y-0.5 hover:bg-rose-400`}
                            >
                                ✕
                            </button>
                            <button
                                type="button"
                                onClick={() => createHandlerRef.current?.deleteLastVertex?.()}
                                title={t('map.toolbar.removeLastPoint')}
                                className={`${toolbarButtonBase} border-slate-300 bg-white text-slate-600 hover:-translate-y-0.5 hover:bg-slate-50`}
                            >
                                -
                            </button>
                        </>
                    )}
                    {editingId && (
                        <>
                            <button
                                type="button"
                                onClick={finishEdit}
                                title={t('map.toolbar.saveEdit')}
                                className={`${toolbarButtonBase} border-emerald-500 bg-emerald-500 text-white hover:-translate-y-0.5 hover:bg-emerald-400`}
                            >
                                ✓
                            </button>
                            <button
                                type="button"
                                onClick={cancelEdit}
                                title={t('map.toolbar.cancelEdit')}
                                className={`${toolbarButtonBase} border-rose-500 bg-rose-500 text-white hover:-translate-y-0.5 hover:bg-rose-400`}
                            >
                                ✕
                            </button>
                        </>
                    )}
                </div>

                {!isImportMode && isSearchOpen && (
                    <div className="pointer-events-auto absolute top-16 right-4 z-[2100] w-[22rem] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-900">{t('map.searchFilters.title')}</h3>
                            <button
                                type="button"
                                onClick={() => setIsSearchOpen(false)}
                                className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                aria-label={t('map.searchFilters.close')}
                            >
                                <XMarkIcon className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <MultiSelectCombobox
                                label={t('map.searchFilters.periodLabel')}
                                options={periodFilterOptions}
                                selectedValues={searchDraft.periodIds}
                                onChange={(next) => setSearchDraft(prev => ({ ...prev, periodIds: next }))}
                                placeholder={t('map.searchFilters.anyPeriod')}
                                disabled={isPreciseDateRangeSelected}
                            />
                            {isPreciseDateRangeSelected && (
                                <p className="-mt-1 text-xs text-slate-400">
                                    {t('map.searchFilters.periodDisabledByDateRange', { defaultValue: 'Period filter is disabled while a precise date range is selected.' })}
                                </p>
                            )}

                            <MultiSelectCombobox
                                label={t('map.searchFilters.toolLabel')}
                                options={toolFilterOptions}
                                selectedValues={searchDraft.toolIds}
                                onChange={(next) => setSearchDraft(prev => ({ ...prev, toolIds: next }))}
                                placeholder={t('map.searchFilters.anyTool')}
                            />

                            <MultiSelectCombobox
                                label={t('map.searchFilters.productLabel')}
                                options={productFilterOptions}
                                selectedValues={searchDraft.productIds}
                                onChange={(next) => setSearchDraft(prev => ({ ...prev, productIds: next }))}
                                placeholder={t('map.searchFilters.anyProduct')}
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {t('map.searchFilters.startDate')}
                                    <input
                                        type="date"
                                        value={searchDraft.startDate}
                                        onChange={(event) => setSearchDraft(prev => ({ ...prev, startDate: event.target.value }))}
                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
                                    />
                                </label>
                                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {t('map.searchFilters.endDate')}
                                    <input
                                        type="date"
                                        value={searchDraft.endDate}
                                        onChange={(event) => setSearchDraft(prev => ({ ...prev, endDate: event.target.value }))}
                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
                                    />
                                </label>
                            </div>

                            <label className="flex items-start gap-2 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={searchDraft.useMapArea}
                                    onChange={(event) => setSearchDraft(prev => ({ ...prev, useMapArea: event.target.checked }))}
                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                                />
                                <span>
                                    {t('map.searchFilters.mapAreaLabel')}
                                    <span className="mt-1 block text-xs text-slate-500">{t('map.searchFilters.mapAreaHint')}</span>
                                </span>
                            </label>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('map.searchFilters.polygonLabel')}</p>
                                        <p className="text-xs text-slate-500">
                                            {searchAreaCoords.length ? t('map.searchFilters.polygonReady') : t('map.searchFilters.polygonEmpty')}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={searchAreaCoords.length ? clearSearchPolygon : startSearchPolygon}
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                                    >
                                        {searchAreaCoords.length ? t('map.searchFilters.clearPolygon') : t('map.searchFilters.drawPolygon')}
                                    </button>
                                </div>
                                {isSearchDrawing && (
                                    <div className="mt-2 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                        <span>{t('map.searchFilters.drawingHint')}</span>
                                        <button
                                            type="button"
                                            onClick={cancelSearchPolygon}
                                            className="font-semibold text-amber-800 hover:underline"
                                        >
                                            {t('map.searchFilters.cancelDraw')}
                                        </button>
                                    </div>
                                )}
                                <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={searchDraft.usePolygon}
                                        onChange={(event) => setSearchDraft(prev => ({ ...prev, usePolygon: event.target.checked }))}
                                        disabled={!searchAreaCoords.length}
                                        className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400 disabled:opacity-50"
                                    />
                                    <span>
                                        {t('map.searchFilters.usePolygon')}
                                        <span className="mt-1 block text-xs text-slate-500">{t('map.searchFilters.usePolygonHint')}</span>
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-2">
                            <button
                                type="button"
                                onClick={clearSearchFilters}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                            >
                                {t('map.searchFilters.clear')}
                            </button>
                            <div className="flex items-center gap-2">
                                {selectedFarm?.canManage && (
                                    <button
                                        type="button"
                                        onClick={handleQuickShareCurrentFilter}
                                        className="rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 shadow-sm hover:bg-cyan-100"
                                    >
                                        Share Filter
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={applySearchFilters}
                                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500"
                                >
                                    {t('map.searchFilters.apply')}
                                </button>
                            </div>
                        </div>

                        {quickShareFeedback && (
                            <div className="mt-2 rounded-lg border border-cyan-300/70 bg-cyan-50 px-3 py-2 text-xs text-cyan-800 break-all">
                                {quickShareFeedback}
                            </div>
                        )}

                    </div>
                )}
                {filterShareModalOpen && typeof document !== 'undefined' && createPortal((
                    <div className="pointer-events-auto fixed inset-0 z-[6500] flex items-center justify-center bg-slate-950/60 px-4">
                        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl shadow-black/40">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-white">Share Current Filter</h3>
                                    <p className="text-sm text-slate-300">
                                        Define permissions, user limits, and optional time window before generating the share.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFilterShareModalOpen(false);
                                        setFilterShareZoneWkt(null);
                                    }}
                                    className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                                    aria-label="Close"
                                >
                                    <XMarkIcon className="h-5 w-5" />
                                </button>
                            </div>

                            <form className="mt-4 grid gap-2" onSubmit={handleCreateFilterResearchShare}>
                                <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-slate-950/40 p-1">
                                    <button
                                        type="button"
                                        onClick={() => setResearchShareMode('direct')}
                                        className={`rounded-md px-3 py-2 text-xs font-semibold transition ${researchShareMode === 'direct' ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-white/5'}`}
                                    >
                                        Share directly to user(s)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setResearchShareMode('link')}
                                        className={`rounded-md px-3 py-2 text-xs font-semibold transition ${researchShareMode === 'link' ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-white/5'}`}
                                    >
                                        Create link with user limit
                                    </button>
                                </div>

                                {researchShareMode === 'direct' ? (
                                    <label className="text-xs text-slate-300">
                                        Usernames (comma or new line separated)
                                        <textarea
                                            value={researchShareUsername}
                                            onChange={(event) => setResearchShareUsername(event.target.value)}
                                            rows={3}
                                            placeholder="alice, bob"
                                            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                        />
                                    </label>
                                ) : (
                                    <label className="text-xs text-slate-300">
                                        Maximum number of users for this link
                                        <input
                                            type="number"
                                            min="1"
                                            value={researchShareMaxUsers}
                                            onChange={(event) => setResearchShareMaxUsers(event.target.value)}
                                            placeholder="Unlimited"
                                            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                        />
                                    </label>
                                )}

                                <div className="grid gap-2 sm:grid-cols-3">
                                    <MultiSelectCombobox
                                        label="Periods"
                                        options={periodFilterOptions}
                                        selectedValues={researchSharePeriodIds}
                                        onChange={setResearchSharePeriodIds}
                                        placeholder="Any period"
                                    />
                                    <MultiSelectCombobox
                                        label="Tools"
                                        options={toolFilterOptions}
                                        selectedValues={researchShareToolIds}
                                        onChange={setResearchShareToolIds}
                                        placeholder="Any tool"
                                    />
                                    <MultiSelectCombobox
                                        label="Products"
                                        options={productFilterOptions}
                                        selectedValues={researchShareProductIds}
                                        onChange={setResearchShareProductIds}
                                        placeholder="Any product"
                                    />
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2">
                                    <label className="text-xs text-slate-300">
                                        Filter start date
                                        <input
                                            type="date"
                                            value={researchShareFilterStartDate}
                                            onChange={(event) => setResearchShareFilterStartDate(event.target.value)}
                                            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="text-xs text-slate-300">
                                        Filter end date
                                        <input
                                            type="date"
                                            value={researchShareFilterEndDate}
                                            onChange={(event) => setResearchShareFilterEndDate(event.target.value)}
                                            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                                        />
                                    </label>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2">
                                    <label className="text-xs text-slate-300">
                                        Share starts at
                                        <input
                                            type="datetime-local"
                                            value={researchShareStartAt}
                                            onChange={(event) => setResearchShareStartAt(event.target.value)}
                                            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="text-xs text-slate-300">
                                        Share ends at
                                        <input
                                            type="datetime-local"
                                            value={researchShareEndAt}
                                            onChange={(event) => setResearchShareEndAt(event.target.value)}
                                            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                                        />
                                    </label>
                                </div>

                                <div className="mt-1 flex items-center justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFilterShareModalOpen(false);
                                            setFilterShareZoneWkt(null);
                                        }}
                                        className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={researchShareLoading}
                                        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {researchShareLoading ? 'Creating...' : (researchShareMode === 'direct' ? 'Create Direct Share' : 'Create Limited Link')}
                                    </button>
                                </div>
                            </form>

                            {researchShareFeedback && (
                                <div className="mt-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100 break-all">
                                    {researchShareFeedback}
                                </div>
                            )}

                            {quickShareLink && (
                                <div className="mt-2 flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
                                    <p className="flex-1 text-xs text-indigo-100 break-all">{quickShareLink}</p>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const copied = await copyToClipboard(quickShareLink);
                                            setResearchShareFeedback(copied ? 'Link copied to clipboard.' : 'Unable to copy the link.');
                                        }}
                                        className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-2 py-1 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/20"
                                    >
                                        Copy
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ), document.body)}
                {shareParcelId && typeof document !== 'undefined' && createPortal((
                    <div className="pointer-events-auto fixed inset-0 z-[6500] flex items-center justify-center bg-slate-950/60 px-4">
                        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl shadow-black/40">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-white">{t('map.sharing.title')}</h3>
                                    <p className="text-sm text-slate-300">
                                        {t('map.sharing.subtitle', { name: allPolygons.find(p => p.id === shareParcelId)?.name || t('map.unnamedParcel') })}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeShareModal}
                                    className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                                    aria-label={t('map.sharing.close')}
                                >
                                    <XMarkIcon className="h-5 w-5" />
                                </button>
                            </div>

                            {shareError && (
                                <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                                    {shareError}
                                </div>
                            )}

                            <form className="mt-4 grid gap-3 sm:grid-cols-[1.5fr_1fr_auto]" onSubmit={handleAddShare}>
                                <input
                                    type="text"
                                    value={shareUsername}
                                    onChange={(event) => setShareUsername(event.target.value)}
                                    placeholder={t('map.sharing.usernamePlaceholder')}
                                    className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                />
                                <select
                                    value={shareRole}
                                    onChange={(event) => setShareRole(event.target.value)}
                                    className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                                >
                                    <option value="EDITOR">{t('map.sharing.roles.editor')}</option>
                                    <option value="VIEWER">{t('map.sharing.roles.viewer')}</option>
                                </select>
                                <button
                                    type="submit"
                                    className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400"
                                >
                                    {t('map.sharing.add')}
                                </button>
                            </form>

                            <div className="mt-4 space-y-2">
                                {shareLoading && (
                                    <p className="text-sm text-slate-400">{t('map.sharing.loading')}</p>
                                )}
                                {!shareLoading && shareList.length === 0 && (
                                    <p className="text-sm text-slate-400">{t('map.sharing.empty')}</p>
                                )}
                                {shareList.map(share => (
                                    <div key={share.userId} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2">
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-white">{share.username}</p>
                                        </div>
                                        <select
                                            value={share.role}
                                            onChange={(event) => handleUpdateShare(share.userId, event.target.value)}
                                            className="rounded-lg border border-white/15 bg-slate-900/70 px-3 py-1.5 text-xs text-white focus:border-indigo-400 focus:outline-none"
                                        >
                                            <option value="EDITOR">{t('map.sharing.roles.editor')}</option>
                                            <option value="VIEWER">{t('map.sharing.roles.viewer')}</option>
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveShare(share.userId)}
                                            className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
                                        >
                                            {t('map.sharing.remove')}
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-6 border-t border-white/10 pt-4">
                                <h4 className="text-sm font-semibold text-slate-100">Researchable Zone Sharing Rules</h4>
                                <p className="mt-1 text-xs text-slate-400">
                                    Create a link or assign a user to research this polygon with optional period, tool, product, and date limits.
                                </p>

                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={applyCurrentFiltersToShareRules}
                                        className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20"
                                    >
                                        Use Current Filter Settings
                                    </button>
                                    {researchShareLastLink && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const copied = await copyToClipboard(researchShareLastLink);
                                                setResearchShareFeedback(copied ? 'Link copied to clipboard.' : 'Could not copy the link automatically.');
                                            }}
                                            className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/20"
                                        >
                                            Copy Last Link
                                        </button>
                                    )}
                                </div>

                                <form className="mt-3 grid gap-2" onSubmit={handleCreateResearchShare}>
                                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-slate-950/40 p-1">
                                        <button
                                            type="button"
                                            onClick={() => setResearchShareMode('direct')}
                                            className={`rounded-md px-3 py-2 text-xs font-semibold transition ${researchShareMode === 'direct' ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-white/5'}`}
                                        >
                                            Share directly to user(s)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setResearchShareMode('link')}
                                            className={`rounded-md px-3 py-2 text-xs font-semibold transition ${researchShareMode === 'link' ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-white/5'}`}
                                        >
                                            Create link with user limit
                                        </button>
                                    </div>

                                    {researchShareMode === 'direct' ? (
                                        <label className="text-xs text-slate-300">
                                            Usernames (comma or new line separated)
                                            <textarea
                                                value={researchShareUsername}
                                                onChange={(event) => setResearchShareUsername(event.target.value)}
                                                rows={3}
                                                placeholder="alice, bob"
                                                className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                            />
                                        </label>
                                    ) : (
                                        <label className="text-xs text-slate-300">
                                            Maximum number of users for this link
                                            <input
                                                type="number"
                                                min="1"
                                                value={researchShareMaxUsers}
                                                onChange={(event) => setResearchShareMaxUsers(event.target.value)}
                                                placeholder="Unlimited"
                                                className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                            />
                                        </label>
                                    )}

                                    <div className="grid gap-2 sm:grid-cols-3">
                                        <MultiSelectCombobox
                                            label="Periods"
                                            options={periodFilterOptions}
                                            selectedValues={researchSharePeriodIds}
                                            onChange={setResearchSharePeriodIds}
                                            placeholder="Any period"
                                        />
                                        <MultiSelectCombobox
                                            label="Tools"
                                            options={toolFilterOptions}
                                            selectedValues={researchShareToolIds}
                                            onChange={setResearchShareToolIds}
                                            placeholder="Any tool"
                                        />
                                        <MultiSelectCombobox
                                            label="Products"
                                            options={productFilterOptions}
                                            selectedValues={researchShareProductIds}
                                            onChange={setResearchShareProductIds}
                                            placeholder="Any product"
                                        />
                                    </div>

                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <label className="text-xs text-slate-300">
                                            Filter start date
                                            <input
                                                type="date"
                                                value={researchShareFilterStartDate}
                                                onChange={(event) => setResearchShareFilterStartDate(event.target.value)}
                                                className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                                            />
                                        </label>
                                        <label className="text-xs text-slate-300">
                                            Filter end date
                                            <input
                                                type="date"
                                                value={researchShareFilterEndDate}
                                                onChange={(event) => setResearchShareFilterEndDate(event.target.value)}
                                                className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                                            />
                                        </label>
                                    </div>

                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <label className="text-xs text-slate-300">
                                            Share starts at
                                            <input
                                                type="datetime-local"
                                                value={researchShareStartAt}
                                                onChange={(event) => setResearchShareStartAt(event.target.value)}
                                                className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                                            />
                                        </label>
                                        <label className="text-xs text-slate-300">
                                            Share ends at
                                            <input
                                                type="datetime-local"
                                                value={researchShareEndAt}
                                                onChange={(event) => setResearchShareEndAt(event.target.value)}
                                                className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                                            />
                                        </label>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={researchShareLoading}
                                        className="mt-1 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {researchShareLoading ? 'Creating...' : (researchShareMode === 'direct' ? 'Create Direct Share' : 'Create Limited Link')}
                                    </button>
                                </form>

                                {researchShareFeedback && (
                                    <div className="mt-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100 break-all">
                                        {researchShareFeedback}
                                    </div>
                                )}

                                {researchShareLastLink && (
                                    <div className="mt-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100 break-all">
                                        {researchShareLastLink}
                                    </div>
                                )}

                                <div className="mt-3 space-y-2 max-h-44 overflow-auto pr-1">
                                    {researchShares.map((share) => (
                                        <div key={share.id} className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-xs text-slate-200">
                                            <div className="flex items-center justify-between gap-2">
                                                <span>{share.username ? `User: ${share.username}` : 'Link-based share'}</span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            const link = buildResearchShareUrl(share.shareToken);
                                                            if (!link) return;
                                                            const copied = await copyToClipboard(link);
                                                            setResearchShareFeedback(copied ? 'Link copied to clipboard.' : `Copy this link: ${link}`);
                                                            setResearchShareLastLink(link);
                                                        }}
                                                        className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-2 py-1 font-semibold text-indigo-100 hover:bg-indigo-500/20"
                                                    >
                                                        Copy Link
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveResearchShare(share.id)}
                                                        className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-2 py-1 font-semibold text-rose-100 hover:bg-rose-500/20"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="mt-1 text-slate-400">Token: {share.shareToken.slice(0, 16)}...</p>
                                            <p className="mt-1 text-slate-400">
                                                {share.maxUsers != null
                                                    ? `Users: ${share.claimedUsers ?? 0} / ${share.maxUsers}`
                                                    : 'Users: unlimited'}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ), document.body)}
            </div>
        </div>
    );
}
