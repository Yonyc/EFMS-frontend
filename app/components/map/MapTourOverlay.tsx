import { useEffect, useMemo, useState } from "react";

interface MapTourStep {
  id: string;
  title: string;
  description: string;
  selector?: string;
}

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface MapTourLabels {
  step: string;
  skip: string;
  back: string;
  next: string;
  finish: string;
}

interface MapTourOverlayProps {
  isOpen: boolean;
  steps: MapTourStep[];
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onFinish: () => void;
  labels: MapTourLabels;
}

const PADDING = 12;

export default function MapTourOverlay({
  isOpen,
  steps,
  currentStep,
  onNext,
  onPrev,
  onSkip,
  onFinish,
  labels,
}: MapTourOverlayProps) {
  const [rect, setRect] = useState<HighlightRect | null>(null);

  const activeStep = steps[currentStep];

  const updateRect = useMemo(() => {
    if (typeof window === "undefined") {
      return () => undefined;
    }
    return () => {
      if (!isOpen || !activeStep?.selector) {
        setRect(null);
        return;
      }
      const element = document.querySelector(activeStep.selector) as HTMLElement | null;
      if (!element) {
        setRect(null);
        return;
      }
      const bounds = element.getBoundingClientRect();
      setRect({
        top: bounds.top - PADDING,
        left: bounds.left - PADDING,
        width: bounds.width + PADDING * 2,
        height: bounds.height + PADDING * 2,
      });
    };
  }, [activeStep?.selector, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setRect(null);
      return;
    }
    updateRect();
    const handleResize = () => updateRect();
    const handleScroll = () => updateRect();

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    let observer: ResizeObserver | null = null;
    if (activeStep?.selector) {
      const el = document.querySelector(activeStep.selector) as HTMLElement | null;
      if (el && "ResizeObserver" in window) {
        observer = new ResizeObserver(() => updateRect());
        observer.observe(el);
      }
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      observer?.disconnect();
    };
  }, [isOpen, activeStep?.selector, updateRect]);

  if (!isOpen || !activeStep) {
    return null;
  }

  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[5000] flex items-end justify-center px-4 pb-8 sm:items-center">
      {!rect && <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />}
      {rect && (
        <div
          className="pointer-events-none fixed rounded-2xl border border-white/60 shadow-[0_0_0_9999px_rgba(15,23,42,0.6)] transition-all duration-200"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            background: "rgba(255,255,255,0.04)",
          }}
        />
      )}
      <div className="relative w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span>{labels.step}</span>
          <button type="button" onClick={onSkip} className="text-indigo-500 transition hover:text-indigo-600">
            {labels.skip}
          </button>
        </div>
        <h3 className="mt-3 text-2xl font-semibold text-slate-900">{activeStep.title}</h3>
        <p className="mt-2 text-sm text-slate-600">{activeStep.description}</p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => currentStep > 0 && onPrev()}
            disabled={currentStep === 0}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {labels.back}
          </button>
          <div className="flex gap-3">
            {!isLastStep && (
              <button
                type="button"
                onClick={onNext}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/20"
              >
                {labels.next}
              </button>
            )}
            {isLastStep && (
              <button
                type="button"
                onClick={onFinish}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30"
              >
                {labels.finish}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
