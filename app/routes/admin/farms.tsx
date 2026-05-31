import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { apiGet, apiPut, apiDelete, getPageMeta } from "~/utils/api";
import { PaginationBar } from "~/components/PaginationBar";
import { TrashIcon, CheckCircleIcon, XCircleIcon, MagnifyingGlassIcon, Cog8ToothIcon } from "@heroicons/react/24/outline";
import { buildLocalizedPath } from "../../utils/locale";
import { useCurrentLocale } from "../../hooks/useCurrentLocale";

export default function AdminFarmsList() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const locale = useCurrentLocale();
    const [farms, setFarms] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);
    const pageSize = 9;

    // Filters and Search
    const [searchQuery, setSearchQuery] = useState("");
    const [filterApproved, setFilterApproved] = useState<"ALL" | "APPROVED" | "PENDING">("ALL");
    const [filterPublic, setFilterPublic] = useState<"ALL" | "PUBLIC" | "PRIVATE">("ALL");

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiGet(`/admin/farms?page=${currentPage}&size=${pageSize}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.content) {
                    const pm = getPageMeta(data);
                    setFarms(data.content);
                    setTotalPages(pm.totalPages);
                    setTotalElements(pm.totalElements);
                } else {
                    setFarms(data || []);
                    setTotalPages(0);
                    setTotalElements(0);
                }
            }
        } catch (error) {
            console.error("Failed to load farms", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [currentPage]);

    const toggleFarmApproval = async (farmId: number, isApproved: boolean) => {
        await apiPut(`/admin/farms/${farmId}/approve?isApproved=${!isApproved}`);
        fetchData();
    };

    const deleteFarm = async (farmId: number) => {
        if (window.confirm(t('admin.farms.confirmDelete', { defaultValue: 'Are you sure you want to delete this farm? This action cannot be undone.' }))) {
            await apiDelete(`/admin/farms/${farmId}`);
            fetchData();
        }
    };

    const filteredFarms = useMemo(() => {
        return farms.filter(f => {
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch = f.name?.toLowerCase().includes(searchLower) || 
                                  f.description?.toLowerCase().includes(searchLower) ||
                                  f.location?.toLowerCase().includes(searchLower) ||
                                  f.id.toString() === searchQuery;
            const matchesApproved = filterApproved === "ALL" ? true : (filterApproved === "APPROVED" ? f.approved : !f.approved);
            const matchesPublic = filterPublic === "ALL" ? true : (filterPublic === "PUBLIC" ? f.isPublic : !f.isPublic);
            return matchesSearch && matchesApproved && matchesPublic;
        });
    }, [farms, searchQuery, filterApproved, filterPublic]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <h2 className="text-2xl font-extrabold text-slate-900">{t('admin.farms.title', { defaultValue: 'Farms Management' })}</h2>
            </div>

            {/* Filters & Search */}
            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xl shadow-slate-900/10 space-y-4 sm:space-y-0 sm:flex sm:gap-4 sm:items-end">
                <div className="flex-1 space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('admin.farms.searchLabel', { defaultValue: 'Search' })}</label>
                    <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                        <input 
                            type="text" 
                            placeholder={t('admin.farms.searchPlaceholder', { defaultValue: 'Search by name, description, location, or ID...' })}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('admin.farms.approvalLabel', { defaultValue: 'Approval' })}</label>
                    <select 
                        value={filterApproved} 
                        onChange={(e) => setFilterApproved(e.target.value as any)}
                        className="w-full sm:w-auto px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-indigo-500 transition-all"
                    >
                        <option value="ALL">{t('admin.farms.allStatus', { defaultValue: 'All Status' })}</option>
                        <option value="APPROVED">{t('admin.farms.approved', { defaultValue: 'Approved' })}</option>
                        <option value="PENDING">{t('admin.farms.pending', { defaultValue: 'Pending' })}</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('admin.farms.visibilityLabel', { defaultValue: 'Visibility' })}</label>
                    <select 
                        value={filterPublic} 
                        onChange={(e) => setFilterPublic(e.target.value as any)}
                        className="w-full sm:w-auto px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-indigo-500 transition-all"
                    >
                        <option value="ALL">{t('admin.farms.allVisibility', { defaultValue: 'All Visibility' })}</option>
                        <option value="PUBLIC">{t('admin.farms.public', { defaultValue: 'Public' })}</option>
                        <option value="PRIVATE">{t('admin.farms.private', { defaultValue: 'Private' })}</option>
                    </select>
                </div>
            </div>

            {/* List */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {loading ? (
                    <div className="col-span-full p-8 text-center text-slate-500">{t('admin.farms.loading', { defaultValue: 'Loading farms...' })}</div>
                ) : filteredFarms.length === 0 ? (
                    <div className="col-span-full p-8 text-center text-slate-500 bg-white border border-slate-200 rounded-2xl">{t('admin.farms.noFarms', { defaultValue: 'No farms found matching your filters.' })}</div>
                ) : (
                    filteredFarms.map(f => (
                        <div key={f.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xl shadow-slate-900/10 flex flex-col transition-transform hover:-translate-y-1 hover:shadow-indigo-500/10 hover:border-indigo-500/30">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h3 className="font-bold text-lg text-slate-900">{f.name}</h3>
                                    <p className="text-xs text-slate-500">ID: {f.id}</p>
                                </div>
                                <div className="flex flex-col gap-1.5 items-end">
                                    <button onClick={() => toggleFarmApproval(f.id, f.approved)}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${f.approved ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'}`}>
                                        {f.approved ? <CheckCircleIcon className="w-3 h-3" /> : <XCircleIcon className="w-3 h-3" />}
                                        {f.approved ? t('admin.farms.approved', { defaultValue: 'Approved' }) : t('admin.farms.pending', { defaultValue: 'Pending' })}
                                    </button>
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${f.isPublic ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-slate-100 text-slate-500 border border-slate-300'}`}>
                                        {f.isPublic ? t('admin.farms.public', { defaultValue: 'Public' }) : t('admin.farms.private', { defaultValue: 'Private' })}
                                    </span>
                                    {f.deletedAt && (
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                            {t('admin.farms.deletedBadge', { defaultValue: 'Deleted' })}
                                        </span>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex-1 space-y-2 mb-6 text-sm text-slate-500">
                                {f.location && <p><span className="text-slate-500">{t('admin.farms.locationLabel', { defaultValue: 'Location:' })}</span> {f.location}</p>}
                                {f.description && <p className="line-clamp-2"><span className="text-slate-500">{t('admin.farms.aboutLabel', { defaultValue: 'About:' })}</span> {f.description}</p>}
                                {f.owner && <p><span className="text-slate-500">{t('admin.farms.ownerLabel', { defaultValue: 'Owner:' })}</span> {f.owner.username}</p>}
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                                {!f.deletedAt ? (
                                    <button onClick={() => deleteFarm(f.id)}
                                        className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                        title={t('admin.farms.deleteBtnTitle', { defaultValue: 'Delete Farm' })}>
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                ) : (
                                    <div />
                                )}
                                <button onClick={() => navigate(buildLocalizedPath(locale, `/admin/farms/${f.id}`))}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-300 bg-indigo-500/10 rounded-xl hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors">
                                    <Cog8ToothIcon className="w-4 h-4" />
                                    {t('admin.farms.manageBtn', { defaultValue: 'Manage' })}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <PaginationBar
                page={currentPage}
                totalPages={totalPages}
                onPrev={() => setCurrentPage(p => Math.max(0, p - 1))}
                onNext={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            />
        </div>
    );
}
