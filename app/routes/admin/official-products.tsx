import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost, getPageMeta } from "~/utils/api";
import { PaginationBar } from "~/components/PaginationBar";
import {
    ArrowPathIcon,
    CheckCircleIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ExclamationCircleIcon,
    MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

interface ProductDto {
    id: number;
    name: string;
    officialAuthNumber?: string;
    officialVersionTag?: string;
    officialDecisionCode?: string;
    officialDecisionCodeFr?: string;
    officialDecisionCodeEn?: string;
    officialDateFirstAuthorization?: string;
    officialDateFrom?: string;
    officialDateTo?: string;
    officialSaleTo?: string;
    officialUseToleratedTo?: string;
    officialHolderName?: string;
    officialActiveSubstances?: string;
    officialUserGroupCode?: string;
    officialUserGroupFr?: string;
    officialUserGroupEn?: string;
    officialFormulationTypeCode?: string;
    officialFormulationTypeFr?: string;
    officialFormulationTypeEn?: string;
    officialProductTypeCodes?: string;
    officialProductTypeFr?: string;
    officialProductTypeEn?: string;
    officialImportedAt?: string;
}

interface PageResult {
    content: ProductDto[];
    totalElements: number;
    totalPages: number;
    number: number;
    size: number;
}

interface SyncLog {
    id: number;
    fileName: string;
    processedAt?: string;
    created: number;
    updated: number;
    skipped: number;
    total: number;
    status: string;
    errorMessage?: string;
}

interface LabeledValue { value: string; label: string }
interface FilterMeta {
    decisionCodes: LabeledValue[];
    userGroups: LabeledValue[];
    productTypes: LabeledValue[];
}

interface SyncStatus {
    logs: SyncLog[];
    syncInProgress: boolean;
}

const PAGE_SIZE = 25;

const inputCls = "rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none disabled:opacity-50";
const selectCls = "rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none";
const btnPrimary = "flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed";
const btnGhost = "rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed";

function DetailRow({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null;
    return (
        <div className="flex gap-3 py-1 text-sm">
            <span className="w-44 shrink-0 text-slate-400">{label}</span>
            <span className="text-slate-200 break-words">{value}</span>
        </div>
    );
}

function ProductRow({ product }: { product: ProductDto }) {
    const [open, setOpen] = useState(false);
    const { t } = useTranslation();

    const decision = product.officialDecisionCodeFr || product.officialDecisionCodeEn || product.officialDecisionCode;
    const isActive = product.officialDecisionCode === "AUT" || product.officialDecisionCode === "AUT_EXT";

    return (
        <div className="border-b border-slate-800 last:border-0">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-800/50 transition-colors"
            >
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100 truncate">{product.name}</span>
                        {decision && (
                            <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                isActive
                                    ? "bg-emerald-900/50 text-emerald-400"
                                    : "bg-slate-800 text-slate-400"
                            }`}>
                                {decision}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {product.officialAuthNumber && (
                            <span className="text-xs text-slate-500 font-mono">{product.officialAuthNumber}</span>
                        )}
                        {product.officialProductTypeFr && (
                            <span className="text-xs text-slate-400">{product.officialProductTypeFr}</span>
                        )}
                        {product.officialActiveSubstances && (
                            <span className="text-xs text-indigo-400 truncate max-w-xs">{product.officialActiveSubstances}</span>
                        )}
                    </div>
                </div>
                <div className="shrink-0 mt-0.5 text-slate-500">
                    {open ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                </div>
            </button>

            {open && (
                <div className="px-4 pb-4 bg-slate-900/60">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 divide-y divide-slate-800/50">
                        <div className="pb-3">
                            <DetailRow label={t('admin.officialProducts.detail.authNumber')} value={product.officialAuthNumber} />
                            <DetailRow label={t('admin.officialProducts.detail.version')} value={product.officialVersionTag} />
                            <DetailRow label={t('admin.officialProducts.detail.decision')} value={decision} />
                            <DetailRow label={t('admin.officialProducts.detail.holder')} value={product.officialHolderName} />
                        </div>
                        <div className="py-3">
                            <DetailRow label={t('admin.officialProducts.detail.activeSubstances')} value={product.officialActiveSubstances} />
                            <DetailRow label={t('admin.officialProducts.detail.productType')} value={product.officialProductTypeFr || product.officialProductTypeEn} />
                            <DetailRow label={t('admin.officialProducts.detail.formulation')} value={product.officialFormulationTypeFr || product.officialFormulationTypeEn} />
                            <DetailRow label={t('admin.officialProducts.detail.userGroup')} value={product.officialUserGroupFr || product.officialUserGroupEn} />
                        </div>
                        <div className="pt-3">
                            <DetailRow label={t('admin.officialProducts.detail.dateFrom')} value={product.officialDateFrom} />
                            <DetailRow label={t('admin.officialProducts.detail.dateTo')} value={product.officialDateTo} />
                            <DetailRow label={t('admin.officialProducts.detail.saleTo')} value={product.officialSaleTo} />
                            <DetailRow label={t('admin.officialProducts.detail.useToleratedTo')} value={product.officialUseToleratedTo} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AdminOfficialProducts() {
    const { t } = useTranslation();

    // Sync state
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [historyExpanded, setHistoryExpanded] = useState(false);

    // Filter meta
    const [filterMeta, setFilterMeta] = useState<FilterMeta | null>(null);

    // Product search state
    const [query, setQuery] = useState("");
    const [decisionCode, setDecisionCode] = useState("");
    const [userGroupCode, setUserGroupCode] = useState("");
    const [productTypeCode, setProductTypeCode] = useState("");
    const [page, setPage] = useState(0);
    const [result, setResult] = useState<PageResult | null>(null);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const loadSync = useCallback(async () => {
        try {
            const res = await apiGet("/admin/phyto/status");
            if (res.ok) setSyncStatus(await res.json());
        } catch {
            // ignore
        }
    }, []);

    const loadProducts = useCallback(async (q: string, dc: string, ug: string, pt: string, p: number) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(p), size: String(PAGE_SIZE) });
            if (q) params.set("query", q);
            if (dc) params.set("decisionCode", dc);
            if (ug) params.set("userGroupCode", ug);
            if (pt) params.set("productTypeCode", pt);
            const res = await apiGet(`/products/official?${params}`);
            if (res.ok) setResult(await res.json());
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSync();
        apiGet("/products/official/meta").then(r => { if (r.ok) r.json().then(setFilterMeta); });
    }, [loadSync]);

    // Poll while another session has a sync running
    useEffect(() => {
        if (!syncStatus?.syncInProgress) return;
        const id = setInterval(loadSync, 2000);
        return () => clearInterval(id);
    }, [syncStatus?.syncInProgress, loadSync]);

    // Debounce text query; immediate reload on filter/page changes
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setPage(0);
            loadProducts(query, decisionCode, userGroupCode, productTypeCode, 0);
        }, 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, decisionCode, userGroupCode, productTypeCode, loadProducts]);

    useEffect(() => {
        loadProducts(query, decisionCode, userGroupCode, productTypeCode, page);
    }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSync = async () => {
        setSyncing(true);
        setSyncError(null);
        try {
            const res = await apiPost("/admin/phyto/sync", {});
            const body = await res.json();
            if (!res.ok) setSyncError(body.error || `HTTP ${res.status}`);
            await Promise.all([loadSync(), loadProducts(query, decisionCode, userGroupCode, productTypeCode, page)]);
        } catch (e: unknown) {
            setSyncError(e instanceof Error ? e.message : String(e));
        } finally {
            setSyncing(false);
        }
    };

    const serverSyncing = syncStatus?.syncInProgress ?? false;
    const anyBusy = syncing || serverSyncing;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-100">
                    {t('admin.officialProducts.title')}
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                    {t('admin.officialProducts.subtitle')}
                </p>
            </div>

            {/* Sync panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/20">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h2 className="text-base font-bold text-slate-100">{t('admin.officialProducts.sync.title')}</h2>
                        <p className="text-xs text-slate-400 mt-0.5">{t('admin.officialProducts.sync.desc')}</p>
                    </div>
                    <button
                        className={btnPrimary}
                        onClick={handleSync}
                        disabled={anyBusy}
                    >
                        <ArrowPathIcon className={`w-4 h-4 ${anyBusy ? "animate-spin" : ""}`} />
                        {anyBusy
                            ? t('admin.officialProducts.sync.running')
                            : t('admin.officialProducts.sync.btn')}
                    </button>
                </div>

                {syncError && (
                    <p className="mt-3 text-xs text-rose-400">{syncError}</p>
                )}

                {/* Sync history */}
                {syncStatus && syncStatus.logs.length > 0 && (
                    <div className="mt-4">
                        <button
                            type="button"
                            onClick={() => setHistoryExpanded((v) => !v)}
                            className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-300"
                        >
                            {historyExpanded
                                ? <ChevronUpIcon className="w-3.5 h-3.5" />
                                : <ChevronDownIcon className="w-3.5 h-3.5" />}
                            {t('admin.officialProducts.sync.history')}
                            <span className="normal-case font-normal text-slate-600">({syncStatus.logs.length})</span>
                        </button>
                        {historyExpanded && (
                            <div className="mt-2 rounded-xl border border-slate-800 overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-800/60">
                                        <tr>
                                            <th className="text-left px-3 py-2 text-slate-400 font-medium">{t('admin.officialProducts.sync.file')}</th>
                                            <th className="text-left px-3 py-2 text-slate-400 font-medium">{t('admin.officialProducts.sync.status')}</th>
                                            <th className="text-right px-3 py-2 text-slate-400 font-medium">{t('admin.officialProducts.sync.created')}</th>
                                            <th className="text-right px-3 py-2 text-slate-400 font-medium">{t('admin.officialProducts.sync.updated')}</th>
                                            <th className="text-right px-3 py-2 text-slate-400 font-medium">{t('admin.officialProducts.sync.total')}</th>
                                            <th className="text-left px-3 py-2 text-slate-400 font-medium">{t('admin.officialProducts.sync.processedAt')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {syncStatus.logs.slice(0, 10).map(log => (
                                            <tr key={log.id} className="hover:bg-slate-800/30">
                                                <td className="px-3 py-2 font-mono text-slate-200">{log.fileName}</td>
                                                <td className="px-3 py-2">
                                                    {log.status === "SUCCESS" ? (
                                                        <span className="flex items-center gap-1 text-emerald-400">
                                                            <CheckCircleIcon className="w-3.5 h-3.5" />
                                                            {t('common.success')}
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-rose-400" title={log.errorMessage}>
                                                            <ExclamationCircleIcon className="w-3.5 h-3.5" />
                                                            {t('common.error')}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right text-slate-300">{log.created}</td>
                                                <td className="px-3 py-2 text-right text-slate-300">{log.updated}</td>
                                                <td className="px-3 py-2 text-right text-slate-400">{log.total}</td>
                                                <td className="px-3 py-2 text-slate-400">
                                                    {log.processedAt ? new Date(log.processedAt).toLocaleString() : "—"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Products browser */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl shadow-black/20">
                <div className="p-6 border-b border-slate-800 space-y-4">
                    {/* Title + count */}
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-base font-bold text-slate-100">{t('admin.officialProducts.catalog.title')}</h2>
                            {result && (
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {t('admin.officialProducts.catalog.count', { count: result.totalElements })}
                                </p>
                            )}
                        </div>
                        {(decisionCode || userGroupCode || productTypeCode) && (
                            <button
                                onClick={() => { setDecisionCode(""); setUserGroupCode(""); setProductTypeCode(""); }}
                                className="text-xs text-indigo-400 hover:text-indigo-300"
                            >
                                {t('common.clearFilters')}
                            </button>
                        )}
                    </div>
                    {/* Search + filters */}
                    <div className="flex flex-wrap gap-2">
                        <div className="relative flex-1 min-w-48">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="search"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder={t('admin.officialProducts.catalog.searchPlaceholder')}
                                className={`${inputCls} pl-9 w-full`}
                            />
                        </div>
                        {filterMeta && filterMeta.decisionCodes.length > 0 && (
                            <select
                                value={decisionCode}
                                onChange={e => { setDecisionCode(e.target.value); setPage(0); }}
                                className={selectCls}
                            >
                                <option value="">{t('admin.officialProducts.filters.allDecisions')}</option>
                                {filterMeta.decisionCodes.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        )}
                        {filterMeta && filterMeta.userGroups.length > 0 && (
                            <select
                                value={userGroupCode}
                                onChange={e => { setUserGroupCode(e.target.value); setPage(0); }}
                                className={selectCls}
                            >
                                <option value="">{t('admin.officialProducts.filters.allGroups')}</option>
                                {filterMeta.userGroups.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        )}
                        {filterMeta && filterMeta.productTypes.length > 0 && (
                            <select
                                value={productTypeCode}
                                onChange={e => { setProductTypeCode(e.target.value); setPage(0); }}
                                className={selectCls}
                            >
                                <option value="">{t('admin.officialProducts.filters.allTypes')}</option>
                                {filterMeta.productTypes.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                {loading && (
                    <div className="flex justify-center py-12">
                        <ArrowPathIcon className="w-6 h-6 text-slate-500 animate-spin" />
                    </div>
                )}

                {!loading && result && result.content.length === 0 && (
                    <div className="py-12 text-center text-sm text-slate-500">
                        {t('admin.officialProducts.catalog.empty')}
                    </div>
                )}

                {!loading && result && result.content.length > 0 && (
                    <>
                        <div>
                            {result.content.map(p => (
                                <ProductRow key={p.id} product={p} />
                            ))}
                        </div>

                        <div className="px-6 pb-4">
                            <PaginationBar
                                page={getPageMeta(result).number}
                                totalPages={getPageMeta(result).totalPages}
                                onPrev={() => setPage(p => Math.max(0, p - 1))}
                                onNext={() => setPage(p => p + 1)}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
