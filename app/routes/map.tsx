import { useEffect, useState } from "react";
import { useFarm } from "../contexts/FarmContext";
import { useAuth } from "../contexts/AuthContext";
import ProtectedRoute from "~/components/ProtectedRoute";

export default function MapPage() {
    const [MapComponent, setMapComponent] = useState<React.ComponentType<any> | null>(null);
    const { selectedFarm, isLoading: farmsLoading } = useFarm();
    const { isAuthenticated } = useAuth();

    useEffect(() => {
        import("../components/map/MapWithPolygons.client").then((mod) => {
            setMapComponent(() => mod.default);
        });
    }, [isAuthenticated]);

    if (!isAuthenticated) {
        return null;
    }

    if (farmsLoading) {
        return (
            <div style={{ display: "flex", height: "100vh", width: "100%", alignItems: "center", justifyContent: "center" }}>
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                    <p className="mt-4 text-gray-600">Loading farms...</p>
                </div>
            </div>
        );
    }

    if (!selectedFarm) {
        return (
            <div style={{ display: "flex", height: "100vh", width: "100%", alignItems: "center", justifyContent: "center" }}>
                <div className="text-center">
                    <p className="text-xl text-gray-600">No farm selected</p>
                    <p className="mt-2 text-sm text-gray-500">Please select a farm from the navigation bar</p>
                </div>
            </div>
        );
    }

    return (
        <ProtectedRoute>
            <div style={{ display: "flex", height: "100vh", width: "100%" }}>
                {MapComponent ? (
                    <MapComponent farm_id={selectedFarm.id} key={selectedFarm.id} />
                ) : (
                    <p>Loading map...</p>
                )}
            </div>
        </ProtectedRoute>
    );
}
