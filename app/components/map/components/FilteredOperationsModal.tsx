import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDateTimeFormatter } from "~/utils/datetime";
import type { ParcelSearchFilters } from "../types";
import {
    buildExportMeta, buildRows, exportExcel, exportPdf, fetchFarmOperations,
    filterOperations, formatDuration, parcelsForSnapshot,
    type ExportOperation,
} from "../utils/operationsExport";
import { renderParcelsSatellite, type SnapshotParcel } from "../utils/mapSnapshot";

type OperationDto = ExportOperation;

interface Props {
    farmId: number;
    filters: ParcelSearchFilters;
    /** Ids of parcels currently matching the filter on the map (string ids). */
    matchingParcelIds: string[];
    /** Visible parcels with geometry, used to draw the satellite snapshot in the PDF export. */
    matchingParcels: SnapshotParcel[];
    onClose: () => void;
    t: (key: string, opts?: any) => string;
}

/**
 * Lists every operation matching the active map filter. Operations are fetched for the farm and
 * filtered client-side using the same semantics as the parcel filter: period is a union, and the
 * operation attributes (type / tool / product) form one OR group, AND-ed with the period and the
 * date range. Results are also scoped to the parcels currently matching on the map so spatial
 * filters (map area / drawn polygon) are honoured.
 */
export default function FilteredOperationsModal({ farmId, filters, matchingParcelIds, matchingParcels, onClose, t }: Props) {
    const { formatDateTime } = useDateTimeFormatter();
    const [operations, setOperations] = useState<OperationDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const all = await fetchFarmOperations(farmId);
                if (!cancelled) setOperations(all);
            } catch {
                if (!cancelled) setError(t("operations.errorLoad", { defaultValue: "Failed to load operations" }));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [farmId, t]);

    const filtered = useMemo(
        () => filterOperations(operations, filters, matchingParcelIds),
        [operations, filters, matchingParcelIds],
    );

    const handleExportExcel = async () => {
        if (exporting) return;
        setExporting("excel");
        setExportError(null);
        try {
            const meta = buildExportMeta(filters, t, formatDateTime);
            await exportExcel(buildRows(filtered, formatDateTime), meta);
        } catch {
            setExportError(t("operations.export.error", { defaultValue: "Export failed" }));
        } finally {
            setExporting(null);
        }
    };

    const handleExportPdf = async () => {
        if (exporting) return;
        setExporting("pdf");
        setExportError(null);
        try {
            const meta = buildExportMeta(filters, t, formatDateTime);
            const image = await renderParcelsSatellite(parcelsForSnapshot(filtered, matchingParcels));
            await exportPdf(buildRows(filtered, formatDateTime), meta, image);
        } catch {
            setExportError(t("operations.export.error", { defaultValue: "Export failed" }));
        } finally {
            setExporting(null);
        }
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
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleExportExcel}
                            disabled={loading || filtered.length === 0 || exporting !== null}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <span aria-hidden>⬇</span>
                            {exporting === "excel"
                                ? t("operations.export.generating", { defaultValue: "Generating…" })
                                : t("operations.export.excel", { defaultValue: "Excel" })}
                        </button>
                        <button
                            type="button"
                            onClick={handleExportPdf}
                            disabled={loading || filtered.length === 0 || exporting !== null}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <span aria-hidden>⬇</span>
                            {exporting === "pdf"
                                ? t("operations.export.generating", { defaultValue: "Generating…" })
                                : t("operations.export.pdf", { defaultValue: "PDF" })}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                            aria-label={t("common.close", { defaultValue: "Close" })}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-2">
                    {loading && (
                        <div className="py-12 text-center text-slate-400">{t("common.loading", { defaultValue: "Loading..." })}</div>
                    )}
                    {error && (
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</div>
                    )}
                    {exportError && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-sm text-amber-300">{exportError}</div>
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
