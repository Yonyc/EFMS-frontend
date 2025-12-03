import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useFarm } from "../contexts/FarmContext";
import { useAuth } from "../contexts/AuthContext";
import ProtectedRoute from "~/components/ProtectedRoute";
import { useCurrentLocale } from "../hooks/useCurrentLocale";
import { buildLocalizedPath } from "../utils/locale";
import MapTourOverlay from "~/components/map/MapTourOverlay";

export default function MapPage() {
    const [MapComponent, setMapComponent] = useState<React.ComponentType<any> | null>(null);
    const { farms, selectedFarm, selectFarm, isLoading: farmsLoading } = useFarm();
    const { isAuthenticated, user } = useAuth();
    const locale = useCurrentLocale();
    const { t } = useTranslation();
    const createFarmPath = useMemo(() => buildLocalizedPath(locale, "/create-farm"), [locale]);
    const [isTourOpen, setIsTourOpen] = useState(false);
    const [tourStep, setTourStep] = useState(0);

    const tourSteps = useMemo(() => (
        [
            {
                id: "farm-selector",
                title: t("map.tour.steps.farmSelector.title"),
                description: t("map.tour.steps.farmSelector.description"),
                selector: '[data-tour-id="map-farm-selector"]',
            },
            {
                id: "toolbar",
                title: t("map.tour.steps.toolbar.title"),
                description: t("map.tour.steps.toolbar.description"),
                selector: '[data-tour-id="map-toolbar"]',
            },
            {
                id: "canvas",
                title: t("map.tour.steps.canvas.title"),
                description: t("map.tour.steps.canvas.description"),
                selector: '[data-tour-id="map-canvas"]',
            },
            {
                id: "list",
                title: t("map.tour.steps.list.title"),
                description: t("map.tour.steps.list.description"),
                selector: '[data-tour-id="map-polygon-list"]',
            },
        ].filter(step => step.title && step.description)
    ), [t]);

    const tourStorageKey = useMemo(() => user ? `efms:tour:map:${user.id}` : "efms:tour:map:guest", [user]);

    useEffect(() => {
        if (!isAuthenticated) {
            setMapComponent(null);
            return;
        }

        let isMounted = true;
        import("../components/map/MapWithPolygons.client").then((mod) => {
            if (isMounted) {
                setMapComponent(() => mod.default);
            }
        });

        return () => {
            isMounted = false;
        };
    }, [isAuthenticated]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!isAuthenticated || !selectedFarm || !MapComponent) return;
        if (localStorage.getItem(tourStorageKey)) return;

        const timer = window.setTimeout(() => {
            setTourStep(0);
            setIsTourOpen(true);
        }, 400);

        return () => window.clearTimeout(timer);
    }, [isAuthenticated, selectedFarm, MapComponent, tourStorageKey]);

    const closeTour = useCallback(() => {
        if (typeof window !== "undefined") {
            localStorage.setItem(tourStorageKey, "done");
        }
        setIsTourOpen(false);
        setTourStep(0);
    }, [tourStorageKey]);

    const handleNextStep = useCallback(() => {
        setTourStep((prev) => Math.min(prev + 1, Math.max(tourSteps.length - 1, 0)));
    }, [tourSteps.length]);

    const handlePrevStep = useCallback(() => {
        setTourStep((prev) => Math.max(prev - 1, 0));
    }, []);

    let content: React.ReactNode = null;

    if (farmsLoading) {
        content = (
            <FullScreenCenter>
                <div className="text-center">
                    <div className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600" />
                    <p className="mt-4 text-gray-600">{t("farmSelector.loading")}</p>
                </div>
            </FullScreenCenter>
        );
    } else if (!farms.length) {
        content = <EmptyFarmState createFarmPath={createFarmPath} />;
    } else if (!selectedFarm) {
        content = (
            <FarmSelectionPanel
                farms={farms}
                onSelect={(farmId) => selectFarm(farmId)}
            />
        );
    } else {
        content = (
            // Use flex-1 so the map area fills remaining viewport height (navbar + content = 100vh)
            <div className="relative flex flex-1 w-full min-h-0">
                {MapComponent ? (
                    <>
                        <MapComponent farm_id={selectedFarm.id} key={selectedFarm.id} />
                        {isTourOpen && tourSteps.length > 0 && (
                            <MapTourOverlay
                                isOpen={isTourOpen}
                                steps={tourSteps}
                                currentStep={tourStep}
                                onNext={handleNextStep}
                                onPrev={handlePrevStep}
                                onSkip={closeTour}
                                onFinish={closeTour}
                                labels={{
                                    step: t("map.tour.controls.step", { current: tourStep + 1, total: tourSteps.length }),
                                    skip: t("map.tour.controls.skip"),
                                    back: t("map.tour.controls.back"),
                                    next: t("map.tour.controls.next"),
                                    finish: t("map.tour.controls.finish"),
                                }}
                            />
                        )}
                    </>
                ) : (
                    <FullScreenCenter>
                        <p className="text-gray-600">{t("common.loading")}</p>
                    </FullScreenCenter>
                )}
            </div>
        );
    }

    return <ProtectedRoute>{content}</ProtectedRoute>;
}

interface FarmSummary {
    id: string;
    name: string;
    location?: string;
}

function FarmSelectionPanel({ farms, onSelect }: { farms: FarmSummary[]; onSelect: (farmId: string) => void }) {
    const { t } = useTranslation();

    return (
        <FullScreenCenter>
            <div className="w-full max-w-3xl space-y-8 rounded-3xl bg-white/90 p-8 shadow-xl backdrop-blur">
                <div className="text-center">
                    <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
                        {t("map.farmSelection.chooseLabel")}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-gray-900">{t("map.farmSelection.title")}</h2>
                    <p className="mt-2 text-sm text-gray-500">{t("map.farmSelection.description")}</p>
                </div>
                <ul className="grid gap-4 sm:grid-cols-2">
                    {farms.map((farm) => (
                        <li
                            key={farm.id}
                            className="rounded-2xl border border-gray-200 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-lg font-semibold text-gray-900">{farm.name}</p>
                                    {farm.location && (
                                        <p className="text-sm text-gray-500">{farm.location}</p>
                                    )}
                                </div>
                                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                                    {t("map.farmSelection.availableBadge")}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => onSelect(farm.id)}
                                className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                            >
                                {t("map.farmSelection.selectButton")}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </FullScreenCenter>
    );
}

function EmptyFarmState({ createFarmPath }: { createFarmPath: string }) {
    const { t } = useTranslation();

    return (
        <FullScreenCenter>
            <div className="w-full max-w-lg rounded-3xl bg-white/90 p-8 text-center shadow-xl backdrop-blur">
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
                    {t("map.farmSelection.stepLabel")}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-gray-900">{t("map.farmSelection.emptyTitle")}</h2>
                <p className="mt-2 text-sm text-gray-500">{t("map.farmSelection.emptyDescription")}</p>
                <Link
                    to={createFarmPath}
                    className="mt-6 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                    {t("map.farmSelection.createButton")}
                </Link>
            </div>
        </FullScreenCenter>
    );
}

function FullScreenCenter({ children }: { children: React.ReactNode }) {
    // Use flex-1 and min-h-0 so this component fits inside the layout's flex column without forcing
    // the page to exceed the viewport height (prevents double 100vh when Navbar is present).
    return (
        <div className="flex flex-1 w-full min-h-0 items-center justify-center bg-slate-50 px-4">
            {children}
        </div>
    );
}
