import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { apiGet, apiPut, apiPost, apiDelete } from "~/utils/api";
import { useFarm } from "~/contexts/FarmContext";
import { ArrowLeftIcon, MapIcon, TrashIcon, UserPlusIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { buildLocalizedPath } from "../../utils/locale";
import { useCurrentLocale } from "../../hooks/useCurrentLocale";
import UserSearchInput from "~/components/UserSearchInput";

export default function AdminFarmDetail() {
    const { farmId } = useParams();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const locale = useCurrentLocale();
    const { selectFarm } = useFarm();
    
    const [farm, setFarm] = useState<any>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [editName, setEditName] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editLocation, setEditLocation] = useState("");
    const [editIsPublic, setEditIsPublic] = useState(false);
    
    const [newMemberUsername, setNewMemberUsername] = useState("");
    const [newMemberId, setNewMemberId] = useState<number | null>(null);
    const [newMemberRole, setNewMemberRole] = useState("EDITOR");

    const fetchData = async () => {
        if (!farmId) return;
        setLoading(true);
        try {
            const [farmRes, membersRes] = await Promise.all([
                apiGet(`/admin/farms/${farmId}`),
                apiGet(`/farm/${farmId}/members`).catch(() => null)
            ]);
            
            if (farmRes.ok) {
                const f = await farmRes.json();
                setFarm(f);
                setEditName(f.name || "");
                setEditDescription(f.description || "");
                setEditLocation(f.location || "");
                setEditIsPublic(f.isPublic || false);
            }
            if (membersRes && membersRes.ok) {
                setMembers(await membersRes.json());
            }
        } catch (error) {
            console.error("Failed to load farm details", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [farmId]);

    const handleUpdateFarm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!farm) return;
        try {
            const res = await apiPut(`/admin/farms/${farmId}`, {
                name: editName,
                description: editDescription,
                location: editLocation,
                isPublic: editIsPublic
            });
            if (res.ok) {
                alert(t('admin.farmDetail.settings.success', { defaultValue: 'Farm updated successfully.' }));
                fetchData();
            }
        } catch (err) {
            alert(t('admin.farmDetail.settings.failed', { defaultValue: 'Failed to update farm' }));
        }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMemberUsername || !newMemberId) return;
        try {
            const res = await apiPost(`/farm/${farmId}/members`, {
                userId: newMemberId,
                username: newMemberUsername,
                role: newMemberRole
            });
            if (res.ok) {
                setNewMemberUsername("");
                setNewMemberId(null);
                fetchData();
            } else {
                alert(t('admin.farmDetail.members.addFailed', { defaultValue: 'Failed to add member' }));
            }
        } catch (err) {
            alert(t('admin.farmDetail.members.addFailed', { defaultValue: 'Failed to add member' }));
        }
    };

    const handleUpdateMemberRole = async (userId: number, role: string) => {
        try {
            const res = await apiPut(`/farm/${farmId}/members/${userId}`, { role });
            if (res.ok) {
                fetchData();
            }
        } catch (err) {
            alert(t('admin.farmDetail.members.roleFailed', { defaultValue: 'Failed to update member role' }));
        }
    };

    const handleRemoveMember = async (userId: number) => {
        if (!window.confirm(t('admin.farmDetail.members.removeConfirm', { defaultValue: 'Are you sure you want to remove this member?' }))) return;
        try {
            const res = await apiDelete(`/farm/${farmId}/members/${userId}`);
            if (res.ok) {
                fetchData();
            }
        } catch (err) {
            alert(t('admin.farmDetail.members.removeFailed', { defaultValue: 'Failed to remove member' }));
        }
    };

    const handleManageInApp = async () => {
        if (!farmId) return;
        await selectFarm(farmId);
        navigate(buildLocalizedPath(locale, "/map"));
    };

    const handleDeleteFarm = async () => {
        const confirm1 = window.confirm(t('admin.farmDetail.dangerZone.deleteConfirm', { 
            defaultValue: 'Soft-delete farm "{{name}}"? This will also soft-delete all its parcels and operations. The farm can be restored later.',
            name: farm?.name
        }));
        if (!confirm1) return;
        try {
            const res = await apiDelete(`/admin/farms/${farmId}`);
            if (res.ok) {
                fetchData();
            } else {
                alert(t('admin.farmDetail.dangerZone.deleteFailed', { defaultValue: 'Failed to delete farm' }));
            }
        } catch (err) {
            alert(t('admin.farmDetail.dangerZone.deleteFailed', { defaultValue: 'Failed to delete farm' }));
        }
    };

    const handleRestoreFarm = async () => {
        const confirm1 = window.confirm(t('admin.farmDetail.dangerZone.restoreConfirm', { 
            defaultValue: 'Restore farm "{{name}}" and its cascade-deleted children?',
            name: farm?.name
        }));
        if (!confirm1) return;
        try {
            const res = await apiPost(`/admin/farms/${farmId}/restore`, {});
            if (res.ok) {
                fetchData();
            } else {
                alert(t('admin.farmDetail.dangerZone.restoreFailed', { defaultValue: 'Failed to restore farm' }));
            }
        } catch (err) {
            alert(t('admin.farmDetail.dangerZone.restoreFailed', { defaultValue: 'Failed to restore farm' }));
        }
    };

    if (loading) {
        return <div className="text-slate-400 p-8 text-center">{t('admin.farmDetail.loading', { defaultValue: 'Loading farm details...' })}</div>;
    }

    if (!farm) {
        return <div className="text-slate-400 p-8 text-center">{t('admin.farmDetail.notFound', { defaultValue: 'Farm not found.' })}</div>;
    }

    return (
        <div className="space-y-8 max-w-5xl">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(buildLocalizedPath(locale, "/admin/farms"))}
                        className="p-2 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors">
                        <ArrowLeftIcon className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-extrabold text-slate-100">{farm.name}</h2>
                            {farm.deletedAt && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                    <TrashIcon className="w-3 h-3" /> {t('admin.farms.deletedBadge', { defaultValue: 'Deleted' })}
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-slate-400">ID: {farm.id}</p>
                    </div>
                </div>
                {!farm.deletedAt && (
                    <button onClick={handleManageInApp}
                        className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-indigo-500 rounded-xl hover:bg-indigo-400 shadow-lg shadow-indigo-500/25 transition-all">
                        <MapIcon className="w-5 h-5" />
                        {t('admin.farmDetail.manageInApp', { defaultValue: 'Manage in App' })}
                    </button>
                )}
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
                {/* Farm Settings */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/20">
                    <h3 className="text-lg font-bold text-slate-100 mb-6">{t('admin.farmDetail.settings.title', { defaultValue: 'Farm Settings' })}</h3>
                    <form onSubmit={handleUpdateFarm} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-slate-300">{t('admin.farmDetail.settings.nameLabel', { defaultValue: 'Name' })}</label>
                            <input type="text" value={editName}
                                onChange={e => setEditName(e.target.value)}
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" required />
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-slate-300">{t('admin.farmDetail.settings.descriptionLabel', { defaultValue: 'Description' })}</label>
                            <textarea value={editDescription}
                                onChange={e => setEditDescription(e.target.value)}
                                rows={3}
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-slate-300">{t('admin.farmDetail.settings.locationLabel', { defaultValue: 'Location' })}</label>
                            <input type="text" value={editLocation}
                                onChange={e => setEditLocation(e.target.value)}
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
                        </div>
                        <label className="flex items-center gap-3">
                            <input type="checkbox" checked={editIsPublic}
                                onChange={e => setEditIsPublic(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900" />
                            <span className="text-sm font-medium text-slate-300">{t('admin.farmDetail.settings.publicLabel', { defaultValue: 'Public Farm' })}</span>
                        </label>
                        <div className="pt-4 flex justify-end">
                            <button type="submit"
                                className="px-5 py-2.5 text-sm font-semibold text-indigo-300 bg-indigo-500/10 rounded-xl hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors">
                                {t('admin.farmDetail.settings.saveBtn', { defaultValue: 'Save Settings' })}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Farm Members */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/20 flex flex-col h-full">
                    <h3 className="text-lg font-bold text-slate-100 mb-6">{t('admin.farmDetail.members.title', { defaultValue: 'Members' })}</h3>
                    
                    <form onSubmit={handleAddMember} className="flex gap-3 mb-6">
                        <div className="flex-1">
                            <UserSearchInput 
                                value={newMemberUsername}
                                onChange={setNewMemberUsername}
                                onSelectUser={(u) => setNewMemberId(u.id)}
                                placeholder={t('admin.farmDetail.members.searchPlaceholder', { defaultValue: 'Search username...' })}
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                            />
                        </div>
                        <select value={newMemberRole} onChange={e => setNewMemberRole(e.target.value)}
                            className="w-32 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all">
                            <option value="ADMIN">{t('admin.farmDetail.members.adminRole', { defaultValue: 'Admin' })}</option>
                            <option value="EDITOR">{t('admin.farmDetail.members.editorRole', { defaultValue: 'Editor' })}</option>
                            <option value="VIEWER">{t('admin.farmDetail.members.viewerRole', { defaultValue: 'Viewer' })}</option>
                        </select>
                        <button type="submit"
                            className="px-4 py-2 text-sm font-semibold text-emerald-300 bg-emerald-500/10 rounded-xl hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
                            title={t('admin.farmDetail.members.addBtnTitle', { defaultValue: 'Add Member' })}>
                            <UserPlusIcon className="w-5 h-5" />
                        </button>
                    </form>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                        {members.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-4">{t('admin.farmDetail.members.empty', { defaultValue: 'No members in this farm.' })}</p>
                        ) : (
                            members.map(m => (
                                <div key={m.userId} className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-slate-200">{m.username}</span>
                                        {m.owner && <span className="text-[10px] uppercase font-bold text-emerald-400">{t('admin.farmDetail.members.ownerBadge', { defaultValue: 'Owner' })}</span>}
                                    </div>
                                    {!m.owner && (
                                        <div className="flex items-center gap-2">
                                            <select value={m.role} onChange={e => handleUpdateMemberRole(m.userId, e.target.value)}
                                                className="w-28 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition-all">
                                                <option value="ADMIN">{t('admin.farmDetail.members.adminRole', { defaultValue: 'Admin' })}</option>
                                                <option value="EDITOR">{t('admin.farmDetail.members.editorRole', { defaultValue: 'Editor' })}</option>
                                                <option value="VIEWER">{t('admin.farmDetail.members.viewerRole', { defaultValue: 'Viewer' })}</option>
                                            </select>
                                            <button onClick={() => handleRemoveMember(m.userId)}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                                title={t('admin.farmDetail.members.removeBtnTitle', { defaultValue: 'Remove Member' })}>
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Danger Zone / Restore */}
            <div className={`rounded-2xl border p-6 space-y-4 ${
                farm.deletedAt
                    ? 'bg-emerald-950/20 border-emerald-500/20'
                    : 'bg-rose-950/20 border-rose-500/20'
            }`}>
                <h3 className={`text-lg font-bold ${
                    farm.deletedAt ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                    {farm.deletedAt ? t('admin.farmDetail.dangerZone.restoreTitle', { defaultValue: '🔄 Restore Farm' }) : t('admin.farmDetail.dangerZone.dangerTitle', { defaultValue: '⚠️ Danger Zone' })}
                </h3>

                {farm.deletedAt ? (
                    <div className="flex items-start justify-between gap-6">
                        <div>
                            <p className="text-sm text-slate-300 font-medium">{t('admin.farmDetail.dangerZone.deletedDesc', { defaultValue: 'This farm has been soft-deleted.' })}</p>
                            <p className="text-xs text-slate-500 mt-1">
                                {t('admin.farmDetail.dangerZone.restoreDesc', { defaultValue: 'Restoring will bring back this farm and all parcels & operations that were cascade-deleted at the same time. Independently deleted children will remain deleted.' })}
                            </p>
                        </div>
                        <button onClick={handleRestoreFarm}
                            className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-500 shadow-lg shadow-emerald-500/20 transition-all">
                            <ArrowPathIcon className="w-4 h-4" />
                            {t('admin.farmDetail.dangerZone.restoreBtn', { defaultValue: 'Restore Farm' })}
                        </button>
                    </div>
                ) : (
                    <div className="flex items-start justify-between gap-6">
                        <div>
                            <p className="text-sm text-slate-300 font-medium">{t('admin.farmDetail.dangerZone.deleteDesc', { defaultValue: 'Delete this farm.' })}</p>
                            <p className="text-xs text-slate-500 mt-1">
                                {t('admin.farmDetail.dangerZone.deleteDescDetail', { defaultValue: 'This will soft-delete the farm and cascade to all its parcels and operations. The data is preserved and can be restored by an admin.' })}
                            </p>
                        </div>
                        <button onClick={handleDeleteFarm}
                            className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-500 shadow-lg shadow-rose-500/20 transition-all">
                            <TrashIcon className="w-4 h-4" />
                            {t('admin.farmDetail.dangerZone.deleteBtn', { defaultValue: 'Delete Farm' })}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
