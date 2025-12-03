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
  refreshFarms: (preferredFarmId?: string) => Promise<Farm[]>;
}

const FarmContext = createContext<FarmContextType | undefined>(undefined);

export function FarmProvider({ children }: { children: ReactNode }) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<Farm | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, token } = useAuth();

  const setAndPersistSelectedFarm = (farm: Farm | null) => {
    setSelectedFarm(farm);
    if (farm) {
      localStorage.setItem('selectedFarmId', farm.id);
    } else {
      localStorage.removeItem('selectedFarmId');
    }
  };

  const fetchFarms = async (preferredFarmId?: string) => {
    if (!isAuthenticated) {
      setFarms([]);
      setAndPersistSelectedFarm(null);
      return [];
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

      const preferredFarm = preferredFarmId
        ? data.find((farm: Farm) => farm.id === preferredFarmId)
        : undefined;

      if (preferredFarm) {
        setAndPersistSelectedFarm(preferredFarm);
      } else if (data.length > 0 && !selectedFarm) {
        setAndPersistSelectedFarm(data[0]);
      } else if (selectedFarm) {
        const stillExists = data.find((f: Farm) => f.id === selectedFarm.id);
        if (!stillExists && data.length > 0) {
          setAndPersistSelectedFarm(data[0]);
        } else if (!stillExists) {
          setAndPersistSelectedFarm(null);
        }
      }

      return data;
    } catch (err) {
      console.error('Error fetching farms:', err);
      setError('Failed to load farms');
      setFarms([]);
      setAndPersistSelectedFarm(null);
      return [];
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
      setAndPersistSelectedFarm(null);
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
        setAndPersistSelectedFarm(farm);
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
