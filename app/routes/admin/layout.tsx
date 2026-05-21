import { Outlet, NavLink, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useAuth } from "../../contexts/AuthContext";
import { UsersIcon, MapIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { useEffect } from "react";
import { buildLocalizedPath } from "../../utils/locale";
import { useCurrentLocale } from "../../hooks/useCurrentLocale";

export default function AdminLayout() {
    const { t } = useTranslation();
    const { user, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const locale = useCurrentLocale();

    useEffect(() => {
        if (isAuthenticated && user && !user.admin) {
            navigate(buildLocalizedPath(locale, "/map"));
        }
    }, [isAuthenticated, user, navigate, locale]);

    if (!isAuthenticated || !user?.admin) {
        return null; 
    }

    const navigation = [
        { name: t('admin.users.title', { defaultValue: 'Users' }), href: buildLocalizedPath(locale, '/admin/users'), icon: UsersIcon },
        { name: t('admin.farms.title', { defaultValue: 'Farms' }), href: buildLocalizedPath(locale, '/admin/farms'), icon: MapIcon },
        { name: t('admin.settings.title', { defaultValue: 'Global Settings' }), href: buildLocalizedPath(locale, '/admin/settings'), icon: Cog6ToothIcon },
    ];

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-slate-950 flex font-sans text-slate-200">
                {/* Sidebar */}
                <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shadow-2xl">
                    <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950/50">
                        <h1 className="text-lg font-bold text-slate-100 tracking-wide">{t('admin.title', { defaultValue: 'Admin Dashboard' })}</h1>
                    </div>
                    <nav className="flex-1 px-4 py-6 space-y-2">
                        {navigation.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.href}
                                className={({ isActive }) =>
                                    `flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                                        isActive
                                            ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 shadow-lg shadow-indigo-500/10'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
                                    }`
                                }
                            >
                                <item.icon className="mr-3 flex-shrink-0 h-5 w-5" aria-hidden="true" />
                                {item.name}
                            </NavLink>
                        ))}
                    </nav>
                </div>

                {/* Main content */}
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {/* Subtle background glow effect */}
                    <div className="absolute top-0 left-0 w-full h-96 bg-indigo-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>
                    
                    <main className="flex-1 overflow-y-auto">
                        <div className="py-10 px-8 max-w-7xl mx-auto">
                            <Outlet />
                        </div>
                    </main>
                </div>
            </div>
        </ProtectedRoute>
    );
}
