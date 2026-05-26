import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, resolveUploadUrl } from "~/utils/api";
import AttachmentSection, { type AttachmentDto } from "~/components/AttachmentSection";

export interface ToolSheetData {
  id: number;
  name: string;
  categoryId?: number | null;
  categoryName?: string | null;
  farmId?: number | null;
  description?: string | null;
  pictureUrl?: string | null;
  attachments?: AttachmentDto[];
}

interface RefOption { id: number; label: string }

interface ToolSheetModalProps {
  tool: ToolSheetData;
  canEdit?: boolean;
  categories: RefOption[];
  onSave: (updated: Partial<ToolSheetData>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export default function ToolSheetModal({
  tool,
  canEdit,
  categories,
  onSave,
  onDelete,
  onClose,
}: ToolSheetModalProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [name, setName] = useState(tool.name);
  const [categoryId, setCategoryId] = useState(tool.categoryId != null ? String(tool.categoryId) : "");
  const [description, setDescription] = useState(tool.description ?? "");
  const [pictureUrl, setPictureUrl] = useState<string | null>(tool.pictureUrl ?? null);
  const [pendingPictureFile, setPendingPictureFile] = useState<File | null>(null);
  const pictureInputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<AttachmentDto[]>(tool.attachments ?? []);

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
      // Base: if no pending file, use the stored server URL (not the local DataURL preview)
      let finalPictureUrl: string | null = pendingPictureFile ? (tool.pictureUrl ?? null) : pictureUrl;

      if (pendingPictureFile && tool.farmId) {
        const formData = new FormData();
        formData.append("file", pendingPictureFile);
        const res = await apiRequest(`/farm/${tool.farmId}/tools/${tool.id}/picture`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          finalPictureUrl = data.pictureUrl;
        }
      }

      await onSave({
        name: name.trim() || tool.name,
        categoryId: categoryId ? Number(categoryId) : null,
        description: description || null,
        pictureUrl: finalPictureUrl || null,
      });
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

  const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
  const labelCls = "block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              {t("toolSheet.label", { defaultValue: "Tool sheet" })}
            </p>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tool.name}</h2>
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
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className={labelCls}>{t("toolSheet.name", { defaultValue: "Name" })}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit || saving} className={`mt-1 ${inputCls}`} />
          </div>
          <div>
            <label className={labelCls}>{t("toolSheet.category", { defaultValue: "Category" })}</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!canEdit || saving} className={`mt-1 ${inputCls}`}>
              <option value="">{t("toolSheet.noCategory", { defaultValue: "No category" })}</option>
              {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t("toolSheet.description", { defaultValue: "Description" })}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit || saving}
              rows={3}
              className={`mt-1 ${inputCls} resize-none`}
            />
          </div>

          {/* Picture */}
          <div>
            <label className={labelCls}>{t("toolSheet.picture", { defaultValue: "Picture" })}</label>
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
              {canEdit && (
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => pictureInputRef.current?.click()}
                    disabled={saving}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {pictureUrl
                      ? t("toolSheet.changePicture", { defaultValue: "Change picture" })
                      : t("toolSheet.addPicture", { defaultValue: "Add picture" })}
                  </button>
                  {pictureUrl && (
                    <button
                      type="button"
                      onClick={() => { setPictureUrl(null); setPendingPictureFile(null); }}
                      disabled={saving}
                      className="text-xs font-semibold text-red-500 hover:text-red-400 dark:text-rose-400"
                    >
                      {t("toolSheet.removePicture", { defaultValue: "Remove" })}
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
        </div>

        {/* Attachments */}
        {tool.farmId && (
          <div className="border-t border-slate-200 px-6 py-5 dark:border-slate-800">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("attachments.title", { defaultValue: "Attachments" })}
            </h3>
            <AttachmentSection
              uploadUrl={`/farm/${tool.farmId}/tools/${tool.id}/attachments`}
              deleteUrlPrefix={`/farm/${tool.farmId}/attachments`}
              attachments={attachments}
              canEdit={canEdit}
              onAdd={att => setAttachments(prev => [...prev, att])}
              onRemove={id => setAttachments(prev => prev.filter(a => a.id !== id))}
            />
          </div>
        )}

        {/* Footer */}
        {canEdit && (
          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-800">
            <div>
              {onDelete && (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600">{t("toolSheet.confirmDelete", { defaultValue: "Sure?" })}</span>
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
