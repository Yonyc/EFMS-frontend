import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet } from "~/utils/api";

/**
 * Probes a lightweight public endpoint to detect whether the backend API is reachable. While it is
 * not, a full-screen blocking overlay is shown so the app can't be used against a dead backend; it
 * keeps polling and clears itself once the API responds. Starts optimistic to avoid a flash on load.
 */
export default function ApiHealthBanner() {
    const { t } = useTranslation();
    const [reachable, setReachable] = useState(true);
    const [checking, setChecking] = useState(false);

    const check = useCallback(async () => {
        setChecking(true);
        try {
            const res = await apiGet("/auth/settings", { requireAuth: false });
            setReachable(res.ok);
        } catch {
            setReachable(false);
        } finally {
            setChecking(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        const run = () => { if (!cancelled) void check(); };
        run();
        // Poll faster while down so access is restored promptly once the backend is back.
        const id = window.setInterval(run, reachable ? 30000 : 5000);
        return () => { cancelled = true; window.clearInterval(id); };
    }, [check, reachable]);

    if (reachable) return null;

    return (
        <div className="fixed inset-0 z-[2147483600] flex items-center justify-center bg-slate-900/95 px-4 text-center">
            <div className="max-w-md">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636L5.636 18.364m0-12.728L18.364 18.364" />
                    </svg>
                </div>
                <h1 className="text-lg font-semibold text-white">
                    {t("common.apiUnreachableTitle", { defaultValue: "Server unavailable" })}
                </h1>
                <p className="mt-2 text-sm text-slate-300">
                    {t("common.apiUnreachable", { defaultValue: "Cannot reach the server. Please check your connection or try again later." })}
                </p>
                <button
                    type="button"
                    onClick={() => void check()}
                    disabled={checking}
                    className="mt-5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                >
                    {checking
                        ? t("common.loading", { defaultValue: "Loading..." })
                        : t("common.retry", { defaultValue: "Retry" })}
                </button>
            </div>
        </div>
    );
}
