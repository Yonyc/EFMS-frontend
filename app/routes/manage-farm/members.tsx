import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useFarm } from '../../contexts/FarmContext';
import { apiGet, apiPost, apiPut, apiDelete } from '~/utils/api';
import UserSearchInput from '~/components/UserSearchInput';
import { TrashIcon, UserPlusIcon } from '@heroicons/react/24/outline';

interface FarmMemberDto {
    userId: number;
    username: string;
    role: string;
    owner: boolean;
}

export default function ManageFarmMembers() {
    const { t } = useTranslation();
    const { selectedFarm } = useFarm();

    const [members, setMembers] = useState<FarmMemberDto[]>([]);
    const [memberLoading, setMemberLoading] = useState(false);
    const [memberError, setMemberError] = useState('');
    
    const [newMemberUsername, setNewMemberUsername] = useState('');
    const [newMemberId, setNewMemberId] = useState<number | null>(null);
    const [newMemberRole, setNewMemberRole] = useState('EDITOR');

    useEffect(() => {
        const loadMembers = async () => {
            if (!selectedFarm?.id) {
                setMembers([]);
                setMemberError('');
                return;
            }
            if (selectedFarm.canManage === false) {
                setMembers([]);
                setMemberError(t('manageFarms.members.errors.noAccess', { defaultValue: 'You do not have permission to manage members' }));
                return;
            }
            setMemberLoading(true);
            setMemberError('');
            try {
                const response = await apiGet(`/farm/${selectedFarm.id}/members`);
                if (response.ok) {
                    const data = await response.json();
                    setMembers(data);
                } else if (response.status === 403) {
                    setMembers([]);
                    setMemberError(t('manageFarms.members.errors.noAccess', { defaultValue: 'You do not have permission to manage members' }));
                } else {
                    setMemberError(t('manageFarms.members.errors.loadFailed', { defaultValue: 'Failed to load members' }));
                }
            } catch (err) {
                console.error('Failed to load members:', err);
                setMemberError(t('manageFarms.members.errors.loadFailed', { defaultValue: 'Failed to load members' }));
            } finally {
                setMemberLoading(false);
            }
        };
        loadMembers();
    }, [selectedFarm?.id, selectedFarm?.canManage, t]);

    if (!selectedFarm) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
                <p className="text-slate-400 text-center">{t('manageFarms.info.selectFarm', { defaultValue: 'Please select a farm first' })}</p>
            </div>
        );
    }

    if (!selectedFarm.canManage) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
                <p className="text-rose-400 text-center font-medium">{t('manageFarms.members.errors.noAccess', { defaultValue: 'You do not have permission to manage members' })}</p>
            </div>
        );
    }

    const handleAddMember = async (e: FormEvent) => {
        e.preventDefault();
        setMemberError('');
        if (!selectedFarm?.id) return;
        if (!newMemberId || !newMemberUsername.trim()) {
            setMemberError(t('manageFarms.members.errors.usernameRequired', { defaultValue: 'Please select a valid user' }));
            return;
        }
        try {
            const response = await apiPost(`/farm/${selectedFarm.id}/members`, {
                userId: newMemberId,
                username: newMemberUsername.trim(),
                role: newMemberRole,
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                setMemberError(data.message || t('manageFarms.members.errors.saveFailed', { defaultValue: 'Failed to add member' }));
                return;
            }
            const created = await response.json();
            setMembers(prev => [...prev, created]);
            setNewMemberUsername('');
            setNewMemberId(null);
            setNewMemberRole('EDITOR');
        } catch (err) {
            console.error('Failed to add member:', err);
            setMemberError(t('manageFarms.members.errors.saveFailed', { defaultValue: 'Failed to add member' }));
        }
    };

    const handleUpdateMember = async (userId: number, role: string) => {
        if (!selectedFarm?.id) return;
        setMemberError('');
        try {
            const response = await apiPut(`/farm/${selectedFarm.id}/members/${userId}`, { role });
            if (!response.ok) {
                setMemberError(t('manageFarms.members.errors.saveFailed', { defaultValue: 'Failed to update member' }));
                return;
            }
            const updated = await response.json();
            setMembers(prev => prev.map(m => m.userId === userId ? { ...m, role: updated.role } : m));
        } catch (err) {
            console.error('Failed to update member:', err);
            setMemberError(t('manageFarms.members.errors.saveFailed', { defaultValue: 'Failed to update member' }));
        }
    };

    const handleRemoveMember = async (userId: number) => {
        if (!selectedFarm?.id) return;
        if (!window.confirm(t('manageFarms.members.confirmRemove', { defaultValue: 'Are you sure you want to remove this member?' }))) return;
        setMemberError('');
        try {
            const response = await apiDelete(`/farm/${selectedFarm.id}/members/${userId}`);
            if (!response.ok) {
                setMemberError(t('manageFarms.members.errors.removeFailed', { defaultValue: 'Failed to remove member' }));
                return;
            }
            setMembers(prev => prev.filter(m => m.userId !== userId));
        } catch (err) {
            console.error('Failed to remove member:', err);
            setMemberError(t('manageFarms.members.errors.removeFailed', { defaultValue: 'Failed to remove member' }));
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/20">
                <div>
                    <h2 className="text-xl font-bold text-slate-100">{t('manageFarms.members.title', { defaultValue: 'Farm Members' })}</h2>
                    <p className="text-sm text-slate-400 mt-1">{t('manageFarms.members.description', { defaultValue: 'Manage who has access to this farm.' })}</p>
                </div>

                {memberError && <div className="mt-4 rounded-xl bg-rose-500/10 p-4 text-sm font-medium text-rose-400 border border-rose-500/20">{memberError}</div>}

                <form onSubmit={handleAddMember} className="mt-6 flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                        <UserSearchInput
                            value={newMemberUsername}
                            onChange={setNewMemberUsername}
                            onSelectUser={(u) => setNewMemberId(u.id)}
                            placeholder={t('manageFarms.members.addPlaceholder', { defaultValue: 'Search username...' })}
                            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                    </div>
                    <div className="flex gap-3">
                        <select
                            value={newMemberRole}
                            onChange={(e) => setNewMemberRole(e.target.value)}
                            className="w-32 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                        >
                            <option value="ADMIN">{t('manageFarms.members.roles.admin', { defaultValue: 'Admin' })}</option>
                            <option value="EDITOR">{t('manageFarms.members.roles.editor', { defaultValue: 'Editor' })}</option>
                            <option value="VIEWER">{t('manageFarms.members.roles.viewer', { defaultValue: 'Viewer' })}</option>
                        </select>
                        <button
                            type="submit"
                            className="inline-flex items-center justify-center rounded-xl bg-emerald-500/10 px-4 py-2.5 font-semibold text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all"
                            title={t('manageFarms.members.add', { defaultValue: 'Add Member' })}
                        >
                            <UserPlusIcon className="w-5 h-5" />
                        </button>
                    </div>
                </form>

                <div className="mt-6 divide-y divide-slate-800 border-t border-slate-800 pt-2">
                    {memberLoading ? (
                        <p className="py-8 text-center text-sm text-slate-500">{t('common.loading', { defaultValue: 'Loading...' })}</p>
                    ) : members.length === 0 ? (
                        <p className="py-8 text-center text-sm text-slate-500">{t('manageFarms.members.empty', { defaultValue: 'No members in this farm.' })}</p>
                    ) : (
                        members.map((member) => (
                            <div key={member.userId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4">
                                <div>
                                    <p className="font-medium text-slate-200">{member.username}</p>
                                    {member.owner && <span className="mt-1 inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/20">{t('manageFarms.members.roles.owner', { defaultValue: 'Owner' })}</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                    <select
                                        value={member.role}
                                        onChange={(e) => handleUpdateMember(member.userId, e.target.value)}
                                        disabled={member.owner}
                                        className="w-28 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs font-medium text-slate-300 focus:border-indigo-500 focus:outline-none disabled:opacity-50 transition-all"
                                    >
                                        <option value="ADMIN">{t('manageFarms.members.roles.admin', { defaultValue: 'Admin' })}</option>
                                        <option value="EDITOR">{t('manageFarms.members.roles.editor', { defaultValue: 'Editor' })}</option>
                                        <option value="VIEWER">{t('manageFarms.members.roles.viewer', { defaultValue: 'Viewer' })}</option>
                                    </select>
                                    {!member.owner && (
                                        <button
                                            onClick={() => handleRemoveMember(member.userId)}
                                            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-all"
                                            title={t('manageFarms.members.remove', { defaultValue: 'Remove Member' })}
                                        >
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
