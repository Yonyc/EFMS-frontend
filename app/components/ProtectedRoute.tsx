import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from "react-i18next";
import { useAuth } from '../contexts/AuthContext';
import { useCurrentLocale } from '../hooks/useCurrentLocale';
import { buildLocalizedPath } from '../utils/locale';

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locale = useCurrentLocale();
  const { t } = useTranslation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const redirectTo = `${location.pathname}${location.search}${location.hash}`;
      navigate(buildLocalizedPath(locale, '/login'), { state: { notice: 'signInRequired', redirectTo } });
    }
  }, [isAuthenticated, isLoading, locale, navigate, location.pathname, location.search, location.hash]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
