import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Project } from '../services/projectApi';
import ProjectApi from '../services/projectApi';
import { useAuthContext } from './AuthContext';

const UNASSIGNED_PROJECT_ID = '00000000-0000-0000-0000-000000000000';
const DEFAULT_BOOTSTRAP_PROJECT_NAME = 'aidis-bootstrap';

interface ProjectContextType {
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  allProjects: Project[];
  loading: boolean;
  refreshProjects: () => Promise<Project[]>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

interface ProjectProviderProps {
  children: ReactNode;
}

export const ProjectProvider: React.FC<ProjectProviderProps> = ({ children }) => {
  const { isAuthenticated, isLoading: authLoading } = useAuthContext();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const hasInitializedRef = useRef(false);

  // Save current project to localStorage when it changes
  useEffect(() => {
    if (currentProject) {
      if (currentProject.id === UNASSIGNED_PROJECT_ID) {
        return;
      }
      localStorage.setItem('aidis_selected_project', JSON.stringify(currentProject));
      // Keep backward compatibility by also saving to old key
      localStorage.setItem('aidis_current_project', JSON.stringify(currentProject));
    } else {
      localStorage.removeItem('aidis_selected_project');
      localStorage.removeItem('aidis_current_project');
    }
  }, [currentProject]);

  const selectBootstrapProject = useCallback(async (projectsFromRefresh?: Project[]): Promise<Project | null> => {
    const projectList = (projectsFromRefresh && projectsFromRefresh.length > 0)
      ? projectsFromRefresh
      : allProjects;

    if (projectList.length === 0) {
      try {
        const response = await ProjectApi.getAllProjects();
        setAllProjects(response.projects);
        if (response.projects.length === 0) {
          return null;
        }
        return selectBootstrapProject(response.projects);
      } catch (error) {
        console.error('Failed to load projects while selecting bootstrap project:', error);
        return null;
      }
    }

    const bootstrapProject = projectList.find(project => project.name === DEFAULT_BOOTSTRAP_PROJECT_NAME);
    if (bootstrapProject) {
      return bootstrapProject;
    }

    const fallbackProject = projectList.find(project => project.id !== UNASSIGNED_PROJECT_ID);
    return fallbackProject || null;
  }, [allProjects]);

  const loadCurrentProjectFromSession = useCallback(async (projectsFromRefresh?: Project[]) => {
    try {
      // First, try to get current project from MCP session
      const session = await ProjectApi.getCurrentSession();
      if (session?.project_name && session?.project_id && session.project_id !== UNASSIGNED_PROJECT_ID) {
        // Find the project in our projects list
        const sessionProject: Project = {
          id: session.project_id,
          name: session.project_name,
          status: 'active' as const,
          created_at: session.created_at || new Date().toISOString(),
          updated_at: session.created_at || new Date().toISOString(),
          description: `Project from MCP session: ${session.title || session.project_name}`
        };
        setCurrentProject(sessionProject);
        console.log('✅ Loaded project from MCP session:', sessionProject.name);
        return;
      }

      if (session?.project_id === UNASSIGNED_PROJECT_ID) {
        const bootstrapProject = await selectBootstrapProject(projectsFromRefresh);
        if (bootstrapProject) {
          setCurrentProject(bootstrapProject);
          console.log('🔄 Session unassigned - defaulting to bootstrap project:', bootstrapProject.name);
          return;
        }
      }
      
      // Fallback to localStorage if session API fails
      let stored = localStorage.getItem('aidis_selected_project');
      if (!stored) {
        // Try the old key for backward compatibility
        stored = localStorage.getItem('aidis_current_project');
      }
      if (stored) {
        const project = JSON.parse(stored);
        if (project?.id && project.id !== UNASSIGNED_PROJECT_ID) {
          setCurrentProject(project);
          console.log('📱 Loaded project from localStorage:', project.name);
          return;
        }
      }

      const bootstrapProject = await selectBootstrapProject(projectsFromRefresh);
      if (bootstrapProject) {
        setCurrentProject(bootstrapProject);
        console.log('🧭 Defaulting to bootstrap project:', bootstrapProject.name);
      }
    } catch (error) {
      console.error('Failed to load project from session:', error);
      // Fallback to localStorage
      try {
        let stored = localStorage.getItem('aidis_selected_project');
        if (!stored) {
          // Try the old key for backward compatibility
          stored = localStorage.getItem('aidis_current_project');
        }
        if (stored) {
          const project = JSON.parse(stored);
          if (project?.id && project.id !== UNASSIGNED_PROJECT_ID) {
            setCurrentProject(project);
            return;
          }
        }

        const bootstrapProject = await selectBootstrapProject(projectsFromRefresh);
        if (bootstrapProject) {
          setCurrentProject(bootstrapProject);
        }
      } catch (storageError) {
        console.error('Failed to load project from storage:', storageError);
      }
    }
  }, [selectBootstrapProject]);

  const refreshProjects = useCallback(async (): Promise<Project[]> => {
    setLoading(true);
    try {
      const response = await ProjectApi.getAllProjects();
      setAllProjects(response.projects);
      
      // If we have a current project, refresh its data
      if (currentProject) {
        const updatedProject = response.projects.find(p => p.id === currentProject.id);
        if (updatedProject) {
          setCurrentProject(updatedProject);
        } else {
          // Current project was deleted, clear it
          setCurrentProject(null);
        }
      }

      return response.projects;
    } catch (error) {
      console.error('Failed to refresh projects:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [currentProject]);

  // Load projects only when authenticated
  useEffect(() => {
    if (!isAuthenticated || authLoading) {
      hasInitializedRef.current = false;
      return;
    }

    if (hasInitializedRef.current) {
      return;
    }

    hasInitializedRef.current = true;
    let isActive = true;

    (async () => {
      const projects = await refreshProjects();
      if (!isActive) {
        return;
      }

      await loadCurrentProjectFromSession(projects);
    })().catch(error => {
      console.error('Failed to initialize projects:', error);
    });

    return () => {
      isActive = false;
    };
  }, [isAuthenticated, authLoading, refreshProjects, loadCurrentProjectFromSession]);

  const value: ProjectContextType = {
    currentProject,
    setCurrentProject,
    allProjects,
    loading,
    refreshProjects,
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjectContext = (): ProjectContextType => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
};

export default ProjectContext;
