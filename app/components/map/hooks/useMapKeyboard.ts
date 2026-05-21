import { useEffect, useRef } from "react";
import type { OverlapWarning, PolygonData } from "../types";

interface MapKeyboardDeps {
    isCreating: boolean;
    editingId: string | null;
    renamingId: string | null;
    pendingDeleteId: string | null;
    createPointCount: number;
    overlapWarning: OverlapWarning | null;
    selectedId: string | null;
    polygons: PolygonData[];
    allPolygons: PolygonData[];

    setOverlapWarning: (w: OverlapWarning | null) => void;
    setShowPreview: (s: boolean) => void;
    setRenamingId: (id: string | null) => void;
    setRenameValue: (s: string) => void;
    setPendingDeleteId: (id: string | null) => void;
    setContextMenu: (m: { x: number; y: number } | null) => void;
    closePolygonContextMenu: () => void;

    cancelCreate: () => void;
    cancelEdit: () => void;
    finishCreate: () => void;
    finishEdit: () => void;
    removeLastSketchPoint: () => void;
    deletePolygonSimple: (id: string) => void;
}

// attached once, live state read off the ref so re-renders don't rebind
export function useMapKeyboard(deps: MapKeyboardDeps) {
    const ref = useRef(deps);
    useEffect(() => { ref.current = deps; });

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            const d = ref.current;
            if (e.key === 'Escape') {
                if (d.overlapWarning) { d.setOverlapWarning(null); d.setShowPreview(false); }
                else if (d.isCreating) d.cancelCreate();
                else if (d.editingId) d.cancelEdit();
                else if (d.renamingId) { d.setRenamingId(null); d.setRenameValue(''); }
                else if (d.pendingDeleteId) d.setPendingDeleteId(null);
                else d.setContextMenu(null);
                d.closePolygonContextMenu();
                return;
            }
            if (e.key === 'Enter' || e.key === 'v' || e.key === 'V') {
                if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
                if (d.pendingDeleteId) { d.deletePolygonSimple(d.pendingDeleteId); d.setPendingDeleteId(null); }
                else if (d.isCreating && d.createPointCount >= 3) d.finishCreate();
                else if (d.editingId) d.finishEdit();
                return;
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
                if ((d.isCreating || !!d.editingId) && e.key === 'Backspace') {
                    e.preventDefault();
                    d.removeLastSketchPoint();
                    return;
                }
                if (d.selectedId && !d.editingId && !d.isCreating) {
                    const target = d.polygons.find(p => p.id === d.selectedId) || d.allPolygons.find(p => p.id === d.selectedId);
                    if (target?.canEdit !== false) d.setPendingDeleteId(d.selectedId);
                }
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);
}
