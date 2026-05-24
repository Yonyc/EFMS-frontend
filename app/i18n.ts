import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Language resources
import enTranslation from "../src/locales/en/translation.json";
import enWiki from "../src/locales/en/wiki.json";
import frTranslation from "../src/locales/fr/translation.json";
import frWiki from "../src/locales/fr/wiki.json";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, getLocaleFromPathname, isSupportedLocale } from "./utils/locale";

const resources = {
  en: {
    translation: enTranslation,
    wiki: enWiki,
  },
  fr: {
    translation: frTranslation,
    wiki: frWiki,
  },
};

// match the server's url-derived render so hydration agrees on first paint
const initialLng = typeof window !== "undefined"
  ? (isSupportedLocale(getLocaleFromPathname(window.location.pathname))
      ? getLocaleFromPathname(window.location.pathname)
      : DEFAULT_LOCALE)
  : DEFAULT_LOCALE;

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLng,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: {
      escapeValue: false,
    },
  });

// language decision importance order: session, browser, account preference
export function applyPostHydrationLanguage(): void {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem("preferredLanguage");
    if (stored && isSupportedLocale(stored)) {
      if (i18n.language !== stored) i18n.changeLanguage(stored);
      return;
    }
  } catch { /* private mode */ }
  const navLang = (navigator.language || "").slice(0, 2).toLowerCase();
  if (SUPPORTED_LOCALES.includes(navLang as any) && i18n.language !== navLang) {
    i18n.changeLanguage(navLang);
  }
}

export default i18n;
