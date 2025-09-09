import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Table,
  Tag,
  Button,
  Spin,
  Alert,
  Tooltip,
  Progress,
  Space,
  Statistic,
  Row,
  Col
} from 'antd';
import {
  EyeOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  CheckSquareOutlined,
  TrophyOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiService } from '../../services/api';
import SessionDetailView from './SessionDetailView';

const { Title, Text } = Typography;

interface SessionSummary {
  id: string;
  project_id: string;
  project_name?: string;
  created_at: string;
  context_count?: number;
  last_context_at?: string;
  // Optional fields for enhanced display
  duration_minutes?: number;
  total_tokens?: number;
  contexts_created?: number;
  decisions_created?: number;
  tasks_created?: number;
  tasks_completed?: number;
  productivity_score?: number;
}

interface SessionSummariesProps {
  projectId?: string;
  limit?: number;
}

const SessionSummaries: React.FC<SessionSummariesProps> = ({ 
  projectId, 
  limit = 20 
}) => {
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  useEffect(() => {
    fetchSummaries();
  }, [projectId, limit]);

  const fetchSummaries = async () => {
    try {
      setLoading(true);
      const params: any = { limit };
      if (projectId) {
        params.project_id = projectId;
      }
      
      const response = await apiService.get<{success: boolean; data: {sessions: SessionSummary[]}}>('/projects/sessions/all', { params });
      setSummaries(response.data.sessions);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load session summaries');
      console.error('Failed to fetch session summaries:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getProductivityColor = (score: number): string => {
    if (score >= 20) return 'green';
    if (score >= 10) return 'blue';
    if (score >= 5) return 'orange';
    return 'default';
  };

  const getCompletionRate = (created: number, completed: number): number => {
    if (created === 0) return 0;
    return Math.round((completed / created) * 100);
  };

  const columns: ColumnsType<SessionSummary> = [
    {
      title: 'Started At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => (
        <Text>{formatDate(date)}</Text>
      ),
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      defaultSortOrder: 'descend'
    },
    {
      title: 'Project',
      dataIndex: 'project_name',
      key: 'project_name',
      render: (name: string) => (
        <Text>{name || 'Unknown'}</Text>
      )
    },
    {
      title: 'Contexts',
      dataIndex: 'context_count',
      key: 'context_count',
      align: 'center',
      render: (contexts: number) => {
        if (!contexts || contexts === 0) {
          return <Text type="secondary">0</Text>;
        }
        return (
          <Tag icon={<DatabaseOutlined />} color="cyan">
            {contexts}
          </Tag>
        );
      },
      sorter: (a, b) => (a.context_count || 0) - (b.context_count || 0)
    },
    {
      title: 'Last Activity',
      dataIndex: 'last_context_at',
      key: 'last_context_at',
      align: 'center',
      render: (date: string) => {
        if (!date) {
          return <Text type="secondary">-</Text>;
        }
        return (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatDate(date)}
          </Text>
        );
      },
      sorter: (a, b) => {
        if (!a.last_context_at) return 1;
        if (!b.last_context_at) return -1;
        return new Date(a.last_context_at).getTime() - new Date(b.last_context_at).getTime();
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'center',
      render: (_, record: SessionSummary) => (
        <Tooltip title="View Details">
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => setSelectedSessionId(record.id)}
          />
        </Tooltip>
      )
    }
  ];

  if (selectedSessionId) {
    const selectedSession = summaries.find(s => s.id === selectedSessionId);
    return (
      <div>
        <Button 
          type="link" 
          onClick={() => setSelectedSessionId(null)}
          style={{ marginBottom: 16, padding: 0 }}
        >
          ← Back to Sessions
        </Button>
        {selectedSession ? (
          <SessionDetailView session={selectedSession} />
        ) : (
          <Alert message="Session not found" type="error" />
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert 
        message="Error loading sessions" 
        description={error} 
        type="error" 
        showIcon 
        style={{ margin: 16 }}
      />
    );
  }

  return (
    <Card>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            Session Analytics
          </Title>
        </Col>
        <Col>
          <Button 
            type="text" 
            icon={<ReloadOutlined />} 
            onClick={fetchSummaries}
          >
            Refresh
          </Button>
        </Col>
      </Row>

      {summaries.length === 0 ? (
        <Alert 
          message="No sessions found" 
          type="info" 
          showIcon 
        />
      ) : (
        <Table
          columns={columns}
          dataSource={summaries}
          rowKey="id"
          size="small"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} sessions`
          }}
        />
      )}
    </Card>
  );
};

export default SessionSummaries;