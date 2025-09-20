import {
    MapContainer,
    TileLayer,
    Polygon,
    Marker,
    Popup,
    FeatureGroup,
} from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { useEffect, useRef, useState, useCallback } from "react";
import PolygonList from "./PolygonList";

interface PolygonData {
    id: string;
    name: string;
    coords: [number, number][];
    visible: boolean;
}

export default function MapWithPolygons() {
    const center: [number, number] = [50.668333, 4.621278];
    const [polygons, setPolygons] = useState<PolygonData[]>([]);
    const featureGroupRef = useRef<L.FeatureGroup>(null);

    useEffect(() => {
        const fetchPolygons = async () => {
            try {
                const res = await fetch("https://example.com/api/polygons");
                const data = await res.json();
                setPolygons(data.map((p: any) => ({ ...p, visible: true })));
            } catch (err) {
                console.error("Failed to fetch polygons:", err);
            }
        };
        fetchPolygons();
    }, []);


    const togglePolygon = useCallback((id: string) => {
        setPolygons((prev) =>
            prev.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p))
        );
    }, []);

    const renamePolygon = useCallback((id: string, newName: string) => {
        setPolygons((prev) =>
            prev.map((p) => (p.id === id ? { ...p, name: newName } : p))
        );
    }, []);

    // Handler for polygon creation
    const handleCreated = useCallback((e: any) => {
        const layer = e.layer;
        const latlngs = layer.getLatLngs()[0].map((ll: L.LatLng) => [ll.lat, ll.lng]) as [number, number][];
        setPolygons((prev) => [
            ...prev,
            {
                id: `poly-${Date.now()}`,
                name: `Polygon ${prev.length + 1}`,
                coords: latlngs,
                visible: true,
            },
        ]);
        featureGroupRef.current?.removeLayer(layer);
    }, []);

    // Handler for polygon edit
    const handleEdited = useCallback((e: any) => {
        const updates: Record<string, [number, number][]> = {};
        e.layers.eachLayer((layer: any) => {
            const id = layer.options?.customId;
            if (!id) return;
            const latlngs = layer.getLatLngs()[0].map((ll: L.LatLng) => [ll.lat, ll.lng]) as [number, number][];
            updates[id] = latlngs;
        });
        setPolygons((prev) =>
            prev.map((p) => (updates[p.id] ? { ...p, coords: updates[p.id] } : p))
        );
    }, []);

    // Handler for polygon deletion
    const handleDeleted = useCallback((e: any) => {
        const idsToDelete: string[] = [];
        e.layers.eachLayer((layer: any) => {
            if (layer.options?.customId) {
                idsToDelete.push(layer.options.customId);
            }
        });
        const newPolys = polygons.filter((p) => !idsToDelete.includes(p.id));
        setPolygons(newPolys);
        featureGroupRef.current?.clearLayers();
        newPolys.forEach((poly) => {
            const layer = L.polygon(poly.coords, { color: 'blue' });
            (layer as any).options.customId = poly.id;
            featureGroupRef.current?.addLayer(layer);
        });
    }, [polygons]);

    return (
        <>
            <div className="text-black" style={{ display: "flex", flexDirection: "column", width: "250px" }}>
                <PolygonList
                    polygons={polygons}
                    onToggle={togglePolygon}
                    onRename={renamePolygon}
                />
            </div>
            <div style={{ flex: 1 }}>
                <MapContainer
                    style={{ height: "100%", width: "100%" }}
                    {...{ center, zoom: 15 }}
                >
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        {...{ attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>' }}
                    />
                    <FeatureGroup ref={featureGroupRef}>
                        <EditControl
                            position="topright"
                            draw={{
                                rectangle: false,
                                polyline: false,
                                circle: false,
                                marker: false,
                                circlemarker: false,
                                polygon: true,
                            }}
                            onCreated={handleCreated}
                            onEdited={handleEdited}
                            onDeleted={handleDeleted}
                        />
                        {polygons.filter((p) => p.visible).map((poly) => (
                            <Polygon
                                key={poly.id}
                                positions={poly.coords}
                                pathOptions={{ color: "blue", customId: poly.id }}
                            >
                                <Popup>{poly.name}</Popup>
                            </Polygon>
                        ))}
                    </FeatureGroup>

                    {/* Adjust marker icon anchor to align bottom center */}
                    {((imgUrl: string) => {
                        const img = new window.Image();
                        img.src = imgUrl;
                        img.onload = () => {
                            const iconWidth = img.width;
                            const iconHeight = img.height;
                            const icon = L.icon({
                                iconUrl: img.src,
                                iconAnchor: [Math.floor(iconWidth / 2), iconHeight], // bottom center
                                popupAnchor: [0, 0],
                            });
                            L.Marker.prototype.options.icon = icon;
                        };
                        return <Marker position={center}>
                            <Popup>Center Location</Popup>
                        </Marker>;
                    })("https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png")}

                </MapContainer>
            </div>
        </>
    );
}
