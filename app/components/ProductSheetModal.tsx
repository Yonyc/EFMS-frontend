import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, resolveUploadUrl } from "~/utils/api";
import AttachmentSection, { type AttachmentDto } from "~/components/AttachmentSection";
import { SearchableSelect } from "~/components/map/components/SearchableSelect";

export interface ProductSheetData {
  id: number;
  name: string;
  productTypeId?: number | null;
  unitId?: number | null;
  farmId?: number | null;
  defaultOperationTypeId?: number | null;
  defaultOperationTypeName?: string | null;
  overrideToolId?: number | null;
  overrideToolName?: string | null;
  description?: string | null;
  pictureUrl?: string | null;
  official?: boolean;
  officialCurrent?: boolean | null;
  officialAuthNumber?: string | null;
  officialVersionTag?: string | null;
  officialDecisionCode?: string | null;
  officialDecisionCodeEn?: string | null;
  officialDateFirstAuthorization?: string | null;
  officialDateFrom?: string | null;
  officialDateTo?: string | null;
  officialUserGroupCode?: string | null;
  officialUserGroupEn?: string | null;
  officialFormulationTypeCode?: string | null;
  officialFormulationTypeEn?: string | null;
  officialProductTypeCodes?: string | null;
  officialProductTypeEn?: string | null;
  cultureTypeId?: number | null;
  attachments?: AttachmentDto[];
}

interface RefOption { id: number; label: string }

interface ProductSheetModalProps {
  product: ProductSheetData;
  isAdmin?: boolean;
  canEdit?: boolean;
  productTypes: RefOption[];
  
  seedTypeIds?: number[];
  
  cultureTypes?: RefOption[];
  units: RefOption[];
  operationTypes: RefOption[];
  tools: RefOption[];
  onSave: (updated: Partial<ProductSheetData>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export default function ProductSheetModal({
  product,
  isAdmin,
  canEdit,
  productTypes,
  seedTypeIds = [],
  cultureTypes = [],
  units,
  operationTypes,
  tools,
  onSave,
  onDelete,
  onClose,
}: ProductSheetModalProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [name, setName] = useState(product.name);
  const [productTypeId, setProductTypeId] = useState(product.productTypeId != null ? String(product.productTypeId) : "");
  const [cultureTypeId, setCultureTypeId] = useState(product.cultureTypeId != null ? String(product.cultureTypeId) : "");
  const isSeedType = productTypeId !== "" && seedTypeIds.includes(Number(productTypeId));
  const [unitId, setUnitId] = useState(product.unitId != null ? String(product.unitId) : "");
  const [defaultOpTypeId, setDefaultOpTypeId] = useState(product.defaultOperationTypeId != null ? String(product.defaultOperationTypeId) : "");
  const [overrideToolId, setOverrideToolId] = useState(product.overrideToolId != null ? String(product.overrideToolId) : "");
  const [description, setDescription] = useState(product.description ?? "");
  const [pictureUrl, setPictureUrl] = useState<string | null>(product.pictureUrl ?? null);
  const [pendingPictureFile, setPendingPictureFile] = useState<File | null>(null);
  const pictureInputRef = useRef<HTMLInputElement | null>(null);

  const [attachments, setAttachments] = useState<AttachmentDto[]>(product.attachments ?? []);

  const [officialCurrent, setOfficialCurrent] = useState(product.officialCurrent ?? false);
  const [officialAuthNumber, setOfficialAuthNumber] = useState(product.officialAuthNumber ?? "");
  const [officialVersionTag, setOfficialVersionTag] = useState(product.officialVersionTag ?? "");
  const [officialDecisionCode, setOfficialDecisionCode] = useState(product.officialDecisionCode ?? "");
  const [officialDecisionCodeEn, setOfficialDecisionCodeEn] = useState(product.officialDecisionCodeEn ?? "");
  const [officialDateFirstAuth, setOfficialDateFirstAuth] = useState(product.officialDateFirstAuthorization ?? "");
  const [officialDateFrom, setOfficialDateFrom] = useState(product.officialDateFrom ?? "");
  const [officialDateTo, setOfficialDateTo] = useState(product.officialDateTo ?? "");
  const [officialUserGroupCode, setOfficialUserGroupCode] = useState(product.officialUserGroupCode ?? "");
  const [officialUserGroupEn, setOfficialUserGroupEn] = useState(product.officialUserGroupEn ?? "");
  const [officialFormulationTypeCode, setOfficialFormulationTypeCode] = useState(product.officialFormulationTypeCode ?? "");
  const [officialFormulationTypeEn, setOfficialFormulationTypeEn] = useState(product.officialFormulationTypeEn ?? "");
  const [officialProductTypeCodes, setOfficialProductTypeCodes] = useState(product.officialProductTypeCodes ?? "");
  const [officialProductTypeEn, setOfficialProductTypeEn] = useState(product.officialProductTypeEn ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onSelectPicture = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingPictureFile(file);
    const reader = new FileReader();
    reader.onload = () => setPictureUrl(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let finalPictureUrl: string | null = pendingPictureFile ? (product.pictureUrl ?? null) : pictureUrl;

      if (pendingPictureFile && product.farmId) {
        const formData = new FormData();
        formData.append("file", pendingPictureFile);
        const res = await apiRequest(`/farm/${product.farmId}/products/${product.id}/picture`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          finalPictureUrl = data.pictureUrl;
        }
      }

      const updated: Partial<ProductSheetData> = {
        name: name.trim() || product.name,
        productTypeId: productTypeId ? Number(productTypeId) : null,
        
        cultureTypeId: isSeedType && cultureTypeId ? Number(cultureTypeId) : null,
        unitId: unitId ? Number(unitId) : null,
        defaultOperationTypeId: defaultOpTypeId ? Number(defaultOpTypeId) : null,
        overrideToolId: overrideToolId ? Number(overrideToolId) : null,
        description: description || null,
        pictureUrl: finalPictureUrl || null,
      };
      if (isAdmin && product.official) {
        Object.assign(updated, {
          officialCurrent,
          officialAuthNumber: officialAuthNumber || null,
          officialVersionTag: officialVersionTag || null,
          officialDecisionCode: officialDecisionCode || null,
          officialDecisionCodeEn: officialDecisionCodeEn || null,
          officialDateFirstAuthorization: officialDateFirstAuth || null,
          officialDateFrom: officialDateFrom || null,
          officialDateTo: officialDateTo || null,
          officialUserGroupCode: officialUserGroupCode || null,
          officialUserGroupEn: officialUserGroupEn || null,
          officialFormulationTypeCode: officialFormulationTypeCode || null,
          officialFormulationTypeEn: officialFormulationTypeEn || null,
          officialProductTypeCodes: officialProductTypeCodes || null,
          officialProductTypeEn: officialProductTypeEn || null,
        });
      }
      await onSave(updated);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const editable = canEdit || (isAdmin && product.official);

  const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
  const labelCls = "block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

  return (
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              {product.official
                ? t("productSheet.labelOfficial", { defaultValue: "Official product" })
                : t("productSheet.label", { defaultValue: "Product sheet" })}
            </p>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{product.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Core fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>{t("productSheet.name", { defaultValue: "Name" })}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!editable || saving} className={`mt-1 ${inputCls}`} />
            </div>
            <div>
              <label className={labelCls}>{t("productSheet.category", { defaultValue: "Category" })}</label>
              <select value={productTypeId} onChange={(e) => setProductTypeId(e.target.value)} disabled={!editable || saving} className={`mt-1 ${inputCls}`}>
                <option value="">{t("productSheet.noCategory", { defaultValue: "No category" })}</option>
                {productTypes.map((pt) => <option key={pt.id} value={String(pt.id)}>{pt.label}</option>)}
              </select>
            </div>
            {isSeedType && (
              <div className="sm:col-span-2">
                <label className={labelCls}>{t("productSheet.cultureType", { defaultValue: "Seeded culture" })}</label>
                <SearchableSelect
                  className="mt-1"
                  value={cultureTypeId}
                  onChange={setCultureTypeId}
                  options={[
                    { value: "", label: t("productSheet.noCultureType", { defaultValue: "No culture" }) },
                    ...cultureTypes.map((ct) => ({ value: String(ct.id), label: ct.label })),
                  ]}
                  placeholder={t("productSheet.noCultureType", { defaultValue: "No culture" })}
                  disabled={!editable || saving}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("productSheet.cultureTypeHint", { defaultValue: "Applied to a parcel's period when an operation uses this seed and the period has no culture yet." })}
                </p>
              </div>
            )}
            <div>
              <label className={labelCls}>{t("productSheet.unit", { defaultValue: "Unit" })}</label>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!editable || saving} className={`mt-1 ${inputCls}`}>
                <option value="">{t("productSheet.noUnit", { defaultValue: "No unit" })}</option>
                {units.map((u) => <option key={u.id} value={String(u.id)}>{u.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("productSheet.defaultOpType", { defaultValue: "Default operation type" })}</label>
              <select value={defaultOpTypeId} onChange={(e) => setDefaultOpTypeId(e.target.value)} disabled={!editable || saving} className={`mt-1 ${inputCls}`}>
                <option value="">{t("productSheet.noOpType", { defaultValue: "None" })}</option>
                {operationTypes.map((ot) => <option key={ot.id} value={String(ot.id)}>{ot.label}</option>)}
              </select>
            </div>
            {!product.official && (
              <div className="sm:col-span-2">
                <label className={labelCls}>{t("productSheet.overrideTool", { defaultValue: "Override operation default tool" })}</label>
                <select value={overrideToolId} onChange={(e) => setOverrideToolId(e.target.value)} disabled={!editable || saving} className={`mt-1 ${inputCls}`}>
                  <option value="">{t("productSheet.noOverrideTool", { defaultValue: "Use operation type default" })}</option>
                  {tools.map((tool) => <option key={tool.id} value={String(tool.id)}>{tool.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>{t("productSheet.description", { defaultValue: "Description" })}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!editable || saving}
              rows={3}
              className={`mt-1 ${inputCls} resize-none`}
            />
          </div>

          {/* Picture */}
          <div>
            <label className={labelCls}>{t("productSheet.picture", { defaultValue: "Picture" })}</label>
            <div className="mt-1 flex items-center gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                {pictureUrl ? (
                  <img src={resolveUploadUrl(pictureUrl) ?? pictureUrl} alt="" className="h-full w-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600">
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                    </svg>
                  </div>
                )}
              </div>
              {editable && (
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => pictureInputRef.current?.click()}
                    disabled={saving}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {pictureUrl
                      ? t("productSheet.changePicture", { defaultValue: "Change picture" })
                      : t("productSheet.addPicture", { defaultValue: "Add picture" })}
                  </button>
                  {pictureUrl && (
                    <button
                      type="button"
                      onClick={() => { setPictureUrl(null); setPendingPictureFile(null); }}
                      disabled={saving}
                      className="text-xs font-semibold text-red-500 hover:text-red-400 dark:text-rose-400"
                    >
                      {t("productSheet.removePicture", { defaultValue: "Remove" })}
                    </button>
                  )}
                  <input
                    ref={pictureInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onSelectPicture}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Official fields - shown to everyone read-only, editable only for admin */}
          {product.official && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/30 dark:bg-indigo-950/20">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                {t("productSheet.officialFields", { defaultValue: "Official registry data" })}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {isAdmin && (
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={officialCurrent}
                      onChange={(e) => setOfficialCurrent(e.target.checked)}
                      disabled={saving}
                      className="rounded border-slate-300"
                    />
                    {t("productSheet.officialCurrent", { defaultValue: "Currently authorized" })}
                  </label>
                )}
                {[
                  { label: t("productSheet.officialAuthNumber", { defaultValue: "Auth number" }), val: officialAuthNumber, set: setOfficialAuthNumber },
                  { label: t("productSheet.officialVersionTag", { defaultValue: "Version tag" }), val: officialVersionTag, set: setOfficialVersionTag },
                  { label: t("productSheet.officialDecisionCode", { defaultValue: "Decision code" }), val: officialDecisionCode, set: setOfficialDecisionCode },
                  { label: t("productSheet.officialDecisionCodeEn", { defaultValue: "Decision code (EN)" }), val: officialDecisionCodeEn, set: setOfficialDecisionCodeEn },
                  { label: t("productSheet.officialDateFirstAuth", { defaultValue: "First authorization" }), val: officialDateFirstAuth, set: setOfficialDateFirstAuth },
                  { label: t("productSheet.officialDateFrom", { defaultValue: "Valid from" }), val: officialDateFrom, set: setOfficialDateFrom },
                  { label: t("productSheet.officialDateTo", { defaultValue: "Valid to" }), val: officialDateTo, set: setOfficialDateTo },
                  { label: t("productSheet.officialUserGroupCode", { defaultValue: "User group" }), val: officialUserGroupCode, set: setOfficialUserGroupCode },
                  { label: t("productSheet.officialUserGroupEn", { defaultValue: "User group (EN)" }), val: officialUserGroupEn, set: setOfficialUserGroupEn },
                  { label: t("productSheet.officialFormulationTypeCode", { defaultValue: "Formulation type" }), val: officialFormulationTypeCode, set: setOfficialFormulationTypeCode },
                  { label: t("productSheet.officialFormulationTypeEn", { defaultValue: "Formulation type (EN)" }), val: officialFormulationTypeEn, set: setOfficialFormulationTypeEn },
                ].map(({ label, val, set }) => (
                  <div key={label}>
                    <label className={labelCls}>{label}</label>
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => set(e.target.value)}
                      disabled={!isAdmin || saving}
                      className={`mt-1 ${inputCls}`}
                    />
                  </div>
                ))}
                {[
                  { label: t("productSheet.officialProductTypeCodes", { defaultValue: "Product type codes" }), val: officialProductTypeCodes, set: setOfficialProductTypeCodes },
                  { label: t("productSheet.officialProductTypeEn", { defaultValue: "Product types (EN)" }), val: officialProductTypeEn, set: setOfficialProductTypeEn },
                ].map(({ label, val, set }) => (
                  <div key={label} className="sm:col-span-2">
                    <label className={labelCls}>{label}</label>
                    <textarea
                      value={val}
                      onChange={(e) => set(e.target.value)}
                      disabled={!isAdmin || saving}
                      rows={2}
                      className={`mt-1 ${inputCls} resize-none`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Attachments */}
        {!product.official && product.farmId && (
          <div className="border-t border-slate-200 px-6 py-5 dark:border-slate-800">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("attachments.title", { defaultValue: "Attachments" })}
            </h3>
            <AttachmentSection
              uploadUrl={`/farm/${product.farmId}/products/${product.id}/attachments`}
              deleteUrlPrefix={`/farm/${product.farmId}/attachments`}
              attachments={attachments}
              canEdit={canEdit}
              onAdd={att => setAttachments(prev => [...prev, att])}
              onRemove={id => setAttachments(prev => prev.filter(a => a.id !== id))}
            />
          </div>
        )}

        {/* Footer */}
        {editable && (
          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-800">
            <div>
              {onDelete && !product.official && (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600">{t("productSheet.confirmDelete", { defaultValue: "Sure?" })}</span>
                    <button type="button" onClick={handleDelete} disabled={saving}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60">
                      {t("common.delete", { defaultValue: "Delete" })}
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} disabled={saving}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300">
                      {t("common.cancel", { defaultValue: "Cancel" })}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)}
                    className="text-xs font-semibold text-red-600 hover:text-red-500 dark:text-rose-400">
                    {t("common.delete", { defaultValue: "Delete" })}
                  </button>
                )
              )}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose} disabled={saving}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                {t("common.cancel", { defaultValue: "Cancel" })}
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
                {saving ? t("common.saving", { defaultValue: "Saving…" }) : t("common.save", { defaultValue: "Save" })}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
