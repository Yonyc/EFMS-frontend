import { type RouteConfig } from "@react-router/dev/routes";
import { useEffect, useState } from "react";

export default function MapPage() {
    const [MapComponent, setMapComponent] = useState<React.ComponentType<any> | null>(null);

    useEffect(() => {
        import("../components/map/MapWithPolygons.client").then((mod) => {
            setMapComponent(() => mod.default);
        });
    }, []);

    return (
        <div style={{ display: "flex", height: "100vh", width: "100%" }}>
            {MapComponent ? <MapComponent /> : <p>Loading map...</p>}
        </div>
    );
}
