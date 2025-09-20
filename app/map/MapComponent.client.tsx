import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import L from "leaflet";
import "leaflet-draw";

const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});
(L.Marker.prototype as any).options.icon = DefaultIcon;

type LatLngTuple = [number, number];

type PolygonData = {
  id: string;
  name: string;
  coords: LatLngTuple[];
  visible: boolean;
};

export default function MapComponent() {
  const center: LatLngTuple = [50.668333, 4.621278];

  const [polygons, setPolygons] = useState<PolygonData[]>([]);
  const mapRef = useRef<L.Map | null>(null);
  const featureGroupRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const drawControlRef = useRef<L.Control.Draw | null>(null);

  // Sync FeatureGroup to polygons
  useEffect(() => {
    const fg = featureGroupRef.current;
    fg.clearLayers();
    polygons.forEach((poly) => {
      if (!poly.visible) return;
      const leafletPoly = L.polygon(poly.coords, { color: "blue" });
      (leafletPoly as any).options.customId = poly.id;
      fg.addLayer(leafletPoly);
    });
  }, [polygons]);

  // Initialize map, draw controls and events
  useEffect(() => {
    const map = mapRef.current;
    if (!map || drawControlRef.current) return;

    const fg = featureGroupRef.current;
    fg.addTo(map);

    const drawControl = new L.Control.Draw({
      edit: { featureGroup: fg, edit: true, remove: true },
      draw: { polygon: true, rectangle: false, circle: false, polyline: false, marker: false, circlemarker: false },
    });
    drawControlRef.current = drawControl;
    map.addControl(drawControl);

    // Create polygon
    map.on(L.Draw.Event.CREATED, (e: any) => {
      const layer = e.layer as L.Polygon;
      const latlngs = (layer.getLatLngs()[0] as L.LatLng[]).map((ll) => [ll.lat, ll.lng]) as LatLngTuple[];
      setPolygons((prev) => [...prev, { id: `poly-${Date.now()}`, name: `Polygon ${prev.length + 1}`, coords: latlngs, visible: true }]);
    });

    // Edit polygon
    map.on(L.Draw.Event.EDITED, (e: any) => {
      const updates: Record<string, LatLngTuple[]> = {};
      e.layers.eachLayer((layer: any) => {
        const id: string | undefined = layer.options?.customId;
        if (!id) return;
        const latlngs = (layer.getLatLngs()[0] as L.LatLng[]).map((ll) => [ll.lat, ll.lng]) as LatLngTuple[];
        updates[id] = latlngs;
      });
      setPolygons((prev) => prev.map((p) => (updates[p.id] ? { ...p, coords: updates[p.id] } : p)));
    });

    // Delete polygon
    map.on(L.Draw.Event.DELETED, (e: any) => {
      const idsToDelete: string[] = [];
      e.layers.eachLayer((layer: any) => {
        const id: string | undefined = layer.options?.customId;
        if (id) idsToDelete.push(id);
      });
      setPolygons((prev) => prev.filter((p) => !idsToDelete.includes(p.id)));
    });
  }, []);

  // Fix black map / dynamic resize
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setTimeout(() => map.invalidateSize(), 0);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }} className="text-black">
      <div style={{ width: 280, background: "#f8f9fa", padding: 12, overflowY: "auto", borderRight: "1px solid #e5e7eb" }}>
        <h3 style={{ margin: "4px 0 12px" }}>Polygons</h3>
        {polygons.map((poly) => (
          <div key={poly.id} style={{ marginBottom: 12, display: "grid", gap: 6 }}>
            <input
              type="text"
              value={poly.name}
              onChange={(e) => setPolygons((prev) => prev.map((p) => (p.id === poly.id ? { ...p, name: e.target.value } : p)))}
              placeholder="Polygon name"
              style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={poly.visible}
                onChange={(e) => setPolygons((prev) => prev.map((p) => (p.id === poly.id ? { ...p, visible: e.target.checked } : p)))}
              />
              Visible
            </label>
          </div>
        ))}
        <p style={{ fontSize: 12, color: "#6b7280" }}>
          Use the polygon tool on the map to create new polygons. Edit or delete using the map tools.
        </p>
      </div>
      <div style={{ flex: 1 }}>
        <MapContainer
          center={center}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          whenCreated={(mapInstance) => {
            mapRef.current = mapInstance;
            featureGroupRef.current.addTo(mapInstance);
          }}
        >
          <TileLayer
            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </MapContainer>
      </div>
    </div>
  );
}
