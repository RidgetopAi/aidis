import React, { useState, useEffect, useCallback } from 'react';
import { Card, Typography, Row, Col, Progress, Space, Alert, Button, Statistic, Tag, Spin } from 'antd';
import { 
  MonitorOutlined, ReloadOutlined, CheckCircleOutlined, 
  WarningOutlined, CloseCircleOutlined, DatabaseOutlined, 
  ThunderboltOutlined, ApiOutlined, ClockCircleOutlined 
} from '@ant-design/icons';
import { MonitoringApi, SystemHealth, SystemMetrics } from '../../services/monitoringApi';

const { Text } = Typography;

interface SystemMonitoringProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const SystemMonitoring: React.FC<SystemMonitoringProps> = ({ 
  autoRefresh = true, 
  refreshInterval = 30000, // 30 seconds
  className 
}) => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMonitoringData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [healthData, metricsData] = await Promise.all([
        MonitoringApi.getSystemHealth(),
        MonitoringApi.getSystemMetrics()
      ]);
      
      setHealth(healthData);
      setMetrics(metricsData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch monitoring data';
      setError(errorMessage);
      console.error('System monitoring error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonitoringData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchMonitoringData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, fetchMonitoringData]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'degraded':
        return <WarningOutlined style={{ color: '#fa8c16' }} />;
      case 'unhealthy':
        return <CloseCircleOutlined style={{ color: '#f5222d' }} />;
      default:
        return <MonitorOutlined style={{ color: '#8c8c8c' }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'success';
      case 'degraded': return 'warning';
      case 'unhealthy': return 'error';
      default: return 'default';
    }
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading && !health && !metrics) {
    return (
      <Card className={className}>
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>Loading system monitoring data...</Text>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <Alert
          message="System Monitoring Error"
          description={error}
          type="error"
          action={
            <Button size="small" onClick={fetchMonitoringData}>
              <ReloadOutlined /> Retry
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card 
      className={className}
      title={
        <Space>
          <MonitorOutlined />
          <span>System Monitoring</span>
          {health && (
            <Tag color={getStatusColor(health.status)}>
              {health.status.toUpperCase()}
            </Tag>
          )}
        </Space>
      }
      extra={
        <Button size="small" onClick={fetchMonitoringData} loading={loading}>
          <ReloadOutlined /> Refresh
        </Button>
      }
    >
      {/* Overall System Health */}
      {health && (
        <Card type="inner" title="System Health" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 16]}>
            {Object.entries(health.checks).map(([name, check]) => (
              <Col xs={12} md={6} key={name}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Space>
                    {getStatusIcon(check.status)}
                    <Text strong style={{ textTransform: 'capitalize' }}>{name}</Text>
                  </Space>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {check.message}
                  </Text>
                  {check.responseTime > 0 && (
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      {check.responseTime}ms
                    </Text>
                  )}
                </Space>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* Performance Metrics */}
      {metrics && (
        <Row gutter={[16, 16]}>
          {/* System Information */}
          <Col xs={24} md={12}>
            <Card type="inner" title="System Performance" size="small">
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Statistic
                    title="Memory Usage"
                    value={metrics.system.memory.percentage}
                    precision={1}
                    suffix="%"
                    prefix={<ThunderboltOutlined />}
                    valueStyle={{ 
                      color: metrics.system.memory.percentage > 80 ? '#f5222d' : 
                             metrics.system.memory.percentage > 60 ? '#fa8c16' : '#52c41a' 
                    }}
                  />
                  <Progress 
                    percent={metrics.system.memory.percentage} 
                    size="small" 
                    status={metrics.system.memory.percentage > 80 ? 'exception' : 'success'}
                    showInfo={false}
                  />
                  <Text type="secondary" style={{ fontSize: '11px' }}>
                    {formatBytes(metrics.system.memory.used)} / {formatBytes(metrics.system.memory.total)}
                  </Text>
                </Col>
                
                <Col span={12}>
                  <Statistic
                    title="Uptime"
                    value={formatUptime(metrics.system.uptime)}
                    prefix={<ClockCircleOutlined />}
                  />
                  <Text type="secondary" style={{ fontSize: '11px' }}>
                    PID: {metrics.system.process.pid}
                  </Text>
                </Col>
              </Row>
            </Card>
          </Col>

          {/* Database & API */}
          <Col xs={24} md={12}>
            <Card type="inner" title="Services" size="small">
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Space>
                      <DatabaseOutlined />
                      <Text strong>Database</Text>
                      <Tag color={getStatusColor(metrics.database.status)}>
                        {metrics.database.status}
                      </Tag>
                    </Space>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      Response: {metrics.database.responseTime}ms
                    </Text>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      Connections: {metrics.database.activeConnections}
                    </Text>
                  </Space>
                </Col>
                
                <Col span={12}>
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Space>
                      <ApiOutlined />
                      <Text strong>API</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      Requests: {metrics.api.requestCount}
                    </Text>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      Error Rate: {metrics.api.errorRate}%
                    </Text>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      Avg Response: {metrics.api.averageResponseTime}ms
                    </Text>
                  </Space>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      )}

      {/* Last Updated */}
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Text type="secondary" style={{ fontSize: '11px' }}>
          Last updated: {new Date().toLocaleTimeString()}
          {autoRefresh && ` • Auto-refresh: ${refreshInterval/1000}s`}
        </Text>
      </div>
    </Card>
  );
};

export default SystemMonitoring;
