import type { Route } from "./+types/home";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useCurrentLocale } from "../hooks/useCurrentLocale";
import { buildLocalizedPath } from "../utils/locale";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "EFMS - Experimental Farms Management System" },
    {
      name: "description",
      content: "Plan, document and report every experimental parcel with EFMS.",
    },
  ];
}

type TranslatedBlock = { title: string; description: string };
type StatBlock = { value: string; label: string };

export default function Home() {
  const { t } = useTranslation();
  const locale = useCurrentLocale();

  const features = t("home.features.items", { returnObjects: true }) as TranslatedBlock[];
  const timeline = t("home.timeline.items", { returnObjects: true }) as TranslatedBlock[];
  const stats = t("home.hero.stats", { returnObjects: true }) as StatBlock[];

  const toMap = buildLocalizedPath(locale, "/map");
  const toCreateFarm = buildLocalizedPath(locale, "/create-farm");

  return (
    <div className="space-y-16 bg-slate-50 pb-20">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-900 to-indigo-700 text-white">
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at top, rgba(255,255,255,0.35), transparent 50%)" }} />
        <div className="relative mx-auto max-w-6xl px-6 py-20 lg:px-10 lg:py-28">
          <span className="inline-flex items-center rounded-full bg-white/10 px-4 py-1 text-sm font-semibold uppercase tracking-wide text-indigo-100">
            {t("home.hero.badge")}
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
            {t("home.hero.title")}
          </h1>
          <p className="mt-6 max-w-3xl text-lg text-indigo-100">
            {t("home.hero.subtitle")}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              to={toMap}
              className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 text-base font-semibold text-slate-900 shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5"
            >
              {t("home.hero.primaryCta")}
            </Link>
            <Link
              to={toCreateFarm}
              className="inline-flex items-center justify-center rounded-xl border border-white/40 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/10"
            >
              {t("home.hero.secondaryCta")}
            </Link>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-white/20 bg-white/5 px-4 py-6 text-center backdrop-blur">
                <p className="text-4xl font-semibold">{stat.value}</p>
                <p className="mt-1 text-sm uppercase tracking-wide text-indigo-100">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 lg:px-10">
        <div className="grid gap-8 rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/60 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-100 p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">{t("home.context.title")}</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">{t("home.context.heading")}</h2>
            <p className="mt-4 text-slate-600">{t("home.context.description")}</p>
          </article>
          <article className="rounded-2xl border border-slate-100 p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">{t("home.project.title")}</p>
            <h3 className="mt-3 text-2xl font-semibold text-slate-900">{t("home.project.heading")}</h3>
            <p className="mt-4 text-slate-600">{t("home.project.description")}</p>
          </article>
        </div>
      </section>

      <section className="bg-white/80 py-16">
        <div className="mx-auto max-w-6xl px-6 lg:px-10">
          <div className="mb-10 flex flex-col gap-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">{t("home.features.tagline")}</p>
            <h2 className="text-3xl font-semibold text-slate-900">{t("home.features.title")}</h2>
            <p className="text-slate-600">{t("home.description")}</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <span>✦</span>
                </div>
                <h3 className="mt-4 text-xl font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 lg:px-10">
        <div className="rounded-3xl border border-slate-100 bg-white p-8 shadow-xl shadow-slate-200/70">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">{t("home.timeline.title")}</p>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">{t("home.timeline.title")}</h2>
          <p className="mt-4 text-slate-600">{t("home.timeline.lead")}</p>
          <ol className="mt-8 space-y-4">
            {timeline.map((item, index) => (
              <li key={item.title} className="flex gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-5 shadow-sm">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-lg font-semibold text-indigo-700">
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 lg:px-10">
        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 px-8 py-12 text-center text-white shadow-xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-100">{t("home.cta.title")}</p>
          <h2 className="mt-3 text-3xl font-semibold">{t("home.cta.description")}</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to={toMap}
              className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 text-base font-semibold text-slate-900 shadow-lg shadow-slate-900/10"
            >
              {t("home.cta.primary")}
            </Link>
            <Link
              to={toCreateFarm}
              className="inline-flex items-center justify-center rounded-xl border border-white/40 px-6 py-3 text-base font-semibold text-white"
            >
              {t("home.cta.secondary")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
