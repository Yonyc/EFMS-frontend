import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiGet, getPageMeta } from "~/utils/api";
import { useDateTimeFormatter } from "~/utils/datetime";
import type { ParcelSearchFilters } from "../types";

interface OpProduct { productId?: number; productName?: string; toolId?: number; toolName?: string; quantity?: number; unitValue?: string; }
interface OperationDto {
    id: number; date?: string; durationSeconds?: number;
    typeId?: number; typeName?: string;
    parcelId?: number; parcelName?: string;
    parcelIds?: number[]; parcelNames?: string[];
    periodId?: number; periodName?: string;
    products?: OpProduct[];
}

interface Props {
    farmId: number;
    filters: ParcelSearchFilters;
    /** Ids of parcels currently matching the filter on the map (string ids). */
    matchingParcelIds: string[];
    onClose: () => void;
    t: (key: string, opts?: any) => string;
}

const PAGE_FETCH = 200;

/**
 * Lists every operation matching the active map filter. Operations are fetched for the farm and
 * filtered client-side using the same semantics as the parcel filter: period is a union, and the
 * operation attributes (type / tool / product) form one OR group, AND-ed with the period and the
 * date range. Results are also scoped to the parcels currently matching on the map so spatial
 * filters (map area / drawn polygon) are honoured.
 */
export default function FilteredOperationsModal({ farmId, filters, matchingParcelIds, onClose, t }: Props) {
    const { formatDateTime } = useDateTimeFormatter();
    const [operations, setOperations] = useState<OperationDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                // Pull all farm operations (paginated) then filter locally
                const all: OperationDto[] = [];
                let page = 0;
                for (;;) {
                    const res = await apiGet(`/farm/${farmId}/operations?page=${page}&size=${PAGE_FETCH}`);
                    if (!res.ok) throw new Error("failed");
                    const data = await res.json();
                    const content: OperationDto[] = Array.isArray(data) ? data : (data.content ?? []);
                    all.push(...content);
                    const pm = getPageMeta(data);
                    if (Array.isArray(data) || pm.number >= pm.totalPages - 1) break;
                    page += 1;
                    if (page > 50) break; // safety cap
                }
                if (!cancelled) setOperations(all);
            } catch {
                if (!cancelled) setError(t("operations.errorLoad", { defaultValue: "Failed to load operations" }));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [farmId, t]);

    const filtered = useMemo(() => {
        const periodIds = new Set(filters.periodIds.map(String));
        const typeIds = new Set(filters.operationTypeIds.map(String));
        const toolIds = new Set(filters.toolIds.map(String));
        const productIds = new Set(filters.productIds.map(String));
        const matching = new Set(matchingParcelIds.map(String));
        const hasOpFilter = typeIds.size > 0 || toolIds.size > 0 || productIds.size > 0;
        const spatial = filters.useMapArea || filters.usePolygon;
        const start = filters.startDate ? new Date(filters.startDate) : null;
        const end = filters.endDate ? new Date(filters.endDate + "T23:59:59") : null;

        return operations.filter(op => {
            // Period (union)
            if (periodIds.size > 0 && !(op.periodId != null && periodIds.has(String(op.periodId)))) return false;
            // Date range
            if (op.date) {
                const d = new Date(op.date);
                if (start && d < start) return false;
                if (end && d > end) return false;
            } else if (start || end) {
                return false;
            }
            // Operation attributes (OR group)
            if (hasOpFilter) {
                const typeMatch = typeIds.size > 0 && op.typeId != null && typeIds.has(String(op.typeId));
                const toolMatch = toolIds.size > 0 && (op.products ?? []).some(p => p.toolId != null && toolIds.has(String(p.toolId)));
                const productMatch = productIds.size > 0 && (op.products ?? []).some(p => p.productId != null && productIds.has(String(p.productId)));
                if (!(typeMatch || toolMatch || productMatch)) return false;
            }
            // Spatial filters: scope to the parcels currently matching on the map.
            if (spatial && matching.size > 0) {
                const opParcels = (op.parcelIds && op.parcelIds.length > 0)
                    ? op.parcelIds.map(String)
                    : (op.parcelId != null ? [String(op.parcelId)] : []);
                if (!opParcels.some(id => matching.has(id))) return false;
            }
            return true;
        }).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    }, [operations, filters, matchingParcelIds]);

    const formatDuration = (s?: number) => {
        if (!s) return null;
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        return h > 0 ? `${h}h ${m}min` : `${m}min`;
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/60 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 text-slate-50 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                    <div>
                        <h2 className="text-base font-semibold text-white">
                            {t("operations.matchingTitle", { defaultValue: "Operations matching the filter" })}
                        </h2>
                        <p className="text-xs text-slate-400">
                            {t("operations.matchingCount", { defaultValue: "{{count}} operation(s)", count: filtered.length })}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                        aria-label={t("common.close", { defaultValue: "Close" })}
                    >
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-2">
                    {loading && (
                        <div className="py-12 text-center text-slate-400">{t("common.loading", { defaultValue: "Loading..." })}</div>
                    )}
                    {error && (
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</div>
                    )}
                    {!loading && !error && filtered.length === 0 && (
                        <div className="py-12 text-center text-slate-400">{t("operations.matchingEmpty", { defaultValue: "No operations match the current filter." })}</div>
                    )}
                    {!loading && filtered.map(op => {
                        const parcels = (op.parcelNames && op.parcelNames.length > 0)
                            ? op.parcelNames
                            : (op.parcelName ? [op.parcelName] : []);
                        return (
                            <div key={op.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-white">
                                        {op.typeName ?? t("operations.selectTypePlaceholder", { defaultValue: "No type" })}
                                    </span>
                                    {parcels.map((name, i) => (
                                        <span key={i} className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-300">{name}</span>
                                    ))}
                                    {op.periodName && (
                                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-300">{op.periodName}</span>
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-slate-400">
                                    {formatDateTime(op.date)}
                                    {formatDuration(op.durationSeconds) ? ` · ${formatDuration(op.durationSeconds)}` : ""}
                                </p>
                                {(op.products ?? []).filter(p => p.productName || p.toolName).length > 0 && (
                                    <ul className="mt-1.5 space-y-0.5 text-xs text-slate-300">
                                        {(op.products ?? []).filter(p => p.productName || p.toolName).map((p, i) => (
                                            <li key={i}>
                                                {p.productName}
                                                {p.quantity != null ? ` — ${p.quantity}${p.unitValue ? ` ${p.unitValue}` : ""}` : ""}
                                                {p.toolName ? ` (${p.toolName})` : ""}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>,
        document.body
    );
}
