import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";

export default function MultiSelectCombobox({
    label,
    options,
    selectedValues,
    onChange,
    placeholder,
    disabled = false,
}: {
    label: string;
    options: Array<{ value: string; label: string }>;
    selectedValues: string[];
    onChange: (next: string[]) => void;
    placeholder: string;
    disabled?: boolean;
}) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
    const selectedLabels = useMemo(
        () => options.filter((option) => selectedSet.has(option.value)).map((option) => option.label),
        [options, selectedSet]
    );
    const filteredOptions = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return options;
        return options.filter((option) => option.label.toLowerCase().includes(needle));
    }, [options, query]);

    useEffect(() => {
        if (disabled && open) {
            setOpen(false);
        }
    }, [disabled, open]);

    return (
        <label className={`block text-xs font-semibold uppercase tracking-wide ${disabled ? 'text-slate-400' : 'text-slate-500'}`}>
            {label}
            <div className="relative mt-1">
                <button
                    type="button"
                    onClick={() => !disabled && setOpen((prev) => !prev)}
                    disabled={disabled}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm focus:outline-none ${disabled
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                        : 'border-slate-200 bg-white text-slate-700 focus:border-indigo-300'
                        }`}
                >
                    {selectedLabels.length > 0 ? selectedLabels.join(', ') : placeholder}
                </button>
                {open && (
                    <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={t('map.polygonList.searchPlaceholder', { defaultValue: 'Search options' })}
                            className="mb-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-300 focus:outline-none"
                        />
                        <div className="max-h-40 overflow-auto">
                            {filteredOptions.map((option) => {
                                const checked = selectedSet.has(option.value);
                                return (
                                    <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => {
                                                if (checked) {
                                                    onChange(selectedValues.filter((value) => value !== option.value));
                                                } else {
                                                    onChange([...selectedValues, option.value]);
                                                }
                                            }}
                                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                                        />
                                        <span>{option.label}</span>
                                    </label>
                                );
                            })}
                            {filteredOptions.length === 0 && (
                                <p className="px-2 py-1.5 text-xs text-slate-400">No match</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </label>
    );
}