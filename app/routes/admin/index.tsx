import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useCurrentLocale } from "../../hooks/useCurrentLocale";
import { buildLocalizedPath } from "../../utils/locale";

export default function AdminIndex() {
    const navigate = useNavigate();
    const locale = useCurrentLocale();

    useEffect(() => {
        navigate(buildLocalizedPath(locale, "/admin/users"), { replace: true });
    }, [navigate, locale]);

    return null;
}
