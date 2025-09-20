import type { Route } from "./+types/home";
import { useEffect, useState } from "react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dynamic Polygon Map" },
    { name: "description", content: "Map with toggleable polygons from API" },
  ];
}

export default function Home() {
  const [MapComponent, setMapComponent] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    import("../map/MapWithPolygons.client").then((mod) => {
      setMapComponent(() => mod.default);
    });
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      {MapComponent ? <MapComponent /> : <p>Loading map...</p>}
    </div>
  );
}
