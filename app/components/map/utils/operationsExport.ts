import { apiGet, getPageMeta } from "~/utils/api";
import type { ParcelSearchFilters } from "../types";
import { renderParcelsSatellite, type SnapshotParcel, type SnapshotResult } from "./mapSnapshot";
import { parseWktCoords } from "./wkt";

type TFn = (key: string, opts?: any) => string;

export interface ExportOpProduct {
    productId?: number;
    productName?: string;
    toolId?: number;
    toolName?: string;
    quantity?: number;
    unitValue?: string;
}

export interface ExportOperation {
    id: number;
    date?: string;
    durationSeconds?: number;
    typeId?: number;
    typeName?: string;
    parcelId?: number;
    parcelName?: string;
    parcelIds?: number[];
    parcelNames?: string[];
    periodId?: number;
    periodName?: string;
    products?: ExportOpProduct[];
}

export interface ExportRow {
    date: string;
    type: string;
    parcels: string;
    period: string;
    duration: string;
    products: string;
}

export interface ExportMeta {
    title: string;
    filename: string;
    sheetName: string;
    generatedAtLabel: string;
    filterSummary: string;
    columns: {
        date: string;
        type: string;
        parcels: string;
        period: string;
        duration: string;
        products: string;
    };
}

export function formatDuration(seconds?: number): string {
    if (!seconds) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export function parcelNamesOf(op: ExportOperation): string[] {
    if (op.parcelNames && op.parcelNames.length > 0) return op.parcelNames;
    return op.parcelName ? [op.parcelName] : [];
}

export function formatProducts(products?: ExportOpProduct[]): string {
    return (products ?? [])
        .filter((p) => p.productName || p.toolName)
        .map((p) => {
            let s = p.productName ?? "";
            if (p.quantity != null) {
                s += `${s ? " — " : ""}${p.quantity}${p.unitValue ? ` ${p.unitValue}` : ""}`;
            }
            if (p.toolName) s += `${s ? " " : ""}(${p.toolName})`;
            return s.trim();
        })
        .filter(Boolean)
        .join("; ");
}

export function buildRows(
    operations: ExportOperation[],
    formatDate: (date?: string) => string,
): ExportRow[] {
    return operations.map((op) => ({
        date: op.date ? formatDate(op.date) : "",
        type: op.typeName ?? "",
        parcels: parcelNamesOf(op).join(", "),
        period: op.periodName ?? "",
        duration: formatDuration(op.durationSeconds),
        products: formatProducts(op.products),
    }));
}

const PAGE_FETCH = 200;

export async function fetchFarmOperations(farmId: number): Promise<ExportOperation[]> {
    const all: ExportOperation[] = [];
    let page = 0;
    for (;;) {
        const res = await apiGet(`/farm/${farmId}/operations?page=${page}&size=${PAGE_FETCH}`);
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        const content: ExportOperation[] = Array.isArray(data) ? data : (data.content ?? []);
        all.push(...content);
        const pm = getPageMeta(data);
        if (Array.isArray(data) || pm.number >= pm.totalPages - 1) break;
        page += 1;
        if (page > 50) break; // safety cap
    }
    return all;
}

export function filterOperations(
    operations: ExportOperation[],
    filters: ParcelSearchFilters,
    matchingParcelIds: string[],
): ExportOperation[] {
    const periodIds = new Set(filters.periodIds.map(String));
    const typeIds = new Set(filters.operationTypeIds.map(String));
    const toolIds = new Set(filters.toolIds.map(String));
    const productIds = new Set(filters.productIds.map(String));
    const matching = new Set(matchingParcelIds.map(String));
    const hasOpFilter = typeIds.size > 0 || toolIds.size > 0 || productIds.size > 0;
    const spatial = filters.useMapArea || filters.usePolygon;
    const start = filters.startDate ? new Date(filters.startDate) : null;
    const end = filters.endDate ? new Date(filters.endDate + "T23:59:59") : null;

    return operations.filter((op) => {
        if (periodIds.size > 0 && !(op.periodId != null && periodIds.has(String(op.periodId)))) return false;
        if (op.date) {
            const d = new Date(op.date);
            if (start && d < start) return false;
            if (end && d > end) return false;
        } else if (start || end) {
            return false;
        }
        if (hasOpFilter) {
            const typeMatch = typeIds.size > 0 && op.typeId != null && typeIds.has(String(op.typeId));
            const toolMatch = toolIds.size > 0 && (op.products ?? []).some(p => p.toolId != null && toolIds.has(String(p.toolId)));
            const productMatch = productIds.size > 0 && (op.products ?? []).some(p => p.productId != null && productIds.has(String(p.productId)));
            if (!(typeMatch || toolMatch || productMatch)) return false;
        }
        if (spatial && matching.size > 0) {
            const opParcels = (op.parcelIds && op.parcelIds.length > 0)
                ? op.parcelIds.map(String)
                : (op.parcelId != null ? [String(op.parcelId)] : []);
            if (!opParcels.some(id => matching.has(id))) return false;
        }
        return true;
    }).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export function buildFilterSummary(filters: ParcelSearchFilters, t: TFn): string {
    const parts: string[] = [];
    if (filters.periodIds.length) parts.push(t("operations.export.sumPeriods", { defaultValue: "Periods: {{count}}", count: filters.periodIds.length }));
    if (filters.operationTypeIds.length) parts.push(t("operations.export.sumTypes", { defaultValue: "Types: {{count}}", count: filters.operationTypeIds.length }));
    if (filters.toolIds.length) parts.push(t("operations.export.sumTools", { defaultValue: "Tools: {{count}}", count: filters.toolIds.length }));
    if (filters.productIds.length) parts.push(t("operations.export.sumProducts", { defaultValue: "Products: {{count}}", count: filters.productIds.length }));
    if (filters.startDate || filters.endDate) parts.push(`${filters.startDate || "…"} → ${filters.endDate || "…"}`);
    if (filters.useMapArea) parts.push(t("operations.export.sumMapArea", { defaultValue: "Map area" }));
    if (filters.usePolygon) parts.push(t("operations.export.sumPolygon", { defaultValue: "Drawn area" }));
    return parts.length ? parts.join(" · ") : t("operations.export.sumNoFilter", { defaultValue: "No filter (all operations)" });
}

function exportColumns(t: TFn): ExportMeta["columns"] {
    return {
        date: t("operations.export.colDate", { defaultValue: "Date" }),
        type: t("operations.export.colType", { defaultValue: "Type" }),
        parcels: t("operations.export.colParcels", { defaultValue: "Parcels" }),
        period: t("operations.export.colPeriod", { defaultValue: "Period" }),
        duration: t("operations.export.colDuration", { defaultValue: "Duration" }),
        products: t("operations.export.colProducts", { defaultValue: "Products" }),
    };
}

export function buildExportMeta(
    filters: ParcelSearchFilters,
    t: TFn,
    formatDate: (date?: string) => string,
): ExportMeta {
    const stamp = new Date().toISOString().slice(0, 10);
    return {
        title: t("operations.export.title", { defaultValue: "Operations report" }),
        filename: `operations-${stamp}`,
        sheetName: t("operations.export.sheetName", { defaultValue: "Operations" }),
        generatedAtLabel: t("operations.export.generatedAt", { defaultValue: "Generated on {{date}}", date: formatDate(new Date().toISOString()) }),
        filterSummary: buildFilterSummary(filters, t),
        columns: exportColumns(t),
    };
}

/**
 * Keeps operations that touch any of the given parcels (e.g. a parcel and its subparcels),
 * optionally restricted to a single period. The only filter is the period — no type/tool/product.
 */
export function filterOperationsForParcels(
    operations: ExportOperation[],
    parcelIds: string[],
    periodId?: string | null,
): ExportOperation[] {
    const ids = new Set(parcelIds.map(String));
    return operations.filter((op) => {
        if (periodId && !(op.periodId != null && String(op.periodId) === String(periodId))) return false;
        const opParcels = (op.parcelIds && op.parcelIds.length > 0)
            ? op.parcelIds.map(String)
            : (op.parcelId != null ? [String(op.parcelId)] : []);
        return opParcels.some((id) => ids.has(id));
    }).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

/** Report chrome for a single-parcel export (parcel + subparcels, optional period). */
export function buildParcelExportMeta(
    t: TFn,
    formatDate: (date?: string) => string,
    opts: { parcelName: string; subparcelCount: number; periodName?: string | null },
): ExportMeta {
    const stamp = new Date().toISOString().slice(0, 10);
    const safeName = opts.parcelName.replace(/[^\w.-]+/g, "_").slice(0, 40) || "parcel";
    const parts = [t("operations.export.sumParcel", { defaultValue: "Parcel: {{name}}", name: opts.parcelName })];
    if (opts.subparcelCount > 0) {
        parts.push(t("operations.export.sumSubparcels", { defaultValue: "+{{count}} subparcel(s)", count: opts.subparcelCount }));
    }
    parts.push(opts.periodName
        ? t("operations.export.sumPeriodName", { defaultValue: "Period: {{name}}", name: opts.periodName })
        : t("operations.export.sumAllPeriods", { defaultValue: "All periods" }));
    return {
        title: t("operations.export.parcelTitle", { defaultValue: "Parcel operations report" }),
        filename: `parcel-${safeName}-${stamp}`,
        sheetName: t("operations.export.sheetName", { defaultValue: "Operations" }),
        generatedAtLabel: t("operations.export.generatedAt", { defaultValue: "Generated on {{date}}", date: formatDate(new Date().toISOString()) }),
        filterSummary: parts.join(" · "),
        columns: exportColumns(t),
    };
}

export function parcelsForSnapshot<T extends { id: string }>(
    operations: ExportOperation[],
    available: T[],
): T[] {
    const byId = new Map(available.map((p) => [String(p.id), p]));
    const referenced = new Set<string>();
    for (const op of operations) {
        const ids = (op.parcelIds && op.parcelIds.length > 0)
            ? op.parcelIds.map(String)
            : (op.parcelId != null ? [String(op.parcelId)] : []);
        ids.forEach((id) => referenced.add(id));
    }
    const picked = [...referenced].map((id) => byId.get(id)).filter(Boolean) as T[];
    return picked.length > 0 ? picked : available;
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

const HEADER_KEYS: (keyof ExportMeta["columns"])[] = [
    "date", "type", "parcels", "period", "duration", "products",
];

export async function exportExcel(rows: ExportRow[], meta: ExportMeta): Promise<void> {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(meta.sheetName);

    ws.mergeCells("A1:F1");
    const titleCell = ws.getCell("A1");
    titleCell.value = meta.title;
    titleCell.font = { bold: true, size: 14 };

    ws.getCell("A2").value = meta.generatedAtLabel;
    ws.getCell("A2").font = { color: { argb: "FF6B7280" }, size: 10 };
    ws.mergeCells("A3:F3");
    ws.getCell("A3").value = meta.filterSummary;
    ws.getCell("A3").font = { color: { argb: "FF6B7280" }, size: 10 };
    ws.getCell("A3").alignment = { wrapText: true };

    const headerRow = ws.getRow(5);
    headerRow.values = HEADER_KEYS.map((k) => meta.columns[k]);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
        cell.alignment = { vertical: "middle" };
    });

    for (const r of rows) {
        ws.addRow([r.date, r.type, r.parcels, r.period, r.duration, r.products]);
    }

    const widths = [20, 22, 26, 18, 12, 50];
    widths.forEach((w, i) => {
        const col = ws.getColumn(i + 1);
        col.width = w;
        col.alignment = { ...col.alignment, wrapText: true, vertical: "top" };
    });

    const buffer = await wb.xlsx.writeBuffer();
    downloadBlob(
        new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `${meta.filename}.xlsx`,
    );
}

export async function exportPdf(
    rows: ExportRow[],
    meta: ExportMeta,
    image: SnapshotResult | null,
): Promise<void> {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(meta.title, margin, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(meta.generatedAtLabel, margin, y);
    y += 14;
    const summaryLines = doc.splitTextToSize(meta.filterSummary, pageW - margin * 2);
    doc.text(summaryLines, margin, y);
    y += summaryLines.length * 12 + 8;
    doc.setTextColor(0);

    if (image) {
        const maxW = pageW - margin * 2;
        const ratio = image.height / image.width;
        let w = maxW;
        let h = w * ratio;
        const maxH = 280;
        if (h > maxH) {
            h = maxH;
            w = h / ratio;
        }
        doc.addImage(image.dataUrl, "PNG", margin, y, w, h);
        y += h + 16;
    }

    autoTable(doc, {
        startY: y,
        head: [HEADER_KEYS.map((k) => meta.columns[k])],
        body: rows.map((r) => [r.date, r.type, r.parcels, r.period, r.duration, r.products]),
        styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak", valign: "top" },
        headStyles: { fillColor: [79, 70, 229], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 250] },
        columnStyles: { 5: { cellWidth: "auto" } },
        margin: { left: margin, right: margin },
    });

    doc.save(`${meta.filename}.pdf`);
}

/**
 * Export every operation of a single parcel — and all of its descendant subparcels — optionally
 * scoped to one period. Shared by the parcel detail page and the manage-parcel modal so both
 * produce identical Excel/PDF reports. The farm parcel list carries `geodata` + `parentParcelId`,
 * which is how we gather the subtree and draw the PDF satellite snapshot.
 */
export async function exportParcelPeriodOperations(opts: {
    kind: "excel" | "pdf";
    farmId: number;
    parcelId: string;
    parcelName: string;
    periodId?: string | null;
    periodName?: string | null;
    t: TFn;
    formatDate: (date?: string) => string;
    fallbackRoot?: { id: string; name: string; geodata?: string | null; color?: string | null; cultureColor?: string | null };
}): Promise<void> {
    const { kind, farmId, parcelId, parcelName, t, formatDate } = opts;
    const periodId = opts.periodId ?? null;

    const res = await apiGet(`/farm/${farmId}/parcels`);
    const all: any[] = res.ok ? await res.json() : [];
    const childrenByParent = new Map<string, any[]>();
    for (const p of all) {
        if (p.parentParcelId == null) continue;
        const parent = String(p.parentParcelId);
        const list = childrenByParent.get(parent) ?? [];
        list.push(p);
        childrenByParent.set(parent, list);
    }
    const subtree: any[] = [];
    const seen = new Set<string>();
    const rootDto = all.find((p) => String(p.id) === String(parcelId));
    const queue: any[] = [rootDto ?? opts.fallbackRoot ?? { id: parcelId, name: parcelName }];
    while (queue.length) {
        const node = queue.shift();
        const nid = String(node.id);
        if (seen.has(nid)) continue;
        seen.add(nid);
        subtree.push(node);
        queue.push(...(childrenByParent.get(nid) ?? []));
    }

    const parcelIds = subtree.map((p) => String(p.id));
    const subparcelCount = parcelIds.length - 1;

    const ops = await fetchFarmOperations(farmId);
    const filtered = filterOperationsForParcels(ops, parcelIds, periodId);
    const meta = buildParcelExportMeta(t, formatDate, {
        parcelName,
        subparcelCount,
        periodName: periodId ? (opts.periodName ?? null) : null,
    });
    const rows = buildRows(filtered, formatDate);

    if (kind === "excel") {
        await exportExcel(rows, meta);
    } else {
        const snapshotParcels: SnapshotParcel[] = subtree.map((p) => ({
            id: String(p.id),
            name: p.name || p.sourceName || `#${p.id}`,
            coords: parseWktCoords(p.geodata),
            color: p.color ?? p.cultureColor ?? null,
        }));
        const image = await renderParcelsSatellite(snapshotParcels);
        await exportPdf(rows, meta, image);
    }
}
