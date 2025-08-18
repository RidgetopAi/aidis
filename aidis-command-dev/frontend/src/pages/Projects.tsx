import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Typography, 
  Card, 
  Empty, 
  Button, 
  Space, 
  message, 
  Modal, 
  Tabs,
  Spin,
  Input
} from 'antd';
import { 
  FolderOutlined, 
  PlusOutlined, 
  SearchOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import ProjectCard from '../components/projects/ProjectCard';
import ProjectForm from '../components/projects/ProjectForm';
import ProjectStats from '../components/projects/ProjectStats';
import SessionList from '../components/projects/SessionList';
import ProjectApi, { 
  Project, 
  Session, 
  ProjectStats as ProjectStatsType,
  CreateProjectRequest,
  UpdateProjectRequest
} from '../services/projectApi';
import '../components/projects/projects.css';

const { Title, Text } = Typography;
const { Search } = Input;
const { TabPane } = Tabs;

const Projects: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<ProjectStatsType | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>(undefined);
  const [formLoading, setFormLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('projects');

  useEffect(() => {
    loadProjects();
    loadStats();
    loadSessions();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const response = await ProjectApi.getAllProjects();
      setProjects(response.projects);
    } catch (error) {
      message.error('Failed to load projects');
      console.error('Load projects error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const stats = await ProjectApi.getProjectStats();
      setStats(stats);
    } catch (error) {
      console.error('Load stats error:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const response = await ProjectApi.getAllSessions();
      setSessions(response.sessions);
    } catch (error) {
      console.error('Load sessions error:', error);
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleCreateProject = () => {
    setEditingProject(undefined);
    setFormVisible(true);
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setFormVisible(true);
  };

  const handleDeleteProject = (project: Project) => {
    Modal.confirm({
      title: 'Delete Project',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <Text>Are you sure you want to delete the project </Text>
          <Text strong>"{project.name}"</Text>
          <Text>?</Text>
          <br />
          <Text type="danger" style={{ marginTop: 8, display: 'block' }}>
            This action cannot be undone and will permanently delete all associated contexts and sessions.
          </Text>
        </div>
      ),
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await ProjectApi.deleteProject(project.id);
          message.success('Project deleted successfully');
          loadProjects();
          loadStats();
          loadSessions();
        } catch (error) {
          message.error('Failed to delete project');
          console.error('Delete project error:', error);
        }
      }
    });
  };

  const handleViewProject = (project: Project) => {
    navigate(`/projects/${project.id}`);
  };

  const handleFormSubmit = async (data: CreateProjectRequest | UpdateProjectRequest) => {
    setFormLoading(true);
    try {
      if (editingProject) {
        await ProjectApi.updateProject(editingProject.id, data);
        message.success('Project updated successfully');
      } else {
        await ProjectApi.createProject(data as CreateProjectRequest);
        message.success('Project created successfully');
      }
      
      setFormVisible(false);
      setEditingProject(undefined);
      loadProjects();
      loadStats();
    } catch (error) {
      message.error(editingProject ? 'Failed to update project' : 'Failed to create project');
      console.error('Form submit error:', error);
    } finally {
      setFormLoading(false);
    }
  };

  const handleFormCancel = () => {
    setFormVisible(false);
    setEditingProject(undefined);
  };

  const handleViewSession = (session: Session) => {
    console.log('Navigating to session:', session.id);
    navigate(`/sessions/${session.id}`);
  };

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const renderProjectsContent = () => {
    if (loading) {
      return (
        <div className="project-loading">
          <Spin size="large" />
        </div>
      );
    }

    if (projects.length === 0) {
      return (
        <Card>
          <Empty
            image={<FolderOutlined style={{ fontSize: '64px', color: '#722ed1' }} />}
            imageStyle={{ height: 80 }}
            description={
              <Space direction="vertical" size="small">
                <Text strong>No Projects Yet</Text>
                <Text type="secondary">
                  Create your first project to start organizing your development work
                </Text>
              </Space>
            }
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateProject}>
              Create First Project
            </Button>
          </Empty>
        </Card>
      );
    }

    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <Search
            placeholder="Search projects..."
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ maxWidth: 400 }}
            allowClear
          />
        </div>
        
        <div className="project-list">
          {filteredProjects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={handleEditProject}
              onDelete={handleDeleteProject}
              onView={handleViewProject}
            />
          ))}
        </div>

        {filteredProjects.length === 0 && searchQuery && (
          <Card>
            <Empty
              description="No projects match your search"
              image={<SearchOutlined style={{ fontSize: '48px', color: '#ccc' }} />}
            />
          </Card>
        )}
      </div>
    );
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={2}>Project Management</Title>
          <Text type="secondary">
            Manage your projects and track development sessions across contexts
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateProject}>
          New Project
        </Button>
      </div>

      {/* Main Content Tabs */}
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card">
        <TabPane 
          tab={
            <Space>
              <FolderOutlined />
              Projects ({projects.length})
            </Space>
          } 
          key="projects"
        >
          {renderProjectsContent()}
        </TabPane>

        <TabPane 
          tab={
            <Space>
              <BarChartOutlined />
              Analytics
            </Space>
          } 
          key="analytics"
        >
          {stats && <ProjectStats stats={stats} loading={statsLoading} />}
        </TabPane>

        <TabPane 
          tab={
            <Space>
              <ClockCircleOutlined />
              Sessions ({sessions.length})
            </Space>
          } 
          key="sessions"
        >
          <SessionList 
            sessions={sessions}
            loading={sessionsLoading}
            onViewSession={handleViewSession}
            showProject={true}
          />
        </TabPane>
      </Tabs>

      {/* Project Form Modal */}
      <ProjectForm
        visible={formVisible}
        project={editingProject}
        onSubmit={handleFormSubmit}
        onCancel={handleFormCancel}
        loading={formLoading}
      />
    </Space>
  );
};

export default Projects;
