import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PaperClipIcon, TrashIcon, ArrowDownTrayIcon, XMarkIcon, PhotoIcon } from "@heroicons/react/24/outline";
import { apiDelete, apiRequest, resolveUploadUrl } from "~/utils/api";

export interface AttachmentDto {
    id: number;
    originalFilename: string;
    url: string;
    mimeType?: string;
    fileSize?: number;
    createdAt?: string;
}

interface Props {
    uploadUrl: string;
    deleteUrlPrefix: string;
    attachments: AttachmentDto[];
    canEdit?: boolean;
    onAdd: (att: AttachmentDto) => void;
    onRemove: (id: number) => void;
}

function formatBytes(bytes?: number) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif"]);

function isImageAttachment(att: AttachmentDto) {
    if (att.mimeType?.startsWith("image/")) return true;
    const ext = att.originalFilename.split(".").pop()?.toLowerCase();
    return ext ? IMAGE_EXTENSIONS.has(ext) : false;
}

export default function AttachmentSection({ uploadUrl, deleteUrlPrefix, attachments, canEdit, onAdd, onRemove }: Props) {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        setError(null);
        for (const file of Array.from(files)) {
            const form = new FormData();
            form.append("file", file);
            try {
                const res = await apiRequest(uploadUrl, { method: "POST", body: form });
                if (res.ok) {
                    const dto: AttachmentDto = await res.json();
                    onAdd(dto);
                } else {
                    setError(t("attachments.uploadFailed", { defaultValue: "Upload failed" }));
                }
            } catch {
                setError(t("attachments.uploadFailed", { defaultValue: "Upload failed" }));
            }
        }
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
    };

    const handleDelete = async (id: number) => {
        try {
            await apiDelete(`${deleteUrlPrefix}/${id}`);
            onRemove(id);
        } catch {
            setError(t("attachments.deleteFailed", { defaultValue: "Delete failed" }));
        }
    };

    return (
        <>
        {lightboxSrc && (
            <div
                className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
                onClick={() => setLightboxSrc(null)}
            >
                <button
                    type="button"
                    onClick={() => setLightboxSrc(null)}
                    className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                >
                    <XMarkIcon className="h-5 w-5" />
                </button>
                <img
                    src={lightboxSrc}
                    alt=""
                    className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                    onClick={e => e.stopPropagation()}
                />
            </div>
        )}

        <div className="space-y-2">
            {attachments.length === 0 && !canEdit && (
                <p className="text-xs text-slate-500 italic">
                    {t("attachments.none", { defaultValue: "No attachments" })}
                </p>
            )}

            {attachments.map(att => {
                const resolvedUrl = resolveUploadUrl(att.url) ?? att.url;
                const isImage = isImageAttachment(att);
                return (
                    <div key={att.id} className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs">
                        {isImage
                            ? <PhotoIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            : <PaperClipIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                        <span className="flex-1 truncate text-slate-200">{att.originalFilename}</span>
                        {att.fileSize != null && (
                            <span className="shrink-0 text-slate-500">{formatBytes(att.fileSize)}</span>
                        )}
                        {isImage && (
                            <button
                                type="button"
                                onClick={() => setLightboxSrc(resolvedUrl)}
                                className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-indigo-300 transition-colors"
                                title={t("attachments.preview", { defaultValue: "Preview" })}
                            >
                                <PhotoIcon className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <a
                            href={resolvedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={att.originalFilename}
                            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-indigo-300 transition-colors"
                            title={t("attachments.download", { defaultValue: "Download" })}
                        >
                            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                        </a>
                        {canEdit && (
                            <button
                                type="button"
                                onClick={() => handleDelete(att.id)}
                                className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-rose-400 transition-colors"
                                title={t("attachments.delete", { defaultValue: "Delete" })}
                            >
                                <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                );
            })}

            {error && <p className="text-xs text-rose-400">{error}</p>}

            {canEdit && (
                <>
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1 rounded border border-dashed border-slate-600 px-2 py-1 text-xs text-slate-400 hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-50 transition-colors w-full justify-center"
                    >
                        <PaperClipIcon className="h-4 w-4" />
                        {uploading
                            ? t("attachments.uploading", { defaultValue: "Uploading…" })
                            : t("attachments.addFile", { defaultValue: "Add attachment" })}
                    </button>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={e => handleFiles(e.target.files)}
                    />
                </>
            )}
        </div>
        </>
    );
}
