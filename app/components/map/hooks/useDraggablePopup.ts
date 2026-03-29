import { useState, useCallback, useEffect, useRef } from "react";
import { clampToRect, clampToViewport } from "../utils/mapUtils";

interface UseDraggablePopupProps {
    getMap: () => L.Map | undefined;
    preferTopRight: boolean;
    POPUP_WIDTH: number;
    POPUP_HEIGHT: number;
    POPUP_PADDING: number;
    isMobile: boolean;
    activePopup: { x: number; y: number } | null;
}

export function useDraggablePopup({ 
    getMap, preferTopRight, POPUP_WIDTH, POPUP_HEIGHT, POPUP_PADDING, isMobile, activePopup 
}: UseDraggablePopupProps) {
    const [popupCoords, setPopupCoords] = useState<{ left: number; top: number } | null>(null);
    const [dragState, setDragState] = useState<{ active: boolean; offsetX: number; offsetY: number }>({ active: false, offsetX: 0, offsetY: 0 });

    const updatePosition = useCallback(() => {
        if (!activePopup) {
            setPopupCoords(null);
            return;
        }

        const mapRect = getMap()?.getContainer?.()?.getBoundingClientRect?.();
        if (preferTopRight && mapRect) {
            const pos = clampToRect(
                mapRect.right - POPUP_WIDTH - POPUP_PADDING, 
                mapRect.top + POPUP_PADDING, 
                POPUP_WIDTH, POPUP_HEIGHT, 
                mapRect, 
                POPUP_PADDING
            );
            setPopupCoords({ left: pos.x, top: pos.y });
            return;
        }

        const fallbackPos = clampToRect(
            activePopup.x, 
            activePopup.y, 
            POPUP_WIDTH, POPUP_HEIGHT, 
            mapRect ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight), 
            POPUP_PADDING
        );
        setPopupCoords({ left: fallbackPos.x, top: fallbackPos.y });
    }, [activePopup, preferTopRight, getMap, POPUP_WIDTH, POPUP_HEIGHT, POPUP_PADDING]);

    // update pos when popup opens
    useEffect(() => {
        updatePosition();
    }, [updatePosition]);

    const startDrag = useCallback((e: React.MouseEvent) => {
        if (!popupCoords || isMobile) return;
        e.preventDefault();
        setDragState({ 
            active: true, 
            offsetX: e.clientX - popupCoords.left, 
            offsetY: e.clientY - popupCoords.top 
        });
    }, [popupCoords, isMobile]);

    useEffect(() => {
        if (!dragState.active) return;

        const handleMove = (e: MouseEvent) => {
            const nextLeft = e.clientX - dragState.offsetX;
            const nextTop = e.clientY - dragState.offsetY;
            const pos = clampToViewport(nextLeft, nextTop, POPUP_WIDTH, POPUP_HEIGHT, POPUP_PADDING);
            setPopupCoords({ left: pos.x, top: pos.y });
        };

        const handleUp = () => setDragState(prev => ({ ...prev, active: false }));

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [dragState.active, dragState.offsetX, dragState.offsetY, POPUP_WIDTH, POPUP_HEIGHT, POPUP_PADDING]);

    return {
        popupCoords,
        startDrag,
        dragState
    };
}
