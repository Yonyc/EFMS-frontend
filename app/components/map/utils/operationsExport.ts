import { apiGet, getPageMeta } from "~/utils/api";
import type { ParcelSearchFilters } from "../types";
import type { SnapshotResult } from "./mapSnapshot";

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
        columns: {
            date: t("operations.export.colDate", { defaultValue: "Date" }),
            type: t("operations.export.colType", { defaultValue: "Type" }),
            parcels: t("operations.export.colParcels", { defaultValue: "Parcels" }),
            period: t("operations.export.colPeriod", { defaultValue: "Period" }),
            duration: t("operations.export.colDuration", { defaultValue: "Duration" }),
            products: t("operations.export.colProducts", { defaultValue: "Products" }),
        },
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
