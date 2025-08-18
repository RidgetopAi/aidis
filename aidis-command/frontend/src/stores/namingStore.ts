import { create } from 'zustand';
import { NamingEntry, NamingSearchParams, NamingStats, NamingSearchResult } from '../components/naming/types';

interface NamingState {
  // Data
  entries: NamingEntry[];
  selectedEntries: number[];
  currentEntry: NamingEntry | null;
  relatedEntries: NamingEntry[];
  stats: NamingStats | null;
  
  // Search & Filter State
  searchParams: NamingSearchParams;
  searchResults: NamingSearchResult | null;
  
  // UI State
  isLoading: boolean;
  isSearching: boolean;
  error: string | null;
  showDetail: boolean;
  showFilters: boolean;
  showRegister: boolean;
  
  // Actions
  setEntries: (entries: NamingEntry[]) => void;
  setSelectedEntries: (ids: number[]) => void;
  addSelectedEntry: (id: number) => void;
  removeSelectedEntry: (id: number) => void;
  selectAllEntries: () => void;
  clearSelection: () => void;
  setCurrentEntry: (entry: NamingEntry | null) => void;
  setRelatedEntries: (entries: NamingEntry[]) => void;
  setStats: (stats: NamingStats) => void;
  setSearchParams: (params: Partial<NamingSearchParams>) => void;
  setSearchResults: (results: NamingSearchResult | null) => void;
  setLoading: (loading: boolean) => void;
  setSearching: (searching: boolean) => void;
  setError: (error: string | null) => void;
  setShowDetail: (show: boolean) => void;
  setShowFilters: (show: boolean) => void;
  setShowRegister: (show: boolean) => void;
  clearError: () => void;
  reset: () => void;
}

const initialSearchParams: NamingSearchParams = {
  limit: 20,
  offset: 0
};

export const useNamingStore = create<NamingState>((set, get) => ({
  // Initial state
  entries: [],
  selectedEntries: [],
  currentEntry: null,
  relatedEntries: [],
  stats: null,
  searchParams: initialSearchParams,
  searchResults: null,
  isLoading: false,
  isSearching: false,
  error: null,
  showDetail: false,
  showFilters: false,
  showRegister: false,

  // Actions
  setEntries: (entries) => set({ entries }),
  
  setSelectedEntries: (ids) => set({ selectedEntries: ids }),
  
  addSelectedEntry: (id) => set(state => ({
    selectedEntries: Array.from(new Set([...state.selectedEntries, id]))
  })),
  
  removeSelectedEntry: (id) => set(state => ({
    selectedEntries: state.selectedEntries.filter(selectedId => selectedId !== id)
  })),
  
  selectAllEntries: () => set(state => ({
    selectedEntries: state.searchResults?.entries.map(entry => entry.id) || state.entries.map(entry => entry.id)
  })),
  
  clearSelection: () => set({ selectedEntries: [] }),
  
  setCurrentEntry: (entry) => set({ currentEntry: entry }),
  
  setRelatedEntries: (entries) => set({ relatedEntries: entries }),
  
  setStats: (stats) => set({ stats }),
  
  setSearchParams: (params) => set(state => ({
    searchParams: { ...state.searchParams, ...params }
  })),
  
  setSearchResults: (results) => set({ searchResults: results }),
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setSearching: (searching) => set({ isSearching: searching }),
  
  setError: (error) => set({ error }),
  
  setShowDetail: (show) => set({ showDetail: show }),
  
  setShowFilters: (show) => set({ showFilters: show }),
  
  setShowRegister: (show) => set({ showRegister: show }),
  
  clearError: () => set({ error: null }),
  
  reset: () => set({
    entries: [],
    selectedEntries: [],
    currentEntry: null,
    relatedEntries: [],
    stats: null,
    searchParams: initialSearchParams,
    searchResults: null,
    isLoading: false,
    isSearching: false,
    error: null,
    showDetail: false,
    showFilters: false,
    showRegister: false
  })
}));

// Computed values and helper hooks
export const useNamingSelection = () => {
  const { selectedEntries, searchResults, entries } = useNamingStore();
  const allEntries = searchResults?.entries || entries;
  
  return {
    selectedEntries,
    selectedCount: selectedEntries.length,
    totalCount: allEntries.length,
    isAllSelected: selectedEntries.length === allEntries.length && allEntries.length > 0,
    isPartiallySelected: selectedEntries.length > 0 && selectedEntries.length < allEntries.length,
    hasSelection: selectedEntries.length > 0
  };
};

export const useNamingSearch = () => {
  const store = useNamingStore();
  
  const isFiltered = () => {
    const params = store.searchParams;
    return !!(
      params.query ||
      params.project_id ||
      params.status ||
      params.type ||
      params.created_by ||
      params.date_from ||
      params.date_to
    );
  };
  
  const clearFilters = () => {
    store.setSearchParams(initialSearchParams);
  };
  
  const updateSearchParam = <K extends keyof NamingSearchParams>(
    key: K,
    value: NamingSearchParams[K]
  ) => {
    store.setSearchParams({ [key]: value });
  };
  
  return {
    ...store,
    isFiltered: isFiltered(),
    clearFilters,
    updateSearchParam
  };
};
