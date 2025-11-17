import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Language resources
import enTranslation from "../src/locales/en/translation.json";
import frTranslation from "../src/locales/fr/translation.json";
import { DEFAULT_LOCALE } from "./utils/locale";

const resources = {
  en: {
    translation: enTranslation,
  },
  fr: {
    translation: frTranslation,
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
