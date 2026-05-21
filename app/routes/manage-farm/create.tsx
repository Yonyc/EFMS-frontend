import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useFarm } from '../../contexts/FarmContext';
import { apiPost } from '~/utils/api';
import { buildLocalizedPath } from '../../utils/locale';
import { useCurrentLocale } from '../../hooks/useCurrentLocale';

export default function ManageFarmCreate() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const locale = useCurrentLocale();
    const { refreshFarms } = useFarm();

    const [newFarmName, setNewFarmName] = useState('');
    const [newFarmDescription, setNewFarmDescription] = useState('');
    const [newFarmLocation, setNewFarmLocation] = useState('');
    const [newFarmIsPublic, setNewFarmIsPublic] = useState(false);
    const [newShowName, setNewShowName] = useState(true);
    const [newShowDescription, setNewShowDescription] = useState(true);
    const [newShowLocation, setNewShowLocation] = useState(true);
    
    const [error, setError] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const handleCreate = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (!newFarmName.trim()) {
            setError(t('manageFarms.errors.required', { defaultValue: 'Name is required' }));
            return;
        }

        setIsCreating(true);

        try {
            const response = await apiPost('/farm', {
                name: newFarmName.trim(),
                description: newFarmDescription.trim(),
                location: newFarmLocation.trim(),
                isPublic: newFarmIsPublic,
                showName: newShowName,
                showDescription: newShowDescription,
                showLocation: newShowLocation,
            });

            if (response.ok) {
                const createdFarm = await response.json();
                await refreshFarms(createdFarm.id);
                navigate(buildLocalizedPath(locale, '/map'));
            } else {
                const data = await response.json().catch(() => ({}));
                setError(data.message || t('manageFarms.errors.generic', { defaultValue: 'Failed to create farm' }));
            }
        } catch (err) {
            console.error('Failed to create farm:', err);
            setError(t('manageFarms.errors.generic', { defaultValue: 'Failed to create farm' }));
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/20">
                <div>
                    <h2 className="text-xl font-bold text-slate-100">{t('manageFarms.newTitle', { defaultValue: 'Create New Farm' })}</h2>
                    <p className="text-sm text-slate-400 mt-1">{t('manageFarms.newDescription', { defaultValue: 'Set up a new farm workspace.' })}</p>
                </div>

                {error && <div className="mt-4 rounded-xl bg-rose-500/10 p-4 text-sm font-medium text-rose-400 border border-rose-500/20">{error}</div>}

                <form className="mt-6 space-y-5" onSubmit={handleCreate}>
                    <div className="space-y-1.5">
                        <label htmlFor="new-farm-name" className="block text-sm font-medium text-slate-300">
                            {t('manageFarms.nameLabel', { defaultValue: 'Farm Name' })}
                        </label>
                        <input
                            id="new-farm-name"
                            type="text"
                            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                            placeholder={t('manageFarms.namePlaceholder', { defaultValue: 'e.g. Sunny Valley Farm' })}
                            value={newFarmName}
                            onChange={(e) => setNewFarmName(e.target.value)}
                            disabled={isCreating}
                            maxLength={100}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="new-farm-description" className="block text-sm font-medium text-slate-300">{t('manageFarms.descriptionLabel', { defaultValue: 'Description' })}</label>
                        <textarea
                            id="new-farm-description"
                            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                            rows={3}
                            placeholder="Optional description"
                            value={newFarmDescription}
                            onChange={(e) => setNewFarmDescription(e.target.value)}
                            disabled={isCreating}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="new-farm-location" className="block text-sm font-medium text-slate-300">{t('manageFarms.locationLabel', { defaultValue: 'Location' })}</label>
                        <input
                            id="new-farm-location"
                            type="text"
                            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                            placeholder="City / region"
                            value={newFarmLocation}
                            onChange={(e) => setNewFarmLocation(e.target.value)}
                            disabled={isCreating}
                            maxLength={150}
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 pt-4">
                        <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 transition-colors cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500" checked={newFarmIsPublic} onChange={(e) => setNewFarmIsPublic(e.target.checked)} disabled={isCreating} />
                            <span className="text-sm font-medium text-slate-300">{t('manageFarms.public', { defaultValue: 'Public Farm' })}</span>
                        </label>
                        <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 transition-colors cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500" checked={newShowName} onChange={(e) => setNewShowName(e.target.checked)} disabled={isCreating} />
                            <span className="text-sm font-medium text-slate-300">{t('manageFarms.showName', { defaultValue: 'Show Name' })}</span>
                        </label>
                        <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 transition-colors cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500" checked={newShowDescription} onChange={(e) => setNewShowDescription(e.target.checked)} disabled={isCreating} />
                            <span className="text-sm font-medium text-slate-300">{t('manageFarms.showDescription', { defaultValue: 'Show Description' })}</span>
                        </label>
                        <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 transition-colors cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500" checked={newShowLocation} onChange={(e) => setNewShowLocation(e.target.checked)} disabled={isCreating} />
                            <span className="text-sm font-medium text-slate-300">{t('manageFarms.showLocation', { defaultValue: 'Show Location' })}</span>
                        </label>
                    </div>

                    <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={isCreating}
                            className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-500 rounded-xl hover:bg-indigo-400 disabled:opacity-50 shadow-lg shadow-indigo-500/25 transition-all"
                        >
                            {isCreating ? t('manageFarms.submitting', { defaultValue: 'Creating...' }) : t('manageFarms.submit', { defaultValue: 'Create Farm' })}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
