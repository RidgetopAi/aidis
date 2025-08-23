import { Context, ContextSearchResult, ContextStats } from '../../stores/contextStore';

export const mockContext: Context = {
  id: 'ctx-123',
  project_id: 'proj-456',
  project_name: 'Test Project',
  type: 'code',
  content: 'This is test context content for testing purposes. It contains enough text to verify search functionality.',
  metadata: {
    file_path: '/src/test.ts',
    line_number: 42
  },
  tags: ['important', 'bug-fix'],
  relevance_score: 0.85,
  session_id: 'session-789',
  created_at: '2024-01-15T10:30:00Z',
  updated_at: '2024-01-15T10:35:00Z'
};

export const mockContexts: Context[] = [
  mockContext,
  {
    ...mockContext,
    id: 'ctx-124',
    type: 'decision',
    content: 'Decision context content about architecture choices',
    tags: ['architecture', 'decision'],
    relevance_score: 0.75,
    created_at: '2024-01-14T15:20:00Z'
  },
  {
    ...mockContext,
    id: 'ctx-125',
    type: 'error',
    content: 'Error context describing a runtime exception',
    tags: ['error', 'runtime'],
    relevance_score: 0.65,
    created_at: '2024-01-13T09:15:00Z'
  }
];

export const mockSearchResult: ContextSearchResult = {
  contexts: mockContexts,
  total: 3,
  page: 1,
  limit: 20
};

export const mockEmptySearchResult: ContextSearchResult = {
  contexts: [],
  total: 0,
  page: 1,
  limit: 20
};

export const mockContextStats: ContextStats = {
  total_contexts: 156,
  by_type: {
    code: 78,
    decision: 34,
    error: 23,
    discussion: 12,
    planning: 7,
    completion: 2
  },
  by_project: {
    'proj-456': 89,
    'proj-789': 45,
    'proj-012': 22
  },
  recent_contexts: 12,
  total_projects: 3
};

export const createMockContext = (overrides: Partial<Context> = {}): Context => ({
  ...mockContext,
  ...overrides,
  id: overrides.id || `ctx-${Date.now()}-${Math.random()}`
});

export const createMockContexts = (count: number, baseOverrides: Partial<Context> = {}): Context[] => {
  return Array.from({ length: count }, (_, index) => 
    createMockContext({
      ...baseOverrides,
      id: `ctx-${index + 1}`,
      content: `Test context content ${index + 1}`,
      created_at: new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString()
    })
  );
};
