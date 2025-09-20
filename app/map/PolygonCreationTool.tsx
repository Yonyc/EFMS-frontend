import { useState } from "react";

interface PolygonCreationToolProps {
  onStart: () => void;
  isDrawing: boolean;
}

export default function PolygonCreationTool({ onStart, isDrawing }: PolygonCreationToolProps) {
  return (
    <div style={{ padding: "1rem", background: "#eee", borderBottom: "1px solid #ccc" }}>
      <button onClick={onStart} disabled={isDrawing} style={{ padding: "0.5rem 1rem" }}>
        {isDrawing ? "Click on map to draw..." : "Start Polygon"}
      </button>
    </div>
  );
}
