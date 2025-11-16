
import { route, index, type RouteConfig } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("login", "routes/login.tsx"),
	route("register", "routes/register.tsx"),
	route("create-farm", "routes/create-farm.tsx"),
	route("map", "routes/map.tsx"),
    route("wiki", "routes/wiki.tsx"),
	route("protected-example", "routes/protected-example.tsx"),
] satisfies RouteConfig;
