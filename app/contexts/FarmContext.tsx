import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { apiGet } from '../utils/api';

interface Farm {
  id: string;
  name: string;
  location?: string;
}

interface FarmContextType {
  farms: Farm[];
  selectedFarm: Farm | null;
  selectFarm: (farmId: string) => void;
  isLoading: boolean;
  error: string | null;
  refreshFarms: () => Promise<void>;
}

const FarmContext = createContext<FarmContextType | undefined>(undefined);

export function FarmProvider({ children }: { children: ReactNode }) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<Farm | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, token } = useAuth();

  const fetchFarms = async () => {
    if (!isAuthenticated) {
      setFarms([]);
      setSelectedFarm(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiGet('/farm/my-farms');
      
      if (!response.ok) {
        throw new Error('Failed to fetch farms');
      }

      const data = await response.json();
      setFarms(data);

      // Auto-select first farm if none selected
      if (data.length > 0 && !selectedFarm) {
        setSelectedFarm(data[0]);
        // Store selected farm in localStorage
        localStorage.setItem('selectedFarmId', data[0].id);
      } else if (selectedFarm) {
        // Ensure selected farm still exists
        const stillExists = data.find((f: Farm) => f.id === selectedFarm.id);
        if (!stillExists && data.length > 0) {
          setSelectedFarm(data[0]);
          localStorage.setItem('selectedFarmId', data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching farms:', err);
      setError('Failed to load farms');
      setFarms([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Load farms when authenticated
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchFarms();
    } else {
      setFarms([]);
      setSelectedFarm(null);
    }
  }, [isAuthenticated, token]);

  // Restore selected farm from localStorage on mount
  useEffect(() => {
    const storedFarmId = localStorage.getItem('selectedFarmId');
    if (storedFarmId && farms.length > 0) {
      const farm = farms.find(f => f.id === storedFarmId);
      if (farm) {
        setSelectedFarm(farm);
      }
    }
  }, [farms]);

  const selectFarm = (farmId: string) => {
    const farm = farms.find(f => f.id === farmId);
    if (farm) {
      setSelectedFarm(farm);
      localStorage.setItem('selectedFarmId', farmId);
    }
  };

  const value = {
    farms,
    selectedFarm,
    selectFarm,
    isLoading,
    error,
    refreshFarms: fetchFarms,
  };

  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}

export function useFarm() {
  const context = useContext(FarmContext);
  if (context === undefined) {
    throw new Error('useFarm must be used within a FarmProvider');
  }
  return context;
}
