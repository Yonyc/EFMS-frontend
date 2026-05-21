import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useCurrentLocale } from "../hooks/useCurrentLocale";
import { buildLocalizedPath } from "../utils/locale";
import {
    MapIcon,
    WrenchScrewdriverIcon,
    ShareIcon,
    Cog6ToothIcon,
    FolderArrowDownIcon,
    ShieldCheckIcon,
    LightBulbIcon,
    CommandLineIcon,
    BookOpenIcon
} from "@heroicons/react/24/outline";

type Shortcut = {
    keys: string;
    description: string;
};

interface Step {
    title: string;
    content: string;
}

export default function WikiPage() {
    const { t } = useTranslation(["translation", "wiki"]);
    const locale = useCurrentLocale();
    const { user, updateTutorialState } = useAuth();
    const [activeTab, setActiveTab] = useState("map");

    const mapPath = buildLocalizedPath(locale, "/map");
    const handleRestartTour = async () => {
        if (!user) return;
        try {
            await updateTutorialState("NOT_STARTED");
            alert(t("wiki:tourResetAlert", { defaultValue: "Map tutorial restarted! Open the map to start your interactive tour." }));
        } catch (error) {
            console.error("Failed to reset tutorial state", error);
        }
    };

    const categoryIds = ["map", "operations", "sharing", "settings", "imports", "admin"];

    const iconMap: Record<string, any> = {
        map: MapIcon,
        operations: WrenchScrewdriverIcon,
        sharing: ShareIcon,
        settings: Cog6ToothIcon,
        imports: FolderArrowDownIcon,
        admin: ShieldCheckIcon
    };

    const categories = categoryIds.map(id => {
        const steps = Array.isArray(t(`wiki:categories.${id}.steps`, { returnObjects: true }))
            ? (t(`wiki:categories.${id}.steps`, { returnObjects: true }) as Step[])
            : [];
        const tips = Array.isArray(t(`wiki:categories.${id}.tips`, { returnObjects: true }))
            ? (t(`wiki:categories.${id}.tips`, { returnObjects: true }) as string[])
            : [];
        return {
            id,
            icon: iconMap[id] || BookOpenIcon,
            title: t(`wiki:categories.${id}.title`, { defaultValue: id }),
            subtitle: t(`wiki:categories.${id}.subtitle`, { defaultValue: "" }),
            overview: t(`wiki:categories.${id}.overview`, { defaultValue: "" }),
            steps,
            tips
        };
    });

    const shortcuts = Array.isArray(t("wiki:shortcuts", { returnObjects: true }))
        ? (t("wiki:shortcuts", { returnObjects: true }) as Shortcut[])
        : [];

    const activeCategory = categories.find(c => c.id === activeTab) || categories[0];

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
            {/* Ambient Background Glows */}
            <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-indigo-950/20 to-transparent blur-3xl -z-10 pointer-events-none"></div>

            <div className="max-w-6xl mx-auto px-4 py-12 sm:px-6 lg:py-16">

                {/* Header Section */}
                <header className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-8 sm:p-10 shadow-2xl mb-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div className="space-y-3 max-w-2xl">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            <BookOpenIcon className="w-4 h-4" />
                            {t("wiki:helpPortal", { defaultValue: "Help Portal" })}
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-100 tracking-tight">
                            {t("wiki:title", { defaultValue: "Wiki & User Documentation" })}
                        </h1>
                        <p className="text-slate-400 text-sm sm:text-base">
                            {t("wiki:subtitle", { defaultValue: "Explore comprehensive guides covering every platform capability." })}
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
                        <Link
                            to={mapPath}
                            className="inline-flex items-center justify-center rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400 transition-all hover:-translate-y-0.5"
                        >
                            {t("wiki:openMap", { defaultValue: "Open Interactive Map" })}
                        </Link>
                        <button
                            type="button"
                            onClick={handleRestartTour}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 px-5 py-3 text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
                        >
                            {t("wiki:restartTour", { defaultValue: "Restart Interactive Tour" })}
                        </button>
                    </div>
                </header>

                {/* Main Content Layout */}
                <div className="grid lg:grid-cols-[280px_1fr] gap-8 items-start">

                    {/* Categories Sidebar */}
                    <aside className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5 shadow-xl">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-3 mb-3">
                            {t("wiki:learningTopics", { defaultValue: "Learning Topics" })}
                        </p>
                        {categories.map((category) => {
                            const IconComponent = category.icon;
                            const isActive = activeTab === category.id;
                            return (
                                <button
                                    key={category.id}
                                    type="button"
                                    onClick={() => setActiveTab(category.id)}
                                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm font-medium transition-all ${isActive
                                        ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 border border-transparent"
                                        }`}
                                >
                                    <IconComponent className={`w-5 h-5 ${isActive ? "text-indigo-400" : "text-slate-500"}`} />
                                    {category.title}
                                </button>
                            );
                        })}
                    </aside>

                    {/* Active Category Content */}
                    <main className="space-y-8">

                        {/* Topic Overview Card */}
                        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

                            <h2 className="text-2xl font-extrabold text-slate-100 flex items-center gap-3">
                                <activeCategory.icon className="w-7 h-7 text-indigo-400" />
                                {activeCategory.title}
                            </h2>
                            <p className="text-sm text-indigo-400 mt-1 font-medium">{activeCategory.subtitle}</p>
                            <p className="text-slate-400 text-sm sm:text-base leading-relaxed mt-4 pt-4 border-t border-slate-800">
                                {activeCategory.overview}
                            </p>
                        </section>

                        {/* Step by Step Guide */}
                        {activeCategory.steps.length > 0 && (
                            <section className="space-y-4">
                                <h3 className="text-lg font-bold text-slate-300 px-1">
                                    {t("wiki:stepByStep", { defaultValue: "Step-by-Step Walkthrough" })}
                                </h3>
                                <div className="space-y-4">
                                    {activeCategory.steps.map((step, idx) => (
                                        <article
                                            key={idx}
                                            className="bg-slate-900/60 border border-slate-800/80 hover:border-slate-800 rounded-xl p-5 sm:p-6 transition-all"
                                        >
                                            <h4 className="text-base font-bold text-indigo-300 flex items-center gap-3">
                                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-500/10 text-xs font-extrabold text-indigo-400 border border-indigo-500/20">
                                                    {idx + 1}
                                                </span>
                                                {step.title}
                                            </h4>
                                            <p className="text-slate-400 text-sm mt-3 leading-relaxed pl-9">
                                                {step.content}
                                            </p>
                                        </article>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Tips & Shortcuts Side-by-Side */}
                        <div className="grid md:grid-cols-2 gap-6">

                            {/* Pro Tips Panel */}
                            {activeCategory.tips.length > 0 && (
                                <section className="bg-emerald-950/15 border border-emerald-500/20 rounded-2xl p-6">
                                    <h4 className="text-sm font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2 mb-4">
                                        <LightBulbIcon className="w-5 h-5" />
                                        {t("wiki:tips", { defaultValue: "Tips" })}
                                    </h4>
                                    <ul className="space-y-3">
                                        {activeCategory.tips.map((tip, idx) => (
                                            <li key={idx} className="flex gap-3 text-sm text-emerald-300/90 leading-relaxed">
                                                <span className="text-emerald-500 shrink-0 font-bold">•</span>
                                                <span>{tip}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                            {/* Keyboard Shortcuts Panel */}
                            {shortcuts.length > 0 && (
                                <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-4">
                                        <CommandLineIcon className="w-5 h-5 text-indigo-400" />
                                        {t("wiki:keyboardShortcuts", { defaultValue: "Keyboard Shortcuts" })}
                                    </h4>
                                    <ul className="space-y-3">
                                        {shortcuts.map((shortcut) => (
                                            <li key={shortcut.keys} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-800/50 last:border-0">
                                                <kbd className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-indigo-400 font-mono text-xs font-semibold shadow-inner">
                                                    {shortcut.keys}
                                                </kbd>
                                                <span className="text-slate-400 text-xs text-right ml-4">
                                                    {shortcut.description}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                        </div>

                    </main>

                </div>

            </div>
        </div>
    );
}