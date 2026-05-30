import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { XMarkIcon } from "@heroicons/react/24/outline";
import UserSearchInput from "../../UserSearchInput";
import type { ParcelShareDto } from "../types";

export interface ParcelShareData {
    childCount: number;
    shareList: ParcelShareDto[];
    shareError: string;
    shareLoading: boolean;
    currentUsername: string | undefined;
    handleAddShare: (username: string, role: string, includeChildren: boolean) => Promise<boolean>;
    handleUpdateShare: (userId: number, patch: { role?: string; includeChildren?: boolean }) => Promise<void>;
    handleRemoveShare: (userId: number) => Promise<void>;
}


export default function ParcelSharePanel({ share }: { share: ParcelShareData }) {
    const { t } = useTranslation();
    const { childCount, shareList, shareError, shareLoading, currentUsername, handleAddShare, handleUpdateShare, handleRemoveShare } = share;

    const [username, setUsername] = useState('');
    const [role, setRole] = useState('VIEWER');
    const [includeChildren, setIncludeChildren] = useState(true);
    const [localError, setLocalError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const onAdd = async () => {
        const trimmed = username.trim();
        if (!trimmed) {
            setLocalError(t('map.sharing.errors.usernameRequired', { defaultValue: 'Enter a username to share' }));
            return;
        }
        if (currentUsername && trimmed.toLowerCase() === currentUsername.toLowerCase()) {
            setLocalError(t('map.sharing.errors.cannotShareWithSelf', { defaultValue: 'You cannot share a parcel with yourself' }));
            return;
        }
        setLocalError('');
        setSubmitting(true);
        const ok = await handleAddShare(trimmed, role, includeChildren);
        setSubmitting(false);
        if (ok) {
            setUsername('');
            setRole('VIEWER');
            setIncludeChildren(true);
        } else {
            setLocalError(t('map.sharing.errors.saveFailed', { defaultValue: 'Unable to save share' }));
        }
    };

    return (
        <div>
            {(localError || shareError) && (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {localError || shareError}
                </div>
            )}

            {/* Add form */}
            <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex-1">
                    <UserSearchInput
                        placeholder={t('map.sharing.usernamePlaceholder', { defaultValue: 'Username' })}
                        value={username}
                        onChange={setUsername}
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                    />
                </div>
                <div className="flex gap-2">
                    <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:border-indigo-400"
                    >
                        <option value="VIEWER">{t('map.sharing.roles.viewer', { defaultValue: 'Viewer' })}</option>
                        <option value="EDITOR">{t('map.sharing.roles.editor', { defaultValue: 'Editor' })}</option>
                    </select>
                    <button
                        type="button"
                        onClick={onAdd}
                        disabled={submitting}
                        className="h-9 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                    >
                        {t('common.add', { defaultValue: 'Add' })}
                    </button>
                </div>
            </div>
            {childCount > 0 && (
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                    <input
                        type="checkbox"
                        checked={includeChildren}
                        onChange={(e) => setIncludeChildren(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    {t('map.sharing.includeChildren', { defaultValue: 'Also share sub-parcels' })}
                </label>
            )}

            {/* People with access */}
            <div className="mt-4">
                <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    {t('map.sharing.currentShares', { defaultValue: 'People with access' })}
                </h4>
                <div className="mt-2 flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
                    {shareLoading && (
                        <div className="py-4 text-center text-xs text-slate-400">{t('common.loading', { defaultValue: 'Loading...' })}</div>
                    )}
                    {!shareLoading && shareList.length === 0 && (
                        <div className="py-4 text-center text-xs text-slate-400">{t('map.sharing.noShares', { defaultValue: 'Not shared with anyone yet' })}</div>
                    )}
                    {shareList.map((shareRow) => (
                        <div key={shareRow.userId} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-slate-800">{shareRow.username}</p>
                                {childCount > 0 && (
                                    <label className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                                        <input
                                            type="checkbox"
                                            checked={shareRow.includeChildren ?? true}
                                            onChange={(event) => handleUpdateShare(shareRow.userId, { includeChildren: event.target.checked })}
                                            className="h-3 w-3 rounded border-slate-300 text-indigo-600"
                                        />
                                        {t('map.sharing.includeChildrenShort', { defaultValue: 'Includes subparcels' })}
                                    </label>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <select
                                    value={shareRow.role}
                                    onChange={(event) => handleUpdateShare(shareRow.userId, { role: event.target.value })}
                                    className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-indigo-400"
                                >
                                    <option value="VIEWER">{t('map.sharing.roles.viewer', { defaultValue: 'Viewer' })}</option>
                                    <option value="EDITOR">{t('map.sharing.roles.editor', { defaultValue: 'Editor' })}</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveShare(shareRow.userId)}
                                    className="rounded p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                                    aria-label={t('common.delete', { defaultValue: 'Delete' })}
                                >
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
