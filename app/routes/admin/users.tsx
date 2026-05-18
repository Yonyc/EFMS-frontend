import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPut, apiPost, apiDelete } from "~/utils/api";
import { useAuth } from "~/contexts/AuthContext";
import { PencilIcon, TrashIcon, EnvelopeIcon, CheckCircleIcon, XCircleIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";

export default function AdminUsers() {
    const { t } = useTranslation();
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);
    const pageSize = 10;
    
    // Filters and Search
    const [searchQuery, setSearchQuery] = useState("");
    const [filterVerified, setFilterVerified] = useState<"ALL" | "VERIFIED" | "UNVERIFIED">("ALL");
    const [filterAdmin, setFilterAdmin] = useState<"ALL" | "ADMIN" | "USER">("ALL");

    // Modal
    const [editingUser, setEditingUser] = useState<any>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiGet(`/admin/users?page=${currentPage}&size=${pageSize}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.content) {
                    setUsers(data.content);
                    setTotalPages(data.totalPages || 0);
                    setTotalElements(data.totalElements || 0);
                } else {
                    setUsers(data || []);
                    setTotalPages(0);
                    setTotalElements(0);
                }
            }
        } catch (error) {
            console.error("Failed to load users", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [currentPage]);

    const toggleUserAdmin = async (userId: number, isAdmin: boolean) => {
        if (currentUser?.id === String(userId) && isAdmin) {
            if (!window.confirm(t('admin.users.confirmSelfDemotion', { defaultValue: 'Are you sure you want to demote yourself? You will lose access to the admin panel.' }))) {
                return;
            }
        } else {
            if (!window.confirm(t('admin.users.confirmAdminChange', { defaultValue: 'Are you sure you want to change this user\'s admin status?' }))) {
                return;
            }
        }
        await apiPut(`/admin/users/${userId}/admin?isAdmin=${!isAdmin}`);
        fetchData();
    };

    const toggleUserVerified = async (userId: number, isVerified: boolean) => {
        await apiPut(`/admin/users/${userId}/verify?isVerified=${!isVerified}`);
        fetchData();
    };

    const resendVerificationMail = async (userId: number) => {
        const res = await apiPost(`/admin/users/${userId}/resend-verification`);
        if (res.ok) {
            alert(t('admin.users.mailSent', { defaultValue: 'Verification email sent.' }));
        } else {
            alert(t('admin.users.mailFailed', { defaultValue: 'Failed to send verification email.' }));
        }
    };

    const deleteUser = async (userId: number) => {
        if (window.confirm(t('admin.users.confirmDelete', { defaultValue: 'Are you sure you want to delete this user?' }))) {
            await apiDelete(`/admin/users/${userId}`);
            fetchData();
        }
    };

    const submitEditUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        await apiPut(`/admin/users/${editingUser.id}`, editingUser);
        setEditingUser(null);
        fetchData();
    };

    const filteredUsers = useMemo(() => {
        return users.filter(u => {
            const matchesSearch = u.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                  u.id.toString() === searchQuery;
            const matchesVerified = filterVerified === "ALL" ? true : (filterVerified === "VERIFIED" ? u.verified : !u.verified);
            const matchesAdmin = filterAdmin === "ALL" ? true : (filterAdmin === "ADMIN" ? u.admin : !u.admin);
            return matchesSearch && matchesVerified && matchesAdmin;
        });
    }, [users, searchQuery, filterVerified, filterAdmin]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <h2 className="text-2xl font-extrabold text-slate-100">{t('admin.users.title', { defaultValue: 'Users Management' })}</h2>
            </div>

            {/* Filters & Search */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl shadow-black/20 space-y-4 sm:space-y-0 sm:flex sm:gap-4 sm:items-end">
                <div className="flex-1 space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Search</label>
                    <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                        <input 
                            type="text" 
                            placeholder="Search by username, email, ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Verification</label>
                    <select 
                        value={filterVerified} 
                        onChange={(e) => setFilterVerified(e.target.value as any)}
                        className="w-full sm:w-auto px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-all"
                    >
                        <option value="ALL">All Status</option>
                        <option value="VERIFIED">Verified</option>
                        <option value="UNVERIFIED">Unverified</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</label>
                    <select 
                        value={filterAdmin} 
                        onChange={(e) => setFilterAdmin(e.target.value as any)}
                        className="w-full sm:w-auto px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-all"
                    >
                        <option value="ALL">All Roles</option>
                        <option value="ADMIN">Admin</option>
                        <option value="USER">User</option>
                    </select>
                </div>
            </div>

            {/* List */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-400">Loading users...</div>
                ) : filteredUsers.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">No users found matching your filters.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-800 bg-slate-950/50">
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {filteredUsers.map(u => (
                                    <tr key={u.id} className="hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-slate-200">{u.username}</span>
                                                <span className="text-xs text-slate-500">ID: {u.id} {u.email ? `• ${u.email}` : ''}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => toggleUserVerified(u.id, u.verified)}
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${u.verified ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'}`}>
                                                    {u.verified ? <CheckCircleIcon className="w-3.5 h-3.5" /> : <XCircleIcon className="w-3.5 h-3.5" />}
                                                    {u.verified ? 'Verified' : 'Unverified'}
                                                </button>
                                                {!u.verified && (
                                                    <button onClick={() => resendVerificationMail(u.id)}
                                                        className="p-1 rounded-md text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                                                        title="Resend verification email">
                                                        <EnvelopeIcon className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button onClick={() => toggleUserAdmin(u.id, u.admin)}
                                                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${u.admin ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}>
                                                {u.admin ? 'Admin' : 'User'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={() => setEditingUser(u)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                                                    title="Edit User">
                                                    <PencilIcon className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => deleteUser(u.id)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                                    title="Delete User">
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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

            {/* Edit Modal */}
            {editingUser && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="text-xl font-bold mb-6 text-slate-100">{t('admin.users.editTitle', { defaultValue: 'Edit User' })}</h3>
                        <form onSubmit={submitEditUser} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-300">Username</label>
                                <input type="text" value={editingUser.username || ''}
                                    onChange={e => setEditingUser({...editingUser, username: e.target.value})}
                                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" required />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-300">Email</label>
                                <input type="email" value={editingUser.email || ''}
                                    onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
                            </div>
                            <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-slate-800">
                                <button type="button" onClick={() => setEditingUser(null)}
                                    className="px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors">
                                    Cancel
                                </button>
                                <button type="submit"
                                    className="px-4 py-2 text-sm font-semibold text-white bg-indigo-500 rounded-xl hover:bg-indigo-400 shadow-lg shadow-indigo-500/25 transition-all">
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
