import React, { useState } from 'react';
import { Table, Tag, Button, Space, Modal, Popconfirm, Select, Input } from 'antd';
import { EditOutlined, DeleteOutlined, EyeOutlined, UserOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import TaskForm from './TaskForm';

const { Search } = Input;
const { Option } = Select;

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

interface TaskListProps {
  tasks: Task[];
  loading: boolean;
  onUpdateTask: (taskId: string, updates: any) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  projects: Array<{ id: string; name: string; }>;
  agents: Array<{ id: string; name: string; }>;
}

const TaskList: React.FC<TaskListProps> = ({ 
  tasks, 
  loading, 
  onUpdateTask, 
  onDeleteTask,
  projects,
  agents 
}) => {
  const [filteredTasks, setFilteredTasks] = useState<Task[]>(tasks);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);

  // Update filtered tasks when tasks prop changes
  React.useEffect(() => {
    let filtered = tasks;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(task => 
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Apply status filter
    if (statusFilter) {
      filtered = filtered.filter(task => task.status === statusFilter);
    }

    // Apply priority filter
    if (priorityFilter) {
      filtered = filtered.filter(task => task.priority === priorityFilter);
    }

    setFilteredTasks(filtered);
  }, [tasks, searchTerm, statusFilter, priorityFilter]);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'todo': 'blue',
      'in_progress': 'orange',
      'blocked': 'red',
      'completed': 'green',
      'cancelled': 'gray'
    };
    return colors[status] || 'blue';
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      'low': 'green',
      'medium': 'blue',
      'high': 'orange',
      'urgent': 'red'
    };
    return colors[priority] || 'blue';
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    await onUpdateTask(taskId, { status: newStatus });
  };

  const handleAssigneeChange = async (taskId: string, assignedTo: string) => {
    await onUpdateTask(taskId, { assigned_to: assignedTo });
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setShowEditForm(true);
  };

  const handleEditSubmit = async (updates: any) => {
    if (editingTask) {
      await onUpdateTask(editingTask.id, updates);
      setShowEditForm(false);
      setEditingTask(null);
    }
  };

  const handleView = (task: Task) => {
    setViewingTask(task);
  };

  const columns: ColumnsType<Task> = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      width: 250,
      render: (text: string, record: Task) => (
        <div>
          <div style={{ fontWeight: 500 }}>{text}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {record.type} • Created {new Date(record.created_at).toLocaleDateString()}
          </div>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string, record: Task) => (
        <Select
          value={status}
          style={{ width: '100%' }}
          size="small"
          onChange={(value) => handleStatusChange(record.id, value)}
        >
          <Option value="todo">To Do</Option>
          <Option value="in_progress">In Progress</Option>
          <Option value="blocked">Blocked</Option>
          <Option value="completed">Completed</Option>
          <Option value="cancelled">Cancelled</Option>
        </Select>
      ),
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (priority: string) => (
        <Tag color={getPriorityColor(priority)}>
          {priority.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Assignee',
      dataIndex: 'assigned_to',
      key: 'assigned_to',
      width: 120,
      render: (assignedTo: string, record: Task) => (
        <Select
          value={assignedTo || ''}
          placeholder="Unassigned"
          style={{ width: '100%' }}
          size="small"
          allowClear
          onChange={(value) => handleAssigneeChange(record.id, value)}
        >
          {agents.map(agent => (
            <Option key={agent.id} value={agent.name}>
              <UserOutlined /> {agent.name}
            </Option>
          ))}
        </Select>
      ),
    },
    {
      title: 'Tags',
      dataIndex: 'tags',
      key: 'tags',
      width: 150,
      render: (tags: string[]) => (
        <div>
          {tags.slice(0, 2).map(tag => (
          <Tag key={tag} style={{ marginBottom: 2, fontSize: '12px' }}>
          {tag}
          </Tag>
          ))}
          {tags.length > 2 && (
          <Tag color="blue" style={{ fontSize: '12px' }}>+{tags.length - 2}</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record: Task) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleView(record)}
          />
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Are you sure you want to delete this task?"
            onConfirm={() => onDeleteTask(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              size="small"
              icon={<DeleteOutlined />}
              danger
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Filters */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Search
          placeholder="Search tasks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: 250 }}
        />
        <Select
          placeholder="Filter by Status"
          value={statusFilter}
          onChange={setStatusFilter}
          allowClear
          style={{ width: 150 }}
        >
          <Option value="todo">To Do</Option>
          <Option value="in_progress">In Progress</Option>
          <Option value="blocked">Blocked</Option>
          <Option value="completed">Completed</Option>
          <Option value="cancelled">Cancelled</Option>
        </Select>
        <Select
          placeholder="Filter by Priority"
          value={priorityFilter}
          onChange={setPriorityFilter}
          allowClear
          style={{ width: 150 }}
        >
          <Option value="low">Low</Option>
          <Option value="medium">Medium</Option>
          <Option value="high">High</Option>
          <Option value="urgent">Urgent</Option>
        </Select>
      </div>

      {/* Task Table */}
      <Table
        columns={columns}
        dataSource={filteredTasks}
        loading={loading}
        rowKey="id"
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} tasks`,
        }}
        scroll={{ x: 1000 }}
      />

      {/* Edit Task Modal */}
      <TaskForm
        visible={showEditForm}
        task={editingTask || undefined}
        projectId={editingTask?.project_id || ''}
        onSubmit={handleEditSubmit}
        onCancel={() => {
          setShowEditForm(false);
          setEditingTask(null);
        }}
      />

      {/* View Task Modal */}
      <Modal
        title="Task Details"
        open={!!viewingTask}
        onCancel={() => setViewingTask(null)}
        footer={[
          <Button key="close" onClick={() => setViewingTask(null)}>
            Close
          </Button>
        ]}
        width={600}
      >
        {viewingTask && (
          <div style={{ lineHeight: 2 }}>
            <div><strong>Title:</strong> {viewingTask.title}</div>
            <div><strong>Description:</strong> {viewingTask.description || 'No description'}</div>
            <div><strong>Type:</strong> {viewingTask.type}</div>
            <div><strong>Status:</strong> <Tag color={getStatusColor(viewingTask.status)}>{viewingTask.status}</Tag></div>
            <div><strong>Priority:</strong> <Tag color={getPriorityColor(viewingTask.priority)}>{viewingTask.priority}</Tag></div>
            <div><strong>Assigned To:</strong> {viewingTask.assigned_to || 'Unassigned'}</div>
            <div><strong>Tags:</strong> {viewingTask.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}</div>
            <div><strong>Created:</strong> {new Date(viewingTask.created_at).toLocaleString()}</div>
            <div><strong>Updated:</strong> {new Date(viewingTask.updated_at).toLocaleString()}</div>
            {viewingTask.dependencies.length > 0 && (
              <div><strong>Dependencies:</strong> {viewingTask.dependencies.join(', ')}</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TaskList;
