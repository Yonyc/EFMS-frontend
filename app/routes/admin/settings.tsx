import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost } from "~/utils/api";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";

interface PhytoImportResult {
    versionTag?: string;
    filePath?: string;
    created: number;
    updated: number;
    skipped: number;
    total: number;
    importedAt?: string;
}

export default function AdminSettings() {
    const { t } = useTranslation();
    const [settings, setSettings] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [phytoFilePath, setPhytoFilePath] = useState("");
    const [phytoVersionTag, setPhytoVersionTag] = useState("");
    const [phytoImporting, setPhytoImporting] = useState(false);
    const [phytoResult, setPhytoResult] = useState<PhytoImportResult | null>(null);
    const [phytoError, setPhytoError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiGet("/admin/settings");
            if (res.ok) {
                setSettings(await res.json());
            }
        } catch (error) {
            console.error("Failed to load settings", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await apiPost("/admin/settings", settings);
            if (res.ok) {
                alert("Settings saved successfully.");
                setSettings(await res.json());
            } else {
                alert("Failed to save settings.");
            }
        } catch (error) {
            alert("Failed to save settings.");
        } finally {
            setSaving(false);
        }
    };

    const handlePhytoImport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!phytoFilePath.trim()) {
            setPhytoError(t("admin.settings.phytoPathRequired", { defaultValue: "File path is required." }));
            return;
        }
        setPhytoImporting(true);
        setPhytoError(null);
        setPhytoResult(null);
        try {
            const res = await apiPost("/admin/phyto/import", {
                filePath: phytoFilePath.trim(),
                versionTag: phytoVersionTag.trim() || undefined,
            });
            if (!res.ok) {
                throw new Error("import_failed");
            }
            const data: PhytoImportResult = await res.json();
            setPhytoResult(data);
        } catch (error) {
            console.error("Failed to import PHYTO products", error);
            setPhytoError(t("admin.settings.phytoImportError", { defaultValue: "Failed to import PHYTO file." }));
        } finally {
            setPhytoImporting(false);
        }
    };

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <h2 className="text-2xl font-extrabold text-slate-100">{t('admin.settings.title', { defaultValue: 'Global Settings' })}</h2>
            </div>

            {loading ? (
                <div className="text-slate-400 p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl">
                    {t('admin.settings.loading', { defaultValue: 'Loading settings...' })}
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/20">
                        <div className="flex items-center gap-3 mb-8 pb-6 border-b border-slate-800">
                            <div className="p-3 bg-indigo-500/10 rounded-xl">
                                <Cog6ToothIcon className="w-6 h-6 text-indigo-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-100">
                                    {t('admin.settings.subtitle', { defaultValue: 'System Preferences' })}
                                </h3>
                                <p className="text-sm text-slate-400">
                                    {t('admin.settings.subtitleDesc', { defaultValue: 'Manage global access and verification requirements.' })}
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleSave} className="space-y-8">
                            <div className="space-y-4">
                                <label className="flex items-start gap-4 p-4 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950 transition-colors cursor-pointer group">
                                    <div className="pt-1">
                                        <input 
                                            type="checkbox" 
                                            checked={settings.userVerificationRequired || false}
                                            onChange={(e) => setSettings({ ...settings, userVerificationRequired: e.target.checked })}
                                            className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-950 transition-all cursor-pointer" 
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-200 group-hover:text-indigo-300 transition-colors">
                                            {t('admin.settings.requireVerification', { defaultValue: 'Require User Verification' })}
                                        </span>
                                        <span className="text-sm text-slate-400 mt-1">
                                            {t('admin.settings.requireVerificationDesc', { defaultValue: 'Users must verify their email address before accessing the platform features.' })}
                                        </span>
                                    </div>
                                </label>

                                <label className="flex items-start gap-4 p-4 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950 transition-colors cursor-pointer group">
                                    <div className="pt-1">
                                        <input 
                                            type="checkbox" 
                                            checked={settings.farmApprovalRequired || false}
                                            onChange={(e) => setSettings({ ...settings, farmApprovalRequired: e.target.checked })}
                                            className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-950 transition-all cursor-pointer" 
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-200 group-hover:text-indigo-300 transition-colors">
                                            {t('admin.settings.requireFarmApproval', { defaultValue: 'Require Farm Approval' })}
                                        </span>
                                        <span className="text-sm text-slate-400 mt-1">
                                            {t('admin.settings.requireFarmApprovalDesc', { defaultValue: 'New farms created by users must be approved by an admin before they are fully active and public.' })}
                                        </span>
                                    </div>
                                </label>
                            </div>

                            <div className="pt-6 border-t border-slate-800 flex justify-end">
                                <button 
                                    type="submit" 
                                    disabled={saving}
                                    className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-500 rounded-xl hover:bg-indigo-400 shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    {saving 
                                        ? t('admin.settings.savingBtn', { defaultValue: 'Saving...' }) 
                                        : t('admin.settings.saveBtn', { defaultValue: 'Save Preferences' })
                                    }
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/20">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-indigo-500/10 rounded-xl">
                                <Cog6ToothIcon className="w-6 h-6 text-indigo-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-100">
                                    {t('admin.settings.phytoTitle', { defaultValue: 'PHYTO catalog import' })}
                                </h3>
                                <p className="text-sm text-slate-400">
                                    {t('admin.settings.phytoSubtitle', { defaultValue: 'Import official products from a PHYTO_DB JSON file.' })}
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handlePhytoImport} className="space-y-4">
                            <label className="block text-sm font-semibold text-slate-200">
                                {t('admin.settings.phytoFileLabel', { defaultValue: 'JSON file path' })}
                                <input
                                    type="text"
                                    value={phytoFilePath}
                                    onChange={(e) => setPhytoFilePath(e.target.value)}
                                    placeholder={t('admin.settings.phytoFilePlaceholder', { defaultValue: '/path/to/PHYTO_DB/2026_05_01_FULL_1.json' })}
                                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                    disabled={phytoImporting}
                                />
                                <span className="mt-2 block text-xs text-slate-400">
                                    {t('admin.settings.phytoFileHint', { defaultValue: 'Use an absolute path on the server where EFMS is running.' })}
                                </span>
                            </label>

                            <label className="block text-sm font-semibold text-slate-200">
                                {t('admin.settings.phytoVersionLabel', { defaultValue: 'Version tag (optional)' })}
                                <input
                                    type="text"
                                    value={phytoVersionTag}
                                    onChange={(e) => setPhytoVersionTag(e.target.value)}
                                    placeholder={t('admin.settings.phytoVersionPlaceholder', { defaultValue: 'e.g., 2026-05-01 FULL' })}
                                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                    disabled={phytoImporting}
                                />
                            </label>

                            {phytoError && (
                                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
                                    {phytoError}
                                </div>
                            )}

                            {phytoResult && (
                                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                                    <p className="font-semibold">
                                        {t('admin.settings.phytoImportSuccess', { defaultValue: 'Import completed.' })}
                                    </p>
                                    <p className="mt-1">
                                        {t('admin.settings.phytoImportSummary', {
                                            defaultValue: 'Total {{total}} · Created {{created}} · Updated {{updated}} · Skipped {{skipped}}',
                                            total: phytoResult.total,
                                            created: phytoResult.created,
                                            updated: phytoResult.updated,
                                            skipped: phytoResult.skipped,
                                        })}
                                    </p>
                                </div>
                            )}

                            <div className="flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={phytoImporting}
                                    className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-500 rounded-xl hover:bg-indigo-400 shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50"
                                >
                                    {phytoImporting
                                        ? t('admin.settings.phytoImporting', { defaultValue: 'Importing...' })
                                        : t('admin.settings.phytoImportBtn', { defaultValue: 'Import PHYTO file' })}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
