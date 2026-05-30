import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "~/components/ProtectedRoute";
import { useFarm } from "~/contexts/FarmContext";
import { apiGet, apiPost, apiPut, apiDelete, getPageMeta } from "~/utils/api";
import { useDateTimeFormatter } from "~/utils/datetime";
import AttachmentSection from "~/components/AttachmentSection";
import type { AttachmentDto } from "~/components/AttachmentSection";
import { SearchableSelect } from "~/components/map/components/SearchableSelect";
import type { SelectOption } from "~/components/map/components/SearchableSelect";

interface ParcelSummary { id: number; name: string; }
interface OpTypeDto { id: number; name: string; }
interface UnitDto { id: number; value: string; }
interface ProductDto {
  id: number; name: string; official?: boolean;
  officialAuthNumber?: string; officialSaleTo?: string; officialUseToleratedTo?: string;
  unitId?: number; defaultOperationTypeId?: number;
}
interface ToolDto { id: number; name: string; }
interface OperationProductDto {
  id: number; quantity?: number; productId?: number; productName?: string;
  unitId?: number; unitValue?: string; toolId?: number; toolName?: string;
}
interface ParcelOperationDto {
  id: number; date?: string; durationSeconds?: number;
  typeId?: number; typeName?: string;
  parcelId?: number; parcelName?: string;
  parcelIds?: number[]; parcelNames?: string[];
  periodId?: number; periodName?: string;
  products?: OperationProductDto[];
  attachments?: AttachmentDto[];
}
interface LineState { productId: string; quantity: string; unitId: string; toolId: string; }

const PAGE_SIZE = 20;
const RES_SIZE = 30;

const nowForInput = () => {
  const d = new Date(); d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function formatDuration(s?: number) {
  if (!s) return null;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function formatDate(str?: string) {
  if (!str) return "";
  return new Date(str).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

interface AddModalProps {
  farmId: number;
  parcels: ParcelSummary[];
  onSaved: () => void;
  onClose: () => void;
  /** When set, the modal edits this operation instead of creating a new one. */
  editOp?: ParcelOperationDto;
}

/** Convert an ISO datetime to the local "YYYY-MM-DDTHH:mm" expected by datetime-local inputs. */
const toLocalInput = (iso?: string): string => {
  if (!iso) return nowForInput();
  const d = new Date(iso);
  if (isNaN(d.getTime())) return nowForInput();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function AddOperationModal({ farmId, parcels, onSaved, onClose, editOp }: AddModalProps) {
  const { t } = useTranslation();
  const isEdit = !!editOp;

  const [parcelIds, setParcelIds] = useState<string[]>(
    editOp
      ? (editOp.parcelIds && editOp.parcelIds.length > 0
          ? editOp.parcelIds.map(String)
          : (editOp.parcelId != null ? [String(editOp.parcelId)] : []))
      : []
  );
  const [typeId, setTypeId] = useState(editOp?.typeId != null ? String(editOp.typeId) : "");
  const [date, setDate] = useState(editOp ? toLocalInput(editOp.date) : nowForInput);
  const [durationMinutes, setDurationMinutes] = useState(editOp?.durationSeconds != null ? String(Math.round(editOp.durationSeconds / 60)) : "");
  const [lines, setLines] = useState<LineState[]>(
    editOp && editOp.products && editOp.products.length > 0
      ? editOp.products.map(p => ({
          productId: p.productId != null ? String(p.productId) : "",
          quantity: p.quantity != null ? String(p.quantity) : "",
          unitId: p.unitId != null ? String(p.unitId) : "",
          toolId: p.toolId != null ? String(p.toolId) : "",
        }))
      : [{ productId: "", quantity: "", unitId: "", toolId: "" }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [units, setUnits] = useState<UnitDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [productHasMore, setProductHasMore] = useState(false);
  const [productLoading, setProductLoading] = useState(false);
  const productPageRef = useRef(-1);
  const [tools, setTools] = useState<ToolDto[]>([]);
  const [toolHasMore, setToolHasMore] = useState(false);
  const [toolLoading, setToolLoading] = useState(false);
  const toolPageRef = useRef(-1);
  const [opTypes, setOpTypes] = useState<OpTypeDto[]>([]);
  const [opTypeHasMore, setOpTypeHasMore] = useState(false);
  const [opTypeLoading, setOpTypeLoading] = useState(false);
  const opTypePageRef = useRef(-1);

  const fetchProducts = useCallback(async (page: number) => {
    setProductLoading(true);
    try {
      const r = await apiGet(`/farm/${farmId}/products?page=${page}&size=${RES_SIZE}&includeOfficial=true`);
      if (r.ok) {
        const data = await r.json(); const pm = getPageMeta(data);
        setProducts(prev => page === 0 ? (data.content ?? []) : [...prev, ...(data.content ?? [])]);
        productPageRef.current = pm.number; setProductHasMore(pm.number < pm.totalPages - 1);
      }
    } finally { setProductLoading(false); }
  }, [farmId]);

  const fetchTools = useCallback(async (page: number) => {
    setToolLoading(true);
    try {
      const r = await apiGet(`/farm/${farmId}/tools?page=${page}&size=${RES_SIZE}`);
      if (r.ok) {
        const data = await r.json(); const pm = getPageMeta(data);
        setTools(prev => page === 0 ? (data.content ?? []) : [...prev, ...(data.content ?? [])]);
        toolPageRef.current = pm.number; setToolHasMore(pm.number < pm.totalPages - 1);
      }
    } finally { setToolLoading(false); }
  }, [farmId]);

  const fetchOpTypes = useCallback(async (page: number) => {
    setOpTypeLoading(true);
    try {
      const r = await apiGet(`/operations/types?farmId=${farmId}&page=${page}&size=${RES_SIZE}`);
      if (r.ok) {
        const data = await r.json(); const pm = getPageMeta(data);
        setOpTypes(prev => page === 0 ? (data.content ?? []) : [...prev, ...(data.content ?? [])]);
        opTypePageRef.current = pm.number; setOpTypeHasMore(pm.number < pm.totalPages - 1);
      }
    } finally { setOpTypeLoading(false); }
  }, [farmId]);

  useEffect(() => {
    apiGet(`/units?farmId=${farmId}`).then(r => { if (r.ok) r.json().then(setUnits); });
    fetchProducts(0); fetchTools(0); fetchOpTypes(0);
  }, [farmId, fetchProducts, fetchTools, fetchOpTypes]);

  const updateLine = (i: number, key: keyof LineState, val: string) => {
    setLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l;
      const up = { ...l, [key]: val };
      if (key === "productId") {
        const p = val ? products.find(p => String(p.id) === val) : null;
        up.unitId = p?.unitId ? String(p.unitId) : "";
      }
      return up;
    }));
    if (key === "productId" && val && !typeId) {
      const p = products.find(p => String(p.id) === val);
      if (p?.defaultOperationTypeId) setTypeId(String(p.defaultOperationTypeId));
    }
  };

  const handleSave = async () => {
    if (parcelIds.length === 0) { setError(t("operations.selectParcel", { defaultValue: "Select a parcel" })); return; }
    setSaving(true); setError(null);
    try {
      let primaryParcelId = parcelIds[0];
      if (isEdit) {
        const originalIds = editOp!.parcelIds && editOp!.parcelIds.length > 0
          ? editOp!.parcelIds.map(String)
          : (editOp!.parcelId != null ? [String(editOp!.parcelId)] : []);
        const stillLinked = parcelIds.find(id => originalIds.includes(id));
        if (stillLinked) primaryParcelId = stillLinked;
      }
      const payload = {
        typeId: typeId ? Number(typeId) : undefined,
        date: date ? date + ":00" : undefined,
        durationSeconds: durationMinutes ? Number(durationMinutes) * 60 : undefined,
        parcelIds: parcelIds.map(Number),
        products: lines.filter(l => l.productId).map(l => ({
          productId: Number(l.productId),
          quantity: l.quantity ? Number(l.quantity) : undefined,
          unitId: l.unitId ? Number(l.unitId) : undefined,
          toolId: l.toolId ? Number(l.toolId) : undefined,
        })),
      };
      const res = isEdit
        ? await apiPut(`/farm/${farmId}/parcels/${primaryParcelId}/operations/${editOp!.id}`, payload)
        : await apiPost(`/farm/${farmId}/parcels/${primaryParcelId}/operations`, payload);
      if (!res.ok) throw new Error("failed");
      onSaved(); onClose();
    } catch {
      setError(t("operations.errorCreate", { defaultValue: "Failed to save operation" }));
    } finally { setSaving(false); }
  };

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const parcelOpts: SelectOption[] = parcels.map(p => ({ value: String(p.id), label: p.name }));
  const availableParcelOpts: SelectOption[] = parcelOpts.filter(o => !parcelIds.includes(o.value));
  const opTypeOpts: SelectOption[] = opTypes.map(t => ({ value: String(t.id), label: t.name }));
  const productOpts: SelectOption[] = products.map(p => ({
    value: String(p.id),
    label: p.official ? `★ ${p.name}${p.officialAuthNumber ? ` (${p.officialAuthNumber})` : ""}` : p.name,
  }));
  const toolOpts: SelectOption[] = tools.map(t => ({ value: String(t.id), label: t.name }));
  const unitOpts: SelectOption[] = units.map(u => ({ value: String(u.id), label: u.value }));

  const inputCls = "w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none disabled:opacity-50";
  const labelCls = "block text-xs font-semibold uppercase tracking-wide text-slate-400";

  return (
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/60 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold text-white">
            {isEdit
              ? t("operations.editModal.title", { defaultValue: "Edit operation" })
              : t("operations.addModal.title", { defaultValue: "New operation" })}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-300">{error}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>{t("operations.selectParcels", { defaultValue: "Parcels" })} *</label>
              {parcelIds.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {parcelIds.map(id => {
                    const name = parcels.find(p => String(p.id) === id)?.name ?? id;
                    return (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-200">
                        {name}
                        <button
                          type="button"
                          onClick={() => setParcelIds(prev => prev.filter(x => x !== id))}
                          className="text-indigo-300 hover:text-white"
                          aria-label={t("common.remove", { defaultValue: "Remove" })}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <SearchableSelect
                value="" onChange={v => { if (v && !parcelIds.includes(v)) setParcelIds(prev => [...prev, v]); }}
                options={availableParcelOpts}
                placeholder={t("operations.addParcel", { defaultValue: "Add a parcel…" })}
                className="mt-1.5"
              />
            </div>
            <div>
              <label className={labelCls}>{t("operations.selectType", { defaultValue: "Type" })}</label>
              <SearchableSelect
                value={typeId} onChange={setTypeId} options={opTypeOpts}
                placeholder={t("operations.selectTypePlaceholder", { defaultValue: "Select type…" })}
                className="mt-1"
                hasMore={opTypeHasMore} loading={opTypeLoading}
                onLoadMore={() => { if (!opTypeHasMore || opTypeLoading) return; void fetchOpTypes(opTypePageRef.current + 1); }}
              />
            </div>
            <div>
              <label className={labelCls}>{t("operations.dateLabel", { defaultValue: "Date" })}</label>
              <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} className={`mt-1 ${inputCls}`} />
            </div>
            <div>
              <label className={labelCls}>{t("operations.durationLabel", { defaultValue: "Duration (min)" })}</label>
              <input type="number" min="0" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} placeholder="0" className={`mt-1 ${inputCls}`} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className={labelCls}>{t("operations.products", { defaultValue: "Products & Tools" })}</span>
              <button
                type="button"
                onClick={() => setLines(prev => [...prev, { productId: "", quantity: "", unitId: "", toolId: "" }])}
                className="rounded border border-white/10 px-2 py-0.5 text-xs text-slate-400 hover:bg-white/5 hover:text-white"
              >
                + {t("operations.addLine", { defaultValue: "Add line" })}
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                  <SearchableSelect
                    value={line.productId} onChange={v => updateLine(idx, "productId", v)}
                    options={productOpts} placeholder={t("operations.product", { defaultValue: "Product" })}
                    hasMore={productHasMore} loading={productLoading}
                    onLoadMore={() => { if (!productHasMore || productLoading) return; void fetchProducts(productPageRef.current + 1); }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number" min="0" value={line.quantity}
                      onChange={e => updateLine(idx, "quantity", e.target.value)}
                      placeholder={t("operations.qty", { defaultValue: "Qty" })}
                      className={inputCls}
                    />
                    <SearchableSelect
                      value={line.unitId} onChange={v => updateLine(idx, "unitId", v)}
                      options={unitOpts} placeholder={t("operations.unit", { defaultValue: "Unit" })}
                    />
                  </div>
                  <SearchableSelect
                    value={line.toolId} onChange={v => updateLine(idx, "toolId", v)}
                    options={toolOpts} placeholder={t("operations.tool", { defaultValue: "Tool" })}
                    hasMore={toolHasMore} loading={toolLoading}
                    onLoadMore={() => { if (!toolHasMore || toolLoading) return; void fetchTools(toolPageRef.current + 1); }}
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                      className="text-xs text-rose-400 hover:text-rose-300"
                    >
                      {t("common.remove", { defaultValue: "Remove" })}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50">
            {t("common.cancel", { defaultValue: "Cancel" })}
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
            {saving ? t("common.saving", { defaultValue: "Saving…" }) : t("common.save", { defaultValue: "Save" })}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CardProps { op: ParcelOperationDto; farmId: string; onEdit?: (op: ParcelOperationDto) => void; onDelete?: (op: ParcelOperationDto) => void; }

function OperationCard({ op, farmId, onEdit, onDelete }: CardProps) {
  const { t } = useTranslation();
  const { formatDateTime } = useDateTimeFormatter();
  const [expanded, setExpanded] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentDto[]>(op.attachments ?? []);
  const canEdit = !!(op.parcelIds?.length || op.parcelId);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow shadow-black/20">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">
              {op.typeName ?? t("operations.selectTypePlaceholder", { defaultValue: "No type" })}
            </span>
            {(op.parcelNames && op.parcelNames.length > 0 ? op.parcelNames : op.parcelName ? [op.parcelName] : []).map((name, i) => (
              <span key={i} className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-300">
                {name}
              </span>
            ))}
            {op.periodName && (
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-300">
                {op.periodName}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">{formatDateTime(op.date)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {op.durationSeconds != null && (
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-300">
              {formatDuration(op.durationSeconds)}
            </span>
          )}
          {op.products && op.products.length > 0 && (
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-500">
              {op.products.length}×
            </span>
          )}
          <svg
            className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-white/5 px-5 py-4">
          {canEdit && (onEdit || onDelete) && (
            <div className="flex items-center justify-end gap-2">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(op)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10"
                >
                  {t("common.edit", { defaultValue: "Edit" })}
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(op)}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20"
                >
                  {t("common.delete", { defaultValue: "Delete" })}
                </button>
              )}
            </div>
          )}
          {op.products && op.products.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("operations.products", { defaultValue: "Products & Tools" })}
              </p>
              <ul className="space-y-1.5">
                {op.products.map(p => (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs">
                    <span className="text-slate-200">
                      {p.productName}
                      {p.quantity != null && (
                        <span className="ml-2 text-slate-400">
                          {p.quantity}{p.unitValue ? ` ${p.unitValue}` : ""}
                        </span>
                      )}
                    </span>
                    {p.toolName && (
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-slate-300">{p.toolName}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("attachments.title", { defaultValue: "Attachments" })}
            </p>
            <AttachmentSection
              uploadUrl={(() => {
                const pid = op.parcelIds?.[0] ?? op.parcelId;
                return pid ? `/farm/${farmId}/parcels/${pid}/operations/${op.id}/attachments` : "";
              })()}
              deleteUrlPrefix={`/farm/${farmId}/attachments`}
              attachments={attachments}
              canEdit={!!(op.parcelIds?.length || op.parcelId)}
              onAdd={att => setAttachments(prev => [...prev, att])}
              onRemove={id => setAttachments(prev => prev.filter(a => a.id !== id))}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function meta() {
  return [{ title: "Operations - EFMS" }];
}

export default function OperationsPage() {
  const { selectedFarm } = useFarm();
  const { t } = useTranslation();
  const farmId = selectedFarm?.id;

  const [parcels, setParcels] = useState<ParcelSummary[]>([]);
  const [filterOpTypes, setFilterOpTypes] = useState<OpTypeDto[]>([]);

  const [filterParcelId, setFilterParcelId] = useState("");
  const [filterTypeId, setFilterTypeId] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const [operations, setOperations] = useState<ParcelOperationDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(0);
  const hasMoreRef = useRef(false);
  const loadingRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [editOp, setEditOp] = useState<ParcelOperationDto | null>(null);

  const handleDeleteOperation = useCallback(async (op: ParcelOperationDto) => {
    if (!farmId) return;
    const pid = op.parcelIds?.[0] ?? op.parcelId;
    if (!pid) return;
    if (!confirm(t("operations.deleteConfirm", { defaultValue: "Delete this operation?" }))) return;
    try {
      const res = await apiDelete(`/farm/${farmId}/parcels/${pid}/operations/${op.id}`);
      if (res.ok) setOperations(prev => prev.filter(o => o.id !== op.id));
    } catch (err) {
      console.error("Failed to delete operation", err);
    }
  }, [farmId, t]);

  useEffect(() => {
    if (!farmId) return;
    apiGet(`/farm/${farmId}/parcels`).then(r => { if (r.ok) r.json().then(setParcels); });
    apiGet(`/operations/types?farmId=${farmId}`).then(r => { if (r.ok) r.json().then(setFilterOpTypes); });
  }, [farmId]);

  const fetchOperations = useCallback(async (page: number) => {
    if (!farmId) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
      if (filterParcelId) params.set("parcelId", filterParcelId);
      if (filterTypeId) params.set("typeId", filterTypeId);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom + ":00");
      if (filterDateTo) params.set("dateTo", filterDateTo + ":59");
      const r = await apiGet(`/farm/${farmId}/operations?${params}`);
      if (!r.ok) return;
      const data = await r.json();
      const pm = getPageMeta(data);
      setOperations(prev => page === 0 ? (data.content ?? []) : [...prev, ...(data.content ?? [])]);
      pageRef.current = pm.number;
      const more = pm.number < pm.totalPages - 1;
      hasMoreRef.current = more;
      setHasMore(more);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [farmId, filterParcelId, filterTypeId, filterDateFrom, filterDateTo]);

  useEffect(() => {
    pageRef.current = 0;
    hasMoreRef.current = false;
    setOperations([]);
    void fetchOperations(0);
  }, [fetchOperations]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!hasMoreRef.current || loadingRef.current) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
        void fetchOperations(pageRef.current + 1);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [fetchOperations]);

  const parcelOpts: SelectOption[] = [
    { value: "", label: t("common.all", { defaultValue: "All" }) },
    ...parcels.map(p => ({ value: String(p.id), label: p.name })),
  ];
  const opTypeOpts: SelectOption[] = [
    { value: "", label: t("common.all", { defaultValue: "All" }) },
    ...filterOpTypes.map(t => ({ value: String(t.id), label: t.name })),
  ];

  const hasFilters = !!(filterParcelId || filterTypeId || filterDateFrom || filterDateTo);
  const inputCls = "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none";

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 px-4 py-10 text-slate-50">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">

          <header className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">
                {t("operations.title")}
              </p>
              <h1 className="text-3xl font-semibold text-white">{t("operations.subtitle")}</h1>
            </div>
            {farmId && selectedFarm?.canEdit !== false && (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {t("operations.addOperation", { defaultValue: "New operation" })}
              </button>
            )}
          </header>

          {!farmId ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
              {t("farmSelector.selectFarm")}
            </div>
          ) : (
            <>
              {/* Filter bar */}
              <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex min-w-[150px] flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t("operations.filterParcel", { defaultValue: "Parcel" })}
                  </label>
                  <SearchableSelect
                    value={filterParcelId} onChange={setFilterParcelId}
                    options={parcelOpts} placeholder={t("common.all", { defaultValue: "All" })}
                  />
                </div>
                <div className="flex min-w-[150px] flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t("operations.filterType", { defaultValue: "Type" })}
                  </label>
                  <SearchableSelect
                    value={filterTypeId} onChange={setFilterTypeId}
                    options={opTypeOpts} placeholder={t("common.all", { defaultValue: "All" })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t("operations.filterFrom", { defaultValue: "From" })}
                  </label>
                  <input
                    type="datetime-local" value={filterDateFrom}
                    onChange={e => setFilterDateFrom(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t("operations.filterTo", { defaultValue: "To" })}
                  </label>
                  <input
                    type="datetime-local" value={filterDateTo}
                    onChange={e => setFilterDateTo(e.target.value)}
                    className={inputCls}
                  />
                </div>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={() => { setFilterParcelId(""); setFilterTypeId(""); setFilterDateFrom(""); setFilterDateTo(""); }}
                    className="self-end rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    {t("common.clearFilters", { defaultValue: "Clear filters" })}
                  </button>
                )}
              </div>

              {/* Scrollable list */}
              <div
                ref={listRef}
                className="overflow-y-auto pr-1"
                style={{ maxHeight: "calc(100vh - 280px)" }}
              >
              <div className="flex flex-col gap-3">
                {loading && operations.length === 0 && [0, 1, 2].map(i => (
                  <div key={i} className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="h-3.5 w-36 rounded bg-white/10" />
                        <div className="h-2.5 w-24 rounded bg-white/5" />
                      </div>
                      <div className="h-6 w-14 rounded-full bg-white/10" />
                    </div>
                  </div>
                ))}

                {!loading && operations.length === 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-sm text-slate-400">
                    {t("operations.emptyHistory", { defaultValue: "No operations found." })}
                  </div>
                )}

                {operations.map(op => (
                  <OperationCard key={op.id} op={op} farmId={String(farmId)} onEdit={setEditOp} onDelete={handleDeleteOperation} />
                ))}

                {loading && operations.length > 0 && (
                  <div className="flex justify-center py-4">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                  </div>
                )}

                {!hasMore && operations.length > 0 && (
                  <p className="py-3 text-center text-xs text-slate-600">
                    {t("operations.allLoaded", { defaultValue: "All operations loaded" })}
                  </p>
                )}
              </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showAdd && farmId && (
        <AddOperationModal
          farmId={Number(farmId)}
          parcels={parcels}
          onSaved={() => { setOperations([]); void fetchOperations(0); }}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editOp && farmId && (
        <AddOperationModal
          farmId={Number(farmId)}
          parcels={parcels}
          editOp={editOp}
          onSaved={() => { setOperations([]); void fetchOperations(0); }}
          onClose={() => setEditOp(null)}
        />
      )}
    </ProtectedRoute>
  );
}
