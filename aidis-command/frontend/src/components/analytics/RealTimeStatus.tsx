import React from 'react';
import {
  Card,
  Space,
  Statistic,
  Badge,
  Tooltip,
  Typography,
  Progress,
  Row,
  Col,
  Alert
} from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ApiOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import { useRealTimeServiceHealth } from '../../hooks/useAIComprehension';

const { Text } = Typography;

interface RealTimeStatusProps {
  className?: string;
  showDetails?: boolean;
}

const RealTimeStatus: React.FC<RealTimeStatusProps> = ({
  className,
  showDetails = false
}) => {
  const health = useRealTimeServiceHealth();

  if (!health) {
    return (
      <Card className={className} size="small">
        <div style={{ textAlign: 'center', padding: '8px' }}>
          <Text type="secondary">Checking service health...</Text>
        </div>
      </Card>
    );
  }

  const { status, metrics, cacheStats } = health;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#52c41a';
      case 'degraded': return '#faad14';
      case 'unhealthy': return '#f5222d';
      default: return '#d9d9d9';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircleOutlined />;
      case 'degraded': return <WarningOutlined />;
      case 'unhealthy': return <CloseCircleOutlined />;
      default: return <ClockCircleOutlined />;
    }
  };

  const successRate = metrics.totalRequests > 0
    ? (metrics.successfulRequests / metrics.totalRequests) * 100
    : 100;

  if (!showDetails) {
    // Compact status indicator
    return (
      <Tooltip
        title={
          <div>
            <div>Status: {status}</div>
            <div>Requests: {metrics.totalRequests}</div>
            <div>Success Rate: {successRate.toFixed(1)}%</div>
            <div>Avg Response: {metrics.averageResponseTime.toFixed(0)}ms</div>
            <div>Cache Hits: {(metrics.cacheHitRate * 100).toFixed(1)}%</div>
          </div>
        }
      >
        <Badge
          status={status === 'healthy' ? 'success' : status === 'degraded' ? 'warning' : 'error'}
          text={
            <Space size={4}>
              <Text style={{ fontSize: '12px' }}>Real-time</Text>
              <Text style={{ fontSize: '10px', color: getStatusColor(status) }}>
                {status.toUpperCase()}
              </Text>
            </Space>
          }
        />
      </Tooltip>
    );
  }

  // Detailed status card
  return (
    <Card
      className={className}
      size="small"
      title={
        <Space>
          <span style={{ color: getStatusColor(status) }}>
            {getStatusIcon(status)}
          </span>
          <span>Real-time Data Service</span>
          <Badge
            status={status === 'healthy' ? 'success' : status === 'degraded' ? 'warning' : 'error'}
            text={status.toUpperCase()}
          />
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* Performance Metrics */}
        <Row gutter={[8, 8]}>
          <Col xs={12} sm={6}>
            <Statistic
              title="Requests"
              value={metrics.totalRequests}
              prefix={<ApiOutlined />}
              valueStyle={{ fontSize: '14px' }}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title="Success Rate"
              value={successRate}
              suffix="%"
              valueStyle={{
                fontSize: '14px',
                color: successRate >= 95 ? '#52c41a' : successRate >= 80 ? '#faad14' : '#f5222d'
              }}
              prefix={<CheckCircleOutlined />}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title="Avg Response"
              value={metrics.averageResponseTime}
              suffix="ms"
              valueStyle={{
                fontSize: '14px',
                color: metrics.averageResponseTime < 500 ? '#52c41a' :
                       metrics.averageResponseTime < 1000 ? '#faad14' : '#f5222d'
              }}
              prefix={<ThunderboltOutlined />}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title="Cache Hits"
              value={(metrics.cacheHitRate * 100)}
              suffix="%"
              valueStyle={{
                fontSize: '14px',
                color: metrics.cacheHitRate > 0.7 ? '#52c41a' : '#faad14'
              }}
              prefix={<DatabaseOutlined />}
            />
          </Col>
        </Row>

        {/* Cache Statistics */}
        <div>
          <Text strong style={{ fontSize: '12px' }}>Cache Status:</Text>
          <Space style={{ marginLeft: 8 }}>
            <Text style={{ fontSize: '11px' }}>
              {cacheStats.size} entries cached
            </Text>
            <Text type="secondary" style={{ fontSize: '11px' }}>
              Last update: {metrics.lastUpdate.toLocaleTimeString()}
            </Text>
          </Space>
        </div>

        {/* Health Alerts */}
        {status === 'degraded' && (
          <Alert
            message="Service Degraded"
            description="Performance below optimal levels. Some requests may be slower than usual."
            type="warning"
            showIcon
          />
        )}

        {status === 'unhealthy' && (
          <Alert
            message="Service Issues Detected"
            description="High error rate or response times. Using cached data when available."
            type="error"
            showIcon
          />
        )}

        {/* Performance Progress Bars */}
        <div>
          <div style={{ marginBottom: 4 }}>
            <Text style={{ fontSize: '11px' }}>Response Time</Text>
            <Progress
              percent={Math.min(100, (1000 - metrics.averageResponseTime) / 10)}
              size="small"
              strokeColor={metrics.averageResponseTime < 500 ? '#52c41a' : '#faad14'}
              showInfo={false}
            />
          </div>
          <div>
            <Text style={{ fontSize: '11px' }}>Cache Efficiency</Text>
            <Progress
              percent={metrics.cacheHitRate * 100}
              size="small"
              strokeColor="#1890ff"
              showInfo={false}
            />
          </div>
        </div>
      </Space>
    </Card>
  );
};

export default RealTimeStatus;