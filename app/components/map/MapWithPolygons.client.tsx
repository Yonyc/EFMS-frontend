import {
    MapContainer,
    TileLayer,
    Polygon,
    Marker,
    Popup,
    FeatureGroup,
    useMapEvents,
    Tooltip,
} from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { useEffect, useRef, useState, useCallback } from "react";
import PolygonList from "./PolygonList";

interface PolygonData {
    id: string;
    name: string;
    coords: [number, number][];
    visible: boolean;
    color?: string;
    version?: number;
}

interface EditState {
    layer: any;
    handler: any;
    tempGroup: any;
    listeners: { edit?: any; mousemove?: { map: any; listener: any } };
}

export default function MapWithPolygons() {
    const center: [number, number] = [50.668333, 4.621278];
    
    // State
    const [polygons, setPolygons] = useState<PolygonData[]>([]);
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
    const originalColorRef = useRef<string | null>(null);
    
    // Refs
    const featureGroupRef = useRef<L.FeatureGroup>(null);
    const editControlRef = useRef<any>(null);
    const createHandlerRef = useRef<any>(null);
    const createdLayerRef = useRef<any>(null);
    const createRafRef = useRef<number | null>(null);
    const editStateRef = useRef<EditState | null>(null);
    const originalCoordsRef = useRef<Record<string, [number, number][]>>({});

    const getMap = () => (featureGroupRef.current as any)?._map || (featureGroupRef.current as any)?.getMap?.();

    const extractCoords = (layer: any): [number, number][] => {
        const raw = layer?.getLatLngs?.();
        if (!raw) return [];
        const ring = Array.isArray(raw) ? (Array.isArray(raw[0]) ? raw[0] : raw) : [raw];
        return ring.map((ll: any) => [ll.lat, ll.lng]);
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
    }, [polygons, editingId, setupEditListeners]);

    const finishEdit = useCallback(() => {
        const state = editStateRef.current;
        if (!state || !editingId) return;

        updatePolygon(editingId, extractCoords(state.layer), true);
        delete originalCoordsRef.current[editingId];
        cleanupEdit();
        setEditingId(null);
        getMap()?.closePopup?.();
    }, [editingId, updatePolygon, cleanupEdit]);

    const cancelEdit = useCallback(() => {
        const state = editStateRef.current;
        if (!state || !editingId) return;

        const original = originalCoordsRef.current[editingId];
        if (original) {
            state.layer.setLatLngs?.(original);
            updatePolygon(editingId, original, true);
            delete originalCoordsRef.current[editingId];
        }

        cleanupEdit();
        setEditingId(null);
        getMap()?.closePopup?.();
    }, [editingId, updatePolygon, cleanupEdit]);

    const deletePolygon = useCallback((id: string) => {
        setPolygons(prev => prev.filter(p => p.id !== id));
        if (id === editingId) {
            cleanupEdit();
            setEditingId(null);
        }
    }, [editingId, cleanupEdit]);

    const closePolygonContextMenu = useCallback(() => {
        setPolygonContextMenu(null);
        setPendingDeleteId(null);
        setShowColorPicker(false);
        originalColorRef.current = null;
    }, []);

    // Creation
    const getPointCount = (handler: any) => {
        if (!handler) return 0;
        return handler._markers?.length || handler._poly?.getLatLngs()[0]?.length || 
               handler._shape?.getLatLngs()[0]?.length || handler._polyline?.getLatLngs()[0]?.length || 0;
    };

    const startCreate = useCallback(() => {
        const drawMode = editControlRef.current?._toolbars?.draw?._modes?.polygon?.handler;
        const handler = drawMode || (getMap() && (L as any).Draw?.Polygon ? new (L as any).Draw.Polygon(getMap(), {}) : null);
        if (!handler) return;

        handler.enable();
        createHandlerRef.current = handler;
        setIsCreating(true);
        setCreatePointCount(0);
    }, []);

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

    const handleCreated = useCallback((e: any) => {
        const coords = e.layer.getLatLngs()[0].map((ll: L.LatLng) => [ll.lat, ll.lng]) as [number, number][];
        createdLayerRef.current = e.layer;
        setModal({ open: true, coords });
        createHandlerRef.current = null;
        setIsCreating(false);
    }, []);

    const confirmCreate = useCallback(() => {
        const coords = modal.coords;
        if (!coords) return;
        createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
        createdLayerRef.current = null;
        setPolygons(prev => [...prev, {
            id: `poly-${Date.now()}`,
            name: areaName || "Polygon",
            coords,
            version: 0,
            visible: true,
            color: '#3388ff',
        }]);
        setModal({ open: false, coords: null });
        setAreaName("");
    }, [modal.coords, areaName]);

    const cancelModal = useCallback(() => {
        createdLayerRef.current && getMap()?.removeLayer(createdLayerRef.current);
        createdLayerRef.current = null;
        setModal({ open: false, coords: null });
        setAreaName("");
    }, []);

    // Effects
    useEffect(() => {
        fetch("/api/polygons")
            .then(res => res.json())
            .then(data => setPolygons(data.map((p: any) => ({ ...p, visible: true, version: 0 }))))
            .catch(err => console.error("Failed to fetch polygons:", err));
    }, []);

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
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (isCreating) cancelCreate();
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
                    deletePolygon(editingId);
                } else if (selectedId && !renamingId && !pendingDeleteId) {
                    e.preventDefault();
                    setPendingDeleteId(selectedId);
                }
            }
        };
        window.addEventListener('keydown', handleKey, { capture: true });
        return () => window.removeEventListener('keydown', handleKey, { capture: true });
    }, [isCreating, editingId, selectedId, renamingId, pendingDeleteId, contextMenu, polygonContextMenu, createPointCount, cancelCreate, cancelEdit, finishCreate, finishEdit, deletePolygon, closePolygonContextMenu]);

    // Components
    function MapEvents() {
        useMapEvents({
            contextmenu: e => {
                if (!editingId && !isCreating) {
                    e.originalEvent.preventDefault();
                    setContextMenu({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
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
        return null;
    }

    // Animate selected polygon
    useEffect(() => {
        if (!selectedId) return;
        
        const map = getMap();
        if (!map) return;
        
        let animationFrame: number;
        let startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            
            // Continuous animation without rollback
            const dashOffset = (elapsed / 100) % 15; // Smooth continuous movement
            const glowProgress = (elapsed % 2500) / 2500;
            const wave = Math.sin(glowProgress * Math.PI * 2);
            const glowSize = 3 + wave * 1.5; // Gentle glow 1.5 to 4.5
            
            // Find the selected polygon layer
            map.eachLayer((layer: any) => {
                if (layer instanceof L.Polygon) {
                    const customId = (layer.options as any).customId;
                    if (customId === selectedId) {
                        // Subtle animated dashed border for wave effect
                        layer.setStyle({
                            dashArray: '10, 5',
                            dashOffset: `-${dashOffset}`
                        });
                        
                        // Apply gentle glow effect
                        const element = layer.getElement();
                        if (element) {
                            (element as HTMLElement).style.filter = `drop-shadow(0 0 ${glowSize}px currentColor)`;
                        }
                    }
                }
            });
            
            animationFrame = requestAnimationFrame(animate);
        };
        
        animate();
        
        return () => {
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
            }
            // Reset style when unselecting - smoothly with CSS transition
            map.eachLayer((layer: any) => {
                if (layer instanceof L.Polygon) {
                    const customId = (layer.options as any).customId;
                    if (customId === selectedId) {
                        layer.setStyle({
                            dashArray: undefined,
                            dashOffset: '0'
                        });
                        const element = layer.getElement();
                        if (element) {
                            // The CSS transition will smoothly fade out the filter
                            (element as HTMLElement).style.filter = '';
                        }
                    }
                }
            });
        };
    }, [selectedId]);

    return (
        <>
            {contextMenu && (
                <div style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, background: 'white', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 10000, minWidth: 150 }}>
                    <button onClick={() => { setContextMenu(null); startCreate(); }} style={{ width: '100%', padding: '0.5rem 1rem', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: '#333' }} onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        ➕ Add New Polygon
                    </button>
                </div>
            )}

            {polygonContextMenu && (
                <div style={{ position: 'fixed', left: polygonContextMenu.x, top: polygonContextMenu.y, background: 'white', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 10000, minWidth: 150, overflow: 'hidden' }}>
                    <style>{`
                        @keyframes slideIn {
                            from { transform: translateX(100%); opacity: 0; }
                            to { transform: translateX(0); opacity: 1; }
                        }
                    `}</style>
                    <button onClick={() => { 
                        const poly = polygons.find(p => p.id === polygonContextMenu.polygonId);
                        closePolygonContextMenu(); 
                        setRenamingId(polygonContextMenu.polygonId); 
                        setRenameValue(poly?.name || ''); 
                    }} style={{ width: '100%', padding: '0.5rem 1rem', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: '#333', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span>✏️</span> Rename
                    </button>
                    <button onClick={() => { closePolygonContextMenu(); startEdit(polygonContextMenu.polygonId); }} style={{ width: '100%', padding: '0.5rem 1rem', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: '#333', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span>🔧</span> Edit
                    </button>
                    {!showColorPicker ? (
                        <button onClick={() => setShowColorPicker(true)} style={{ width: '100%', padding: '0.5rem 1rem', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: '#333', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <span>🎨</span> Color
                        </button>
                    ) : (
                        <div style={{ padding: '0.5rem 1rem', animation: 'slideIn 0.3s ease-out' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {['#3388ff', '#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf', '#ff8b94', '#b4a7d6', '#ffa07a'].map(color => {
                                    return (
                                        <button
                                            key={color}
                                            onClick={() => {
                                                setPolygons(prev => prev.map(p => p.id === polygonContextMenu.polygonId ? { ...p, color } : p));
                                                originalColorRef.current = null;
                                                closePolygonContextMenu();
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'scale(1.2)';
                                                if (!originalColorRef.current) {
                                                    const currentPoly = polygons.find(p => p.id === polygonContextMenu.polygonId);
                                                    originalColorRef.current = currentPoly?.color || '#3388ff';
                                                }
                                                setPolygons(prev => prev.map(p => p.id === polygonContextMenu.polygonId ? { ...p, color } : p));
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'scale(1)';
                                                if (originalColorRef.current) {
                                                    setPolygons(prev => prev.map(p => p.id === polygonContextMenu.polygonId ? { ...p, color: originalColorRef.current! } : p));
                                                }
                                            }}
                                            style={{
                                                width: '24px',
                                                height: '24px',
                                                border: '2px solid #fff',
                                                borderRadius: '50%',
                                                background: color,
                                                cursor: 'pointer',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                                transition: 'transform 0.2s'
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <button 
                        onClick={() => { 
                            if (pendingDeleteId) {
                                deletePolygon(pendingDeleteId);
                                closePolygonContextMenu();
                            } else {
                                setPendingDeleteId(polygonContextMenu.polygonId);
                            }
                        }} 
                        style={{ 
                            width: '100%', 
                            padding: '0.5rem 1rem', 
                            border: 'none', 
                            background: pendingDeleteId ? '#ef5350' : 'transparent', 
                            textAlign: 'left', 
                            cursor: 'pointer', 
                            fontSize: '0.9rem', 
                            color: pendingDeleteId ? 'white' : '#d32f2f', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem', 
                            transition: 'all 0.3s ease-out',
                            fontWeight: pendingDeleteId ? 500 : 'normal',
                            animation: pendingDeleteId ? 'slideIn 0.3s ease-out' : 'none'
                        }} 
                        onMouseEnter={e => e.currentTarget.style.background = pendingDeleteId ? '#e53935' : '#ffebee'} 
                        onMouseLeave={e => e.currentTarget.style.background = pendingDeleteId ? '#ef5350' : 'transparent'}
                    >
                        <span>🗑️</span> {pendingDeleteId ? 'Confirm' : 'Delete'}
                    </button>
                </div>
            )}

            {pendingDeleteId && !polygonContextMenu && (
                <div style={{ position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", background: "#ef5350", color: "white", padding: "1rem 2rem", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.3)", zIndex: 10000, display: "flex", alignItems: "center", gap: "1rem", animation: "slideIn 0.3s ease-out" }}>
                    <span style={{ fontSize: "1.1rem", fontWeight: 500 }}>Delete "{polygons.find(p => p.id === pendingDeleteId)?.name}"?</span>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button onClick={() => { deletePolygon(pendingDeleteId); setPendingDeleteId(null); }} style={{ padding: "0.5rem 1rem", borderRadius: 4, border: "none", background: "white", color: "#ef5350", cursor: "pointer", fontWeight: 600 }}>Confirm</button>
                        <button onClick={() => setPendingDeleteId(null)} style={{ padding: "0.5rem 1rem", borderRadius: 4, border: "1px solid white", background: "transparent", color: "white", cursor: "pointer" }}>Cancel</button>
                    </div>
                </div>
            )}

            {renamingId && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "#fff", padding: "2rem", borderRadius: 8, boxShadow: "0 2px 16px rgba(0,0,0,0.2)", minWidth: 300, display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <h2 style={{ margin: 0, color: '#222' }}>Rename Polygon</h2>
                        <input type="text" value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { 
                            if (e.key === "Enter") { 
                                setPolygons(prev => prev.map(p => p.id === renamingId ? { ...p, name: renameValue } : p)); 
                                setRenamingId(null); 
                            } else if (e.key === "Escape") {
                                setRenamingId(null);
                            }
                        }} placeholder="Polygon name" style={{ padding: "0.5rem", fontSize: "1rem", borderRadius: 4, border: "1px solid #ccc", color: "#222" }} autoFocus />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                            <button onClick={() => setRenamingId(null)} style={{ padding: "0.5rem 1rem", borderRadius: 4, border: "none", background: "#eee", cursor: "pointer" }}>Cancel</button>
                            <button onClick={() => { setPolygons(prev => prev.map(p => p.id === renamingId ? { ...p, name: renameValue } : p)); setRenamingId(null); }} style={{ padding: "0.5rem 1rem", borderRadius: 4, border: "none", background: "#007bff", color: "#fff", cursor: "pointer" }}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}
            
            {modal.open && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "#fff", padding: "2rem", borderRadius: 8, boxShadow: "0 2px 16px rgba(0,0,0,0.2)", minWidth: 300, display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <h2 style={{ margin: 0, color: '#222' }}>Enter Area Name</h2>
                        <input type="text" value={areaName} onChange={e => setAreaName(e.target.value)} onKeyDown={e => e.key === "Enter" && confirmCreate()} placeholder="Area name" style={{ padding: "0.5rem", fontSize: "1rem", borderRadius: 4, border: "1px solid #ccc", color: "#222" }} autoFocus />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                            <button onClick={cancelModal} style={{ padding: "0.5rem 1rem", borderRadius: 4, border: "none", background: "#eee", cursor: "pointer" }}>Cancel</button>
                            <button onClick={confirmCreate} style={{ padding: "0.5rem 1rem", borderRadius: 4, border: "none", background: "#007bff", color: "#fff", cursor: "pointer" }}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="text-black" style={{ display: "flex", flexDirection: "column", width: "clamp(50px, 30%, 200px)" }}>
                <PolygonList polygons={polygons} onToggle={id => setPolygons(prev => prev.map(p => p.id === id ? { ...p, visible: !p.visible } : p))} onRename={(id, name) => setPolygons(prev => prev.map(p => p.id === id ? { ...p, name } : p))} />
            </div>

            <div style={{ flex: 1, position: 'relative' }}>
                <MapContainer style={{ height: "100%", width: "100%" }} center={center} zoom={15}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>' />
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
                    `}</style>
                    
                    <FeatureGroup ref={featureGroupRef}>
                        <EditControl ref={editControlRef} position="topright" draw={{ rectangle: false, polyline: false, circle: false, marker: false, circlemarker: false, polygon: true }} onCreated={handleCreated} />
                        
                        {polygons.filter(p => p.visible).map(poly => {
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
                                        add: e => ((e.target as L.Polygon).options as any).customId = poly.id,
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
                                                setPolygonContextMenu({ 
                                                    x: e.originalEvent.clientX, 
                                                    y: e.originalEvent.clientY, 
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
                                    </Tooltip>
                                </Polygon>
                            );
                        })}
                    </FeatureGroup>

                    <Marker position={center}><Popup>Center Location</Popup></Marker>
                </MapContainer>

                <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 2000, display: 'flex', gap: 8 }}>
                    {!editingId && !isCreating && <button onClick={startCreate} title="Add" style={{ background: '#007bff', color: 'white', border: 'none', padding: '0.5rem', borderRadius: 4 }}>+</button>}
                    {isCreating && (
                        <>
                            <button onClick={finishCreate} title="Finish drawing" disabled={createPointCount < 3} style={{ background: createPointCount >= 3 ? 'green' : '#9fc59f', color: 'white', border: 'none', padding: '0.5rem', borderRadius: 4, cursor: createPointCount >= 3 ? 'pointer' : 'not-allowed', opacity: createPointCount >= 3 ? 1 : 0.6 }}>✓</button>
                            <button onClick={cancelCreate} title="Cancel drawing" style={{ background: 'red', color: 'white', border: 'none', padding: '0.5rem', borderRadius: 4 }}>✕</button>
                            <button onClick={() => createHandlerRef.current?.deleteLastVertex?.()} title="Remove last point" style={{ background: '#ddd', color: '#333', border: 'none', padding: '0.5rem', borderRadius: 4 }}>-</button>
                        </>
                    )}
                    {editingId && (
                        <>
                            <button onClick={finishEdit} title="Save" style={{ background: 'green', color: 'white', border: 'none', padding: '0.5rem', borderRadius: 4 }}>✓</button>
                            <button onClick={cancelEdit} title="Cancel" style={{ background: 'red', color: 'white', border: 'none', padding: '0.5rem', borderRadius: 4 }}>✕</button>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
