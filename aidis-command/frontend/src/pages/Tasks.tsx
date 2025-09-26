import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Tabs, Button, notification } from 'antd';
import { PlusOutlined, BarChartOutlined, ProjectOutlined } from '@ant-design/icons';
import useWebSocketSingleton from '../hooks/useWebSocketSingleton';
import { apiService } from '../services/api';
import { useProjectContext } from '../contexts/ProjectContext';
// TODO: Import remaining components once they're fixed
// import TaskKanbanBoard from '../components/tasks/TaskKanbanBoard';
import TaskList from '../components/tasks/TaskList';
import TaskCardList from '../components/tasks/TaskCardList';
import TaskForm from '../components/tasks/TaskForm';
import TaskAnalytics from '../components/analytics/TaskAnalytics';
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

const { TabPane } = Tabs;

/**
 * Tasks Page - Main task management interface
 * Features: Kanban board, list view, analytics, dependency tracking
 */
const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Use the global project context instead of local state
  const { currentProject, allProjects } = useProjectContext();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTab, setActiveTab] = useState('kanban');

  // WebSocket for real-time updates  
  const token = localStorage.getItem('aidis_token');
  const backendPort = process.env.REACT_APP_BACKEND_PORT || '5001';
  const wsUrl = token ? `ws://localhost:${backendPort}/ws?token=${encodeURIComponent(token)}` : null;
  
  const projectId = currentProject?.id;

  const { isConnected } = useWebSocketSingleton(wsUrl, {
    onMessage: (message) => {
      console.log('Received WebSocket message:', message.type);

      const taskPayload: Task | undefined = message.data?.task;
      const isProjectMatch = (task: Task | undefined) => Boolean(projectId && task && task.project_id === projectId);

      switch (message.type) {
        case 'connection_established':
          console.log('✅ WebSocket connection established');
          break;
          
        case 'task_created':
          if (taskPayload && isProjectMatch(taskPayload)) {
            setTasks(prev => {
              if (prev.some(task => task.id === taskPayload.id)) {
                return prev.map(task => (task.id === taskPayload.id ? taskPayload : task));
              }
              return [taskPayload, ...prev];
            });
            notification.success({
              message: 'Task Created',
              description: `New task "${taskPayload.title}" has been created.`
            });
          }
          break;
       
        case 'task_updated':
        case 'task_status_changed':
        case 'task_assigned':
          if (taskPayload && isProjectMatch(taskPayload)) {
            setTasks(prev => prev.map(task => 
              task.id === taskPayload.id ? taskPayload : task
            ));
          }
          break;
        
        case 'task_deleted':
          if (projectId) {
            setTasks(prev => {
              const taskId = message.data?.taskId as string | undefined;
              if (!taskId || !prev.some(task => task.id === taskId)) {
                return prev;
              }
              notification.info({
                message: 'Task Deleted',
                description: 'A task has been deleted.'
              });
              return prev.filter(task => task.id !== taskId);
            });
          }
          break;
        
        case 'tasks_bulk_updated':
          if (projectId && Array.isArray(message.data?.tasks)) {
            setTasks(prev => prev.map(task => {
              if (task.project_id !== projectId) {
                return task;
              }
              const updated = message.data.tasks.find((t: Task) => t.id === task.id && t.project_id === projectId);
              return updated || task;
            }));
          }
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
  const loadTasks = useCallback(async () => {
    if (!projectId) {
      setTasks([]);
      return;
    }
    
    setLoading(true);
    try {
      const response = await apiService.get<{success: boolean; data: {tasks: Task[]}}>('/tasks', {
        params: { project_id: projectId }
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
  }, [projectId]);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      if (projectId) {
        await loadTasks();
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
      notification.error({
        message: 'Loading Error',
        description: 'Failed to load initial data.'
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, loadTasks]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Reload tasks when project selection changes
  useEffect(() => {
    if (!projectId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    loadTasks();
  }, [projectId, loadTasks]);

  // Cleanup effect for component unmounting
  useEffect(() => {
    return () => {
      // Reset state on unmount to prevent stale state on revisit
      setTasks([]);
      setLoading(false);
      setCreating(false);
      setShowCreateForm(false);
    };
  }, []);

  const handleCreateTask = async (taskData: any) => {
    setCreating(true);
    try {
      if (!projectId) {
        notification.error({
          message: 'Creation Error',
          description: 'Select a project before creating tasks.'
        });
        return;
      }

      const response = await apiService.post<{success: boolean; data: {task: Task}}>('/tasks', {
        ...taskData,
        project_id: projectId
      });
      
      // Task will be added via WebSocket, but add immediately for better UX
      if (response.data.task.project_id === projectId) {
        setTasks(prev => [response.data.task, ...prev]);
      }
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

  const selectedProjectName = currentProject?.name || 'No Project Selected';

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
                  disabled={!currentProject}
                >
                  Create Task
                </Button>
              </div>
            </div>

            {/* Project selection is now handled by the global ProjectSwitcher in the header */}
            {!currentProject && (
              <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f6f6f6', borderRadius: '6px' }}>
                <p style={{ margin: 0, color: '#666' }}>
                  Please select a project using the Project Switcher in the header to view and manage tasks.
                </p>
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24}>
          <Card style={{ minHeight: '600px' }}>
            <Tabs 
              activeKey={activeTab} 
              onChange={setActiveTab}
              type="card"
            >
              <TabPane tab="Card View" key="list">
                <TaskCardList
                  tasks={tasks}
                  loading={loading}
                  onUpdateTask={handleUpdateTask}
                  onDeleteTask={handleDeleteTask}
                  projects={allProjects}
                />
              </TabPane>

              <TabPane tab="Table View" key="table">
                <TaskList
                  tasks={tasks}
                  loading={loading}
                  onUpdateTask={handleUpdateTask}
                  onDeleteTask={handleDeleteTask}
                  projects={allProjects}
                />
              </TabPane>

              <TabPane tab="Kanban Board" key="kanban">
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <h3>Kanban Board</h3>
                  <p>Coming soon - drag and drop task management</p>
                </div>
              </TabPane>

              <TabPane tab={<span><BarChartOutlined />Analytics</span>} key="analytics">
                <TaskAnalytics projectId={currentProject?.id} />
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
      {currentProject && (
        <TaskForm
          visible={showCreateForm}
          projectId={currentProject.id}
          onSubmit={handleCreateTask}
          onCancel={() => setShowCreateForm(false)}
          loading={creating}
        />
      )}
    </div>
  );
};

export default Tasks;
