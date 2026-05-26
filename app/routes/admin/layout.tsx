import { Outlet, NavLink, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useAuth } from "../../contexts/AuthContext";
import { UsersIcon, MapIcon, Cog6ToothIcon, CircleStackIcon, BeakerIcon } from "@heroicons/react/24/outline";
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

    if (!isAuthenticated || !user?.admin) return null;

    const navigation = [
        { name: t('admin.users.title', { defaultValue: 'Users' }), href: buildLocalizedPath(locale, '/admin/users'), icon: UsersIcon },
        { name: t('admin.farms.title', { defaultValue: 'Farms' }), href: buildLocalizedPath(locale, '/admin/farms'), icon: MapIcon },
        { name: t('admin.reference.navLabel', { defaultValue: 'Reference data' }), href: buildLocalizedPath(locale, '/admin/reference'), icon: CircleStackIcon },
        { name: t('admin.officialProducts.navLabel', { defaultValue: 'Official Products' }), href: buildLocalizedPath(locale, '/admin/official-products'), icon: BeakerIcon },
        { name: t('admin.settings.title', { defaultValue: 'Global Settings' }), href: buildLocalizedPath(locale, '/admin/settings'), icon: Cog6ToothIcon },
    ];

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            isActive
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        }`;

    return (
        <ProtectedRoute>
            <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
                {/* Desktop sidebar */}
                <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70 lg:flex">
                    <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                        <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {t('admin.title', { defaultValue: 'Admin Dashboard' })}
                        </h1>
                    </div>
                    <nav className="flex-1 space-y-1 px-3 py-4">
                        {navigation.map((item) => (
                            <NavLink key={item.name} to={item.href} className={navLinkClass}>
                                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                {item.name}
                            </NavLink>
                        ))}
                    </nav>
                </aside>

                {/* Mobile tabs */}
                <div className="fixed top-16 left-0 right-0 z-30 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900 lg:hidden">
                    <div className="flex overflow-x-auto gap-1">
                        {navigation.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.href}
                                className={({ isActive }) =>
                                    `shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                        isActive
                                            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                                            : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                                    }`
                                }
                            >
                                {item.name}
                            </NavLink>
                        ))}
                    </div>
                </div>

                {/* Main content */}
                <main className="flex-1 overflow-y-auto pt-16 lg:pt-0">
                    <div className="mx-auto max-w-7xl px-6 py-10">
                        <Outlet />
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    );
}
