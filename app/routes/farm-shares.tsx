import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "~/components/ProtectedRoute";
import { useFarm } from "~/contexts/FarmContext";
import { apiDelete, apiGet, apiPut } from "~/utils/api";

interface ParcelSummaryDto {
    id: number;
    name?: string;
}

interface ParcelShareDto {
    userId: number;
    username: string;
    role: string;
}

interface ParcelShareRow {
    parcelId: number;
    parcelName: string;
    userId: number;
    username: string;
    role: string;
}

interface ResearchZoneShareDto {
    id: number;
    userId?: number | null;
    username?: string | null;
    shareToken: string;
    zoneWkt?: string;
    periodIds?: number[];
    toolIds?: number[];
    productIds?: number[];
    filterStartDate?: string | null;
    filterEndDate?: string | null;
    maxUsers?: number | null;
    claimedUsers?: number | null;
    accessUsernames?: string[];
    shareStartAt?: string | null;
    shareEndAt?: string | null;
    createdAt?: string | null;
}

interface PeriodDto {
    id: number;
    name?: string;
    startDate?: string;
    endDate?: string;
}

interface ToolDto {
    id: number;
    name: string;
}

interface ProductDto {
    id: number;
    name: string;
}

export default function FarmSharesPage() {
    const { t } = useTranslation();
    const { selectedFarm } = useFarm();
    const farmId = selectedFarm?.id;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [parcelShares, setParcelShares] = useState<ParcelShareRow[]>([]);
    const [researchShares, setResearchShares] = useState<ResearchZoneShareDto[]>([]);
    const [enrolledShares, setEnrolledShares] = useState<ResearchZoneShareDto[]>([]);
    const [periods, setPeriods] = useState<PeriodDto[]>([]);
    const [tools, setTools] = useState<ToolDto[]>([]);
    const [products, setProducts] = useState<ProductDto[]>([]);
    const [editingResearchShare, setEditingResearchShare] = useState<ResearchZoneShareDto | null>(null);
    const [editShareMode, setEditShareMode] = useState<"direct" | "link">("link");
    const [editUsername, setEditUsername] = useState("");
    const [editMaxUsers, setEditMaxUsers] = useState("");
    const [editPeriodIds, setEditPeriodIds] = useState<string[]>([]);
    const [editToolIds, setEditToolIds] = useState<string[]>([]);
    const [editProductIds, setEditProductIds] = useState<string[]>([]);
    const [editFilterStartDate, setEditFilterStartDate] = useState("");
    const [editFilterEndDate, setEditFilterEndDate] = useState("");
    const [editShareStartAt, setEditShareStartAt] = useState("");
    const [editShareEndAt, setEditShareEndAt] = useState("");
    const [savingEdit, setSavingEdit] = useState(false);

    const canManage = selectedFarm?.canManage !== false;

    const buildResearchShareUrl = useCallback((token: string) => {
        if (typeof window === "undefined") return "";
        const shareUrl = new URL(window.location.href);
        shareUrl.pathname = shareUrl.pathname.replace(/\/farm-shares$/, "/map");
        shareUrl.searchParams.set("researchShareToken", token);
        return shareUrl.toString();
    }, []);

    const copyToClipboard = useCallback(async (text: string) => {
        if (!text) return false;
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            return false;
        }
    }, []);

    const loadShares = useCallback(async () => {
        if (!farmId) return;
        setLoading(true);
        setError(null);
        try {
            if (canManage) {
                const parcelsRes = await apiGet(`/farm/${farmId}/parcels/all`);
                if (!parcelsRes.ok) throw new Error("failed to load parcels");
                const parcels: ParcelSummaryDto[] = await parcelsRes.json();

                const shareRequests = parcels.map(async (parcel) => {
                    const res = await apiGet(`/farm/${farmId}/parcels/${parcel.id}/shares`);
                    if (!res.ok) return [] as ParcelShareRow[];
                    const shares: ParcelShareDto[] = await res.json();
                    return shares.map((share) => ({
                        parcelId: parcel.id,
                        parcelName: parcel.name || t("map.unnamedParcel", { defaultValue: "Unnamed Parcel" }),
                        userId: share.userId,
                        username: share.username,
                        role: share.role,
                    }));
                });

                const shareResults = await Promise.all(shareRequests);
                setParcelShares(shareResults.flat());

                const researchRes = await apiGet(`/farm/${farmId}/research-shares`);
                if (!researchRes.ok) throw new Error("failed to load research shares");
                const researchData: ResearchZoneShareDto[] = await researchRes.json();
                setResearchShares(researchData);
            } else {
                setParcelShares([]);
                setResearchShares([]);
            }

            const enrolledRes = await apiGet(`/farm/${farmId}/research-shares/enrolled`);
            if (!enrolledRes.ok) throw new Error("failed to load enrolled research shares");
            const enrolledData: ResearchZoneShareDto[] = await enrolledRes.json();
            setEnrolledShares(enrolledData);

            const [periodsRes, toolsRes, productsRes] = await Promise.all([
                apiGet(`/farm/${farmId}/periods`),
                apiGet(`/farm/${farmId}/tools`),
                apiGet(`/farm/${farmId}/products`),
            ]);

            if (periodsRes.ok) {
                setPeriods(await periodsRes.json());
            } else {
                setPeriods([]);
            }

            if (toolsRes.ok) {
                setTools(await toolsRes.json());
            } else {
                setTools([]);
            }

            if (productsRes.ok) {
                setProducts(await productsRes.json());
            } else {
                setProducts([]);
            }
        } catch (err) {
            console.error("Failed to load farm shares:", err);
            setError(t("farmShares.errors.load", { defaultValue: "Unable to load farm shares." }));
        } finally {
            setLoading(false);
        }
    }, [canManage, farmId, t]);

    useEffect(() => {
        loadShares();
    }, [loadShares]);

    const groupedParcelShares = useMemo(() => {
        const byParcel = new Map<number, { parcelName: string; rows: ParcelShareRow[] }>();
        for (const row of parcelShares) {
            const existing = byParcel.get(row.parcelId);
            if (!existing) {
                byParcel.set(row.parcelId, { parcelName: row.parcelName, rows: [row] });
            } else {
                existing.rows.push(row);
            }
        }
        return Array.from(byParcel.entries()).map(([parcelId, value]) => ({
            parcelId,
            parcelName: value.parcelName,
            rows: value.rows,
        }));
    }, [parcelShares]);

    const handleUpdateParcelShareRole = useCallback(async (row: ParcelShareRow, role: string) => {
        if (!farmId) return;
        try {
            const res = await apiPut(`/farm/${farmId}/parcels/${row.parcelId}/shares/${row.userId}`, { role });
            if (!res.ok) throw new Error("failed");
            setParcelShares((prev) => prev.map((item) => (
                item.parcelId === row.parcelId && item.userId === row.userId ? { ...item, role } : item
            )));
        } catch (err) {
            console.error("Failed to update parcel share role", err);
            setError(t("farmShares.errors.save", { defaultValue: "Unable to save share changes." }));
        }
    }, [farmId, t]);

    const handleRemoveParcelShare = useCallback(async (row: ParcelShareRow) => {
        if (!farmId) return;
        try {
            const res = await apiDelete(`/farm/${farmId}/parcels/${row.parcelId}/shares/${row.userId}`);
            if (!res.ok) throw new Error("failed");
            setParcelShares((prev) => prev.filter((item) => !(item.parcelId === row.parcelId && item.userId === row.userId)));
        } catch (err) {
            console.error("Failed to remove parcel share", err);
            setError(t("farmShares.errors.save", { defaultValue: "Unable to save share changes." }));
        }
    }, [farmId, t]);

    const handleRemoveResearchShare = useCallback(async (shareId: number) => {
        if (!farmId) return;
        try {
            const res = await apiDelete(`/farm/${farmId}/research-shares/${shareId}`);
            if (!res.ok) throw new Error("failed");
            setResearchShares((prev) => prev.filter((share) => share.id !== shareId));
        } catch (err) {
            console.error("Failed to remove research share", err);
            setError(t("farmShares.errors.save", { defaultValue: "Unable to save share changes." }));
        }
    }, [farmId, t]);

    const handleLeaveEnrollment = useCallback(async (shareId: number) => {
        if (!farmId) return;
        try {
            const res = await apiDelete(`/farm/${farmId}/research-shares/${shareId}/enrollment`);
            if (!res.ok) throw new Error("failed");
            setEnrolledShares((prev) => prev.filter((share) => share.id !== shareId));
        } catch (err) {
            console.error("Failed to leave enrolled share", err);
            setError(t("farmShares.errors.save", { defaultValue: "Unable to save share changes." }));
        }
    }, [farmId, t]);

    const toDateTimeLocal = useCallback((value?: string | null) => {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const hh = String(date.getHours()).padStart(2, "0");
        const min = String(date.getMinutes()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
    }, []);

    const openEditResearchShare = useCallback((share: ResearchZoneShareDto) => {
        setEditingResearchShare(share);
        const isDirect = Boolean(share.username);
        setEditShareMode(isDirect ? "direct" : "link");
        setEditUsername(share.username || "");
        setEditMaxUsers(share.maxUsers != null ? String(share.maxUsers) : "");
        setEditPeriodIds((share.periodIds || []).map((id) => String(id)));
        setEditToolIds((share.toolIds || []).map((id) => String(id)));
        setEditProductIds((share.productIds || []).map((id) => String(id)));
        setEditFilterStartDate(share.filterStartDate || "");
        setEditFilterEndDate(share.filterEndDate || "");
        setEditShareStartAt(toDateTimeLocal(share.shareStartAt));
        setEditShareEndAt(toDateTimeLocal(share.shareEndAt));
    }, [toDateTimeLocal]);

    const closeEditResearchShare = useCallback(() => {
        setEditingResearchShare(null);
    }, []);

    const handleSaveResearchShare = useCallback(async () => {
        if (!farmId || !editingResearchShare) return;
        if (editShareMode === "direct" && !editUsername.trim()) {
            setError(t("farmShares.errors.save", { defaultValue: "Unable to save share changes." }));
            return;
        }

        setSavingEdit(true);
        setError(null);
        try {
            const payload = {
                username: editShareMode === "direct" ? editUsername.trim() : "",
                zoneWkt: editingResearchShare.zoneWkt,
                periodIds: editPeriodIds.map(Number),
                toolIds: editToolIds.map(Number),
                productIds: editProductIds.map(Number),
                filterStartDate: editFilterStartDate || null,
                filterEndDate: editFilterEndDate || null,
                shareStartAt: editShareStartAt ? new Date(editShareStartAt).toISOString() : null,
                shareEndAt: editShareEndAt ? new Date(editShareEndAt).toISOString() : null,
                maxUsers: editShareMode === "link"
                    ? (editMaxUsers ? Number(editMaxUsers) : null)
                    : null,
            };

            const res = await apiPut(`/farm/${farmId}/research-shares/${editingResearchShare.id}`, payload);
            if (!res.ok) throw new Error("failed");
            const updated: ResearchZoneShareDto = await res.json();
            setResearchShares((prev) => prev.map((share) => share.id === updated.id ? updated : share));
            closeEditResearchShare();
        } catch (err) {
            console.error("Failed to update research share", err);
            setError(t("farmShares.errors.save", { defaultValue: "Unable to save share changes." }));
        } finally {
            setSavingEdit(false);
        }
    }, [closeEditResearchShare, editFilterEndDate, editFilterStartDate, editMaxUsers, editPeriodIds, editProductIds, editShareEndAt, editShareMode, editShareStartAt, editToolIds, editUsername, editingResearchShare, farmId, t]);

    const lookupLabel = useCallback((type: "period" | "tool" | "product", id: number) => {
        if (type === "period") {
            const found = periods.find((period) => period.id === id);
            return found?.name || `Period ${id}`;
        }
        if (type === "tool") {
            const found = tools.find((tool) => tool.id === id);
            return found?.name || `Tool ${id}`;
        }
        const found = products.find((product) => product.id === id);
        return found?.name || `Product ${id}`;
    }, [periods, products, tools]);

    function MultiSelectField({
        label,
        selected,
        onChange,
        options,
    }: {
        label: string;
        selected: string[];
        onChange: (next: string[]) => void;
        options: Array<{ id: number; label: string }>;
    }) {
        return (
            <div className="rounded-lg border border-white/15 bg-slate-900/60 p-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">{label}</p>
                <div className="max-h-28 space-y-1 overflow-auto">
                    {options.map((option) => {
                        const value = String(option.id);
                        const checked = selected.includes(value);
                        return (
                            <label key={option.id} className="flex items-center gap-2 text-xs text-slate-200">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                        if (checked) {
                                            onChange(selected.filter((item) => item !== value));
                                        } else {
                                            onChange([...selected, value]);
                                        }
                                    }}
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                                />
                                <span>{option.label}</span>
                            </label>
                        );
                    })}
                    {options.length === 0 && (
                        <p className="text-xs text-slate-400">{t("farmShares.common.noEntries", { defaultValue: "No entries" })}</p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <ProtectedRoute>
            <div className="mx-auto w-full max-w-6xl px-4 py-8 text-slate-900 dark:text-slate-100">
                <div className="mb-6 flex flex-col gap-2">
                    <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("farmShares.title", { defaultValue: "Farm shares" })}</h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        {t("farmShares.subtitle", { defaultValue: "Manage user access and share links for the selected farm." })}
                    </p>
                </div>

                {!farmId && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-200">
                        {t("farmShares.selectFarm", { defaultValue: "Select a farm to manage shares." })}
                    </div>
                )}

                {farmId && !canManage && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-200">
                        {t("farmShares.noAccess", { defaultValue: "You do not have permission to manage shares for this farm." })}
                    </div>
                )}

                {farmId && (
                    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                            {t("farmShares.enrolled.title", { defaultValue: "My enrolled shares" })}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {t("farmShares.enrolled.subtitle", { defaultValue: "Shares you can currently use." })}
                        </p>
                        {enrolledShares.length === 0 && !loading && (
                            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                                {t("farmShares.enrolled.empty", { defaultValue: "You are not enrolled in any research share for this farm." })}
                            </p>
                        )}
                        <div className="mt-4 space-y-2">
                            {enrolledShares.map((share) => (
                                <div key={`enrolled-${share.id}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                                    <p className="text-sm text-slate-700 dark:text-slate-200">
                                        {share.username
                                            ? `${t("farmShares.research.assignedTo", { defaultValue: "Assigned to" })}: ${share.username}`
                                            : t("farmShares.research.linkShare", { defaultValue: "Link-based share" })
                                        }
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("farmShares.research.periods", { defaultValue: "Periods" })}: {share.periodIds && share.periodIds.length ? share.periodIds.map((id) => lookupLabel("period", id)).join(", ") : t("farmShares.research.any", { defaultValue: "Any" })}</p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {t("farmShares.research.window", {
                                            defaultValue: "Window: {{start}} -> {{end}}",
                                            start: share.shareStartAt ? new Date(share.shareStartAt).toLocaleString() : t("farmShares.research.now", { defaultValue: "now" }),
                                            end: share.shareEndAt ? new Date(share.shareEndAt).toLocaleString() : t("farmShares.research.noEnd", { defaultValue: "no end" }),
                                        })}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const copied = await copyToClipboard(buildResearchShareUrl(share.shareToken));
                                                if (!copied) {
                                                    setError(t("farmShares.errors.copy", { defaultValue: "Could not copy share link." }));
                                                }
                                            }}
                                            className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200"
                                        >
                                            {t("farmShares.research.copyLink", { defaultValue: "Copy link" })}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleLeaveEnrollment(share.id)}
                                            className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"
                                        >
                                            {t("farmShares.enrolled.leave", { defaultValue: "Leave share" })}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {farmId && canManage && (
                    <div className="space-y-6">
                        {loading && (
                            <p className="text-sm text-slate-500 dark:text-slate-400">{t("common.loading", { defaultValue: "Loading..." })}</p>
                        )}
                        {error && (
                            <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                                {error}
                            </p>
                        )}

                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                                {t("farmShares.parcel.title", { defaultValue: "Parcel shares" })}
                            </h2>
                            {groupedParcelShares.length === 0 && !loading && (
                                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                                    {t("farmShares.parcel.empty", { defaultValue: "No parcel shares found." })}
                                </p>
                            )}
                            <div className="mt-4 space-y-4">
                                {groupedParcelShares.map((group) => (
                                    <div key={group.parcelId} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                                        <p className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{group.parcelName}</p>
                                        <div className="space-y-2">
                                            {group.rows.map((row) => (
                                                <div key={`${row.parcelId}-${row.userId}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/70">
                                                    <span className="min-w-40 flex-1 text-slate-700 dark:text-slate-200">{row.username}</span>
                                                    <select
                                                        value={row.role}
                                                        onChange={(event) => handleUpdateParcelShareRole(row, event.target.value)}
                                                        className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                                    >
                                                        <option value="EDITOR">{t("map.sharing.roles.editor", { defaultValue: "Editor" })}</option>
                                                        <option value="VIEWER">{t("map.sharing.roles.viewer", { defaultValue: "Viewer" })}</option>
                                                    </select>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveParcelShare(row)}
                                                        className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"
                                                    >
                                                        {t("common.delete", { defaultValue: "Delete" })}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                                {t("farmShares.research.title", { defaultValue: "Research share links" })}
                            </h2>
                            {researchShares.length === 0 && !loading && (
                                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                                    {t("farmShares.research.empty", { defaultValue: "No research shares found." })}
                                </p>
                            )}
                            <div className="mt-4 space-y-2">
                                {researchShares.map((share) => (
                                    <div key={share.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm text-slate-700 dark:text-slate-200">
                                                {share.username ? `${t("farmShares.research.assignedTo", { defaultValue: "Assigned to" })}: ${share.username}` : t("farmShares.research.linkShare", { defaultValue: "Link-based share" })}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => openEditResearchShare(share)}
                                                    className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200"
                                                >
                                                    {t("common.edit", { defaultValue: "Edit" })}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        const copied = await copyToClipboard(buildResearchShareUrl(share.shareToken));
                                                        if (!copied) {
                                                            setError(t("farmShares.errors.copy", { defaultValue: "Could not copy share link." }));
                                                        }
                                                    }}
                                                    className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200"
                                                >
                                                    {t("farmShares.research.copyLink", { defaultValue: "Copy link" })}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveResearchShare(share.id)}
                                                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"
                                                >
                                                    {t("common.delete", { defaultValue: "Delete" })}
                                                </button>
                                            </div>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Token: {share.shareToken.slice(0, 16)}...</p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {t("farmShares.research.accessUsers", { defaultValue: "Users with access" })}: {share.accessUsernames && share.accessUsernames.length ? share.accessUsernames.join(", ") : t("farmShares.research.none", { defaultValue: "none" })}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {t("farmShares.research.periods", { defaultValue: "Periods" })}: {share.periodIds && share.periodIds.length ? share.periodIds.map((id) => lookupLabel("period", id)).join(", ") : t("farmShares.research.any", { defaultValue: "Any" })}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {t("farmShares.research.tools", { defaultValue: "Tools" })}: {share.toolIds && share.toolIds.length ? share.toolIds.map((id) => lookupLabel("tool", id)).join(", ") : t("farmShares.research.any", { defaultValue: "Any" })}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {t("farmShares.research.products", { defaultValue: "Products" })}: {share.productIds && share.productIds.length ? share.productIds.map((id) => lookupLabel("product", id)).join(", ") : t("farmShares.research.any", { defaultValue: "Any" })}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {t("farmShares.research.filterWindow", { defaultValue: "Filter window" })}: {(share.filterStartDate || t("farmShares.research.any", { defaultValue: "Any" }))} - {(share.filterEndDate || t("farmShares.research.any", { defaultValue: "Any" }))}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {share.maxUsers != null
                                                ? t("farmShares.research.userCap", { defaultValue: "Users: {{claimed}} / {{max}}", claimed: share.claimedUsers ?? 0, max: share.maxUsers })
                                                : t("farmShares.research.userCapUnlimited", { defaultValue: "Users: unlimited" })}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {t("farmShares.research.window", {
                                                defaultValue: "Window: {{start}} -> {{end}}",
                                                start: share.shareStartAt ? new Date(share.shareStartAt).toLocaleString() : "now",
                                                end: share.shareEndAt ? new Date(share.shareEndAt).toLocaleString() : "no end",
                                            })}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {t("farmShares.research.createdAt", { defaultValue: "Created" })}: {share.createdAt ? new Date(share.createdAt).toLocaleString() : t("farmShares.research.unknown", { defaultValue: "unknown" })}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                )}
            </div>
            {editingResearchShare && typeof document !== "undefined" && createPortal(
                <div className="fixed inset-0 z-[6500] flex items-center justify-center bg-slate-950/70 px-4">
                    <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl shadow-black/40">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-white">Edit Share</h3>
                                <p className="text-sm text-slate-300">{t("farmShares.edit.subtitle", { defaultValue: "Update constraints, timing, or revoke this share." })}</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeEditResearchShare}
                                className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="mt-4 grid gap-2">
                            <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-slate-950/40 p-1">
                                <button
                                    type="button"
                                    onClick={() => setEditShareMode("direct")}
                                    className={`rounded-md px-3 py-2 text-xs font-semibold transition ${editShareMode === "direct" ? "bg-indigo-500 text-white" : "text-slate-300 hover:bg-white/5"}`}
                                >
                                    {t("farmShares.edit.direct", { defaultValue: "Direct user" })}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditShareMode("link")}
                                    className={`rounded-md px-3 py-2 text-xs font-semibold transition ${editShareMode === "link" ? "bg-indigo-500 text-white" : "text-slate-300 hover:bg-white/5"}`}
                                >
                                    {t("farmShares.edit.link", { defaultValue: "Link-based" })}
                                </button>
                            </div>

                            {editShareMode === "direct" ? (
                                <label className="text-xs text-slate-300">
                                    {t("farmShares.edit.username", { defaultValue: "Username" })}
                                    <input
                                        type="text"
                                        value={editUsername}
                                        onChange={(event) => setEditUsername(event.target.value)}
                                        className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                                    />
                                </label>
                            ) : (
                                <label className="text-xs text-slate-300">
                                    {t("farmShares.edit.maxUsers", { defaultValue: "Maximum users (empty means unlimited)" })}
                                    <input
                                        type="number"
                                        min="1"
                                        value={editMaxUsers}
                                        onChange={(event) => setEditMaxUsers(event.target.value)}
                                        className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                                    />
                                </label>
                            )}

                            <div className="grid gap-2 sm:grid-cols-3">
                                <MultiSelectField
                                    label={t("farmShares.research.periods", { defaultValue: "Periods" })}
                                    selected={editPeriodIds}
                                    onChange={setEditPeriodIds}
                                    options={periods.map((period) => ({ id: period.id, label: period.name || `Period ${period.id}` }))}
                                />
                                <MultiSelectField
                                    label={t("farmShares.research.tools", { defaultValue: "Tools" })}
                                    selected={editToolIds}
                                    onChange={setEditToolIds}
                                    options={tools.map((tool) => ({ id: tool.id, label: tool.name }))}
                                />
                                <MultiSelectField
                                    label={t("farmShares.research.products", { defaultValue: "Products" })}
                                    selected={editProductIds}
                                    onChange={setEditProductIds}
                                    options={products.map((product) => ({ id: product.id, label: product.name }))}
                                />
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                                <label className="text-xs text-slate-300">
                                    {t("farmShares.edit.filterStart", { defaultValue: "Filter start date" })}
                                    <input
                                        type="date"
                                        value={editFilterStartDate}
                                        onChange={(event) => setEditFilterStartDate(event.target.value)}
                                        className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                                    />
                                </label>
                                <label className="text-xs text-slate-300">
                                    {t("farmShares.edit.filterEnd", { defaultValue: "Filter end date" })}
                                    <input
                                        type="date"
                                        value={editFilterEndDate}
                                        onChange={(event) => setEditFilterEndDate(event.target.value)}
                                        className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                                    />
                                </label>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                                <label className="text-xs text-slate-300">
                                    {t("farmShares.edit.shareStart", { defaultValue: "Share start" })}
                                    <input
                                        type="datetime-local"
                                        value={editShareStartAt}
                                        onChange={(event) => setEditShareStartAt(event.target.value)}
                                        className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                                    />
                                </label>
                                <label className="text-xs text-slate-300">
                                    {t("farmShares.edit.shareEnd", { defaultValue: "Share end" })}
                                    <input
                                        type="datetime-local"
                                        value={editShareEndAt}
                                        onChange={(event) => setEditShareEndAt(event.target.value)}
                                        className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                            <button
                                type="button"
                                onClick={async () => {
                                    await handleRemoveResearchShare(editingResearchShare.id);
                                    closeEditResearchShare();
                                }}
                                className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
                            >
                                {t("farmShares.edit.revoke", { defaultValue: "Revoke Access" })}
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={closeEditResearchShare}
                                    className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
                                >
                                    {t("common.cancel", { defaultValue: "Cancel" })}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveResearchShare}
                                    disabled={savingEdit}
                                    className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400 disabled:opacity-60"
                                >
                                    {savingEdit ? t("common.saving", { defaultValue: "Saving..." }) : t("farmShares.edit.save", { defaultValue: "Save changes" })}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </ProtectedRoute>
    );
}
