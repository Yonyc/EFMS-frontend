import { redirect } from "react-router";
import {
  buildLocalizedUrl,
  DEFAULT_LOCALE,
  isSupportedLocale,
} from "../utils/locale";

export function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const pathname = url.pathname || "/";
  const [firstSegment] = pathname.split("/").filter(Boolean);

  if (!isSupportedLocale(firstSegment)) {
    const destination = buildLocalizedUrl(
      DEFAULT_LOCALE,
      pathname,
      url.search,
      url.hash
    );
    return redirect(destination);
  }

  throw new Response("Not Found", { status: 404 });
}

export default function LocaleFallback() {
  return null;
}
