import { useEffect, useMemo, useRef, useState } from "react";
import { apiPut } from "~/utils/api";

const LAYER_STORE_KEY = "efms.layerRange.v1";

interface User {
    id: string | number;
    operationsPopupTopRight?: boolean;
}

// useFamilyScope flips layerOverrideRef to pause persistence during a sub-parcel override
export function useUserPreferences(user: User | null) {
    // per-user so two accounts on the same browser don't collide
    const prefKey = useMemo(() => user ? `opsTopRight:${user.id}` : 'opsTopRight:anon', [user]);

    const [preferTopRight, setPreferTopRight] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        try {
            const stored = localStorage.getItem(`opsTopRight:${user?.id ?? 'anon'}`);
            if (stored !== null) return stored === '1';
        } catch { /* ignore */ }
        return !!user?.operationsPopupTopRight;
    });

    // skip the first run so the hydrated value doesn't echo back on mount
    const prefSyncedRef = useRef(false);
    useEffect(() => {
        if (!prefSyncedRef.current) {
            prefSyncedRef.current = true;
            return;
        }
        try { localStorage.setItem(prefKey, preferTopRight ? '1' : '0'); } catch { /* ignore */ }
        apiPut('/users/me/preferences', { operationsPopupTopRight: preferTopRight })
            .catch(err => console.error('persist ops popup preference failed', err));
    }, [prefKey, preferTopRight]);

    // 1 = top-level parcels, max can be Infinity meaning all
    const [minLayer, setMinLayer] = useState<number>(() => {
        if (typeof window === "undefined") return 1;
        try {
            const raw = window.localStorage.getItem(LAYER_STORE_KEY);
            if (!raw) return 1;
            const v = JSON.parse(raw) as { min?: number };
            return typeof v.min === "number" && v.min >= 1 ? v.min : 1;
        } catch { return 1; }
    });
    const [maxLayer, setMaxLayer] = useState<number>(() => {
        if (typeof window === "undefined") return 1;
        try {
            const raw = window.localStorage.getItem(LAYER_STORE_KEY);
            if (!raw) return 1;
            const v = JSON.parse(raw) as { max?: number | "all" };
            if (v.max === "all") return Number.POSITIVE_INFINITY;
            return typeof v.max === "number" && v.max >= 1 ? v.max : 1;
        } catch { return 1; }
    });

    // non-null while useFamilyScope is overriding so persistence pauses
    const layerOverrideRef = useRef<{ min: number; max: number } | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (layerOverrideRef.current !== null) return;
        try {
            window.localStorage.setItem(LAYER_STORE_KEY, JSON.stringify({
                min: minLayer,
                max: Number.isFinite(maxLayer) ? maxLayer : "all",
            }));
        } catch { /* quota / privacy mode */ }
    }, [minLayer, maxLayer]);

    return {
        preferTopRight, setPreferTopRight,
        minLayer, setMinLayer,
        maxLayer, setMaxLayer,
        layerOverrideRef,
    };
}
