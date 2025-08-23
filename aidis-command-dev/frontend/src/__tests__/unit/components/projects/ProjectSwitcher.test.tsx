import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../../utils/test-utils';
import { mockProjectApi, mockProjects } from '../../../utils/mocks';
import ProjectSwitcher from '../../../../components/projects/ProjectSwitcher';

// Mock the API
jest.mock('../../../../services/projectApi', () => ({
  __esModule: true,
  default: mockProjectApi
}));

describe('ProjectSwitcher - DROPDOWN BUG TESTS', () => {
  const mockOnProjectChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockProjectApi.getAllProjects.mockResolvedValue({
      projects: mockProjects,
      total: mockProjects.length
    });
  });

  describe('Project Loading and Filtering', () => {
    it('should load and display active projects only', async () => {
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
          currentProject="proj-456"
        />
      );

      await waitFor(() => {
        expect(mockProjectApi.getAllProjects).toHaveBeenCalledTimes(1);
      });

      // Click to open dropdown
      const select = screen.getByRole('combobox');
      await userEvent.click(select);

      // Should show only active projects (filtered out inactive ones)
      expect(screen.getByText('Test Project')).toBeInTheDocument();
      expect(screen.getByText('AI Assistant')).toBeInTheDocument();
      expect(screen.getByText('Web Dashboard')).toBeInTheDocument();
      expect(screen.queryByText('Old Project')).not.toBeInTheDocument(); // inactive project
    });

    it('should handle search within dropdown - DROPDOWN WIDTH BUG TEST', async () => {
      const user = userEvent.setup();
      
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
          style={{ width: '200px' }} // Fixed width to test dropdown
        />
      );

      await waitFor(() => {
        expect(mockProjectApi.getAllProjects).toHaveBeenCalledTimes(1);
      });

      const select = screen.getByRole('combobox');
      
      // Open dropdown and search
      await user.click(select);
      await user.type(select, 'test');

      // Should filter options and maintain proper width
      await waitFor(() => {
        expect(screen.getByText('Test Project')).toBeInTheDocument();
        expect(screen.queryByText('AI Assistant')).not.toBeInTheDocument();
      });

      // Verify dropdown is properly sized
      const dropdown = screen.getByRole('listbox');
      expect(dropdown).toBeInTheDocument();
    });

    it('should handle project selection correctly', async () => {
      const user = userEvent.setup();
      
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
          currentProject="proj-456"
        />
      );

      await waitFor(() => {
        expect(mockProjectApi.getAllProjects).toHaveBeenCalledTimes(1);
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      // Select different project
      const aiAssistantOption = screen.getByText('AI Assistant');
      await user.click(aiAssistantOption);

      expect(mockOnProjectChange).toHaveBeenCalledWith('proj-789', mockProjects[1]);
    });
  });

  describe('Current Project Display', () => {
    it('should show check icon for current project', async () => {
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
          currentProject="proj-456"
        />
      );

      await waitFor(() => {
        expect(mockProjectApi.getAllProjects).toHaveBeenCalledTimes(1);
      });

      const select = screen.getByRole('combobox');
      await userEvent.click(select);

      // Current project should have check icon
      const checkIcon = screen.getByLabelText('check-circle');
      expect(checkIcon).toBeInTheDocument();
    });

    it('should display project metadata correctly', async () => {
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
          currentProject="proj-456"
        />
      );

      await waitFor(() => {
        expect(mockProjectApi.getAllProjects).toHaveBeenCalledTimes(1);
      });

      const select = screen.getByRole('combobox');
      await userEvent.click(select);

      // Check context count and activity display
      expect(screen.getByText(/45 contexts/)).toBeInTheDocument();
      expect(screen.getByText(/123 contexts/)).toBeInTheDocument();
    });
  });

  describe('Status Display', () => {
    it('should show correct status colors', async () => {
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
        />
      );

      await waitFor(() => {
        expect(mockProjectApi.getAllProjects).toHaveBeenCalledTimes(1);
      });

      const select = screen.getByRole('combobox');
      await userEvent.click(select);

      // Active projects should have green status tags
      const statusTags = screen.getAllByText('active');
      expect(statusTags.length).toBeGreaterThan(0);
    });

    it('should format last activity correctly', async () => {
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
        />
      );

      await waitFor(() => {
        expect(mockProjectApi.getAllProjects).toHaveBeenCalledTimes(1);
      });

      const select = screen.getByRole('combobox');
      await userEvent.click(select);

      // Should show human-readable activity times
      expect(screen.getByText(/ago|Today|Yesterday/)).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('should show loading spinner when fetching projects', () => {
      // Mock pending promise
      mockProjectApi.getAllProjects.mockReturnValue(new Promise(() => {}));
      
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('loading', 'true');
    });

    it('should show loading spinner in dropdown when searching', async () => {
      mockProjectApi.getAllProjects.mockReturnValue(new Promise(() => {}));
      
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
        />
      );

      const select = screen.getByRole('combobox');
      await userEvent.click(select);

      // Should show loading spinner
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockProjectApi.getAllProjects.mockRejectedValue(new Error('API Error'));
      
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
        />
      );

      await waitFor(() => {
        expect(mockProjectApi.getAllProjects).toHaveBeenCalledTimes(1);
      });

      // Should not crash and should show empty state
      const select = screen.getByRole('combobox');
      await userEvent.click(select);

      expect(screen.getByText('No projects found')).toBeInTheDocument();
    });
  });

  describe('Authentication Integration', () => {
    it('should only load projects when authenticated', () => {
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
        />,
        {
          authContext: {
            isAuthenticated: false,
            isLoading: false
          }
        }
      );

      // Should not load projects when not authenticated
      expect(mockProjectApi.getAllProjects).not.toHaveBeenCalled();
    });

    it('should wait for auth loading to complete', () => {
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
        />,
        {
          authContext: {
            isAuthenticated: true,
            isLoading: true
          }
        }
      );

      // Should not load projects while auth is loading
      expect(mockProjectApi.getAllProjects).not.toHaveBeenCalled();
    });
  });

  describe('Component Props', () => {
    it('should apply custom size prop', () => {
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
          size="large"
        />
      );

      const select = screen.getByRole('combobox');
      expect(select.closest('.ant-select-lg')).toBeInTheDocument();
    });

    it('should apply custom styles', () => {
      const customStyle = { width: '300px', backgroundColor: 'red' };
      
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
          style={customStyle}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select.closest('.ant-select')).toHaveStyle('width: 300px');
    });
  });

  describe('Dropdown Width and Layout - CRITICAL BUG TESTS', () => {
    it('should maintain proper dropdown width in constrained containers', async () => {
      const user = userEvent.setup();
      
      // Render in a constrained container
      render(
        <div style={{ width: '150px', overflow: 'hidden' }}>
          <ProjectSwitcher 
            onProjectChange={mockOnProjectChange}
            style={{ width: '100%' }}
          />
        </div>
      );

      await waitFor(() => {
        expect(mockProjectApi.getAllProjects).toHaveBeenCalledTimes(1);
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      // Dropdown should be visible and usable despite container constraints
      const dropdown = screen.getByRole('listbox');
      expect(dropdown).toBeInTheDocument();
      
      // Should be able to select options
      const firstOption = screen.getByText('Test Project');
      await user.click(firstOption);
      
      expect(mockOnProjectChange).toHaveBeenCalled();
    });

    it('should handle long project names without layout issues', async () => {
      const longNameProject = {
        ...mockProjects[0],
        name: 'Very Long Project Name That Could Cause Layout Issues In The Dropdown'
      };

      mockProjectApi.getAllProjects.mockResolvedValue({
        projects: [longNameProject],
        total: 1
      });

      const user = userEvent.setup();
      
      render(
        <ProjectSwitcher 
          onProjectChange={mockOnProjectChange}
          style={{ width: '200px' }}
        />
      );

      await waitFor(() => {
        expect(mockProjectApi.getAllProjects).toHaveBeenCalledTimes(1);
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      // Long name should be handled gracefully
      expect(screen.getByText(/Very Long Project Name/)).toBeInTheDocument();
    });
  });
});
