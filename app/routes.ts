
import { route, index, type RouteConfig } from "@react-router/dev/routes";

export default [
	index("routes/redirect-to-default-locale.tsx"),
	route(":locale", "routes/home.tsx"),
	route(":locale/login", "routes/login.tsx"),
	route(":locale/register", "routes/register.tsx"),
	route(":locale/create-farm", "routes/create-farm-redirect.tsx"), // backward compatibility redirect
	route(":locale/manage-farm", "routes/manage-farm/layout.tsx", [
		index("routes/manage-farm/index.tsx"),
		route("settings", "routes/manage-farm/settings.tsx"),
		route("members", "routes/manage-farm/members.tsx"),
		route("danger", "routes/manage-farm/danger.tsx"),
		route("create", "routes/manage-farm/create.tsx"),
	]),
	route(":locale/public-farms", "routes/public-farms.tsx"),
	route(":locale/map", "routes/map.tsx"),
	route(":locale/profile", "routes/profile.tsx"),
	route(":locale/operations", "routes/operations.tsx"),
	route(":locale/assets", "routes/assets.tsx"),
	route(":locale/periods", "routes/periods.tsx"),
	route(":locale/farm-shares", "routes/farm-shares.tsx"),
	route(":locale/wiki", "routes/wiki.tsx"),
	route(":locale/imports", "routes/imports.tsx"),
	route(":locale/imports/map", "routes/imports.map.tsx"),
	route(":locale/protected-example", "routes/protected-example.tsx"),
	route(":locale/admin", "routes/admin/layout.tsx", [
		index("routes/admin/index.tsx"),
		route("users", "routes/admin/users.tsx"),
		route("farms", "routes/admin/farms.tsx"),
		route("farms/:farmId", "routes/admin/farm-detail.tsx"),
		route("settings", "routes/admin/settings.tsx"),
	]),
	route(":locale/verify", "routes/verify.tsx"),
	route("*", "routes/locale-fallback.tsx"),
] satisfies RouteConfig;
