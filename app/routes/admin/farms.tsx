import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { apiGet, apiPut, apiDelete } from "~/utils/api";
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
                    setFarms(data.content);
                    setTotalPages(data.totalPages || 0);
                    setTotalElements(data.totalElements || 0);
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
                <h2 className="text-2xl font-extrabold text-slate-100">{t('admin.farms.title', { defaultValue: 'Farms Management' })}</h2>
            </div>

            {/* Filters & Search */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl shadow-black/20 space-y-4 sm:space-y-0 sm:flex sm:gap-4 sm:items-end">
                <div className="flex-1 space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Search</label>
                    <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                        <input 
                            type="text" 
                            placeholder="Search by name, description, location, or ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Approval</label>
                    <select 
                        value={filterApproved} 
                        onChange={(e) => setFilterApproved(e.target.value as any)}
                        className="w-full sm:w-auto px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-all"
                    >
                        <option value="ALL">All Status</option>
                        <option value="APPROVED">Approved</option>
                        <option value="PENDING">Pending</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Visibility</label>
                    <select 
                        value={filterPublic} 
                        onChange={(e) => setFilterPublic(e.target.value as any)}
                        className="w-full sm:w-auto px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-all"
                    >
                        <option value="ALL">All Visibility</option>
                        <option value="PUBLIC">Public</option>
                        <option value="PRIVATE">Private</option>
                    </select>
                </div>
            </div>

            {/* List */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {loading ? (
                    <div className="col-span-full p-8 text-center text-slate-400">Loading farms...</div>
                ) : filteredFarms.length === 0 ? (
                    <div className="col-span-full p-8 text-center text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl">No farms found matching your filters.</div>
                ) : (
                    filteredFarms.map(f => (
                        <div key={f.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl shadow-black/20 flex flex-col transition-transform hover:-translate-y-1 hover:shadow-indigo-500/10 hover:border-indigo-500/30">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h3 className="font-bold text-lg text-slate-100">{f.name}</h3>
                                    <p className="text-xs text-slate-500">ID: {f.id}</p>
                                </div>
                                <div className="flex flex-col gap-1.5 items-end">
                                    <button onClick={() => toggleFarmApproval(f.id, f.approved)}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${f.approved ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'}`}>
                                        {f.approved ? <CheckCircleIcon className="w-3 h-3" /> : <XCircleIcon className="w-3 h-3" />}
                                        {f.approved ? 'Approved' : 'Pending'}
                                    </button>
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${f.isPublic ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                                        {f.isPublic ? 'Public' : 'Private'}
                                    </span>
                                    {f.deletedAt && (
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                            Deleted
                                        </span>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex-1 space-y-2 mb-6 text-sm text-slate-400">
                                {f.location && <p><span className="text-slate-500">Location:</span> {f.location}</p>}
                                {f.description && <p className="line-clamp-2"><span className="text-slate-500">About:</span> {f.description}</p>}
                                {f.owner && <p><span className="text-slate-500">Owner:</span> {f.owner.username}</p>}
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                                {!f.deletedAt ? (
                                    <button onClick={() => deleteFarm(f.id)}
                                        className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                        title="Delete Farm">
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                ) : (
                                    <div />
                                )}
                                <button onClick={() => navigate(buildLocalizedPath(locale, `/admin/farms/${f.id}`))}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-300 bg-indigo-500/10 rounded-xl hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors">
                                    <Cog8ToothIcon className="w-4 h-4" />
                                    Manage
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 sm:px-6 mt-6">
                    <div className="flex flex-1 justify-between sm:hidden">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                            disabled={currentPage === 0}
                            className="relative inline-flex items-center rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                            disabled={currentPage === totalPages - 1}
                            className="relative ml-3 inline-flex items-center rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            Next
                        </button>
                    </div>
                    <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm text-slate-400">
                                Showing page <span className="font-semibold text-slate-200">{currentPage + 1}</span> of <span className="font-semibold text-slate-200">{totalPages}</span> (<span className="font-semibold text-slate-200">{totalElements}</span> total elements)
                            </p>
                        </div>
                        <div>
                            <nav className="isolate inline-flex -space-x-px rounded-xl shadow-sm" aria-label="Pagination">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                                    disabled={currentPage === 0}
                                    className="relative inline-flex items-center rounded-l-xl px-3 py-2 text-slate-400 bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    Previous
                                </button>
                                {Array.from({ length: totalPages }, (_, i) => i).map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => setCurrentPage(p)}
                                        className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold border border-slate-800 transition-all ${
                                            p === currentPage
                                                ? "bg-indigo-600 text-white border-indigo-600 z-10"
                                                : "text-slate-400 bg-slate-900 hover:bg-slate-800"
                                        }`}
                                    >
                                        {p + 1}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                                    disabled={currentPage === totalPages - 1}
                                    className="relative inline-flex items-center rounded-r-xl px-3 py-2 text-slate-400 bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    Next
                                </button>
                            </nav>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
