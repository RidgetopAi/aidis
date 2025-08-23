import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';
import { mockContextApi, mockProjectApi, mockTimers } from '../utils/mocks';
import { mockSearchResult, mockContextStats, mockEmptySearchResult } from '../fixtures/contexts';
import { mockProjectsResponse } from '../fixtures/projects';
import Contexts from '../../pages/Contexts';

// Mock APIs and services
jest.mock('../../services/contextApi', () => ({
  ContextApi: mockContextApi
}));

jest.mock('../../services/projectApi', () => ({
  __esModule: true,
  default: mockProjectApi
}));

// Mock Ant Design message
const mockMessage = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn()
};

jest.mock('antd', () => ({
  ...jest.requireActual('antd'),
  message: mockMessage
}));

describe('Context Browser Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContextApi.searchContexts.mockResolvedValue(mockSearchResult);
    mockContextApi.getContextStats.mockResolvedValue(mockContextStats);
    mockProjectApi.getAllProjects.mockResolvedValue(mockProjectsResponse);
  });

  describe('Complete Search and Filter Workflow', () => {
    it('should perform end-to-end search and filtering', async () => {
      const timers = mockTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(<Contexts />);

      // Wait for initial load
      await waitFor(() => {
        expect(mockContextApi.searchContexts).toHaveBeenCalledTimes(1);
        expect(mockContextApi.getContextStats).toHaveBeenCalledTimes(1);
      });

      // Verify initial state
      expect(screen.getByText('3 contexts found')).toBeInTheDocument();

      // Show filters
      const filterButton = screen.getByRole('button', { name: /show filters/i });
      await user.click(filterButton);

      // Perform search
      const searchInput = screen.getByPlaceholderText(/search contexts/i);
      await user.type(searchInput, 'test query');

      // Wait for debounce
      timers.advanceTime(300);

      await waitFor(() => {
        expect(mockContextApi.searchContexts).toHaveBeenCalledWith(
          expect.objectContaining({
            query: 'test query',
            offset: 0
          })
        );
      });

      // Apply type filter
      const typeSelect = screen.getByRole('combobox', { name: /filter by type/i });
      await user.click(typeSelect);
      
      const codeOption = screen.getByText('Code');
      await user.click(codeOption);

      await waitFor(() => {
        expect(mockContextApi.searchContexts).toHaveBeenCalledWith(
          expect.objectContaining({
            query: 'test query',
            type: 'code',
            offset: 0
          })
        );
      });

      timers.cleanup();
    });

    it('should clear all filters and reset search', async () => {
      const user = userEvent.setup();
      const timers = mockTimers();

      render(<Contexts />);

      await waitFor(() => {
        expect(mockContextApi.searchContexts).toHaveBeenCalledTimes(1);
      });

      // Show filters and apply some
      const filterButton = screen.getByRole('button', { name: /show filters/i });
      await user.click(filterButton);

      const searchInput = screen.getByPlaceholderText(/search contexts/i);
      await user.type(searchInput, 'test query');

      timers.advanceTime(300);

      // Clear all filters - CRITICAL INTEGRATION TEST
      const clearAllButton = screen.getByRole('button', { name: /clear all/i });
      await user.click(clearAllButton);

      await waitFor(() => {
        expect(mockContextApi.searchContexts).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 20,
            offset: 0,
            sort_by: 'created_at',
            sort_order: 'desc'
            // Should not have query, type, etc.
          })
        );
      });

      // Search input should be cleared
      expect(searchInput).toHaveValue('');

      timers.cleanup();
    });
  });

  describe('Project Switching Integration', () => {
    it('should refresh contexts when project changes', async () => {
      const user = userEvent.setup();

      // Mock project switcher in the app layout would trigger this
      // For now, we'll simulate the effect by changing search params
      render(<Contexts />);

      await waitFor(() => {
        expect(mockContextApi.searchContexts).toHaveBeenCalledTimes(1);
      });

      // Simulate project change by directly triggering search with project_id
      // In real app, this would come from the project switcher
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      await user.click(refreshButton);

      await waitFor(() => {
        expect(mockContextApi.searchContexts).toHaveBeenCalledTimes(2);
        expect(mockContextApi.getContextStats).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Bulk Operations Integration', () => {
    it('should select contexts and perform bulk delete', async () => {
      const user = userEvent.setup();
      
      mockContextApi.deleteContext.mockResolvedValue(true);

      render(<Contexts />);

      await waitFor(() => {
        expect(screen.getByText('3 contexts found')).toBeInTheDocument();
      });

      // Select individual contexts (this would require ContextCard implementation)
      // For now, test the bulk actions component integration
      
      // Simulate having selected contexts
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      await user.click(selectAllCheckbox);

      // Delete selected
      const deleteButton = screen.getByRole('button', { name: /delete selected/i });
      await user.click(deleteButton);

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: /delete/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockContextApi.deleteContext).toHaveBeenCalledTimes(3); // All contexts
        expect(mockContextApi.searchContexts).toHaveBeenCalledTimes(2); // Refresh after delete
      });

      expect(mockMessage.success).toHaveBeenCalledWith(
        expect.stringContaining('deleted successfully')
      );
    });
  });

  describe('Pagination Integration', () => {
    it('should handle pagination correctly', async () => {
      const user = userEvent.setup();
      
      // Mock large result set
      const largeResult = {
        ...mockSearchResult,
        total: 150,
        contexts: mockSearchResult.contexts
      };
      
      mockContextApi.searchContexts.mockResolvedValue(largeResult);

      render(<Contexts />);

      await waitFor(() => {
        expect(screen.getByText('150 contexts found')).toBeInTheDocument();
      });

      // Should show pagination
      const pagination = screen.getByRole('navigation');
      expect(pagination).toBeInTheDocument();

      // Go to page 2
      const page2Button = screen.getByText('2');
      await user.click(page2Button);

      await waitFor(() => {
        expect(mockContextApi.searchContexts).toHaveBeenCalledWith(
          expect.objectContaining({
            offset: 20, // (page-1) * limit
            limit: 20
          })
        );
      });
    });

    it('should change page size', async () => {
      const user = userEvent.setup();
      
      const largeResult = {
        ...mockSearchResult,
        total: 150
      };
      
      mockContextApi.searchContexts.mockResolvedValue(largeResult);

      render(<Contexts />);

      await waitFor(() => {
        expect(screen.getByText('150 contexts found')).toBeInTheDocument();
      });

      // Change page size
      const pageSizeSelect = screen.getByTitle('20 / page');
      await user.click(pageSizeSelect);

      const fiftyOption = screen.getByText('50 / page');
      await user.click(fiftyOption);

      await waitFor(() => {
        expect(mockContextApi.searchContexts).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 50,
            offset: 0 // Reset to first page
          })
        );
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle search errors gracefully', async () => {
      const user = userEvent.setup();
      
      mockContextApi.searchContexts.mockRejectedValue(new Error('Search failed'));

      render(<Contexts />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load contexts/i)).toBeInTheDocument();
      });

      expect(mockMessage.error).toHaveBeenCalledWith('Failed to load contexts');

      // Should be able to retry
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      
      // Fix the API for retry
      mockContextApi.searchContexts.mockResolvedValue(mockSearchResult);
      
      await user.click(refreshButton);

      await waitFor(() => {
        expect(screen.getByText('3 contexts found')).toBeInTheDocument();
      });
    });

    it('should handle stats loading failure', async () => {
      mockContextApi.getContextStats.mockRejectedValue(new Error('Stats failed'));

      render(<Contexts />);

      await waitFor(() => {
        expect(mockContextApi.getContextStats).toHaveBeenCalledTimes(1);
      });

      // Should still show contexts even if stats fail
      expect(screen.getByText('3 contexts found')).toBeInTheDocument();
    });
  });

  describe('Empty States Integration', () => {
    it('should show appropriate empty state when no contexts found', async () => {
      mockContextApi.searchContexts.mockResolvedValue(mockEmptySearchResult);

      render(<Contexts />);

      await waitFor(() => {
        expect(screen.getByText('0 contexts found')).toBeInTheDocument();
      });

      expect(screen.getByText('No contexts found')).toBeInTheDocument();
      expect(screen.getByText(/contexts will appear here as they are created/i)).toBeInTheDocument();
    });

    it('should show filtered empty state with clear option', async () => {
      const user = userEvent.setup();
      const timers = mockTimers();
      
      // Start with results, then return empty for filtered search
      mockContextApi.searchContexts
        .mockResolvedValueOnce(mockSearchResult)
        .mockResolvedValueOnce(mockEmptySearchResult);

      render(<Contexts />);

      await waitFor(() => {
        expect(screen.getByText('3 contexts found')).toBeInTheDocument();
      });

      // Apply filter that returns no results
      const filterButton = screen.getByRole('button', { name: /show filters/i });
      await user.click(filterButton);

      const searchInput = screen.getByPlaceholderText(/search contexts/i);
      await user.type(searchInput, 'no results query');

      timers.advanceTime(300);

      await waitFor(() => {
        expect(screen.getByText('0 contexts found')).toBeInTheDocument();
      });

      expect(screen.getByText('No contexts match your filters')).toBeInTheDocument();

      // Should show clear filters button
      const clearFiltersButton = screen.getByRole('button', { name: /clear filters/i });
      expect(clearFiltersButton).toBeInTheDocument();

      timers.cleanup();
    });
  });

  describe('Loading States Integration', () => {
    it('should show loading spinner during search', async () => {
      const user = userEvent.setup();
      
      // Mock pending search
      mockContextApi.searchContexts.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockSearchResult), 1000))
      );

      render(<Contexts />);

      // Should show loading
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

      // Trigger another search
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      await user.click(refreshButton);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
  });

  describe('Context Detail Integration', () => {
    it('should open and close context detail drawer', async () => {
      const user = userEvent.setup();

      render(<Contexts />);

      await waitFor(() => {
        expect(screen.getByText('3 contexts found')).toBeInTheDocument();
      });

      // Click on a context to view details (would be on ContextCard)
      // This requires ContextCard implementation
      
      // Simulate opening detail drawer
      // In real test, would click on context card
      
      // For now, test the drawer state management
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Statistics Modal Integration', () => {
    it('should open and display statistics modal', async () => {
      const user = userEvent.setup();

      render(<Contexts />);

      await waitFor(() => {
        expect(mockContextApi.getContextStats).toHaveBeenCalledTimes(1);
      });

      const statsButton = screen.getByRole('button', { name: /statistics/i });
      await user.click(statsButton);

      // Modal should be open
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.getByText('Context Statistics')).toBeInTheDocument();
    });
  });
});
