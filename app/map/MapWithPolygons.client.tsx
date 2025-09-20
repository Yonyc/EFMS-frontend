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
import { useEffect, useRef, useState } from "react";
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

    // Fix default icons
    const DefaultIcon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
    });
    L.Marker.prototype.options.icon = DefaultIcon;

    // Fetch initial polygons from API
    useEffect(() => {
        async function fetchPolygons() {
            try {
                const res = await fetch("https://example.com/api/polygons");
                const data = await res.json();
                const formatted: PolygonData[] = data.map((p: any) => ({
                    ...p,
                    visible: true,
                }));
                setPolygons(formatted);
            } catch (err) {
                console.error("Failed to fetch polygons:", err);
            }
        }
        fetchPolygons();
    }, []);

    const togglePolygon = (id: string) => {
        setPolygons((prev) =>
            prev.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p))
        );
    };

    const renamePolygon = (id: string, newName: string) => {
        setPolygons((prev) =>
            prev.map((p) => (p.id === id ? { ...p, name: newName } : p))
        );
    };

    // Handle creation from draw tool
    const handleCreated = (e: any) => {
        const layer = e.layer;
        const latlngs = layer.getLatLngs()[0].map((ll: L.LatLng) => [
            ll.lat,
            ll.lng,
        ]) as [number, number][];

        const newPoly: PolygonData = {
            id: `poly-${Date.now()}`,
            name: `Polygon ${polygons.length + 1}`,
            coords: latlngs,
            visible: true,
        };
        setPolygons((prev) => [...prev, newPoly]);
    };

    // Handle edit of existing polygons
    const handleEdited = (e: any) => {
        const editedLayers = e.layers;
        editedLayers.eachLayer((layer: any) => {
            const id = layer.options?.customId;
            if (!id) return;
            const latlngs = layer.getLatLngs()[0].map((ll: L.LatLng) => [
                ll.lat,
                ll.lng,
            ]) as [number, number][];
            setPolygons((prev) =>
                prev.map((p) => (p.id === id ? { ...p, coords: latlngs } : p))
            );
        });
    };

    // Handle delete
    const handleDeleted = (e: any) => {
        const deletedLayers = e.layers;
        const idsToDelete: string[] = [];
        deletedLayers.eachLayer((layer: any) => {
            if (layer.options?.customId) {
                idsToDelete.push(layer.options.customId);
            }
        });
        setPolygons((prev) => prev.filter((p) => !idsToDelete.includes(p.id)));
    };

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
                    center={center}
                    zoom={15}
                    scrollWheelZoom={true}
                    style={{ height: "100%", width: "100%" }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
                            onCreated={(e: any) => {
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

                                // Remove the live Leaflet.Draw layer so only React renders it
                                featureGroupRef.current?.removeLayer(layer);
                            }}
                            onEdited={(e: any) => {
                                // Create a map of updated polygons
                                const updates: Record<string, [number, number][]> = {};

                                e.layers.eachLayer((layer: any) => {
                                    const id = layer.options?.customId;
                                    if (!id) return;

                                    const latlngs = layer
                                        .getLatLngs()[0]
                                        .map((ll: L.LatLng) => [ll.lat, ll.lng]) as [number, number][];

                                    updates[id] = latlngs;
                                });

                                // Merge updates into existing state
                                setPolygons((prev) =>
                                    prev.map((p) =>
                                        updates[p.id] ? { ...p, coords: updates[p.id] } : p
                                    )
                                );

                                // Clear Draw's temp layers
                                //featureGroupRef.current?.clearLayers();
                            }}

                            onDeleted={(e: any) => {
                                const idsToDelete: string[] = [];

                                e.layers.eachLayer((layer: any) => {
                                    if (layer.options?.customId) {
                                        idsToDelete.push(layer.options.customId);
                                    }
                                });

                                // Filter out deleted IDs, keep others
                                let newPolys = polygons.filter((p) => !idsToDelete.includes(p.id));
                                setPolygons(newPolys);

                                // reload the polygons drawn on the map
                                featureGroupRef.current?.clearLayers();
                                newPolys.forEach((poly) => {
                                    const layer = L.polygon(poly.coords, { color: 'blue', customId: poly.id });
                                    featureGroupRef.current?.addLayer(layer);
                                });
                            }}

                        />

                        {polygons
                            .filter((p) => p.visible)
                            .map((poly) => (
                                <Polygon
                                    key={poly.id}
                                    positions={poly.coords}
                                    color="blue"
                                    pathOptions={{ customId: poly.id }}
                                >
                                    <Popup>{poly.name}</Popup>
                                </Polygon>
                            ))}
                    </FeatureGroup>


                    <Marker position={center}>
                        <Popup>Center Location</Popup>
                    </Marker>
                </MapContainer>
            </div>
        </>
    );
}
