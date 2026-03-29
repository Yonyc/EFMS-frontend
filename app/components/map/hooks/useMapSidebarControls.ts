import { useState, useMemo, useCallback } from "react";
import type { PolygonData } from "../types";
import { useTranslation } from "react-i18next";

interface UseMapSidebarControlsProps {
    polygons: PolygonData[];
    allPolygons: PolygonData[];
    isImportMode: boolean;
}

export function useMapSidebarControls({ polygons, allPolygons, isImportMode }: UseMapSidebarControlsProps) {
    const { t } = useTranslation();
    const [isListCollapsed, setIsListCollapsed] = useState(false);
    const [listFilter, setListFilter] = useState<Array<'visible' | 'hidden' | 'approved' | 'unapproved' | 'onscreen'>>([]);
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

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
        if (!listFilter.length) return t('map.polygonList.filters.all', { defaultValue: 'All' });
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

    return {
        isListCollapsed, setIsListCollapsed,
        listFilter, setListFilter,
        showFilterMenu, setShowFilterMenu,
        searchQuery, setSearchQuery,
        filterOptions, activeFilterLabel, filteredPolygons
    };
}
