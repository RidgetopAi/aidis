import { ContextSearchParams } from '../../stores/contextStore';

export const defaultSearchParams: ContextSearchParams = {
  limit: 20,
  offset: 0,
  sort_by: 'created_at',
  sort_order: 'desc'
};

export const filteredSearchParams: ContextSearchParams = {
  ...defaultSearchParams,
  query: 'test search',
  type: 'code',
  project_id: 'proj-456',
  tags: ['important', 'bug-fix'],
  min_similarity: 0.7,
  date_from: '2024-01-01T00:00:00Z',
  date_to: '2024-01-31T23:59:59Z'
};

export const emptySearchParams: ContextSearchParams = {
  limit: 20,
  offset: 0,
  sort_by: 'created_at',
  sort_order: 'desc'
};

export const paginatedSearchParams: ContextSearchParams = {
  ...defaultSearchParams,
  limit: 10,
  offset: 20 // page 3
};

export const createSearchParams = (overrides: Partial<ContextSearchParams> = {}): ContextSearchParams => ({
  ...defaultSearchParams,
  ...overrides
});
