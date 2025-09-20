
import { route, index, type RouteConfig } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("map", "routes/map.tsx"),
    route("wiki", "routes/wiki.tsx")
] satisfies RouteConfig;
