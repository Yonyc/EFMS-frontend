import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useFarm } from '../contexts/FarmContext';
import { apiPost } from '~/utils/api';
import ProtectedRoute from '~/components/ProtectedRoute';
import { useCurrentLocale } from '../hooks/useCurrentLocale';
import { buildLocalizedPath } from '../utils/locale';

export function meta() {
    return [
        { title: "Create Farm - EMFS" },
        { name: "description", content: "Create a new farm" },
    ];
}

export default function CreateFarm() {
    const [farmName, setFarmName] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const { isAuthenticated } = useAuth();
    const { refreshFarms } = useFarm();
    const navigate = useNavigate();
    const locale = useCurrentLocale();
    const { t } = useTranslation();

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        // Validate farm name
        if (farmName.trim().length === 0) {
            setError(t('createFarm.errors.required'));
            return;
        }

        if (farmName.trim().length < 3) {
            setError(t('createFarm.errors.minLength'));
            return;
        }

        setIsLoading(true);

        try {
            const response = await apiPost('/farm', {
                name: farmName.trim(),
            });

            if (response.ok) {
                const createdFarm = await response.json();
                await refreshFarms(createdFarm.id);
                navigate(buildLocalizedPath(locale, '/map'));
            } else {
                const data = await response.json().catch(() => ({}));
                setError(data.message || t('createFarm.errors.generic'));
            }
        } catch (err) {
            console.error('Failed to create farm:', err);
            setError(t('createFarm.errors.generic'));
        } finally {
            setIsLoading(false);
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
            <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8">
                    <div>
                        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                            {t('createFarm.title')}
                        </h2>
                        <p className="mt-2 text-center text-sm text-gray-600">
                            {t('createFarm.description')}
                        </p>
                    </div>
                    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                        {error && (
                            <div className="rounded-md bg-red-50 p-4">
                                <div className="text-sm text-red-800">{error}</div>
                            </div>
                        )}
                        <div className="rounded-md shadow-sm">
                            <div>
                                <label htmlFor="farm-name" className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('createFarm.nameLabel')}
                                </label>
                                <input
                                    id="farm-name"
                                    name="farm-name"
                                    type="text"
                                    required
                                    className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                    placeholder={t('createFarm.namePlaceholder')}
                                    value={farmName}
                                    onChange={(e) => setFarmName(e.target.value)}
                                    disabled={isLoading}
                                    maxLength={100}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    {t('createFarm.nameHelp')}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={handleCancel}
                                disabled={isLoading}
                                className="flex-1 py-2 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="flex-1 py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? t('createFarm.submitting') : t('createFarm.submit')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </ProtectedRoute>
    );
}
