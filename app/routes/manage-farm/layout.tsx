import { Outlet, NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useFarm } from "../../contexts/FarmContext";
import { Cog6ToothIcon, UsersIcon, ExclamationTriangleIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { buildLocalizedPath } from "../../utils/locale";
import { useCurrentLocale } from "../../hooks/useCurrentLocale";

export default function ManageFarmLayout() {
    const { t } = useTranslation();
    const locale = useCurrentLocale();
    const { selectedFarm } = useFarm();

    const mainNav = [
        { name: t('manageFarms.navigation.settings', { defaultValue: 'Settings' }), href: buildLocalizedPath(locale, "/manage-farm"), icon: Cog6ToothIcon, end: true },
        { name: t('manageFarms.navigation.members', { defaultValue: 'Members' }), href: buildLocalizedPath(locale, "/manage-farm/members"), icon: UsersIcon },
        { name: t('manageFarms.navigation.create', { defaultValue: 'Create New' }), href: buildLocalizedPath(locale, "/manage-farm/create"), icon: PlusCircleIcon },
        { name: t('manageFarms.navigation.danger', { defaultValue: 'Danger Zone' }), href: buildLocalizedPath(locale, "/manage-farm/danger"), icon: ExclamationTriangleIcon },
    ];

    // Periods now live exclusively in the Resources (Assets) tab — see /assets#periods.
    const allNav = [...mainNav];

    const navLinkClass = (isActive: boolean, disabled: boolean) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            isActive
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        } ${disabled ? "pointer-events-none opacity-40" : ""}`;

    return (
        <ProtectedRoute>
            <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
                {/* Desktop sidebar */}
                <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70 lg:flex">
                    <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                        <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {t('manageFarms.title', { defaultValue: 'Manage Farm' })}
                        </h1>
                        {selectedFarm && (
                            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                                {selectedFarm.name}
                            </p>
                        )}
                    </div>
                    <nav className="flex-1 space-y-1 px-3 py-4">
                        {mainNav.map((item) => {
                            const disabled = !selectedFarm && item.href !== buildLocalizedPath(locale, "/manage-farm/create");
                            return (
                                <NavLink
                                    key={item.name}
                                    to={item.href}
                                    end={item.end}
                                    className={({ isActive }) => navLinkClass(isActive, disabled)}
                                >
                                    <item.icon className="h-4 w-4 shrink-0" />
                                    {item.name}
                                </NavLink>
                            );
                        })}
                    </nav>
                </aside>

                {/* Mobile tabs */}
                <div className="fixed top-16 left-0 right-0 z-30 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900 lg:hidden">
                    <div className="flex overflow-x-auto gap-1">
                        {allNav.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.href}
                                end={"end" in item ? (item.end as boolean | undefined) : undefined}
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
                    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
                        <Outlet />
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    );
}
