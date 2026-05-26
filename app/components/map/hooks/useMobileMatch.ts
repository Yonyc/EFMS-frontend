import { useEffect, useState } from "react";

export function useMobileMatch(maxWidthPx: number = 768): boolean {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
        const h = (e: { matches: boolean }) => setIsMobile(e.matches);
        h(mq);
        mq.addEventListener('change', h);
        return () => mq.removeEventListener('change', h);
    }, [maxWidthPx]);
    return isMobile;
}
