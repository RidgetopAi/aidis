import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Project } from '../services/projectApi';
import ProjectApi from '../services/projectApi';
import { useAuthContext } from './AuthContext';

interface ProjectContextType {
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  allProjects: Project[];
  loading: boolean;
  refreshProjects: () => Promise<void>;
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

  // Load projects only when authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      refreshProjects();
      loadCurrentProjectFromStorage();
    }
  }, [isAuthenticated, authLoading]);

  // Save current project to localStorage when it changes
  useEffect(() => {
    if (currentProject) {
      localStorage.setItem('aidis_current_project', JSON.stringify(currentProject));
    } else {
      localStorage.removeItem('aidis_current_project');
    }
  }, [currentProject]);

  const loadCurrentProjectFromStorage = () => {
    try {
      const stored = localStorage.getItem('aidis_current_project');
      if (stored) {
        const project = JSON.parse(stored);
        setCurrentProject(project);
      }
    } catch (error) {
      console.error('Failed to load current project from storage:', error);
    }
  };

  const refreshProjects = async () => {
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
    } catch (error) {
      console.error('Failed to refresh projects:', error);
    } finally {
      setLoading(false);
    }
  };

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
