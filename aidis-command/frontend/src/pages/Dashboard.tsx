import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Card,
  Row,
  Col,
  Statistic,
  Space,
  Alert,
  Button,
  Spin,
  Skeleton,
} from 'antd';
import {
  DatabaseOutlined,
  TeamOutlined,
  FolderOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useAuthContext } from '../contexts/AuthContext';
import { useProjectContext } from '../contexts/ProjectContext';
import { useDashboardStats } from '../hooks/useDashboardStats';
import ProjectInsights from '../components/analytics/ProjectInsights';
import SystemMonitoring from '../components/analytics/SystemMonitoring';

const { Title, Text, Paragraph } = Typography;

interface SystemStats {
  contexts: number;
  agents: number;
  projects: number;
  activeTasks: number;
}

const Dashboard: React.FC = () => {
  const { user } = useAuthContext();
  const { currentProject } = useProjectContext();
  const navigate = useNavigate();
  
  // Oracle Phase 2: Use dashboard stats hook with real data
  const { stats, isLoading, error, refetch } = useDashboardStats();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Oracle Phase 2: Show loading skeleton until data arrives
  if (isLoading) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2} style={{ marginBottom: '8px' }}>
            {getGreeting()}, {user?.firstName || user?.username}! 👋
          </Title>
          <Text type="secondary">
            Welcome to AIDIS Command - Your AI Development Intelligence System
          </Text>
        </div>
        
        <Row gutter={[24, 24]}>
          {[1, 2, 3, 4].map(i => (
            <Col xs={24} sm={12} lg={6} key={i}>
              <Card>
                <Skeleton active title={false} paragraph={{ rows: 2 }} />
              </Card>
            </Col>
          ))}
        </Row>
        
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin size="large" tip="Loading real-time dashboard data..." />
        </div>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Welcome Header */}
      <div>
        <Title level={2} style={{ marginBottom: '8px' }}>
          {getGreeting()}, {user?.firstName || user?.username}! 👋
        </Title>
        <Text type="secondary">
          Welcome to AIDIS Command - Your AI Development Intelligence System
        </Text>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert
          message="Connection Issue"
          description={error}
          type="warning"
          showIcon
          action={
            <Button
              size="small"
              type="primary"
              onClick={refetch}
            >
              Retry
            </Button>
          }
          closable
        />
      )}

      {/* Oracle Phase 2: Real Database Counts */}
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Contexts"
              value={stats?.contexts ?? 0}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {currentProject ? `In ${currentProject.name}` : 'Development contexts stored'}
            </Text>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Active Tasks"
              value={stats?.activeTasks ?? 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {currentProject ? `In ${currentProject.name}` : 'Tasks in progress'}
            </Text>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Projects"
              value={stats?.projects ?? 0}
              prefix={<FolderOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Projects managed
            </Text>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Active Agents"
              value={stats?.agents ?? 0}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              AI agents coordinating
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Project Insights */}
      {currentProject && (
        <ProjectInsights projectId={currentProject.id} />
      )}

      {/* System Monitoring */}
      <SystemMonitoring />

      {/* Feature Cards */}
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={8}>
          <Card
            title="Context Management"
            extra={<DatabaseOutlined style={{ color: '#1890ff' }} />}
            hoverable
          >
            <Paragraph>
              Store and retrieve development contexts with semantic search.
              Maintain consistency across multi-week projects.
            </Paragraph>
            <Button type="primary" ghost onClick={() => navigate('/contexts')}>
              Browse Contexts
            </Button>
          </Card>
        </Col>
        
        <Col xs={24} lg={8}>
          <Card
            title="Agent Coordination"
            extra={<TeamOutlined style={{ color: '#52c41a' }} />}
            hoverable
          >
            <Paragraph>
              Coordinate multiple AI agents, assign tasks, and track progress
              across your development team.
            </Paragraph>
            <Button type="primary" ghost>
              Manage Agents
            </Button>
          </Card>
        </Col>
        
        <Col xs={24} lg={8}>
          <Card
            title="Project Switching"
            extra={<FolderOutlined style={{ color: '#722ed1' }} />}
            hoverable
          >
            <Paragraph>
              Seamlessly switch between projects while maintaining context
              and decision history.
            </Paragraph>
            <Button type="primary" ghost>
              Switch Projects
            </Button>
          </Card>
        </Col>
      </Row>

      {/* System Status */}
      <Card title="System Status">
        <Row gutter={24}>
          <Col span={8}>
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '18px' }} />
              <div>
                <Text strong>Backend API</Text>
                <br />
                <Text type="secondary">Connected</Text>
              </div>
            </Space>
          </Col>
          <Col span={8}>
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '18px' }} />
              <div>
                <Text strong>Authentication</Text>
                <br />
                <Text type="secondary">Active</Text>
              </div>
            </Space>
          </Col>
          <Col span={8}>
            <Space>
              <ExclamationCircleOutlined style={{ color: '#fa8c16', fontSize: '18px' }} />
              <div>
                <Text strong>AIDIS MCP</Text>
                <br />
                <Text type="secondary">Connecting...</Text>
              </div>
            </Space>
          </Col>
        </Row>
      </Card>
    </Space>
  );
};

export default Dashboard;
