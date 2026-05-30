import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PolygonData } from "../types";

interface PolygonContextMenuProps {
    polygonContextMenu: {
        x: number;
        y: number;
        polygonId: string;
        mapRect?: { left: number; top: number; right: number; bottom: number };
    };
    canEditPolygon: (id: string) => boolean;
    polygons: PolygonData[];
    closePolygonContextMenu: () => void;
    contextType: string;
    setSelectedId: (id: string | null) => void;
    setCurrentParcelId: (id: string | null) => void;
    loadParcelOperations: (id: string) => Promise<void>;
    setOperationPopup: (val: { x: number; y: number; polygonId: string } | null) => void;
    isImportMode: boolean;
    startEdit: (id: string) => void;
    approveSingleParcel: (id: string) => Promise<void>;
    
    onManageParcel: (id: string) => void;
    t: any;
    pendingDeleteId: string | null;
    setPendingDeleteId: (id: string | null) => void;
    deletePolygon: (id: string) => Promise<void>;
    addChild: (parentId: string) => void;
    selectParent: (childId: string) => void;
}

const PolygonContextMenu = React.memo((props: PolygonContextMenuProps) => {
    const {
        polygonContextMenu, canEditPolygon, polygons, closePolygonContextMenu,
        contextType, setSelectedId, setCurrentParcelId, loadParcelOperations, setOperationPopup,
        isImportMode,
        startEdit, approveSingleParcel, onManageParcel,
        t, pendingDeleteId, setPendingDeleteId, deletePolygon, addChild, selectParent
    } = props;

    const MENU_PADDING = 12;
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({
        left: polygonContextMenu.x,
        top: polygonContextMenu.y,
    });
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        setIsMobile(window.innerWidth < 640);
        const handler = () => setIsMobile(window.innerWidth < 640);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    
    
    
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) closePolygonContextMenu();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePolygonContextMenu(); };
        const id = window.setTimeout(() => {
            document.addEventListener('mousedown', onDown);
            document.addEventListener('keydown', onKey);
        }, 0);
        return () => {
            window.clearTimeout(id);
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [closePolygonContextMenu]);

    useLayoutEffect(() => {
        const menuEl = menuRef.current;
        if (!menuEl) return;

        const mapRect = polygonContextMenu.mapRect ?? {
            left: 0,
            top: 0,
            right: window.innerWidth,
            bottom: window.innerHeight,
        };

        const menuWidth = menuEl.offsetWidth || 240;
        const menuHeight = menuEl.offsetHeight || 320;

        const maxLeft = Math.max(mapRect.left + MENU_PADDING, mapRect.right - menuWidth - MENU_PADDING);
        const maxTop = Math.max(mapRect.top + MENU_PADDING, mapRect.bottom - menuHeight - MENU_PADDING);

        const nextLeft = Math.max(mapRect.left + MENU_PADDING, Math.min(polygonContextMenu.x, maxLeft));
        const nextTop = Math.max(mapRect.top + MENU_PADDING, Math.min(polygonContextMenu.y, maxTop));

        setMenuPos(prev => (prev.left === nextLeft && prev.top === nextTop ? prev : { left: nextLeft, top: nextTop }));
    }, [polygonContextMenu]);

    const btn = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-slate-50 active:scale-95";

    const menuItems = (
        <>
            {canEditPolygon(polygonContextMenu.polygonId) && (
                <button
                    type="button"
                    onClick={() => { closePolygonContextMenu(); startEdit(polygonContextMenu.polygonId); }}
                    className={`${btn} text-slate-800`}
                >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">🔧</span>
                    {t('map.polygonMenu.edit')}
                </button>
            )}

            {contextType === 'farm' && !isImportMode && canEditPolygon(polygonContextMenu.polygonId) && (
                <button
                    type="button"
                    onClick={() => { closePolygonContextMenu(); onManageParcel(polygonContextMenu.polygonId); }}
                    className={`${btn} text-slate-800`}
                >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">🗂️</span>
                    {t('map.parcelManager.open', { defaultValue: 'Manage parcel' })}
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
                    className={`${btn} text-slate-800`}
                >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">📋</span>
                    {t('operations.title', { defaultValue: 'Parcel operations' })}
                </button>
            )}

            {contextType === 'farm' && !isImportMode && canEditPolygon(polygonContextMenu.polygonId) && (
                <button
                    type="button"
                    onClick={() => { closePolygonContextMenu(); addChild(polygonContextMenu.polygonId); }}
                    className={`${btn} text-slate-800`}
                >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-600">➕</span>
                    {t('map.polygonMenu.addChild', { defaultValue: 'Add child parcel' })}
                </button>
            )}

            {(() => {
                const poly = polygons.find(p => p.id === polygonContextMenu.polygonId);
                if (!poly?.parentId) return null;
                return (
                    <button
                        type="button"
                        onClick={() => { closePolygonContextMenu(); selectParent(polygonContextMenu.polygonId); }}
                        className={`${btn} text-slate-800`}
                    >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-base text-amber-600">⬆️</span>
                        {t('map.polygonMenu.selectParent', { defaultValue: 'Select parent' })}
                    </button>
                );
            })()}


            {isImportMode && (
                <button
                    type="button"
                    onClick={() => { closePolygonContextMenu(); approveSingleParcel(polygonContextMenu.polygonId); }}
                    className={`${btn} text-emerald-700`}
                >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-base text-emerald-600">✅</span>
                    {t('imports.map.approveOne', { defaultValue: 'Approve parcel' })}
                </button>
            )}

            {canEditPolygon(polygonContextMenu.polygonId) && (
                <button
                    type="button"
                    onClick={() => {
                        if (pendingDeleteId === polygonContextMenu.polygonId) {
                            deletePolygon(pendingDeleteId);
                            setPendingDeleteId(null);
                            closePolygonContextMenu();
                        } else {
                            setPendingDeleteId(polygonContextMenu.polygonId);
                        }
                    }}
                    className={`${btn} ${pendingDeleteId === polygonContextMenu.polygonId ? 'bg-rose-500 text-white hover:!bg-rose-600 hover:!text-white' : 'text-rose-600 hover:bg-rose-50'}`}
                >
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-base ${pendingDeleteId === polygonContextMenu.polygonId ? 'bg-white/20 text-white' : 'bg-rose-50 text-rose-600'}`}>🗑️</span>
                    {pendingDeleteId === polygonContextMenu.polygonId ? t('common.confirm') : t('common.delete')}
                </button>
            )}
        </>
    );

    if (isMobile) {
        return (
            <>
                <div className="fixed inset-0 z-[2900]" onClick={closePolygonContextMenu} />
                <div
                    ref={menuRef}
                    className="pointer-events-auto fixed bottom-0 left-0 right-0 z-[3000] max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/30"
                >
                    <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
                    <div className="flex flex-col gap-1 px-1 pb-4">{menuItems}</div>
                </div>
            </>
        );
    }

    return (
        <div
            ref={menuRef}
            className="pointer-events-auto fixed z-[1100] min-w-[220px] max-h-[28rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-2xl shadow-slate-900/15 backdrop-blur-md transition-all duration-200"
            style={{ left: menuPos.left, top: menuPos.top }}
        >
            <div className="flex flex-col gap-1 p-1">{menuItems}</div>
        </div>
    );
});

export default PolygonContextMenu;
