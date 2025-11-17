export const SUPPORTED_LOCALES = ["en", "fr"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

export function isSupportedLocale(value: string | undefined | null): value is Locale {
  return value !== undefined && value !== null && SUPPORTED_LOCALES.includes(value as Locale);
}

export function ensureLeadingSlash(pathname: string): string {
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function stripLocaleFromPathname(pathname: string): string {
  const normalized = ensureLeadingSlash(pathname);
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length > 0 && isSupportedLocale(segments[0])) {
    segments.shift();
  }

  return segments.join("/");
}

export function getLocaleFromPathname(pathname: string): Locale {
  const normalized = ensureLeadingSlash(pathname);
  const [firstSegment] = normalized.split("/").filter(Boolean);
  return isSupportedLocale(firstSegment) ? firstSegment : DEFAULT_LOCALE;
}

export function buildLocalizedPath(locale: Locale, pathname: string): string {
  const rest = stripLocaleFromPathname(pathname);
  return `/${locale}${rest ? `/${rest}` : ""}`;
}

export function buildLocalizedUrl(
  locale: Locale,
  pathname: string,
  search = "",
  hash = ""
): string {
  const basePath = buildLocalizedPath(locale, pathname);
  return `${basePath}${search}${hash}`;
}
