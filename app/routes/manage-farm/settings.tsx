import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useFarm } from '../../contexts/FarmContext';
import { apiPut } from '~/utils/api';

export default function ManageFarmSettings() {
    const { t } = useTranslation();
    const { selectedFarm, refreshFarms } = useFarm();

    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editLocation, setEditLocation] = useState('');
    const [editIsPublic, setEditIsPublic] = useState(false);
    const [editShowName, setEditShowName] = useState(true);
    const [editShowDescription, setEditShowDescription] = useState(true);
    const [editShowLocation, setEditShowLocation] = useState(true);
    const [editEnableMemberAlerts, setEditEnableMemberAlerts] = useState(false);
    const [editEnableParcelAlerts, setEditEnableParcelAlerts] = useState(false);
    const [editEnableOperationAlerts, setEditEnableOperationAlerts] = useState(false);
    const [editAlertRecipientEmail, setEditAlertRecipientEmail] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        if (selectedFarm) {
            setEditName(selectedFarm.name || '');
            setEditDescription(selectedFarm.description || '');
            setEditLocation(selectedFarm.location || '');
            setEditIsPublic(!!selectedFarm.isPublic);
            setEditShowName(selectedFarm.showName ?? true);
            setEditShowDescription(selectedFarm.showDescription ?? true);
            setEditShowLocation(selectedFarm.showLocation ?? true);
            setEditEnableMemberAlerts(!!selectedFarm.enableMemberAlerts);
            setEditEnableParcelAlerts(!!selectedFarm.enableParcelAlerts);
            setEditEnableOperationAlerts(!!selectedFarm.enableOperationAlerts);
            setEditAlertRecipientEmail(selectedFarm.alertRecipientEmail || '');
        }
    }, [selectedFarm?.id]);

    if (!selectedFarm) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
                <p className="text-slate-400 text-center">{t('manageFarms.info.selectFarm', { defaultValue: 'Please select a farm first' })}</p>
            </div>
        );
    }

    const handleUpdate = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (!editName.trim()) {
            setError(t('manageFarms.errors.required', { defaultValue: 'Name is required' }));
            return;
        }

        setIsUpdating(true);

        try {
            const response = await apiPut(`/farm/${selectedFarm.id}`, {
                name: editName.trim(),
                description: editDescription.trim(),
                location: editLocation.trim(),
                isPublic: editIsPublic,
                showName: editShowName,
                showDescription: editShowDescription,
                showLocation: editShowLocation,
                enableMemberAlerts: editEnableMemberAlerts,
                enableParcelAlerts: editEnableParcelAlerts,
                enableOperationAlerts: editEnableOperationAlerts,
                alertRecipientEmail: editAlertRecipientEmail.trim(),
            });
            if (response.ok) {
                await refreshFarms(selectedFarm.id);
                setMessage(t('manageFarms.updated', { defaultValue: 'Farm updated successfully' }));
            } else {
                const data = await response.json().catch(() => ({}));
                setError(data.message || t('manageFarms.errors.generic', { defaultValue: 'Failed to update farm' }));
            }
        } catch (err) {
            console.error('Failed to update farm:', err);
            setError(t('manageFarms.errors.generic', { defaultValue: 'Failed to update farm' }));
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/20">
                <div>
                    <h2 className="text-xl font-bold text-slate-100">{t('manageFarms.currentTitle', { defaultValue: 'Farm Settings' })}</h2>
                    <p className="text-sm text-slate-400 mt-1">{t('manageFarms.currentDescription', { defaultValue: 'Update your farm information and visibility.' })}</p>
                </div>

                {error && <div className="mt-4 rounded-xl bg-rose-500/10 p-4 text-sm font-medium text-rose-400 border border-rose-500/20">{error}</div>}
                {message && <div className="mt-4 rounded-xl bg-emerald-500/10 p-4 text-sm font-medium text-emerald-400 border border-emerald-500/20">{message}</div>}

                <form className="mt-6 space-y-5" onSubmit={handleUpdate}>
                    <div className="space-y-1.5">
                        <label htmlFor="edit-name" className="block text-sm font-medium text-slate-300">
                            {t('manageFarms.nameLabel', { defaultValue: 'Farm Name' })}
                        </label>
                        <input
                            id="edit-name"
                            type="text"
                            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            disabled={!selectedFarm || isUpdating || !selectedFarm.canManage}
                            maxLength={100}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="edit-description" className="block text-sm font-medium text-slate-300">{t('manageFarms.descriptionLabel', { defaultValue: 'Description' })}</label>
                        <textarea
                            id="edit-description"
                            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                            rows={3}
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            disabled={!selectedFarm || isUpdating || !selectedFarm.canManage}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="edit-location" className="block text-sm font-medium text-slate-300">{t('manageFarms.locationLabel', { defaultValue: 'Location' })}</label>
                        <input
                            id="edit-location"
                            type="text"
                            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                            value={editLocation}
                            onChange={(e) => setEditLocation(e.target.value)}
                            disabled={!selectedFarm || isUpdating || !selectedFarm.canManage}
                            maxLength={150}
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 pt-4">
                        <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 transition-colors cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500" checked={editIsPublic} onChange={(e) => setEditIsPublic(e.target.checked)} disabled={!selectedFarm || isUpdating || !selectedFarm.canManage} />
                            <span className="text-sm font-medium text-slate-300">{t('manageFarms.public', { defaultValue: 'Public Farm' })}</span>
                        </label>
                        <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 transition-colors cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500" checked={editShowName} onChange={(e) => setEditShowName(e.target.checked)} disabled={!selectedFarm || isUpdating || !selectedFarm.canManage} />
                            <span className="text-sm font-medium text-slate-300">{t('manageFarms.showName', { defaultValue: 'Show Name' })}</span>
                        </label>
                        <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 transition-colors cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500" checked={editShowDescription} onChange={(e) => setEditShowDescription(e.target.checked)} disabled={!selectedFarm || isUpdating || !selectedFarm.canManage} />
                            <span className="text-sm font-medium text-slate-300">{t('manageFarms.showDescription', { defaultValue: 'Show Description' })}</span>
                        </label>
                        <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 transition-colors cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500" checked={editShowLocation} onChange={(e) => setEditShowLocation(e.target.checked)} disabled={!selectedFarm || isUpdating || !selectedFarm.canManage} />
                            <span className="text-sm font-medium text-slate-300">{t('manageFarms.showLocation', { defaultValue: 'Show Location' })}</span>
                        </label>
                    </div>

                    {/* Email Alerts Section */}
                    <div className="border-t border-slate-800 pt-6 mt-6">
                        <h3 className="text-lg font-semibold text-slate-200 mb-1">
                            {t('manageFarms.emailAlertsTitle', { defaultValue: 'Email Alert Configurations' })}
                        </h3>
                        <p className="text-xs text-slate-400 mb-4">
                            {t('manageFarms.emailAlertsDesc', { defaultValue: 'Enable or disable real-time email alerts for important actions on this farm.' })}
                        </p>

                        <div className="grid gap-4 sm:grid-cols-3 mb-4">
                            <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 transition-colors cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500"
                                    checked={editEnableMemberAlerts}
                                    onChange={(e) => setEditEnableMemberAlerts(e.target.checked)}
                                    disabled={!selectedFarm || isUpdating || !selectedFarm.canManage}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-slate-300">
                                        {t('manageFarms.memberAlerts', { defaultValue: 'Member Alerts' })}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                        {t('manageFarms.memberAlertsHelp', { defaultValue: 'Changes to users / roles' })}
                                    </span>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 transition-colors cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500"
                                    checked={editEnableParcelAlerts}
                                    onChange={(e) => setEditEnableParcelAlerts(e.target.checked)}
                                    disabled={!selectedFarm || isUpdating || !selectedFarm.canManage}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-slate-300">
                                        {t('manageFarms.parcelAlerts', { defaultValue: 'Parcel Alerts' })}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                        {t('manageFarms.parcelAlertsHelp', { defaultValue: 'Created, modified or deleted parcels' })}
                                    </span>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 transition-colors cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500"
                                    checked={editEnableOperationAlerts}
                                    onChange={(e) => setEditEnableOperationAlerts(e.target.checked)}
                                    disabled={!selectedFarm || isUpdating || !selectedFarm.canManage}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-slate-300">
                                        {t('manageFarms.operationAlerts', { defaultValue: 'Operation Alerts' })}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                        {t('manageFarms.operationAlertsHelp', { defaultValue: 'Created or deleted parcel operations' })}
                                    </span>
                                </div>
                            </label>
                        </div>

                        <div className="space-y-1.5 mt-4">
                            <label htmlFor="edit-alert-email" className="block text-sm font-medium text-slate-300">
                                {t('manageFarms.alertEmailLabel', { defaultValue: 'Custom Alert Recipient Email' })}
                            </label>
                            <input
                                id="edit-alert-email"
                                type="email"
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                                value={editAlertRecipientEmail}
                                onChange={(e) => setEditAlertRecipientEmail(e.target.value)}
                                disabled={!selectedFarm || isUpdating || !selectedFarm.canManage}
                                placeholder="manager@example.com (falls back to farm owner if empty)"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={isUpdating || !selectedFarm || !selectedFarm.canManage}
                            className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-500 rounded-xl hover:bg-indigo-400 disabled:opacity-50 shadow-lg shadow-indigo-500/25 transition-all"
                        >
                            {isUpdating ? t('manageFarms.updating', { defaultValue: 'Saving...' }) : t('manageFarms.update', { defaultValue: 'Save Changes' })}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
