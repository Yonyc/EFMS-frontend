import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "~/components/ProtectedRoute";
import { apiDelete, apiGet, apiPost, apiPut } from "~/utils/api";
import { useFarm } from "~/contexts/FarmContext";
import { useAuth } from "~/contexts/AuthContext";
import { SearchableSelect } from "~/components/map/components/SearchableSelect";
import type { SelectOption } from "~/components/map/components/SearchableSelect";
import { PaginationBar } from "~/components/PaginationBar";

interface CultureTypeDto {
    id: number;
    code: string;
    name: string;
    nameNl: string | null;
    category: string | null;
    color: string | null;
    farmId: number | null;
}

const CATEGORIES = ["cereals", "industrial", "potatoes", "vegetables", "grasslands", "legumes", "fruits", "ecology", "forestry", "other"];

function categoryLabel(cat: string | null) {
    if (!cat) return "Other";
    return cat.charAt(0).toUpperCase() + cat.slice(1);
}

const categoryOptions: SelectOption[] = CATEGORIES.map(c => ({ value: c, label: categoryLabel(c) }));

function Badge({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${active
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
            {label}
        </button>
    );
}

function EditRow({
    ct,
    onSaved,
    onCancel,
}: {
    ct: CultureTypeDto;
    onSaved: (updated: CultureTypeDto) => void;
    onCancel: () => void;
}) {
    const { t } = useTranslation();
    const [code, setCode] = useState(ct.code);
    const [name, setName] = useState(ct.name);
    const [nameNl, setNameNl] = useState(ct.nameNl ?? "");
    const [category, setCategory] = useState(ct.category ?? "");
    const [color, setColor] = useState(ct.color ?? "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        if (!code.trim() || !name.trim()) { setError(t("cultureTypes.fieldRequired", { defaultValue: "Code and name are required." })); return; }
        setSaving(true);
        setError(null);
        try {
            const r = await apiPut(`/culture-types/${ct.id}`, { code: code.trim(), name: name.trim(), nameNl: nameNl.trim() || null, category: category || null, color: color || "" });
            if (!r.ok) throw new Error(await r.text().catch(() => r.statusText));
            const updated: CultureTypeDto = await r.json();
            onSaved(updated);
        } catch (e: any) {
            setError(e?.message ?? t("common.error", { defaultValue: "An error occurred." }));
        } finally {
            setSaving(false);
        }
    };

    const editInput = "rounded border border-indigo-300 bg-white px-1.5 py-1 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-400";

    return (
        <tr className="bg-indigo-50">
            <td className="px-3 py-2">
                <input
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className={`w-20 ${editInput}`}
                />
            </td>
            <td className="px-3 py-2">
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className={`w-full ${editInput}`}
                />
            </td>
            <td className="px-3 py-2">
                <input
                    value={nameNl}
                    onChange={e => setNameNl(e.target.value)}
                    className={`w-full ${editInput}`}
                />
            </td>
            <td className="px-3 py-2">
                <SearchableSelect
                    options={categoryOptions}
                    value={category}
                    onChange={setCategory}
                    placeholder={t("cultureTypes.col.category", { defaultValue: "Category" })}
                    className="min-w-[8rem]"
                    variant="light"
                />
            </td>
            <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                    <input
                        type="color"
                        value={color || "#3388ff"}
                        onChange={e => setColor(e.target.value)}
                        className="h-7 w-9 cursor-pointer rounded border border-slate-200"
                        title={t("cultureTypes.col.color", { defaultValue: "Colour" })}
                    />
                    {color && (
                        <button type="button" onClick={() => setColor("")} className="text-xs text-slate-400 hover:text-slate-600" title={t("common.clear", { defaultValue: "Clear" })}>×</button>
                    )}
                </div>
            </td>
            <td className="px-3 py-2">
                {error && <span className="mr-2 text-xs text-rose-600">{error}</span>}
                <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="mr-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                >
                    {t("common.save", { defaultValue: "Save" })}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                >
                    {t("common.cancel", { defaultValue: "Cancel" })}
                </button>
            </td>
        </tr>
    );
}

function CultureTypeTable({
    types,
    isAdmin,
    isGlobal,
    onUpdated,
    onDeleted,
    onPromoted,
}: {
    types: CultureTypeDto[];
    isAdmin: boolean;
    isGlobal: boolean;
    onUpdated: (ct: CultureTypeDto) => void;
    onDeleted: (id: number) => void;
    onPromoted: (ct: CultureTypeDto) => void;
}) {
    const { t } = useTranslation();
    const [editingId, setEditingId] = useState<number | null>(null);

    const handleDelete = async (ct: CultureTypeDto) => {
        if (!confirm(t("cultureTypes.deleteConfirm", { defaultValue: "Delete this culture type?" }))) return;
        const r = await apiDelete(`/culture-types/${ct.id}`);
        if (r.ok) onDeleted(ct.id);
    };

    const handlePromote = async (ct: CultureTypeDto) => {
        if (!confirm(t("cultureTypes.promoteConfirm", { defaultValue: "Promote this to a global culture type?" }))) return;
        const r = await apiPost(`/culture-types/${ct.id}/promote`, {});
        if (r.ok) { const updated: CultureTypeDto = await r.json(); onPromoted(updated); }
    };

    if (types.length === 0) return (
        <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
            {t("cultureTypes.empty", { defaultValue: "No culture types." })}
        </div>
    );

    // Group by category
    const byCategory = new Map<string, CultureTypeDto[]>();
    for (const ct of types) {
        const cat = ct.category ?? "other";
        const arr = byCategory.get(cat) ?? [];
        arr.push(ct);
        byCategory.set(cat, arr);
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                    <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t("cultureTypes.col.code", { defaultValue: "Code" })}
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t("cultureTypes.col.nameFr", { defaultValue: "Name (FR)" })}
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t("cultureTypes.col.nameNl", { defaultValue: "Name (NL)" })}
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t("cultureTypes.col.category", { defaultValue: "Category" })}
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t("cultureTypes.col.color", { defaultValue: "Colour" })}
                        </th>
                        {(isAdmin || !isGlobal) && (
                            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {t("cultureTypes.col.actions", { defaultValue: "Actions" })}
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {Array.from(byCategory.entries()).map(([cat, cts]) => (
                        <>
                            <tr key={`cat-${cat}`} className="bg-slate-50/50">
                                <td colSpan={6} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                                    {categoryLabel(cat)}
                                </td>
                            </tr>
                            {cts.map(ct =>
                                editingId === ct.id ? (
                                    <EditRow
                                        key={ct.id}
                                        ct={ct}
                                        onSaved={updated => { onUpdated(updated); setEditingId(null); }}
                                        onCancel={() => setEditingId(null)}
                                    />
                                ) : (
                                    <tr key={ct.id} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 font-mono text-sm font-semibold text-slate-800">{ct.code}</td>
                                        <td className="px-3 py-2 text-sm text-slate-900">{ct.name}</td>
                                        <td className="px-3 py-2 text-sm text-slate-500">{ct.nameNl ?? <span className="text-slate-300">—</span>}</td>
                                        <td className="px-3 py-2 text-xs text-slate-500">{categoryLabel(ct.category)}</td>
                                        <td className="px-3 py-2">
                                            {ct.color
                                                ? <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><span className="h-4 w-4 rounded-full border border-slate-200 shadow-sm" style={{ background: ct.color }} aria-hidden />{ct.color}</span>
                                                : <span className="text-slate-300">—</span>}
                                        </td>
                                        {(isAdmin || !isGlobal) && (
                                            <td className="px-3 py-2 text-right">
                                                <div className="flex justify-end gap-1">
                                                    {(isAdmin || !isGlobal) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingId(ct.id)}
                                                            className="rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                                                        >
                                                            {t("common.edit", { defaultValue: "Edit" })}
                                                        </button>
                                                    )}
                                                    {!isGlobal && isAdmin && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePromote(ct)}
                                                            className="rounded px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                                                        >
                                                            {t("cultureTypes.promote", { defaultValue: "Promote" })}
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(ct)}
                                                        className="rounded px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                                                    >
                                                        {t("common.delete", { defaultValue: "Delete" })}
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                )
                            )}
                        </>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function AddCultureTypeForm({
    farmId,
    isAdmin,
    onAdded,
    onClose,
}: {
    farmId: string | null;
    isAdmin: boolean;
    onAdded: (ct: CultureTypeDto) => void;
    onClose?: () => void;
}) {
    const { t } = useTranslation();
    const [code, setCode] = useState("");
    const [name, setName] = useState("");
    const [nameNl, setNameNl] = useState("");
    const [category, setCategory] = useState("");
    const [color, setColor] = useState("");
    const [scope, setScope] = useState<"farm" | "global">("farm");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code.trim() || !name.trim()) { setError(t("cultureTypes.fieldRequired", { defaultValue: "Code and name are required." })); return; }
        setSaving(true);
        setError(null);
        try {
            const body: Record<string, unknown> = { code: code.trim(), name: name.trim(), nameNl: nameNl.trim() || null, category: category || null, color: color || null };
            if (scope === "farm" && farmId) body.farmId = Number(farmId);
            const r = await apiPost("/culture-types", body);
            if (!r.ok) throw new Error(await r.text().catch(() => r.statusText));
            const created: CultureTypeDto = await r.json();
            onAdded(created);
            setCode(""); setName(""); setNameNl(""); setCategory(""); setColor("");
            onClose?.();
        } catch (e: any) {
            setError(e?.message ?? t("common.error", { defaultValue: "An error occurred." }));
        } finally {
            setSaving(false);
        }
    };

    const addInput = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/30";

    return (
        <form onSubmit={save}>
            {error && (
                <p className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{error}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                        {t("cultureTypes.col.code", { defaultValue: "Code" })} *
                    </label>
                    <input
                        value={code}
                        onChange={e => setCode(e.target.value)}
                        placeholder="e.g. 999"
                        className={addInput}
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                        {t("cultureTypes.col.nameFr", { defaultValue: "Name (FR)" })} *
                    </label>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. Pomme de terre"
                        className={addInput}
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                        {t("cultureTypes.col.nameNl", { defaultValue: "Name (NL)" })}
                    </label>
                    <input
                        value={nameNl}
                        onChange={e => setNameNl(e.target.value)}
                        placeholder="e.g. Aardappel"
                        className={addInput}
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                        {t("cultureTypes.col.category", { defaultValue: "Category" })}
                    </label>
                    <SearchableSelect
                        options={categoryOptions}
                        value={category}
                        onChange={setCategory}
                        placeholder={t("cultureTypes.selectCategory", { defaultValue: "— Select —" })}
                        variant="light"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                        {t("cultureTypes.col.color", { defaultValue: "Colour" })}
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={color || "#3388ff"}
                            onChange={e => setColor(e.target.value)}
                            className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200"
                        />
                        {color
                            ? <button type="button" onClick={() => setColor("")} className="text-xs text-slate-400 hover:text-slate-600">{t("common.clear", { defaultValue: "Clear" })}</button>
                            : <span className="text-xs text-slate-400">{t("cultureTypes.noColor", { defaultValue: "No default" })}</span>}
                    </div>
                </div>
            </div>
            {isAdmin && (
                <div className="mt-3 flex items-center gap-4 text-sm text-slate-600">
                    <span className="font-medium">{t("cultureTypes.scope", { defaultValue: "Scope:" })}</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" value="farm" checked={scope === "farm"} onChange={() => setScope("farm")} className="accent-indigo-500" />
                        {t("cultureTypes.scopeFarm", { defaultValue: "Farm-specific" })}
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" value="global" checked={scope === "global"} onChange={() => setScope("global")} className="accent-indigo-500" />
                        {t("cultureTypes.scopeGlobal", { defaultValue: "Global (all farms)" })}
                    </label>
                </div>
            )}
            <div className="mt-4">
                <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-indigo-500 disabled:opacity-60"
                >
                    {saving ? t("common.saving", { defaultValue: "Saving…" }) : t("cultureTypes.add", { defaultValue: "Add culture type" })}
                </button>
            </div>
        </form>
    );
}

export function meta() {
    return [{ title: "Culture Types - EFMS" }];
}

export function CultureTypesManager() {
    const { t } = useTranslation();
    const { selectedFarm } = useFarm();
    const { user } = useAuth();
    const isAdmin = user?.admin === true;

    const [globalTypes, setGlobalTypes] = useState<CultureTypeDto[]>([]);
    const [farmTypes, setFarmTypes] = useState<CultureTypeDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<"global" | "farm">("global");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [page, setPage] = useState(0);
    const [addModalOpen, setAddModalOpen] = useState(false);
    const PAGE_SIZE = 15;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const farmId = selectedFarm?.id;
            const url = farmId ? `/culture-types?farmId=${farmId}` : "/culture-types";
            const r = await apiGet(url);
            if (!r.ok) throw new Error(r.statusText);
            const all: CultureTypeDto[] = await r.json();
            setGlobalTypes(all.filter(ct => ct.farmId == null));
            setFarmTypes(all.filter(ct => ct.farmId != null));
        } catch (e: any) {
            setError(e?.message ?? t("common.error", { defaultValue: "An error occurred." }));
        } finally {
            setLoading(false);
        }
    }, [selectedFarm?.id, t]);

    useEffect(() => { load(); }, [load]);

    const handleUpdated = (updated: CultureTypeDto) => {
        if (updated.farmId == null) {
            setGlobalTypes(prev => prev.map(ct => ct.id === updated.id ? updated : ct));
        } else {
            setFarmTypes(prev => prev.map(ct => ct.id === updated.id ? updated : ct));
        }
    };

    const handleDeleted = (id: number) => {
        setGlobalTypes(prev => prev.filter(ct => ct.id !== id));
        setFarmTypes(prev => prev.filter(ct => ct.id !== id));
    };

    const handlePromoted = (updated: CultureTypeDto) => {
        setFarmTypes(prev => prev.filter(ct => ct.id !== updated.id));
        setGlobalTypes(prev => [...prev, updated].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })));
    };

    const handleAdded = (ct: CultureTypeDto) => {
        if (ct.farmId == null) {
            setGlobalTypes(prev => [...prev, ct].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })));
        } else {
            setFarmTypes(prev => [...prev, ct].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })));
            setTab("farm");
        }
    };

    const displayList = (tab === "global" ? globalTypes : farmTypes).filter(ct =>
        categoryFilter === "all" || ct.category === categoryFilter
    );

    const allCategories = [...new Set((tab === "global" ? globalTypes : farmTypes).map(ct => ct.category ?? "other"))].sort();

    // Client-side pagination over the filtered list. Reset to page 0 when the slice changes.
    const totalPages = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
    useEffect(() => { setPage(0); }, [tab, categoryFilter, displayList.length]);
    const pagedList = displayList.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    // Only farm members (any farm selected) or admins can add; mirrors the table's edit rules.
    const canAdd = isAdmin || !!selectedFarm;

    return (
        <div>
                    {/* Header */}
                    <div className="mb-8">
                        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
                            {t("cultureTypes.title", { defaultValue: "Belgian PAC / SIGEC crop codes" })}
                        </p>
                        <h1 className="text-3xl font-bold text-slate-900">
                            {t("cultureTypes.subtitle", { defaultValue: "Culture Types" })}
                        </h1>
                        <p className="mt-2 text-slate-500">
                            {t("cultureTypes.description", { defaultValue: "Reference crop codes used in PAC declarations. Global codes follow the Belgian SIGEC reference list; farm-specific codes extend it for your farm." })}
                        </p>
                    </div>

                    {/* Scope tabs + Add button */}
                    <div className="mb-5 flex items-center gap-2">
                        <Badge
                            label={`${t("cultureTypes.tabGlobal", { defaultValue: "Global reference" })} (${globalTypes.length})`}
                            active={tab === "global"}
                            onClick={() => { setTab("global"); setCategoryFilter("all"); }}
                        />
                        {selectedFarm && (
                            <Badge
                                label={`${t("cultureTypes.tabFarm", { defaultValue: "Farm-specific" })} (${farmTypes.length})`}
                                active={tab === "farm"}
                                onClick={() => { setTab("farm"); setCategoryFilter("all"); }}
                            />
                        )}
                        {canAdd && (
                            <button
                                type="button"
                                onClick={() => setAddModalOpen(true)}
                                className="ml-auto rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-indigo-500"
                            >
                                + {t("cultureTypes.add", { defaultValue: "Add culture type" })}
                            </button>
                        )}
                    </div>

                    {/* Category filter */}
                    {allCategories.length > 1 && (
                        <div className="mb-4 flex flex-wrap gap-1.5">
                            <button
                                type="button"
                                onClick={() => setCategoryFilter("all")}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition ${categoryFilter === "all" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                            >
                                {t("common.all", { defaultValue: "All" })}
                            </button>
                            {allCategories.map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setCategoryFilter(cat)}
                                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${categoryFilter === cat ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                                >
                                    {categoryLabel(cat)}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Error / loading */}
                    {loading && (
                        <div className="py-16 text-center text-slate-500">
                            {t("common.loading", { defaultValue: "Loading..." })}
                        </div>
                    )}
                    {error && (
                        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
                    )}

                    {/* Table */}
                    {!loading && (
                        <CultureTypeTable
                            types={pagedList}
                            isAdmin={isAdmin}
                            isGlobal={tab === "global"}
                            onUpdated={handleUpdated}
                            onDeleted={handleDeleted}
                            onPromoted={handlePromoted}
                        />
                    )}

                    {/* Pagination */}
                    {!loading && displayList.length > PAGE_SIZE && (
                        <PaginationBar
                            page={page}
                            totalPages={totalPages}
                            onPrev={() => setPage(p => Math.max(0, p - 1))}
                            onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        />
                    )}

                    {/* Add modal */}
                    {addModalOpen && (
                        <div
                            className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/40 p-4"
                            onClick={(e) => { if (e.target === e.currentTarget) setAddModalOpen(false); }}
                        >
                            <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
                                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                                    <h2 className="text-base font-semibold text-slate-900">
                                        {t("cultureTypes.addTitle", { defaultValue: "Add a culture type" })}
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={() => setAddModalOpen(false)}
                                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                        aria-label={t("common.close", { defaultValue: "Close" })}
                                    >
                                        ✕
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6">
                                    <AddCultureTypeForm
                                        farmId={selectedFarm?.id ?? null}
                                        isAdmin={isAdmin}
                                        onAdded={handleAdded}
                                        onClose={() => setAddModalOpen(false)}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
        </div>
    );
}

export default function CultureTypesPage() {
    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-slate-50 text-slate-900">
                <div className="mx-auto max-w-6xl px-4 py-10">
                    <CultureTypesManager />
                </div>
            </div>
        </ProtectedRoute>
    );
}
