import { useEffect, useMemo, useRef, useState } from "react";
import type { PolygonData } from "../types";
import { getDepth } from "../utils/colorUtils";

interface UseFamilyScopeProps {
    polygons: PolygonData[];
    isCreating: boolean;
    selectedParentId: string | null;
    editingId: string | null;
    minLayer: number;
    maxLayer: number;
    setMinLayer: (v: number) => void;
    setMaxLayer: (v: number) => void;
    layerOverrideRef: React.MutableRefObject<{ min: number; max: number } | null>;
}

export function useFamilyScope(props: UseFamilyScopeProps) {
    const {
        polygons, isCreating, selectedParentId, editingId,
        minLayer, maxLayer, setMinLayer, setMaxLayer,
        layerOverrideRef,
    } = props;

    // parcel anchoring the current sub-parcel work or null
    const familyRootId = useMemo(() => {
        if (isCreating && selectedParentId) return String(selectedParentId);
        if (editingId) {
            const edited = polygons.find(p => String(p.id) === String(editingId));
            if (edited?.parentId) return String(edited.parentId);
        }
        return null;
    }, [isCreating, selectedParentId, editingId, polygons]);

    const [restrictToFamily, setRestrictToFamily] = useState(false);

    // ref'd so the effect only fires on familyRootId
    const polygonsRef = useRef(polygons);
    useEffect(() => { polygonsRef.current = polygons; }, [polygons]);

    useEffect(() => {
        if (!familyRootId) return;
        const snap = polygonsRef.current;
        const polyById = new Map(snap.map(p => [String(p.id), p] as const));
        const root = polyById.get(familyRootId);
        if (!root) return;
        const rootLayer = getDepth(root, polyById) + 1;
        layerOverrideRef.current = { min: minLayer, max: maxLayer };
        setMinLayer(rootLayer);
        setMaxLayer(rootLayer + 1);
        setRestrictToFamily(true);
        return () => {
            const prev = layerOverrideRef.current ?? { min: 1, max: 1 };
            layerOverrideRef.current = null;
            setMinLayer(prev.min);
            // bump max so the parcel just touched stays visible after restore
            setMaxLayer(Number.isFinite(prev.max) ? Math.max(prev.max, rootLayer + 1) : prev.max);
            setRestrictToFamily(false);
        };
    // min/max captured at entry so listing them as deps would loop the setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [familyRootId]);

    return { familyRootId, restrictToFamily, setRestrictToFamily };
}
