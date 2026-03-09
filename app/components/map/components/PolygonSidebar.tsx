import { useTranslation } from "react-i18next";
import PolygonList from "../PolygonList";
import type { PolygonData } from "../types";

interface FilterOption {
    key: string;
    label: string;
    value: string;
}

interface PolygonSidebarProps {
    isListCollapsed: boolean;
    setIsListCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    filteredPolygons: PolygonData[];
    polygons: PolygonData[];
    searchQuery: string;
    setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
    showFilterMenu: boolean;
    setShowFilterMenu: React.Dispatch<React.SetStateAction<boolean>>;
    filterOptions: FilterOption[];
    listFilter: ('visible' | 'hidden' | 'approved' | 'unapproved')[];
    setListFilter: React.Dispatch<React.SetStateAction<('visible' | 'hidden' | 'approved' | 'unapproved')[]>>;
    activeFilterLabel: string;
    isImportMode: boolean;
    isApproving: boolean;
    approveFeedback: { type: 'success' | 'error'; message: string } | null;
    onApproveAll?: () => Promise<void>;
    approveLabel?: string;
    listBarRef: React.RefObject<HTMLDivElement | null>;
    togglePolygonVisibility: (id: string) => void;
    renamePolygonInline: (id: string, name: string) => void;
    focusPolygon: (coords: [number, number][]) => void;
    approveSingleParcel: (id: string) => void;
}

export function PolygonSidebar({
    isListCollapsed,
    setIsListCollapsed,
    filteredPolygons,
    polygons,
    searchQuery,
    setSearchQuery,
    showFilterMenu,
    setShowFilterMenu,
    filterOptions,
    listFilter,
    setListFilter,
    activeFilterLabel,
    isImportMode,
    isApproving,
    approveFeedback,
    onApproveAll,
    approveLabel,
    listBarRef,
    togglePolygonVisibility,
    renamePolygonInline,
    focusPolygon,
    approveSingleParcel,
}: PolygonSidebarProps) {
    const { t } = useTranslation();

    return (
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
                {/* Header bar */}
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
                        onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.96)')}
                        onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                    >
                        {isListCollapsed ? '›' : '‹'}
                    </button>
                </div>

                {/* Expanded content */}
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
                        {/* Search + filter row */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="search"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
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

                            {/* Filter dropdown */}
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
                                                        const k = option.key as 'visible' | 'hidden' | 'approved' | 'unapproved';
                                                        return prev.includes(k) ? prev.filter(i => i !== k) : [...prev, k];
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
                                                        : (listFilter.includes(option.key as 'visible' | 'hidden' | 'approved' | 'unapproved') ? 'rgba(15,23,42,0.08)' : 'transparent'),
                                                    color: '#0f172a',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                }}
                                            >
                                                <span>{option.label}</span>
                                                {option.key === 'all' && listFilter.length === 0 && <span aria-hidden>✓</span>}
                                                {option.key !== 'all' && listFilter.includes(option.key as 'visible' | 'hidden' | 'approved' | 'unapproved') && <span aria-hidden>✓</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Approve all button */}
                        {onApproveAll && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                                <button
                                    type="button"
                                    onClick={onApproveAll}
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
                                    {approveLabel || t('imports.map.approveButton', { defaultValue: 'Approve import list' })}
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
                            onFocus={id => {
                                const poly = polygons.find(p => p.id === id);
                                if (poly) focusPolygon(poly.coords);
                            }}
                            onApproveSingle={isImportMode ? approveSingleParcel : undefined}
                            showStatus={isImportMode}
                            emptyLabel={polygons.length ? t('map.polygonList.emptyFiltered', { defaultValue: 'No polygons match this filter' }) : undefined}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
