import React, { createContext, useContext, useEffect } from 'react';
import { message } from 'antd';
import { apiClient, LoginRequest, User, ApiError } from '../services/api';
import { useAuth } from '../stores/authStore';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const auth = useAuth();

  useEffect(() => {
    // Initialize auth state from localStorage on app start
    auth.initialize();
    
    // Verify token is still valid
    const verifyToken = async () => {
      if (auth.token) {
        try {
          auth.setLoading(true);
          await apiClient.getCurrentUser();
        } catch (error) {
          console.warn('Token verification failed, logging out');
          auth.logout();
        } finally {
          auth.setLoading(false);
        }
      }
    };

    verifyToken();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (credentials: LoginRequest) => {
    try {
      auth.setLoading(true);
      auth.clearError();
      
      const response = await apiClient.login(credentials);
      auth.setUser(response.user, response.token);
      
      message.success(`Welcome back, ${response.user?.firstName || response.user?.username || 'User'}!`);
    } catch (error) {
      const apiError = error as ApiError;
      auth.setError(apiError.message || 'Login failed');
      message.error(apiError.message || 'Login failed');
      throw error;
    } finally {
      auth.setLoading(false);
    }
  };

  const logout = async () => {
    try {
      auth.setLoading(true);
      await apiClient.logout();
      auth.logout();
      message.info('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout even if API call fails
      auth.logout();
    } finally {
      auth.setLoading(false);
    }
  };

  const contextValue: AuthContextType = {
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    error: auth.error,
    login,
    logout,
    clearError: auth.clearError,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
