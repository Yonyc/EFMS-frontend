import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useFarm } from '../contexts/FarmContext';
import { apiPost, apiPut } from '~/utils/api';
import ProtectedRoute from '~/components/ProtectedRoute';
import { useCurrentLocale } from '../hooks/useCurrentLocale';
import { buildLocalizedPath } from '../utils/locale';

export function meta() {
    return [
        { title: "Manage Farms - EMFS" },
        { name: "description", content: "Manage and create farms" },
    ];
}

export default function CreateFarm() {
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editLocation, setEditLocation] = useState('');
    const [editIsPublic, setEditIsPublic] = useState(false);
    const [editShowName, setEditShowName] = useState(true);
    const [editShowDescription, setEditShowDescription] = useState(true);
    const [editShowLocation, setEditShowLocation] = useState(true);

    const [newFarmName, setNewFarmName] = useState('');
    const [newFarmDescription, setNewFarmDescription] = useState('');
    const [newFarmLocation, setNewFarmLocation] = useState('');
    const [newFarmIsPublic, setNewFarmIsPublic] = useState(false);
    const [newShowName, setNewShowName] = useState(true);
    const [newShowDescription, setNewShowDescription] = useState(true);
    const [newShowLocation, setNewShowLocation] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    const { isAuthenticated } = useAuth();
    const { farms, selectedFarm, selectFarm, refreshFarms } = useFarm();
    const navigate = useNavigate();
    const locale = useCurrentLocale();
    const { t } = useTranslation();

    useEffect(() => {
        if (selectedFarm) {
            setEditName(selectedFarm.name || '');
            setEditDescription(selectedFarm.description || '');
            setEditLocation(selectedFarm.location || '');
            setEditIsPublic(!!selectedFarm.isPublic);
            setEditShowName(selectedFarm.showName ?? true);
            setEditShowDescription(selectedFarm.showDescription ?? true);
            setEditShowLocation(selectedFarm.showLocation ?? true);
        }
    }, [selectedFarm?.id]);

    const validateName = (name: string) => {
        if (!name.trim()) {
            setError(t('manageFarms.errors.required'));
            return false;
        }
        if (name.trim().length < 3) {
            setError(t('manageFarms.errors.minLength'));
            return false;
        }
        return true;
    };

    const handleUpdate = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (!selectedFarm) {
            setError(t('manageFarms.errors.noSelection'));
            return;
        }

        if (!validateName(editName)) return;

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
            });
            if (response.ok) {
                await refreshFarms(selectedFarm.id);
                setMessage(t('manageFarms.updated'));
            } else {
                const data = await response.json().catch(() => ({}));
                setError(data.message || t('manageFarms.errors.generic'));
            }
        } catch (err) {
            console.error('Failed to update farm:', err);
            setError(t('manageFarms.errors.generic'));
        } finally {
            setIsUpdating(false);
        }
    };

    const handleCreate = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (!validateName(newFarmName)) return;

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
                setMessage(t('manageFarms.created'));
                setNewFarmName('');
                setNewFarmDescription('');
                setNewFarmLocation('');
                setNewFarmIsPublic(false);
                setNewShowName(true);
                setNewShowDescription(true);
                setNewShowLocation(true);
                navigate(buildLocalizedPath(locale, '/map'));
            } else {
                const data = await response.json().catch(() => ({}));
                setError(data.message || t('manageFarms.errors.generic'));
            }
        } catch (err) {
            console.error('Failed to create farm:', err);
            setError(t('manageFarms.errors.generic'));
        } finally {
            setIsCreating(false);
        }
    };

    const handleCancel = () => {
    navigate(buildLocalizedPath(locale, '/'));
    };

    if (!isAuthenticated) {
        return null;
    }

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 py-12 px-4 sm:px-6 lg:px-8 text-slate-100">
                <div className="mx-auto max-w-5xl space-y-8">
                    <div className="text-center">
                        <h2 className="mt-2 text-3xl font-extrabold text-white">{t('manageFarms.title')}</h2>
                        <p className="mt-2 text-sm text-slate-300">{t('manageFarms.description')}</p>
                    </div>

                    {(error || message) && (
                        <div className={`rounded-md border p-4 text-sm ${error ? 'border-rose-500/40 bg-rose-500/10 text-rose-100' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'}`}>
                            {error || message}
                        </div>
                    )}

                    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/30">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-white">{t('manageFarms.currentTitle')}</h3>
                                    <p className="text-sm text-slate-300">{t('manageFarms.currentDescription')}</p>
                                </div>
                                {farms.length > 0 && (
                                    <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-100 border border-indigo-400/30">
                                        {farms.length} farms
                                    </span>
                                )}
                            </div>

                            <form className="mt-4 space-y-4" onSubmit={handleUpdate}>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-100">{t('manageFarms.nameLabel')}</label>
                                    <select
                                        value={selectedFarm?.id || ''}
                                        onChange={(e) => selectFarm(e.target.value)}
                                        className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                                    >
                                        <option value="" disabled>
                                            {t('manageFarms.currentDescription')}
                                        </option>
                                        {farms.map((farm) => (
                                            <option key={farm.id} value={farm.id} className="text-slate-900">
                                                {farm.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="edit-name" className="block text-sm font-medium text-slate-100">
                                        {t('manageFarms.nameLabel')}
                                    </label>
                                    <input
                                        id="edit-name"
                                        type="text"
                                        className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                        placeholder={t('manageFarms.namePlaceholder')}
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        disabled={!selectedFarm || isUpdating}
                                        maxLength={100}
                                    />
                                    <p className="text-xs text-slate-400">{t('manageFarms.nameHelp')}</p>
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="edit-description" className="block text-sm font-medium text-slate-100">{t('manageFarms.descriptionLabel')}</label>
                                    <textarea
                                        id="edit-description"
                                        className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                        rows={3}
                                        placeholder="Optional description"
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        disabled={!selectedFarm || isUpdating}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="edit-location" className="block text-sm font-medium text-slate-100">{t('manageFarms.locationLabel')}</label>
                                    <input
                                        id="edit-location"
                                        type="text"
                                        className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                        placeholder="City / region"
                                        value={editLocation}
                                        onChange={(e) => setEditLocation(e.target.value)}
                                        disabled={!selectedFarm || isUpdating}
                                        maxLength={150}
                                    />
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="flex items-center gap-2 text-sm text-slate-100">
                                        <input type="checkbox" className="h-4 w-4 rounded border-white/30 bg-slate-900" checked={editIsPublic} onChange={(e) => setEditIsPublic(e.target.checked)} disabled={!selectedFarm || isUpdating} />
                                        <span>{t('manageFarms.public')}</span>
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-slate-100">
                                        <input type="checkbox" className="h-4 w-4 rounded border-white/30 bg-slate-900" checked={editShowName} onChange={(e) => setEditShowName(e.target.checked)} disabled={!selectedFarm || isUpdating} />
                                        <span>{t('manageFarms.showName')}</span>
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-slate-100">
                                        <input type="checkbox" className="h-4 w-4 rounded border-white/30 bg-slate-900" checked={editShowDescription} onChange={(e) => setEditShowDescription(e.target.checked)} disabled={!selectedFarm || isUpdating} />
                                        <span>{t('manageFarms.showDescription')}</span>
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-slate-100">
                                        <input type="checkbox" className="h-4 w-4 rounded border-white/30 bg-slate-900" checked={editShowLocation} onChange={(e) => setEditShowLocation(e.target.checked)} disabled={!selectedFarm || isUpdating} />
                                        <span>{t('manageFarms.showLocation')}</span>
                                    </label>
                                </div>

                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={handleCancel}
                                        className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
                                    >
                                        {t('common.cancel')}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isUpdating || !selectedFarm}
                                        className="rounded-lg border border-transparent px-4 py-2 text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 shadow-lg shadow-indigo-500/25"
                                    >
                                        {isUpdating ? t('manageFarms.updating') : t('manageFarms.update')}
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/30 lg:self-start lg:sticky lg:top-24">
                            <h3 className="text-lg font-semibold text-white">{t('manageFarms.newTitle')}</h3>
                            <p className="text-sm text-slate-300">{t('manageFarms.newDescription')}</p>

                            <form className="mt-4 space-y-4" onSubmit={handleCreate}>
                                <div className="space-y-2">
                                    <label htmlFor="new-farm-name" className="block text-sm font-medium text-slate-100">
                                        {t('manageFarms.nameLabel')}
                                    </label>
                                    <input
                                        id="new-farm-name"
                                        type="text"
                                        className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                        placeholder={t('manageFarms.namePlaceholder')}
                                        value={newFarmName}
                                        onChange={(e) => setNewFarmName(e.target.value)}
                                        disabled={isCreating}
                                        maxLength={100}
                                    />
                                    <p className="text-xs text-slate-400">{t('manageFarms.nameHelp')}</p>
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="new-farm-description" className="block text-sm font-medium text-slate-100">{t('manageFarms.descriptionLabel')}</label>
                                    <textarea
                                        id="new-farm-description"
                                        className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                        rows={3}
                                        placeholder="Optional description"
                                        value={newFarmDescription}
                                        onChange={(e) => setNewFarmDescription(e.target.value)}
                                        disabled={isCreating}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="new-farm-location" className="block text-sm font-medium text-slate-100">{t('manageFarms.locationLabel')}</label>
                                    <input
                                        id="new-farm-location"
                                        type="text"
                                        className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                        placeholder="City / region"
                                        value={newFarmLocation}
                                        onChange={(e) => setNewFarmLocation(e.target.value)}
                                        disabled={isCreating}
                                        maxLength={150}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-100">{t('manageFarms.visibility')}</label>
                                    <div className="grid gap-2 text-sm text-slate-100">
                                        <label className="flex items-center gap-2">
                                            <input type="checkbox" className="h-4 w-4 rounded border-white/30 bg-slate-900" checked={newFarmIsPublic} onChange={(e) => setNewFarmIsPublic(e.target.checked)} disabled={isCreating} />
                                            <span>{t('manageFarms.public')}</span>
                                        </label>
                                        <label className="flex items-center gap-2">
                                            <input type="checkbox" className="h-4 w-4 rounded border-white/30 bg-slate-900" checked={newShowName} onChange={(e) => setNewShowName(e.target.checked)} disabled={isCreating} />
                                            <span>{t('manageFarms.showName')}</span>
                                        </label>
                                        <label className="flex items-center gap-2">
                                            <input type="checkbox" className="h-4 w-4 rounded border-white/30 bg-slate-900" checked={newShowDescription} onChange={(e) => setNewShowDescription(e.target.checked)} disabled={isCreating} />
                                            <span>{t('manageFarms.showDescription')}</span>
                                        </label>
                                        <label className="flex items-center gap-2">
                                            <input type="checkbox" className="h-4 w-4 rounded border-white/30 bg-slate-900" checked={newShowLocation} onChange={(e) => setNewShowLocation(e.target.checked)} disabled={isCreating} />
                                            <span>{t('manageFarms.showLocation')}</span>
                                        </label>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={handleCancel}
                                        disabled={isCreating}
                                        className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
                                    >
                                        {t('common.cancel')}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isCreating}
                                        className="rounded-lg border border-transparent px-4 py-2 text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 shadow-lg shadow-indigo-500/25"
                                    >
                                        {isCreating ? t('manageFarms.submitting') : t('manageFarms.submit')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </ProtectedRoute>
    );
}
