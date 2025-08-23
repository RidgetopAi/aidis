import { mockContexts, mockSearchResult, mockContextStats } from '../fixtures/contexts';
import { mockProjects, mockProjectsResponse } from '../fixtures/projects';
import { ContextSearchParams } from '../../stores/contextStore';

// API Response Mocks
export const mockContextApi = {
  searchContexts: jest.fn().mockResolvedValue(mockSearchResult),
  getContextStats: jest.fn().mockResolvedValue(mockContextStats),
  createContext: jest.fn().mockResolvedValue(mockContexts[0]),
  updateContext: jest.fn().mockResolvedValue(mockContexts[0]),
  deleteContext: jest.fn().mockResolvedValue(true),
  getContext: jest.fn().mockResolvedValue(mockContexts[0]),
  getRelatedContexts: jest.fn().mockResolvedValue(mockContexts.slice(1)),
  getTypeColor: jest.fn((type: string) => {
    const colors: Record<string, string> = {
      code: 'blue',
      decision: 'purple',
      error: 'red',
      discussion: 'green',
      planning: 'orange',
      completion: 'gold'
    };
    return colors[type] || 'default';
  }),
  getTypeDisplayName: jest.fn((type: string) => 
    type.charAt(0).toUpperCase() + type.slice(1)
  )
};

export const mockProjectApi = {
  getAllProjects: jest.fn().mockResolvedValue(mockProjectsResponse),
  getProject: jest.fn().mockResolvedValue(mockProjects[0]),
  createProject: jest.fn().mockResolvedValue(mockProjects[0]),
  updateProject: jest.fn().mockResolvedValue(mockProjects[0]),
  deleteProject: jest.fn().mockResolvedValue(true),
  switchProject: jest.fn().mockResolvedValue(mockProjects[0])
};

// Network Error Mocks
export const mockNetworkError = new Error('Network request failed');
export const mockAuthError = new Error('Authentication failed');
export const mockValidationError = new Error('Validation failed');

// Mock API with different scenarios
export const createMockApiWithScenario = (scenario: 'success' | 'error' | 'loading' | 'empty') => {
  switch (scenario) {
    case 'error':
      return {
        ...mockContextApi,
        searchContexts: jest.fn().mockRejectedValue(mockNetworkError),
        getContextStats: jest.fn().mockRejectedValue(mockNetworkError)
      };
    case 'empty':
      return {
        ...mockContextApi,
        searchContexts: jest.fn().mockResolvedValue({
          contexts: [],
          total: 0,
          page: 1,
          limit: 20
        })
      };
    case 'loading':
      return {
        ...mockContextApi,
        searchContexts: jest.fn().mockImplementation(() => new Promise(() => {})),
        getContextStats: jest.fn().mockImplementation(() => new Promise(() => {}))
      };
    default:
      return mockContextApi;
  }
};

// Mock timers for debouncing tests
export const mockTimers = () => {
  jest.useFakeTimers();
  return {
    advanceTime: (ms: number) => jest.advanceTimersByTime(ms),
    runAllTimers: () => jest.runAllTimers(),
    cleanup: () => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    }
  };
};

// Mock localStorage
export const mockLocalStorage = () => {
  const store: Record<string, string> = {};
  
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    store
  };
};

// Mock Ant Design message
export const mockAntdMessage = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  loading: jest.fn()
};

// Mock window functions
export const mockWindowFunctions = () => {
  const originalLocation = window.location;
  const originalNavigator = window.navigator;

  return {
    mockClipboard: {
      writeText: jest.fn().mockResolvedValue(undefined)
    },
    mockShare: jest.fn().mockResolvedValue(undefined),
    cleanup: () => {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true
      });
      Object.defineProperty(window, 'navigator', {
        value: originalNavigator,
        writable: true
      });
    }
  };
};

// Helper to create delayed promises for testing loading states
export const createDelayedPromise = <T>(value: T, delay: number = 100): Promise<T> => {
  return new Promise(resolve => setTimeout(() => resolve(value), delay));
};
