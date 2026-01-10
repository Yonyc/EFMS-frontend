import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useCurrentLocale } from "../hooks/useCurrentLocale";
import { buildLocalizedPath } from "../utils/locale";

type TutorialSection = {
    title: string;
    body: string;
    actions: string[];
};

type Shortcut = {
    keys: string;
    description: string;
};

export default function WikiPage() {
    const { t } = useTranslation();
    const locale = useCurrentLocale();
    const { user, updateTutorialState } = useAuth();

    const sections = t("wiki.mapTutorial.sections", { returnObjects: true }) as TutorialSection[];
    const tips = t("wiki.mapTutorial.tips.items", { returnObjects: true }) as string[];
    const shortcuts = t("wiki.mapTutorial.shortcuts.items", { returnObjects: true }) as Shortcut[];

    const mapPath = buildLocalizedPath(locale, "/map");
    const handleRestartTour = async () => {
        if (!user) return;
        try {
            await updateTutorialState("NOT_STARTED");
        } catch (error) {
            console.error("Failed to reset tutorial state", error);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 py-16">
            <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 sm:px-6">
                <header className="rounded-3xl bg-gradient-to-br from-slate-900 to-indigo-800 px-8 py-10 text-white shadow-xl">
                    <p className="text-sm font-semibold uppercase tracking-wide text-indigo-200">{t("wiki.title")}</p>
                    <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{t("wiki.mapTutorial.title")}</h1>
                    <p className="mt-4 max-w-3xl text-base text-indigo-100">{t("wiki.mapTutorial.intro")}</p>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <Link
                            to={mapPath}
                            className="inline-flex items-center rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-indigo-900/30 transition hover:-translate-y-0.5"
                        >
                            {t("wiki.mapTutorial.cta.openMap")}
                        </Link>
                        <button
                            type="button"
                            onClick={handleRestartTour}
                            className="inline-flex items-center rounded-xl border border-white/70 px-5 py-2.5 text-sm font-semibold text-white/90 transition hover:bg-white/10"
                        >
                            {t("wiki.mapTutorial.cta.restartTour")}
                        </button>
                    </div>
                </header>

                <main className="grid gap-8 lg:grid-cols-[2fr_1fr]">
                    <section className="space-y-6">
                        {sections.map((section) => (
                            <article key={section.title} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">{section.title}</p>
                                <p className="mt-2 text-slate-600">{section.body}</p>
                                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700">
                                    {section.actions.map((action) => (
                                        <li key={action}>{action}</li>
                                    ))}
                                </ul>
                            </article>
                        ))}
                    </section>

                    <aside className="space-y-6">
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">{t("wiki.mapTutorial.tips.title")}</p>
                            <ul className="mt-3 space-y-2 text-sm text-indigo-900">
                                {tips.map((tip) => (
                                    <li key={tip} className="rounded-xl bg-white/70 px-3 py-2 shadow-sm">
                                        {tip}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">{t("wiki.mapTutorial.shortcuts.title")}</p>
                            <ul className="mt-3 space-y-3 text-sm text-slate-700">
                                {shortcuts.map((shortcut) => (
                                    <li key={shortcut.keys} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                                        <span className="font-mono text-slate-900">{shortcut.keys}</span>
                                        <span className="text-right text-slate-500">{shortcut.description}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </aside>
                </main>
            </div>
        </div>
    );
}