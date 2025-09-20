import type { Route } from "./+types/home";
import { useTranslation } from "react-i18next";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "EMFS - Experimental Farms Managment System" },
    { name: "description", content: "A website designed for managing experimental farms" },
  ];
}

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="">
      <h1>{t("home.title")}</h1>
      <p>{t("home.description")}</p>
    </div>
  );
}
