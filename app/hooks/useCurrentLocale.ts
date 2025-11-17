import { useLocation, useParams } from "react-router";
import {
  getLocaleFromPathname,
  isSupportedLocale,
} from "../utils/locale";
import type { Locale } from "../utils/locale";

export function useCurrentLocale(): Locale {
  const params = useParams();
  const location = useLocation();

  if (isSupportedLocale(params.locale)) {
    return params.locale;
  }

  return getLocaleFromPathname(location.pathname ?? "/");
}
