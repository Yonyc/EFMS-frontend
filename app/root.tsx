import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import { useEffect, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";

import type { Route } from "./+types/root";
import "./app.css";
import Navbar from "./components/Navbar";
import "./i18n";
import { AuthProvider } from "./contexts/AuthContext";
import { FarmProvider } from "./contexts/FarmContext";
import { getLocaleFromPathname } from "./utils/locale";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { i18n } = useTranslation();
  const currentLocale = getLocaleFromPathname(location.pathname ?? "/");

  if (typeof window === "undefined" && i18n.language !== currentLocale) {
    i18n.changeLanguage(currentLocale);
  }

  useIsomorphicLayoutEffect(() => {
    if (i18n.language !== currentLocale) {
      i18n.changeLanguage(currentLocale);
    }
  }, [currentLocale, i18n]);

  // Get API URL from environment variable (server-side)
  const apiUrl = typeof process !== 'undefined' ? (process as any).env?.API_URL : undefined;

  return (
    <html lang={currentLocale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {apiUrl && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__ENV__ = { API_URL: ${JSON.stringify(apiUrl)} };`,
            }}
          />
        )}
      </head>
      <body>
        <AuthProvider>
          <FarmProvider>
            <Navbar currentLocale={currentLocale} />
            {children}
          </FarmProvider>
        </AuthProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
