import { renderHook, act } from '@testing-library/react';
import { useContextStore, useContextSearch, useContextSelection } from '../../../stores/contextStore';
import { mockContexts, mockSearchResult, mockContextStats } from '../../fixtures/contexts';
import { defaultSearchParams, filteredSearchParams } from '../../fixtures/searchParams';

describe('contextStore', () => {
  beforeEach(() => {
    // Reset store before each test
    act(() => {
      useContextStore.getState().reset();
    });
  });

  describe('useContextStore', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useContextStore());
      
      expect(result.current.contexts).toEqual([]);
      expect(result.current.selectedContexts).toEqual([]);
      expect(result.current.currentContext).toBeNull();
      expect(result.current.searchParams).toEqual(defaultSearchParams);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should set contexts', () => {
      const { result } = renderHook(() => useContextStore());
      
      act(() => {
        result.current.setContexts(mockContexts);
      });
      
      expect(result.current.contexts).toEqual(mockContexts);
    });

    it('should manage selected contexts', () => {
      const { result } = renderHook(() => useContextStore());
      
      act(() => {
        result.current.addSelectedContext('ctx-123');
        result.current.addSelectedContext('ctx-124');
      });
      
      expect(result.current.selectedContexts).toEqual(['ctx-123', 'ctx-124']);
      
      act(() => {
        result.current.removeSelectedContext('ctx-123');
      });
      
      expect(result.current.selectedContexts).toEqual(['ctx-124']);
    });

    it('should not add duplicate selected contexts', () => {
      const { result } = renderHook(() => useContextStore());
      
      act(() => {
        result.current.addSelectedContext('ctx-123');
        result.current.addSelectedContext('ctx-123'); // duplicate
      });
      
      expect(result.current.selectedContexts).toEqual(['ctx-123']);
    });

    it('should select all contexts from search results', () => {
      const { result } = renderHook(() => useContextStore());
      
      act(() => {
        result.current.setSearchResults(mockSearchResult);
        result.current.selectAllContexts();
      });
      
      expect(result.current.selectedContexts).toEqual(['ctx-123', 'ctx-124', 'ctx-125']);
    });

    it('should clear selection', () => {
      const { result } = renderHook(() => useContextStore());
      
      act(() => {
        result.current.addSelectedContext('ctx-123');
        result.current.addSelectedContext('ctx-124');
        result.current.clearSelection();
      });
      
      expect(result.current.selectedContexts).toEqual([]);
    });

    it('should update search parameters', () => {
      const { result } = renderHook(() => useContextStore());
      
      act(() => {
        result.current.setSearchParams({ query: 'test', type: 'code' });
      });
      
      expect(result.current.searchParams).toEqual({
        ...defaultSearchParams,
        query: 'test',
        type: 'code'
      });
    });

    it('should reset to initial state', () => {
      const { result } = renderHook(() => useContextStore());
      
      // Set some state
      act(() => {
        result.current.setContexts(mockContexts);
        result.current.addSelectedContext('ctx-123');
        result.current.setError('test error');
        result.current.setLoading(true);
        result.current.reset();
      });
      
      expect(result.current.contexts).toEqual([]);
      expect(result.current.selectedContexts).toEqual([]);
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('useContextSearch', () => {
    it('should detect filtered state correctly', () => {
      const { result } = renderHook(() => useContextSearch());
      
      // Initially not filtered
      expect(result.current.isFiltered).toBe(false);
      
      act(() => {
        result.current.updateSearchParam('query', 'test');
      });
      
      expect(result.current.isFiltered).toBe(true);
    });

    it('should clear filters - CRITICAL BUG TEST', () => {
      const { result } = renderHook(() => useContextSearch());
      
      // Set multiple filters
      act(() => {
        result.current.updateSearchParam('query', 'test');
        result.current.updateSearchParam('type', 'code');
        result.current.updateSearchParam('tags', ['important']);
        result.current.updateSearchParam('project_id', 'proj-456');
      });
      
      expect(result.current.isFiltered).toBe(true);
      
      // Clear filters
      act(() => {
        result.current.clearFilters();
      });
      
      // BUG TEST: Verify all filters are actually cleared
      expect(result.current.searchParams).toEqual(defaultSearchParams);
      expect(result.current.isFiltered).toBe(false);
      
      // Verify individual filter parameters
      expect(result.current.searchParams.query).toBeUndefined();
      expect(result.current.searchParams.type).toBeUndefined();
      expect(result.current.searchParams.tags).toBeUndefined();
      expect(result.current.searchParams.project_id).toBeUndefined();
    });

    it('should update individual search parameters', () => {
      const { result } = renderHook(() => useContextSearch());
      
      act(() => {
        result.current.updateSearchParam('limit', 50);
      });
      
      expect(result.current.searchParams.limit).toBe(50);
      
      act(() => {
        result.current.updateSearchParam('tags', ['bug', 'feature']);
      });
      
      expect(result.current.searchParams.tags).toEqual(['bug', 'feature']);
    });

    it('should handle date range filtering', () => {
      const { result } = renderHook(() => useContextSearch());
      
      const dateFrom = '2024-01-01T00:00:00Z';
      const dateTo = '2024-01-31T23:59:59Z';
      
      act(() => {
        result.current.updateSearchParam('date_from', dateFrom);
        result.current.updateSearchParam('date_to', dateTo);
      });
      
      expect(result.current.isFiltered).toBe(true);
      expect(result.current.searchParams.date_from).toBe(dateFrom);
      expect(result.current.searchParams.date_to).toBe(dateTo);
    });
  });

  describe('useContextSelection', () => {
    it('should calculate selection state correctly', () => {
      const { result: storeResult } = renderHook(() => useContextStore());
      const { result: selectionResult } = renderHook(() => useContextSelection());
      
      act(() => {
        storeResult.current.setSearchResults(mockSearchResult);
      });
      
      // Initially no selection
      expect(selectionResult.current.selectedCount).toBe(0);
      expect(selectionResult.current.totalCount).toBe(3);
      expect(selectionResult.current.isAllSelected).toBe(false);
      expect(selectionResult.current.isPartiallySelected).toBe(false);
      expect(selectionResult.current.hasSelection).toBe(false);
      
      // Partial selection
      act(() => {
        storeResult.current.addSelectedContext('ctx-123');
        storeResult.current.addSelectedContext('ctx-124');
      });
      
      expect(selectionResult.current.selectedCount).toBe(2);
      expect(selectionResult.current.isAllSelected).toBe(false);
      expect(selectionResult.current.isPartiallySelected).toBe(true);
      expect(selectionResult.current.hasSelection).toBe(true);
      
      // All selected
      act(() => {
        storeResult.current.selectAllContexts();
      });
      
      expect(selectionResult.current.selectedCount).toBe(3);
      expect(selectionResult.current.isAllSelected).toBe(true);
      expect(selectionResult.current.isPartiallySelected).toBe(false);
      expect(selectionResult.current.hasSelection).toBe(true);
    });

    it('should handle empty context list', () => {
      const { result: storeResult } = renderHook(() => useContextStore());
      const { result: selectionResult } = renderHook(() => useContextSelection());
      
      act(() => {
        storeResult.current.setSearchResults({
          contexts: [],
          total: 0,
          page: 1,
          limit: 20
        });
      });
      
      expect(selectionResult.current.totalCount).toBe(0);
      expect(selectionResult.current.isAllSelected).toBe(false);
      expect(selectionResult.current.isPartiallySelected).toBe(false);
    });
  });

  describe('State persistence and immutability', () => {
    it('should not mutate original arrays', () => {
      const { result } = renderHook(() => useContextStore());
      const originalContexts = [...mockContexts];
      
      act(() => {
        result.current.setContexts(mockContexts);
      });
      
      // Modify returned contexts
      result.current.contexts[0].content = 'modified';
      
      // Original should be unchanged
      expect(originalContexts[0].content).not.toBe('modified');
      expect(mockContexts[0].content).not.toBe('modified');
    });

    it('should maintain referential integrity for search params', () => {
      const { result } = renderHook(() => useContextStore());
      const initialParams = result.current.searchParams;
      
      act(() => {
        result.current.setSearchParams({ query: 'test' });
      });
      
      expect(result.current.searchParams).not.toBe(initialParams);
      expect(result.current.searchParams.query).toBe('test');
      expect(result.current.searchParams.limit).toBe(defaultSearchParams.limit);
    });
  });
});
