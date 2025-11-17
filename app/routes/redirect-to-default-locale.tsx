import { redirect } from "react-router";
import { DEFAULT_LOCALE } from "../utils/locale";

export function loader() {
  return redirect(`/${DEFAULT_LOCALE}`);
}

export default function RedirectToDefaultLocale() {
  return null;
}
