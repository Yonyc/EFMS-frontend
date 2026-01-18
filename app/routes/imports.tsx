import { useEffect, useState, useCallback, useRef } from "react";
import type { ChangeEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "~/components/ProtectedRoute";
import { apiGet, apiRequest } from "~/utils/api";
import { useCurrentLocale } from "~/hooks/useCurrentLocale";
import { buildLocalizedPath } from "~/utils/locale";

interface ImportGroup {
    id: string | number;
    name?: string;
    filename?: string;
    createdAt?: string;
    polygonsCount?: number;
    status?: string;
    sourceName?: string;
}

export default function ImportsPage() {
    const { t } = useTranslation();
    const locale = useCurrentLocale();
    const [groups, setGroups] = useState<ImportGroup[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadFeedback, setUploadFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [busyImportId, setBusyImportId] = useState<string | number | null>(null);

    const loadImports = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await apiGet("/imports");
            if (!response.ok) {
                throw new Error(`Failed to fetch imports: ${response.statusText}`);
            }
            const payload = await response.json();
            const list = Array.isArray(payload?.imports) ? payload.imports : Array.isArray(payload) ? payload : [];
            setGroups(list);
            setError(null);
        } catch (err) {
            console.error(err);
            setError(t('imports.list.error', { defaultValue: 'Unable to load import lists' }));
        } finally {
            setIsLoading(false);
        }
    }, [t]);

    useEffect(() => {
        loadImports();
    }, [loadImports]);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        setUploadFeedback(null);
        setActionFeedback(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await apiRequest('/imports/upload', {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                throw new Error('Upload failed');
            }
            setUploadFeedback({ type: 'success', message: t('imports.upload.success', { defaultValue: 'Upload complete. Processing import…' }) });
            await loadImports();
        } catch (err) {
            console.error(err);
            setUploadFeedback({ type: 'error', message: t('imports.upload.error', { defaultValue: 'Upload failed. Please try again.' }) });
        } finally {
            setIsUploading(false);
            event.target.value = '';
        }
    }, [loadImports, t]);

    const handleRename = useCallback(async (group: ImportGroup) => {
        const initial = group.name || group.filename || '';
        const newName = window.prompt(t('imports.rename.prompt', { defaultValue: 'Enter a new name for this import list:' }), initial);
        if (newName === null) return;
        const trimmed = newName.trim();
        if (!trimmed) {
            setActionFeedback({ type: 'error', message: t('imports.rename.empty', { defaultValue: 'Name cannot be empty.' }) });
            return;
        }
        setBusyImportId(group.id);
        setActionFeedback(null);
        try {
            const response = await apiRequest(`/imports/${group.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: trimmed }),
            });
            if (!response.ok) {
                throw new Error('Rename failed');
            }
            await loadImports();
            setActionFeedback({ type: 'success', message: t('imports.rename.success', { defaultValue: 'Import list renamed.' }) });
        } catch (err) {
            console.error(err);
            setActionFeedback({ type: 'error', message: t('imports.rename.error', { defaultValue: 'Unable to rename this import.' }) });
        } finally {
            setBusyImportId(null);
        }
    }, [loadImports, t]);

    const handleDelete = useCallback(async (group: ImportGroup) => {
        const confirmed = window.confirm(t('imports.delete.confirm', { defaultValue: 'Delete this import list? This cannot be undone.' }));
        if (!confirmed) return;
        setBusyImportId(group.id);
        setActionFeedback(null);
        try {
            const response = await apiRequest(`/imports/${group.id}`, { method: 'DELETE' });
            if (!response.ok) {
                throw new Error('Delete failed');
            }
            await loadImports();
            setActionFeedback({ type: 'success', message: t('imports.delete.success', { defaultValue: 'Import list deleted.' }) });
        } catch (err) {
            console.error(err);
            setActionFeedback({ type: 'error', message: t('imports.delete.error', { defaultValue: 'Unable to delete this import.' }) });
        } finally {
            setBusyImportId(null);
        }
    }, [loadImports, t]);

    const renderBody = () => {
        if (isLoading) {
            return (
                <div className="flex h-64 items-center justify-center text-gray-500">
                    {t('imports.list.loading', { defaultValue: 'Loading imports...' })}
                </div>
            );
        }

        if (error) {
            return (
                <div className="rounded-xl border border-red-200 bg-red-50/70 px-6 py-4 text-red-700">
                    {error}
                </div>
            );
        }

        if (!groups.length) {
            return (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center text-slate-500">
                    {t('imports.list.empty', { defaultValue: 'No import batches found yet.' })}
                </div>
            );
        }

        return (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {groups.map((group) => (
                    <div key={group.id} className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-xs uppercase tracking-wide text-slate-400">
                                    {t('imports.list.createdAt', { defaultValue: 'Created on {{date}}', date: group.createdAt ? new Date(group.createdAt).toLocaleDateString() : '—' })}
                                </p>
                                <h3 className="mt-1 truncate text-lg font-semibold text-slate-900">{group.name || group.filename || t('imports.list.untitled', { defaultValue: 'Untitled batch' })}</h3>
                            </div>
                            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                                {t(`imports.status.${group.status || 'pending'}` as const, { defaultValue: group.status || 'Pending' })}
                            </span>
                        </div>
                        <dl className="mt-4 space-y-2 text-sm text-slate-500">
                            <div className="flex justify-between">
                                <dt>{t('imports.list.polygons', { defaultValue: 'Polygons' })}</dt>
                                <dd className="font-semibold text-slate-900">{group.polygonsCount ?? '—'}</dd>
                            </div>
                            {group.sourceName && (
                                <div className="flex justify-between">
                                    <dt>{t('imports.list.source', { defaultValue: 'Source' })}</dt>
                                    <dd className="font-semibold text-slate-900">{group.sourceName}</dd>
                                </div>
                            )}
                        </dl>
                        <div className="mt-6 space-y-2">
                            <Link
                                to={buildLocalizedPath(locale, `/imports/map?list=${group.id}`)}
                                className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-500"
                            >
                                {t('imports.list.open', { defaultValue: 'Open for validation' })}
                            </Link>
                            <div className="flex gap-2 text-sm">
                                <button
                                    type="button"
                                    onClick={() => handleRename(group)}
                                    disabled={busyImportId === group.id}
                                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {t('imports.list.rename', { defaultValue: 'Rename' })}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(group)}
                                    disabled={busyImportId === group.id}
                                    className="flex-1 rounded-lg border border-red-200 px-3 py-2 font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {t('imports.list.delete', { defaultValue: 'Delete' })}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <ProtectedRoute>
            <div className="mx-auto max-w-6xl px-4 py-10">
                <div className="mb-8">
                    <p className="text-sm uppercase tracking-wide text-indigo-600">{t('imports.title', { defaultValue: 'Import lists' })}</p>
                    <h1 className="text-3xl font-bold text-slate-900">{t('imports.subtitle', { defaultValue: 'Validate your upcoming imports' })}</h1>
                    <p className="mt-2 text-slate-500">{t('imports.description', { defaultValue: 'Select a batch to review its polygons before applying it to your farm.' })}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={handleUploadClick}
                            disabled={isUploading}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow transition ${isUploading ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                        >
                            {isUploading ? t('imports.upload.uploading', { defaultValue: 'Uploading…' }) : t('imports.upload.button', { defaultValue: 'Upload ZIP' })}
                        </button>
                        <span className="text-sm text-slate-500">
                            {t('imports.upload.helper', { defaultValue: 'Upload a ZIP export to create a new import list.' })}
                        </span>
                        {(uploadFeedback || actionFeedback) && (
                            <span className={`text-sm font-medium ${((uploadFeedback || actionFeedback)?.type === 'success') ? 'text-emerald-600' : 'text-red-600'}`}>
                                {(uploadFeedback || actionFeedback)?.message}
                            </span>
                        )}
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".zip"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                </div>
                {renderBody()}
            </div>
        </ProtectedRoute>
    );
}
