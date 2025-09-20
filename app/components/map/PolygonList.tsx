interface PolygonListProps {
  polygons: { id: string; name: string; visible: boolean }[];
  onToggle: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}

export default function PolygonList({ polygons, onToggle, onRename }: PolygonListProps) {
  return (
    <div style={{ width: "100%", padding: "1rem", background: "#f8f8f8", overflowY: "auto" }}>
      <h3>Polygons</h3>
      {polygons.map((poly) => (
        <div key={poly.id} style={{ marginBottom: "0.5rem" }}>
          <input
            type="checkbox"
            checked={poly.visible}
            onChange={() => onToggle(poly.id)}
          />
          <input
            type="text"
            value={poly.name}
            onChange={(e) => onRename(poly.id, e.target.value)}
            style={{ marginLeft: "0.5rem", width: "100%" }}
          />
        </div>
      ))}
    </div>
  );
}
