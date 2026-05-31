import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useFarm } from '../../contexts/FarmContext';
import { apiDelete } from '~/utils/api';
import { buildLocalizedPath } from '../../utils/locale';
import { useCurrentLocale } from '../../hooks/useCurrentLocale';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function ManageFarmDanger() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const locale = useCurrentLocale();
    const { selectedFarm, refreshFarms, selectFarm } = useFarm();
    
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState('');

    if (!selectedFarm) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-white border border-slate-200 rounded-2xl shadow-xl">
                <p className="text-slate-500 text-center">{t('manageFarms.info.selectFarm', { defaultValue: 'Please select a farm first' })}</p>
            </div>
        );
    }

    if (!selectedFarm.canManage) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-white border border-slate-200 rounded-2xl shadow-xl">
                <p className="text-rose-400 text-center font-medium">{t('manageFarms.errors.noAccess', { defaultValue: 'You do not have permission to manage this farm' })}</p>
            </div>
        );
    }

    const handleDelete = async () => {
        if (!selectedFarm) return;
        
        const confirmName = window.prompt(t('manageFarms.danger.confirmPrompt', { defaultValue: 'Please type the farm name to confirm deletion:' }));
        if (confirmName !== selectedFarm.name) {
            alert(t('manageFarms.danger.nameMismatch', { defaultValue: 'Name did not match. Deletion cancelled.' }));
            return;
        }

        setIsDeleting(true);
        setError('');

        try {
            const response = await apiDelete(`/farm/${selectedFarm.id}`);
            if (response.ok) {
                await refreshFarms();
                selectFarm(null);
                navigate(buildLocalizedPath(locale, '/'));
            } else {
                const data = await response.json().catch(() => ({}));
                setError(data.message || t('manageFarms.errors.generic', { defaultValue: 'Failed to delete farm' }));
            }
        } catch (err) {
            console.error('Failed to delete farm:', err);
            setError(t('manageFarms.errors.generic', { defaultValue: 'Failed to delete farm' }));
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-rose-950/20 border border-rose-900/50 rounded-2xl p-6 shadow-xl shadow-slate-900/10">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400">
                        <ExclamationTriangleIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-rose-400">{t('manageFarms.danger.title', { defaultValue: 'Danger Zone' })}</h2>
                        <p className="text-sm text-rose-400/80 mt-1">
                            {t('manageFarms.danger.description', { defaultValue: 'Deleting a farm is irreversible. All associated parcels, periods, and operations will be permanently deleted.' })}
                        </p>
                    </div>
                </div>

                {error && <div className="mt-6 rounded-xl bg-rose-500/10 p-4 text-sm font-medium text-rose-400 border border-rose-500/20">{error}</div>}

                <div className="mt-8 border-t border-rose-900/50 pt-6 flex justify-end">
                    <button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="px-6 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-500 disabled:opacity-50 shadow-lg shadow-rose-600/20 transition-all"
                    >
                        {isDeleting ? t('manageFarms.danger.deleting', { defaultValue: 'Deleting...' }) : t('manageFarms.danger.delete', { defaultValue: 'Delete Farm' })}
                    </button>
                </div>
            </div>
        </div>
    );
}
