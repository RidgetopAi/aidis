import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock authentication context
const mockAuthContextValue = {
  isAuthenticated: true,
  isLoading: false,
  user: {
    id: 'test-user-id',
    username: 'testuser',
    email: 'test@example.com'
  },
  token: 'mock-jwt-token',
  login: jest.fn(),
  logout: jest.fn(),
  refreshToken: jest.fn()
};

// Custom render function with all providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  authContext?: Partial<typeof mockAuthContextValue>;
  routerPath?: string;
}

const AllTheProviders: React.FC<{ 
  children: React.ReactNode; 
  authContext?: Partial<typeof mockAuthContextValue>;
}> = ({ children, authContext = {} }) => {
  const contextValue = { ...mockAuthContextValue, ...authContext };

  return (
    <BrowserRouter>
      <ConfigProvider>
        <AuthProvider value={contextValue as any}>
          {children}
        </AuthProvider>
      </ConfigProvider>
    </BrowserRouter>
  );
};

const customRender = (
  ui: ReactElement,
  options: CustomRenderOptions = {}
) => {
  const { authContext, ...renderOptions } = options;
  
  return render(ui, {
    wrapper: ({ children }) => (
      <AllTheProviders authContext={authContext}>
        {children}
      </AllTheProviders>
    ),
    ...renderOptions,
  });
};

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };

// Utility functions for common test scenarios
export const waitForStoreUpdate = () => 
  new Promise(resolve => setTimeout(resolve, 0));

export const createMockEvent = (value: string) => ({
  target: { value },
  preventDefault: jest.fn(),
  stopPropagation: jest.fn()
});

export const expectElementToBeInDocument = (element: HTMLElement | null) => {
  expect(element).toBeInTheDocument();
};

export const expectElementNotToBeInDocument = (element: HTMLElement | null) => {
  expect(element).not.toBeInTheDocument();
};
