import { Project } from '../../services/projectApi';

export const mockProject: Project = {
  id: 'proj-456',
  name: 'Test Project',
  description: 'A test project for development',
  status: 'active',
  context_count: 45,
  last_activity: '2024-01-15T10:30:00Z',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T10:30:00Z'
};

export const mockProjects: Project[] = [
  mockProject,
  {
    ...mockProject,
    id: 'proj-789',
    name: 'AI Assistant',
    description: 'Main AI assistant project',
    context_count: 123,
    last_activity: '2024-01-16T14:20:00Z'
  },
  {
    ...mockProject,
    id: 'proj-012',
    name: 'Web Dashboard',
    description: 'Frontend dashboard application',
    status: 'active',
    context_count: 67,
    last_activity: '2024-01-14T08:45:00Z'
  },
  {
    ...mockProject,
    id: 'proj-inactive',
    name: 'Old Project',
    description: 'An inactive project',
    status: 'inactive',
    context_count: 12,
    last_activity: '2024-01-01T12:00:00Z'
  }
];

export const mockProjectsResponse = {
  projects: mockProjects,
  total: mockProjects.length
};

export const createMockProject = (overrides: Partial<Project> = {}): Project => ({
  ...mockProject,
  ...overrides,
  id: overrides.id || `proj-${Date.now()}-${Math.random()}`
});
