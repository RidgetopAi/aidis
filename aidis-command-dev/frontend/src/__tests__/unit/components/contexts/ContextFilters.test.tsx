import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../../utils/test-utils';
import { mockTimers } from '../../../utils/mocks';
import ContextFilters from '../../../../components/contexts/ContextFilters';
import { useContextStore, useContextSearch } from '../../../../stores/contextStore';
import { defaultSearchParams } from '../../../fixtures/searchParams';

// Mock the context store
jest.mock('../../../../stores/contextStore');
jest.mock('../../../../services/contextApi');

const mockUseContextSearch = useContextSearch as jest.MockedFunction<typeof useContextSearch>;
const mockUseContextStore = useContextStore as jest.MockedFunction<typeof useContextStore>;

describe('ContextFilters', () => {
  const mockUpdateSearchParam = jest.fn();
  const mockClearFilters = jest.fn();
  const mockOnSearch = jest.fn();

  const defaultMockReturn = {
    searchParams: defaultSearchParams,
    updateSearchParam: mockUpdateSearchParam,
    clearFilters: mockClearFilters,
    isFiltered: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseContextSearch.mockReturnValue(defaultMockReturn);
  });

  describe('Clear All Button - CRITICAL BUG TESTS', () => {
    it('should be disabled when no filters are active', () => {
      render(<ContextFilters onSearch={mockOnSearch} />);
      
      const clearButton = screen.getByRole('button', { name: /clear all/i });
      expect(clearButton).toBeDisabled();
    });

    it('should be enabled when filters are active', () => {
      mockUseContextSearch.mockReturnValue({
        ...defaultMockReturn,
        isFiltered: true,
        searchParams: {
          ...defaultSearchParams,
          query: 'test search'
        }
      });

      render(<ContextFilters onSearch={mockOnSearch} />);
      
      const clearButton = screen.getByRole('button', { name: /clear all/i });
      expect(clearButton).not.toBeDisabled();
    });

    it('should clear all filters and call onSearch when clicked - STATE SYNC BUG TEST', async () => {
      const user = userEvent.setup();
      
      mockUseContextSearch.mockReturnValue({
        ...defaultMockReturn,
        isFiltered: true,
        searchParams: {
          ...defaultSearchParams,
          query: 'test search',
          type: 'code',
          tags: ['important']
        }
      });

      render(<ContextFilters onSearch={mockOnSearch} />);
      
      const clearButton = screen.getByRole('button', { name: /clear all/i });
      await user.click(clearButton);
      
      // Should clear filters and trigger search
      expect(mockClearFilters).toHaveBeenCalledTimes(1);
      expect(mockOnSearch).toHaveBeenCalledTimes(1);
    });

    it('should reset local search query when clearing filters', async () => {
      const user = userEvent.setup();
      
      // Start with filtered state
      mockUseContextSearch.mockReturnValue({
        ...defaultMockReturn,
        isFiltered: true,
        searchParams: {
          ...defaultSearchParams,
          query: 'existing query'
        }
      });

      const { rerender } = render(<ContextFilters onSearch={mockOnSearch} />);
      
      const searchInput = screen.getByPlaceholderText(/search contexts/i);
      expect(searchInput).toHaveValue('existing query');
      
      // Click clear all
      const clearButton = screen.getByRole('button', { name: /clear all/i });
      await user.click(clearButton);
      
      // Simulate store update after clearing
      mockUseContextSearch.mockReturnValue({
        ...defaultMockReturn,
        isFiltered: false,
        searchParams: defaultSearchParams
      });
      
      rerender(<ContextFilters onSearch={mockOnSearch} />);
      
      // Local query should be reset
      expect(searchInput).toHaveValue('');
    });

    it('should show correct active filter count', () => {
      mockUseContextSearch.mockReturnValue({
        ...defaultMockReturn,
        isFiltered: true,
        searchParams: {
          ...defaultSearchParams,
          query: 'test',
          type: 'code',
          tags: ['important', 'bug-fix'],
          date_from: '2024-01-01T00:00:00Z',
          min_similarity: 0.8
        }
      });

      render(<ContextFilters onSearch={mockOnSearch} />);
      
      // Should show 5 active filters (query, type, tags, date_from, min_similarity)
      expect(screen.getByText('5 active')).toBeInTheDocument();
    });
  });

  describe('Search Input Debouncing', () => {
    it('should debounce search input changes', async () => {
      const timers = mockTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      
      render(<ContextFilters onSearch={mockOnSearch} />);
      
      const searchInput = screen.getByPlaceholderText(/search contexts/i);
      
      // Type rapidly
      await user.type(searchInput, 'test');
      
      // Should not have called updateSearchParam yet
      expect(mockUpdateSearchParam).not.toHaveBeenCalled();
      
      // Advance timers past debounce delay (300ms)
      timers.advanceTime(300);
      
      // Now should have called updateSearchParam
      expect(mockUpdateSearchParam).toHaveBeenCalledWith('query', 'test');
      expect(mockUpdateSearchParam).toHaveBeenCalledWith('offset', 0);
      expect(mockOnSearch).toHaveBeenCalledTimes(1);
      
      timers.cleanup();
    });

    it('should not search if query value has not changed', async () => {
      const timers = mockTimers();
      
      mockUseContextSearch.mockReturnValue({
        ...defaultMockReturn,
        searchParams: {
          ...defaultSearchParams,
          query: 'existing'
        }
      });

      render(<ContextFilters onSearch={mockOnSearch} />);
      
      timers.advanceTime(300);
      
      // Should not search since local query matches store query
      expect(mockUpdateSearchParam).not.toHaveBeenCalled();
      expect(mockOnSearch).not.toHaveBeenCalled();
      
      timers.cleanup();
    });
  });

  describe('Filter Interactions', () => {
    it('should update type filter and reset offset', async () => {
      const user = userEvent.setup();
      
      render(<ContextFilters onSearch={mockOnSearch} />);
      
      const typeSelect = screen.getByRole('combobox', { name: /filter by type/i });
      await user.click(typeSelect);
      
      const codeOption = screen.getByText('Code');
      await user.click(codeOption);
      
      expect(mockUpdateSearchParam).toHaveBeenCalledWith('type', 'code');
      expect(mockUpdateSearchParam).toHaveBeenCalledWith('offset', 0);
      expect(mockOnSearch).toHaveBeenCalledTimes(1);
    });

    it('should handle tags filter changes', async () => {
      const user = userEvent.setup();
      
      render(<ContextFilters onSearch={mockOnSearch} />);
      
      // Open advanced filters
      const advancedPanel = screen.getByText('Advanced Filters');
      await user.click(advancedPanel);
      
      const tagsSelect = screen.getByRole('combobox', { name: /enter or select tags/i });
      await user.type(tagsSelect, 'important{enter}');
      
      expect(mockUpdateSearchParam).toHaveBeenCalledWith('tags', ['important']);
      expect(mockUpdateSearchParam).toHaveBeenCalledWith('offset', 0);
      expect(mockOnSearch).toHaveBeenCalledTimes(1);
    });

    it('should handle date range changes', async () => {
      const user = userEvent.setup();
      
      render(<ContextFilters onSearch={mockOnSearch} />);
      
      // Mock date picker interaction would go here
      // Note: Testing Ant Design DatePicker requires more setup
      // This is a placeholder for the actual date range test
    });

    it('should handle sort changes', async () => {
      const user = userEvent.setup();
      
      render(<ContextFilters onSearch={mockOnSearch} />);
      
      const sortSelect = screen.getByDisplayValue('Created Date (Newest First)');
      await user.click(sortSelect);
      
      const relevanceOption = screen.getByText('Relevance Score (Newest First)');
      await user.click(relevanceOption);
      
      expect(mockUpdateSearchParam).toHaveBeenCalledWith('sort_by', 'relevance');
      expect(mockUpdateSearchParam).toHaveBeenCalledWith('sort_order', 'desc');
      expect(mockUpdateSearchParam).toHaveBeenCalledWith('offset', 0);
      expect(mockOnSearch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Similarity Slider', () => {
    it('should show similarity slider only when query is present', () => {
      // Without query
      render(<ContextFilters onSearch={mockOnSearch} />);
      
      const advancedPanel = screen.getByText('Advanced Filters');
      fireEvent.click(advancedPanel);
      
      expect(screen.queryByText(/minimum similarity/i)).not.toBeInTheDocument();
      
      // With query
      mockUseContextSearch.mockReturnValue({
        ...defaultMockReturn,
        searchParams: {
          ...defaultSearchParams,
          query: 'test search'
        }
      });

      render(<ContextFilters onSearch={mockOnSearch} />);
      
      fireEvent.click(screen.getByText('Advanced Filters'));
      
      expect(screen.getByText(/minimum similarity/i)).toBeInTheDocument();
    });

    it('should update similarity threshold', async () => {
      const user = userEvent.setup();
      
      mockUseContextSearch.mockReturnValue({
        ...defaultMockReturn,
        searchParams: {
          ...defaultSearchParams,
          query: 'test search'
        }
      });

      render(<ContextFilters onSearch={mockOnSearch} />);
      
      fireEvent.click(screen.getByText('Advanced Filters'));
      
      // Find and interact with slider (simplified test)
      const slider = screen.getByRole('slider');
      
      // Simulate slider change
      fireEvent.mouseDown(slider);
      fireEvent.mouseUp(slider);
      
      expect(mockUpdateSearchParam).toHaveBeenCalledWith('min_similarity', expect.any(Number));
      expect(mockUpdateSearchParam).toHaveBeenCalledWith('offset', 0);
    });
  });

  describe('Loading States', () => {
    it('should pass loading state to component', () => {
      render(<ContextFilters onSearch={mockOnSearch} loading={true} />);
      
      // Component should handle loading state appropriately
      // Specific assertions depend on how loading is displayed
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      render(<ContextFilters onSearch={mockOnSearch} />);
      
      expect(screen.getByRole('textbox', { name: /search contexts/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      
      render(<ContextFilters onSearch={mockOnSearch} />);
      
      const searchInput = screen.getByPlaceholderText(/search contexts/i);
      
      // Tab to search input
      await user.tab();
      expect(searchInput).toHaveFocus();
      
      // Tab to next element
      await user.tab();
      // Next focusable element should have focus
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty tags array', async () => {
      const user = userEvent.setup();
      
      render(<ContextFilters onSearch={mockOnSearch} />);
      
      fireEvent.click(screen.getByText('Advanced Filters'));
      
      const tagsSelect = screen.getByRole('combobox', { name: /enter or select tags/i });
      
      // Clear all tags
      await user.clear(tagsSelect);
      
      expect(mockUpdateSearchParam).toHaveBeenCalledWith('tags', undefined);
    });

    it('should handle malformed date input gracefully', () => {
      // Test for date input edge cases would go here
      // Depends on specific date picker implementation
    });
  });
});
