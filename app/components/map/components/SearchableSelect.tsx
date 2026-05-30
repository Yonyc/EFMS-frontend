import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

export interface SelectOption { value: string; label: string }

interface Props {
    value: string;
    onChange: (val: string) => void;
    options: SelectOption[];
    placeholder: string;
    noResultsText?: string;
    className?: string;
    onLoadMore?: () => void;
    hasMore?: boolean;
    loading?: boolean;
    disabled?: boolean;
    /** Colour scheme: "dark" (default, for map overlays) or "light" (for white modals/lists). */
    variant?: "dark" | "light";
}

export function SearchableSelect({ value, onChange, options, placeholder, noResultsText = "No results", className, onLoadMore, hasMore, loading, disabled, variant = "dark" }: Props) {
    const light = variant === "light";
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedLabel = options.find(o => o.value === value)?.label;

    const filtered = query.trim()
        ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
        : options;

    const close = useCallback(() => {
        setOpen(false);
        setQuery("");
    }, []);

    const handleOpen = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const estimatedHeight = Math.min(208, filtered.length * 36 + 8);
        const spaceBelow = window.innerHeight - rect.bottom - 8;
        const top = spaceBelow < estimatedHeight && rect.top > estimatedHeight
            ? rect.top - estimatedHeight - 4
            : rect.bottom + 4;
        setDropdownPos({ top, left: rect.left, width: rect.width });
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
    }, [filtered.length]);

    const handleSelect = useCallback((val: string) => {
        onChange(val);
        close();
    }, [onChange, close]);

    // Attach scroll listener to call onLoadMore when near the bottom
    useEffect(() => {
        if (!open || !onLoadMore) return;
        const el = dropdownRef.current;
        if (!el) return;
        const onScroll = () => {
            if (!loading && el.scrollHeight - el.scrollTop - el.clientHeight < 60) {
                onLoadMore();
            }
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [open, onLoadMore, loading]);

    // Close on outside pointer-down (works for both mouse and touch)
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            const t = e.target as Node;
            if (!triggerRef.current?.contains(t) && !dropdownRef.current?.contains(t)) {
                close();
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open, close]);

    return (
        <div ref={triggerRef} className={className}>
            {open ? (
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Escape') close();
                        if (e.key === 'Enter' && filtered.length > 0) handleSelect(filtered[0].value);
                    }}
                    placeholder={placeholder}
                    className={light
                        ? "w-full rounded-md border border-indigo-400 bg-white px-2 py-2 text-sm text-slate-900 outline-none ring-1 ring-indigo-200"
                        : "w-full rounded-md border border-indigo-400/60 bg-white/5 px-2 py-2 text-sm text-white outline-none ring-1 ring-indigo-400/30"}
                />
            ) : (
                <button
                    type="button"
                    onClick={handleOpen}
                    disabled={disabled}
                    className={light
                        ? "w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-left outline-none transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                        : "w-full rounded-md border border-white/10 bg-white/5 px-2 py-2 text-sm text-left outline-none transition-colors hover:border-white/20 hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-white/10 disabled:hover:bg-white/5"}
                >
                    {value && selectedLabel
                        ? <span className={light ? "text-slate-900" : "text-white"}>{selectedLabel}</span>
                        : <span className={light ? "text-slate-400" : "text-slate-400"}>{placeholder}</span>
                    }
                </button>
            )}

            {open && dropdownPos && createPortal(
                <div
                    ref={dropdownRef}
                    style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 130000 }}
                    className={light
                        ? "max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl"
                        : "max-h-52 overflow-y-auto rounded-xl border border-white/15 bg-slate-800 shadow-2xl"}
                >
                    {filtered.length === 0 && !loading ? (
                        <div className={`px-3 py-2 text-sm ${light ? 'text-slate-500' : 'text-slate-400'}`}>{noResultsText}</div>
                    ) : (
                        filtered.map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                onPointerDown={() => handleSelect(opt.value)}
                                className={light
                                    ? `w-full px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100 ${opt.value === value ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-900'}`
                                    : `w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 ${opt.value === value ? 'bg-indigo-500/10 font-semibold text-indigo-300' : 'text-white'}`}
                            >
                                {opt.label}
                            </button>
                        ))
                    )}
                    {loading && (
                        <div className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-slate-400">
                            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
                            Loading…
                        </div>
                    )}
                    {!loading && hasMore && (
                        <button
                            type="button"
                            onPointerDown={onLoadMore}
                            className="w-full px-3 py-2 text-center text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors"
                        >
                            Load more…
                        </button>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}
