import React, { useState } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Typography,
  Space,
  Tag,
  Badge,
  Tooltip,
  Button,
  Alert,
  Spin,
  Avatar,
  List
} from 'antd';
import {
  HeartOutlined,
  BugOutlined,
  CodeOutlined,
  EyeOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  TrophyOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  FireOutlined,
  SafetyOutlined
} from '@ant-design/icons';
import { useProjectAIInsights, useCodeHotspots, type HotspotData } from '../../hooks/useAIComprehension';

const { Text, Title } = Typography;

interface CodeHealthCardsProps {
  projectId: string;
  refreshInterval?: number;
  className?: string;
}

interface HealthMetric {
  label: string;
  value: number;
  target: number;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  description: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'stable';
}

const CodeHealthCards: React.FC<CodeHealthCardsProps> = ({
  projectId,
  refreshInterval = 30000,
  className
}) => {
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  // Get project-wide AI insights
  const {
    data: projectInsights,
    isLoading: insightsLoading,
    error: insightsError,
    refetch: refetchInsights
  } = useProjectAIInsights(projectId, {
    enabled: !!projectId,
    refetchInterval: refreshInterval
  });

  // Get code hotspots
  const {
    data: hotspots,
    isLoading: hotspotsLoading,
    error: hotspotsError,
    refetch: refetchHotspots
  } = useCodeHotspots(projectId);

  // Calculate health metrics based on available data
  const calculateHealthMetrics = (): HealthMetric[] => {
    // Use mock data if real data isn't available
    const defaultMetrics = {
      overallHealth: 75,
      codeQuality: 70,
      maintainability: 68,
      testCoverage: 82,
      documentation: 65,
      security: 88
    };

    const insights = projectInsights || defaultMetrics;

    return [
      {
        label: 'Overall Health',
        value: insights.overallHealth || 75,
        target: 80,
        status: (insights.overallHealth || 75) >= 80 ? 'excellent' :
                (insights.overallHealth || 75) >= 70 ? 'good' :
                (insights.overallHealth || 75) >= 50 ? 'warning' : 'critical',
        description: 'Comprehensive code health score based on all metrics',
        icon: <HeartOutlined />,
        trend: 'up'
      },
      {
        label: 'Code Quality',
        value: insights.codeQuality || 70,
        target: 85,
        status: (insights.codeQuality || 70) >= 80 ? 'excellent' :
                (insights.codeQuality || 70) >= 65 ? 'good' :
                (insights.codeQuality || 70) >= 45 ? 'warning' : 'critical',
        description: 'Readability, complexity, and structure quality',
        icon: <TrophyOutlined />,
        trend: 'stable'
      },
      {
        label: 'Maintainability',
        value: insights.maintainability || 68,
        target: 75,
        status: (insights.maintainability || 68) >= 75 ? 'excellent' :
                (insights.maintainability || 68) >= 60 ? 'good' :
                (insights.maintainability || 68) >= 40 ? 'warning' : 'critical',
        description: 'How easy the code is to modify and extend',
        icon: <CodeOutlined />,
        trend: 'up'
      },
      {
        label: 'Documentation',
        value: insights.documentation || 65,
        target: 80,
        status: (insights.documentation || 65) >= 75 ? 'excellent' :
                (insights.documentation || 65) >= 60 ? 'good' :
                (insights.documentation || 65) >= 40 ? 'warning' : 'critical',
        description: 'Comment coverage and documentation quality',
        icon: <EyeOutlined />,
        trend: 'down'
      },
      {
        label: 'Test Coverage',
        value: insights.testCoverage || 82,
        target: 90,
        status: (insights.testCoverage || 82) >= 85 ? 'excellent' :
                (insights.testCoverage || 82) >= 70 ? 'good' :
                (insights.testCoverage || 82) >= 50 ? 'warning' : 'critical',
        description: 'Percentage of code covered by tests',
        icon: <SafetyOutlined />,
        trend: 'up'
      },
      {
        label: 'Security Score',
        value: insights.security || 88,
        target: 95,
        status: (insights.security || 88) >= 90 ? 'excellent' :
                (insights.security || 88) >= 80 ? 'good' :
                (insights.security || 88) >= 60 ? 'warning' : 'critical',
        description: 'Security vulnerabilities and best practices',
        icon: <SafetyOutlined />,
        trend: 'stable'
      }
    ];
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'excellent': return '#52c41a';
      case 'good': return '#1890ff';
      case 'warning': return '#faad14';
      case 'critical': return '#f5222d';
      default: return '#d9d9d9';
    }
  };

  const getStatusIcon = (status: string): React.ReactNode => {
    switch (status) {
      case 'excellent': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'good': return <CheckCircleOutlined style={{ color: '#1890ff' }} />;
      case 'warning': return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
      case 'critical': return <WarningOutlined style={{ color: '#f5222d' }} />;
      default: return <ExclamationCircleOutlined style={{ color: '#d9d9d9' }} />;
    }
  };

  const getTrendIcon = (trend?: string): React.ReactNode => {
    switch (trend) {
      case 'up': return <span style={{ color: '#52c41a' }}>↗️</span>;
      case 'down': return <span style={{ color: '#f5222d' }}>↘️</span>;
      case 'stable': return <span style={{ color: '#1890ff' }}>➡️</span>;
      default: return null;
    }
  };

  const renderHealthCard = (metric: HealthMetric) => (
    <Card
      hoverable
      size="small"
      onClick={() => setSelectedMetric(selectedMetric === metric.label ? null : metric.label)}
      style={{
        borderColor: selectedMetric === metric.label ? getStatusColor(metric.status) : undefined,
        borderWidth: selectedMetric === metric.label ? 2 : 1
      }}
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            {metric.icon}
            <Text strong style={{ fontSize: '14px' }}>{metric.label}</Text>
          </Space>
          <Space>
            {getTrendIcon(metric.trend)}
            {getStatusIcon(metric.status)}
          </Space>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: '24px', fontWeight: 'bold', color: getStatusColor(metric.status) }}>
              {metric.value}%
            </Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Target: {metric.target}%
            </Text>
          </div>

          <Progress
            percent={metric.value}
            strokeColor={getStatusColor(metric.status)}
            size="small"
            showInfo={false}
            trailColor="#f0f0f0"
            strokeWidth={6}
          />
        </div>

        {selectedMetric === metric.label && (
          <div style={{ marginTop: 8, padding: '8px', backgroundColor: '#fafafa', borderRadius: '4px' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {metric.description}
            </Text>
          </div>
        )}
      </Space>
    </Card>
  );

  const renderHotspotsCard = () => {
    if (hotspotsLoading) {
      return (
        <Card title="Code Hotspots" size="small">
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Spin size="small" />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">Loading hotspots...</Text>
            </div>
          </div>
        </Card>
      );
    }

    if (hotspotsError) {
      return (
        <Card title="Code Hotspots" size="small">
          <Alert
            message="Failed to load hotspots"
            type="error"
            action={
              <Button size="small" onClick={() => refetchHotspots()}>
                <ReloadOutlined />
              </Button>
            }
          />
        </Card>
      );
    }

    const hotspotsToShow = hotspots?.slice(0, 3) || [];

    return (
      <Card
        title={
          <Space>
            <FireOutlined style={{ color: '#f5222d' }} />
            <span>Critical Hotspots</span>
            <Badge count={hotspots?.length || 0} style={{ backgroundColor: '#f5222d' }} />
          </Space>
        }
        size="small"
        extra={
          <Button size="small" onClick={() => refetchHotspots()}>
            <ReloadOutlined />
          </Button>
        }
      >
        {hotspotsToShow.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <CheckCircleOutlined style={{ fontSize: '24px', color: '#52c41a' }} />
            <div style={{ marginTop: 8 }}>
              <Text>No critical hotspots detected!</Text>
            </div>
          </div>
        ) : (
          <List
            dataSource={hotspotsToShow}
            renderItem={(hotspot: HotspotData) => (
              <List.Item style={{ padding: '8px 0' }}>
                <List.Item.Meta
                  avatar={
                    <Avatar
                      style={{
                        backgroundColor: hotspot.severity === 'critical' ? '#f5222d' :
                                          hotspot.severity === 'high' ? '#fa8c16' :
                                          hotspot.severity === 'medium' ? '#faad14' : '#52c41a'
                      }}
                      size="small"
                    >
                      <BugOutlined />
                    </Avatar>
                  }
                  title={
                    <div>
                      <Text strong style={{ fontSize: '12px' }}>
                        {hotspot.componentName}
                      </Text>
                      <div>
                        <Tag
                          color={hotspot.severity === 'critical' ? 'red' :
                                 hotspot.severity === 'high' ? 'orange' :
                                 hotspot.severity === 'medium' ? 'yellow' : 'green'}
                        >
                          {hotspot.severity.toUpperCase()}
                        </Tag>
                      </div>
                    </div>
                  }
                  description={
                    <div>
                      <Text type="secondary" style={{ fontSize: '11px' }}>
                        {hotspot.filePath.split('/').pop()}
                      </Text>
                      <div style={{ marginTop: 4 }}>
                        <Space size="small">
                          <Tooltip title="Complexity">
                            <Tag>{hotspot.metrics.complexity}</Tag>
                          </Tooltip>
                          <Tooltip title="Readability">
                            <Tag>{hotspot.metrics.readability}%</Tag>
                          </Tooltip>
                        </Space>
                      </div>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    );
  };

  const renderSummaryCard = () => {
    const metrics = calculateHealthMetrics();
    const avgScore = Math.round(metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length);
    const criticalCount = metrics.filter(m => m.status === 'critical').length;
    const warningCount = metrics.filter(m => m.status === 'warning').length;

    return (
      <Card title="Health Summary" size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: 'bold', color: getStatusColor(
              avgScore >= 80 ? 'excellent' : avgScore >= 70 ? 'good' : avgScore >= 50 ? 'warning' : 'critical'
            )}}>
              {avgScore}%
            </div>
            <Text type="secondary">Overall Project Health</Text>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', color: '#f5222d' }}>{criticalCount}</div>
              <Text type="secondary" style={{ fontSize: '12px' }}>Critical</Text>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', color: '#faad14' }}>{warningCount}</div>
              <Text type="secondary" style={{ fontSize: '12px' }}>Warning</Text>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', color: '#52c41a' }}>{6 - criticalCount - warningCount}</div>
              <Text type="secondary" style={{ fontSize: '12px' }}>Good</Text>
            </div>
          </div>
        </Space>
      </Card>
    );
  };

  if (insightsLoading) {
    return (
      <div className={className}>
        <Row gutter={[16, 16]}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Col xs={24} sm={12} lg={8} xl={6} key={i}>
              <Card size="small">
                <Spin />
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    );
  }

  if (insightsError) {
    return (
      <div className={className}>
        <Alert
          message="Failed to Load Code Health Data"
          description={insightsError.message || 'Unknown error occurred'}
          type="error"
          action={
            <Button onClick={() => refetchInsights()}>
              <ReloadOutlined /> Retry
            </Button>
          }
        />
      </div>
    );
  }

  const healthMetrics = calculateHealthMetrics();

  return (
    <div className={className}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Health Metrics Grid */}
        <Row gutter={[16, 16]}>
          {healthMetrics.map((metric) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={metric.label}>
              {renderHealthCard(metric)}
            </Col>
          ))}
        </Row>

        {/* Summary and Hotspots */}
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8}>
            {renderSummaryCard()}
          </Col>
          <Col xs={24} lg={16}>
            {renderHotspotsCard()}
          </Col>
        </Row>
      </Space>
    </div>
  );
};

export default CodeHealthCards;