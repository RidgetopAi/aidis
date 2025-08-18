import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Tabs, Button, notification } from 'antd';
import { PlusOutlined, BarChartOutlined, ProjectOutlined } from '@ant-design/icons';
import useWebSocketSingleton from '../hooks/useWebSocketSingleton';
import { apiService } from '../services/api';
// TODO: Import remaining components once they're fixed
// import TaskKanbanBoard from '../components/tasks/TaskKanbanBoard';
import TaskList from '../components/tasks/TaskList';
import TaskForm from '../components/tasks/TaskForm';
// import TaskStats from '../components/tasks/TaskStats';
// import TaskDependencyGraph from '../components/tasks/TaskDependencyGraph';
// Define types locally for compatibility
interface Task {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  type: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  dependencies: string[];
  tags: string[];
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

interface Agent {
  id: string;
  name: string;
  status: string;
  type: string;
  created_at: string;
}

const { TabPane } = Tabs;

/**
 * Tasks Page - Main task management interface
 * Features: Kanban board, list view, analytics, dependency tracking
 */
const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTab, setActiveTab] = useState('kanban');

  // WebSocket for real-time updates  
  const token = localStorage.getItem('aidis_token');
  const backendPort = process.env.REACT_APP_BACKEND_PORT || '5000';
  const wsUrl = token ? `ws://localhost:${backendPort}/ws?token=${encodeURIComponent(token)}` : null;
  
  const { isConnected } = useWebSocketSingleton(wsUrl, {
    onMessage: (message) => {
      console.log('Received WebSocket message:', message.type);
      switch (message.type) {
        case 'connection_established':
          console.log('✅ WebSocket connection established');
          break;
          
        case 'task_created':
          setTasks(prev => [message.data.task, ...prev]);
          notification.success({
            message: 'Task Created',
            description: `New task "${message.data.task.title}" has been created.`
          });
          break;
        
        case 'task_updated':
        case 'task_status_changed':
        case 'task_assigned':
          setTasks(prev => prev.map(task => 
            task.id === message.data.task.id ? message.data.task : task
          ));
          break;
        
        case 'task_deleted':
          setTasks(prev => prev.filter(task => task.id !== message.data.taskId));
          notification.info({
            message: 'Task Deleted',
            description: 'A task has been deleted.'
          });
          break;
        
        case 'tasks_bulk_updated':
          setTasks(prev => {
            const updatedTaskIds = message.data.tasks.map((t: Task) => t.id);
            return prev.map(task => {
              const updated = message.data.tasks.find((t: Task) => t.id === task.id);
              return updated || task;
            });
          });
          break;
      }
    },
    onOpen: () => {
      console.log('✅ WebSocket connection opened for Tasks page');
    },
    onClose: (event) => {
      console.log('🔌 WebSocket connection closed for Tasks page:', event.code, event.reason);
    },
    onError: (event) => {
      console.error('❌ WebSocket error for Tasks page:', event);
    }
  });

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  // Reload tasks when project selection changes
  useEffect(() => {
    if (projects.length > 0) {
      loadTasks();
    }
  }, [selectedProject]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [projectsRes, agentsRes] = await Promise.all([
        apiService.get<{data: {projects: Project[]}}> ('/projects'),
        apiService.get<{data: {agents: Agent[]}}>('/agents')
      ]);

      setProjects(projectsRes.data.projects || []);
      setAgents(agentsRes.data.agents || []);

      // Auto-select first project if none selected
      if (!selectedProject && projectsRes.data.projects?.length > 0) {
        setSelectedProject(projectsRes.data.projects[0].id);
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
      notification.error({
        message: 'Loading Error',
        description: 'Failed to load projects and agents.'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async () => {
    if (!selectedProject) return;
    
    setLoading(true);
    try {
      const response = await apiService.get<{data: {tasks: Task[]}}>('/tasks', {
        params: { project_id: selectedProject }
      });
      setTasks(response.data.tasks || []);
    } catch (error) {
      console.error('Failed to load tasks:', error);
      notification.error({
        message: 'Loading Error',
        description: 'Failed to load tasks.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (taskData: any) => {
    setCreating(true);
    try {
      const response = await apiService.post<{data: {task: Task}}>('/tasks', {
        ...taskData,
        project_id: selectedProject
      });
      
      // Task will be added via WebSocket, but add immediately for better UX
      setTasks(prev => [response.data.task, ...prev]);
      setShowCreateForm(false);
      
      notification.success({
        message: 'Task Created',
        description: `Task "${response.data.task.title}" has been created successfully.`
      });
    } catch (error) {
      console.error('Failed to create task:', error);
      notification.error({
        message: 'Creation Error',
        description: 'Failed to create task.'
      });
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateTask = async (taskId: string, updates: any) => {
    try {
      await apiService.put(`/tasks/${taskId}`, updates);
      // Updates will be handled via WebSocket
    } catch (error) {
      console.error('Failed to update task:', error);
      notification.error({
        message: 'Update Error',
        description: 'Failed to update task.'
      });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await apiService.delete(`/tasks/${taskId}`);
      // Deletion will be handled via WebSocket
    } catch (error) {
      console.error('Failed to delete task:', error);
      notification.error({
        message: 'Deletion Error',
        description: 'Failed to delete task.'
      });
    }
  };

  const handleBulkUpdateTasks = async (updates: Array<{ id: string; status: string }>) => {
    try {
      await apiService.post('/tasks/bulk-update', { updates });
      // Updates will be handled via WebSocket
    } catch (error) {
      console.error('Failed to bulk update tasks:', error);
      notification.error({
        message: 'Update Error',
        description: 'Failed to update task statuses.'
      });
      // Reload tasks to ensure consistency
      loadTasks();
    }
  };

  const selectedProjectName = projects.find(p => p.id === selectedProject)?.name || 'All Projects';

  return (
    <div className="tasks-page" style={{ padding: '24px' }}>
      <Row gutter={[24, 24]}>
        <Col xs={24}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                  <ProjectOutlined style={{ marginRight: '8px' }} />
                  Task Management - {selectedProjectName}
                </h2>
                <p style={{ margin: '4px 0 0 0', color: '#666' }}>
                  WebSocket: {isConnected ? '🟢 Connected' : '🔴 Disconnected'} | {tasks.length} tasks loaded
                </p>
              </div>
              <div>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setShowCreateForm(true)}
                  disabled={!selectedProject}
                >
                  Create Task
                </Button>
              </div>
            </div>

            {/* Project Selection */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ marginRight: '8px' }}>Project:</label>
              <select 
                value={selectedProject} 
                onChange={(e) => setSelectedProject(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d9d9d9' }}
              >
                <option value="">All Projects</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </Card>
        </Col>

        <Col xs={24}>
          <Card style={{ minHeight: '600px' }}>
            <Tabs 
              activeKey={activeTab} 
              onChange={setActiveTab}
              type="card"
            >
              <TabPane tab="Task List" key="list">
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <h3>Task Management System</h3>
                  <p>Loading: {loading ? 'Yes' : 'No'}</p>
                  <p>Tasks loaded: {tasks.length}</p>
                  {tasks.length > 0 && (
                    <div style={{ textAlign: 'left', marginTop: '20px' }}>
                      <h4>Tasks:</h4>
                      {tasks.map(task => (
                        <Card key={task.id} size="small" style={{ marginBottom: '8px' }}>
                          <div><strong>{task.title}</strong></div>
                          <div>Status: {task.status} | Priority: {task.priority}</div>
                          <div>{task.description}</div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </TabPane>

              <TabPane tab="Kanban Board" key="kanban">
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <h3>Kanban Board</h3>
                  <p>Coming soon - drag and drop task management</p>
                </div>
              </TabPane>

              <TabPane tab={<span><BarChartOutlined />Analytics</span>} key="analytics">
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <h3>Task Analytics</h3>
                  <p>Coming soon - task statistics and progress reports</p>
                </div>
              </TabPane>

              <TabPane tab="Dependencies" key="dependencies">
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <h3>Dependency Graph</h3>
                  <p>Coming soon - task dependency visualization</p>
                </div>
              </TabPane>
            </Tabs>
          </Card>
        </Col>
      </Row>

      {/* Task Creation Form Modal */}
      <TaskForm
        visible={showCreateForm}
        projectId={selectedProject}
        onSubmit={handleCreateTask}
        onCancel={() => setShowCreateForm(false)}
        loading={creating}
      />
    </div>
  );
};

export default Tasks;
