import { Outlet, NavLink, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useFarm } from "../../contexts/FarmContext";
import { Cog6ToothIcon, UsersIcon, ExclamationTriangleIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { buildLocalizedPath } from "../../utils/locale";
import { useCurrentLocale } from "../../hooks/useCurrentLocale";

export default function ManageFarmLayout() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const locale = useCurrentLocale();
    const { selectedFarm } = useFarm();

    const navigation = [
        { name: t('manageFarms.navigation.settings', { defaultValue: 'Settings' }), href: buildLocalizedPath(locale, "/manage-farm"), icon: Cog6ToothIcon, end: true },
        { name: t('manageFarms.navigation.members', { defaultValue: 'Members' }), href: buildLocalizedPath(locale, "/manage-farm/members"), icon: UsersIcon },
        { name: t('manageFarms.navigation.danger', { defaultValue: 'Danger Zone' }), href: buildLocalizedPath(locale, "/manage-farm/danger"), icon: ExclamationTriangleIcon },
        { name: t('manageFarms.navigation.create', { defaultValue: 'Create New' }), href: buildLocalizedPath(locale, "/manage-farm/create"), icon: PlusCircleIcon },
    ];

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-slate-950">
                {/* Mobile Header */}
                <div className="lg:hidden sticky top-0 z-40 bg-slate-900 border-b border-slate-800 px-4 py-4 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-slate-100">
                        {t('manageFarms.title', { defaultValue: 'Manage Farm' })}
                    </h1>
                </div>

                <div className="flex h-[calc(100vh-64px)] lg:h-screen">
                    {/* Sidebar */}
                    <div className="hidden lg:flex w-72 flex-col bg-slate-900 border-r border-slate-800">
                        <div className="p-6">
                            <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
                                {t('manageFarms.title', { defaultValue: 'Manage Farm' })}
                            </h1>
                            <p className="mt-2 text-sm text-slate-400">
                                {selectedFarm ? selectedFarm.name : t('manageFarms.info.selectFarm')}
                            </p>
                        </div>
                        <nav className="flex-1 px-4 space-y-2">
                            {navigation.map((item) => {
                                // Disable settings/members/danger if no farm is selected and we are not creating a new one
                                const disabled = !selectedFarm && item.href !== buildLocalizedPath(locale, "/manage-farm/create");
                                return (
                                    <NavLink
                                        key={item.name}
                                        to={item.href}
                                        end={item.end}
                                        className={({ isActive }) => `
                                            flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
                                            ${isActive 
                                                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" 
                                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"}
                                            ${disabled ? "opacity-50 pointer-events-none" : ""}
                                        `}
                                    >
                                        <item.icon className="w-5 h-5" />
                                        {item.name}
                                    </NavLink>
                                );
                            })}
                        </nav>
                    </div>

                    {/* Main Content */}
                    <main className="flex-1 overflow-y-auto">
                        <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
                            <Outlet />
                        </div>
                    </main>
                </div>
            </div>
        </ProtectedRoute>
    );
}
