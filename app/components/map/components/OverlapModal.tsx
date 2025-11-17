import { useTranslation } from "react-i18next";
import type { OverlapWarning } from "../types";

interface OverlapModalProps {
    warning: OverlapWarning;
    areaName: string;
    onAreaNameChange: (value: string) => void;
    onCancel: () => void;
    onManualEdit: () => void;
    onEditOriginal: () => void;
    onIgnore: () => void;
    onAccept: () => void;
    onShowPreview: () => void;
}

export default function OverlapModal({
    warning,
    areaName,
    onAreaNameChange,
    onCancel,
    onManualEdit,
    onEditOriginal,
    onIgnore,
    onAccept,
    onShowPreview
}: OverlapModalProps) {
    const { t } = useTranslation();
    const overlapCount = warning.overlappingPolygons.length;
    const verticesCount = warning.fixedCoords?.length ?? 0;
    const areaPercentage = Math.round(
        ((warning.fixedCoords?.length ?? 0) / (warning.originalCoords?.length || 1)) * 100
    );

    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10001 }}>
            <div style={{ 
                background: "#fff", 
                padding: "2rem", 
                borderRadius: 8, 
                boxShadow: "0 4px 24px rgba(0,0,0,0.3)", 
                minWidth: 400, 
                maxWidth: 600, 
                display: "flex", 
                flexDirection: "column", 
                gap: "1.5rem"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ fontSize: "2rem" }}>⚠️</span>
                    <h2 style={{ margin: 0, color: '#d32f2f', fontSize: "1.5rem" }}>{t('map.overlap.title')}</h2>
                </div>

                {warning.isNewPolygon && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <label style={{ color: '#555', fontWeight: 500 }}>{t('map.overlap.polygonNameLabel')}</label>
                        <input 
                            type="text" 
                            value={areaName} 
                            onChange={e => onAreaNameChange(e.target.value)} 
                            placeholder={t('map.overlap.polygonNamePlaceholder')}
                            style={{ 
                                padding: "0.75rem", 
                                fontSize: "1rem", 
                                borderRadius: 4, 
                                border: "1px solid #ccc", 
                                color: "#222" 
                            }} 
                            autoFocus 
                        />
                    </div>
                )}
                
                <p style={{ margin: 0, color: '#555', lineHeight: 1.6 }}>
                    {t('map.overlap.description', { count: overlapCount })}
                </p>
                
                <ul style={{ margin: 0, paddingLeft: "1.5rem", color: '#333' }}>
                    {warning.overlappingPolygons.map(op => (
                        <li key={op.id} style={{ marginBottom: "0.5rem" }}>
                            <strong>{op.name}</strong>
                        </li>
                    ))}
                </ul>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div style={{ padding: '0.75rem', background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: 4, color: '#2e7d32', fontSize: '0.9rem' }}>
                        <strong>✓ {t('map.overlap.autoFixTitle')}</strong> {t('map.overlap.autoFixMessage', { vertices: verticesCount, percentage: areaPercentage })}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <button 
                            onClick={onShowPreview}
                            style={{ 
                                padding: "0.75rem 1rem", 
                                borderRadius: 4, 
                                border: "1px solid #007bff", 
                                background: "transparent", 
                                color: "#007bff",
                                cursor: "pointer",
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#e3f2fd'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <span>👁️‍🗨️</span>
                            {t('map.overlap.previewButton')}
                        </button>
                        {warning.isNewPolygon ? (
                            <button 
                                onClick={onManualEdit} 
                                style={{ 
                                    padding: "0.75rem 1rem", 
                                    borderRadius: 4, 
                                    border: "1px solid #2196f3", 
                                    background: "#fff", 
                                    cursor: "pointer",
                                    fontWeight: 500,
                                    color: "#2196f3",
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#e3f2fd'}
                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                            >
                                <span>🛠️</span>
                                {t('map.overlap.manualEdit')}
                            </button>
                        ) : (
                            <button 
                                onClick={onEditOriginal} 
                                style={{ 
                                    padding: "0.75rem 1rem", 
                                    borderRadius: 4, 
                                    border: "1px solid #2196f3", 
                                    background: "#fff", 
                                    cursor: "pointer",
                                    fontWeight: 500,
                                    color: "#2196f3",
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#e3f2fd'}
                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                            >
                                <span>✏️</span>
                                {t('map.overlap.continueEditing')}
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", paddingTop: "1rem", borderTop: "1px solid #eee", flexWrap: "wrap" }}>
                    <button 
                        onClick={onCancel} 
                        style={{ 
                            padding: "0.75rem 1.5rem", 
                            borderRadius: 4, 
                            border: "1px solid #ccc", 
                            background: "#fff", 
                            cursor: "pointer",
                            fontWeight: 500,
                            color: "#757575",
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                        <span>✕</span>
                        {t('common.cancel')}
                    </button>
                    
                    <button 
                        onClick={onIgnore} 
                        style={{ 
                            padding: "0.75rem 1.5rem", 
                            borderRadius: 4, 
                            border: "none", 
                            background: "#ff9800", 
                            color: "#fff", 
                            cursor: "pointer",
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fb8c00'}
                        onMouseLeave={e => e.currentTarget.style.background = '#ff9800'}
                    >
                        <span>⚠️</span>
                        {t('map.overlap.allowOverlap')}
                    </button>
                    
                    <button 
                        onClick={onAccept} 
                        style={{ 
                            padding: "0.75rem 1.5rem", 
                            borderRadius: 4, 
                            border: "none", 
                            background: "#4caf50", 
                            color: "#fff", 
                            cursor: "pointer",
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#43a047'}
                        onMouseLeave={e => e.currentTarget.style.background = '#4caf50'}
                    >
                        <span>✓</span>
                        {t('map.overlap.applyShrink')}
                    </button>
                </div>
            </div>
        </div>
    );
}
