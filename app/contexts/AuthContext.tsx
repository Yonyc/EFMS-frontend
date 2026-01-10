import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { apiRequest } from '~/utils/api';

export type TutorialState = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

interface User {
  id: string;
  username: string;
  email?: string;
  tutorialState?: TutorialState;
  operationsPopupTopRight?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  refreshUser: () => Promise<User | null>;
  updateTutorialState: (state: TutorialState) => Promise<User | null>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const persistSession = (nextToken: string, nextUser: User) => {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem('authToken', nextToken);
    localStorage.setItem('authUser', JSON.stringify(nextUser));
  };

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  }, []);

  const refreshUser = useCallback(async (overrideToken?: string): Promise<User | null> => {
    const activeToken = overrideToken ?? token;
    if (!activeToken) return null;
    try {
      const response = await apiRequest('/users/me', {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (!response.ok) {
        if (response.status === 401) {
          logout();
        }
        return null;
      }
      const data = await response.json();
      const refreshedUser: User = {
        id: String(data.id),
        username: data.username,
        tutorialState: data.tutorialState as TutorialState,
        operationsPopupTopRight: data.operationsPopupTopRight,
      };
      persistSession(activeToken, refreshedUser);
      return refreshedUser;
    } catch (error) {
      console.error('Error refreshing user:', error);
      return null;
    }
  }, [logout, token]);

  // Load token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('authUser');

    if (storedToken) {
      setToken(storedToken);
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
        } catch (e) {
          console.error('Error parsing stored user:', e);
          localStorage.removeItem('authToken');
          localStorage.removeItem('authUser');
        }
      }

      refreshUser(storedToken).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [refreshUser]);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await apiRequest('/auth/login', {
        method: 'POST',
        requireAuth: false,
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data = await response.json();
      const { token: newToken, user_id, tutorialState, operationsPopupTopRight } = data;

      const newUser: User = {
        id: String(user_id),
        username,
        tutorialState: tutorialState as TutorialState,
        operationsPopupTopRight,
      };
      persistSession(newToken, newUser);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updateTutorialState = useCallback(async (state: TutorialState): Promise<User | null> => {
    if (!token) return null;
    try {
      const response = await apiRequest('/users/me/tutorial-state', {
        method: 'PUT',
        body: JSON.stringify({ tutorialState: state }),
      });
      if (!response.ok) {
        if (response.status === 401) logout();
        return null;
      }
      const data = await response.json();
      const updatedUser: User = {
        id: String(data.id),
        username: data.username,
        tutorialState: data.tutorialState as TutorialState,
      };
      persistSession(token, updatedUser);
      return updatedUser;
    } catch (error) {
      console.error('Failed to update tutorial state:', error);
      return null;
    }
  }, [logout, token]);

  const value = {
    user,
    token,
    login,
    refreshUser,
    updateTutorialState,
    logout,
    isAuthenticated: !!token,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
