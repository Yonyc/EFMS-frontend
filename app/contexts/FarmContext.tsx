import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { apiGet } from '../utils/api';

export interface Farm {
  id: string;
  name: string;
  location?: string;
  description?: string;
  isPublic?: boolean;
  showName?: boolean;
  showDescription?: boolean;
  showLocation?: boolean;
  canEdit?: boolean;
  canManage?: boolean;
  
  canViewFarm?: boolean;
  enableMemberAlerts?: boolean;
  enableParcelAlerts?: boolean;
  enableOperationAlerts?: boolean;
  alertRecipientEmail?: string;
  
  defaultPeriodId?: number | null;
}

interface FarmContextType {
  farms: Farm[];
  selectedFarm: Farm | null;
  selectFarm: (farmId: string | null) => Promise<void>;
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
  const { isAuthenticated, token, user } = useAuth();

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
      const response = await apiGet('/farm/my-farms', {
        suppressUnauthorizedRedirect: true,
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch farms');
      }

      const data = await response.json();
      setFarms(data);

      let preferredFarm = preferredFarmId
        ? data.find((farm: Farm) => farm.id === preferredFarmId)
        : undefined;

      if (!preferredFarm && preferredFarmId) {
        try {
          const res = await apiGet(`/farm/${preferredFarmId}`, { suppressUnauthorizedRedirect: true });
          if (res.ok) {
            preferredFarm = await res.json();
            data.push(preferredFarm);
          }
        } catch (e) {
          console.error("Failed to fetch preferred farm", e);
        }
      }

      if (!preferredFarm && selectedFarm) {
        const stillExists = data.find((f: Farm) => f.id === selectedFarm.id);
        if (!stillExists) {
            try {
                const res = await apiGet(`/farm/${selectedFarm.id}`, { suppressUnauthorizedRedirect: true });
                if (res.ok) {
                    const fetchedFarm = await res.json();
                    data.push(fetchedFarm);
                    preferredFarm = fetchedFarm;
                }
            } catch (e) {
                console.error("Failed to fetch selected farm", e);
            }
        }
      }

      setFarms([...data])

      if (preferredFarm) {
        setAndPersistSelectedFarm(preferredFarm);
      } else if (!selectedFarm) {
        const defaultId = user?.defaultFarmId;
        const fromDefault = defaultId ? data.find((f: Farm) => f.id === defaultId) : null;
        if (fromDefault) setAndPersistSelectedFarm(fromDefault);
      } else {
        const stillExists = data.find((f: Farm) => f.id === selectedFarm.id);
        if (!stillExists) {
          const defaultId = user?.defaultFarmId;
          const fromDefault = defaultId ? data.find((f: Farm) => f.id === defaultId) : null;
          setAndPersistSelectedFarm(fromDefault || null);
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

  useEffect(() => {
    if (isAuthenticated && token) {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('selectedFarmId') : null;
      fetchFarms(stored || user?.defaultFarmId || undefined);
    } else {
      setFarms([]);
      setAndPersistSelectedFarm(null);
    }
  }, [isAuthenticated, token, user?.defaultFarmId]);

  const selectFarm = async (farmId: string | null) => {
    if (!farmId) {
        setAndPersistSelectedFarm(null);
        return;
    }
    let farm = farms.find(f => f.id === farmId);
    if (!farm) {
        try {
            const res = await apiGet(`/farm/${farmId}`);
            if (res.ok) {
                farm = await res.json();
                if (farm) {
                    setFarms(prev => [...prev, farm!]);
                }
            }
        } catch (e) {
            console.error("Failed to select external farm", e);
        }
    }
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
