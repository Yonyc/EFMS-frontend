
import { route, index, type RouteConfig } from "@react-router/dev/routes";

export default [
	index("routes/redirect-to-default-locale.tsx"),
	route(":locale", "routes/home.tsx"),
	route(":locale/login", "routes/login.tsx"),
	route(":locale/register", "routes/register.tsx"),
	route(":locale/create-farm", "routes/create-farm.tsx"),
	route(":locale/map", "routes/map.tsx"),
	route(":locale/profile", "routes/profile.tsx"),
	route(":locale/operations", "routes/operations.tsx"),
	route(":locale/assets", "routes/assets.tsx"),
	route(":locale/wiki", "routes/wiki.tsx"),
	route(":locale/protected-example", "routes/protected-example.tsx"),
	route("*", "routes/locale-fallback.tsx"),
] satisfies RouteConfig;
