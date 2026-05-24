import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "~/contexts/AuthContext";
import type { TimeFormat, DateFormat } from "~/contexts/AuthContext";

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
    if (value === null || value === undefined || value === "") return null;
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

function pad(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

interface FormatPrefs {
    timeFormat?: TimeFormat;
    dateFormat?: DateFormat;
    locale?: string;
}

export function formatDate(value: DateInput, prefs: FormatPrefs = {}): string {
    const d = toDate(value);
    if (!d) return "";
    const fmt = prefs.dateFormat ?? "auto";
    if (fmt === "auto") {
        return d.toLocaleDateString(prefs.locale);
    }
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    if (fmt === "DD-MM-YYYY") return `${day}/${m}/${y}`;
    if (fmt === "MM-DD-YYYY") return `${m}/${day}/${y}`;
    return `${y}-${m}-${day}`;
}

export function formatTime(value: DateInput, prefs: FormatPrefs = {}): string {
    const d = toDate(value);
    if (!d) return "";
    const hour12 = prefs.timeFormat === "12h";
    return d.toLocaleTimeString(prefs.locale, { hour: "2-digit", minute: "2-digit", hour12 });
}

export function formatDateTime(value: DateInput, prefs: FormatPrefs = {}): string {
    const datePart = formatDate(value, prefs);
    const timePart = formatTime(value, prefs);
    if (!datePart && !timePart) return "";
    return `${datePart} ${timePart}`.trim();
}

// hook variant that reads prefs from the auth context and the active i18n locale, returns stable formatters
export function useDateTimeFormatter() {
    const { user } = useAuth();
    const { i18n } = useTranslation();
    const prefs = useMemo<FormatPrefs>(() => ({
        timeFormat: user?.timeFormat ?? "24h",
        dateFormat: user?.dateFormat ?? "auto",
        locale: i18n.language,
    }), [user?.timeFormat, user?.dateFormat, i18n.language]);

    const fmtDate = useCallback((value: DateInput) => formatDate(value, prefs), [prefs]);
    const fmtTime = useCallback((value: DateInput) => formatTime(value, prefs), [prefs]);
    const fmtDateTime = useCallback((value: DateInput) => formatDateTime(value, prefs), [prefs]);
    return { formatDate: fmtDate, formatTime: fmtTime, formatDateTime: fmtDateTime, prefs };
}
