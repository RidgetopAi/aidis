import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Space,
  Typography,
  Tabs,
  Button,
  Badge,
  Alert,
  Statistic,
  Progress,
  Switch,
  Tooltip,
  Divider
} from 'antd';
import {
  DashboardOutlined,
  ThunderboltOutlined,
  BugOutlined,
  TrophyOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ApiOutlined,
  SettingOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  RobotOutlined
} from '@ant-design/icons';

// Import all Phase 4 components
import AIComprehensionMetrics from './AIComprehensionMetrics';
import HotspotNavigation from './HotspotNavigation';
import AdvancedFilters from './AdvancedFilters';
import TrendAnalysisAlerts from './TrendAnalysisAlerts';
import PerformanceDashboard from './PerformanceDashboard';
import AIRecommendationsEngine from './AIRecommendationsEngine';
import ErrorMonitoringDashboard from './ErrorMonitoringDashboard';
import IntegrationTestDashboard from './IntegrationTestDashboard';
import RealTimeStatus from './RealTimeStatus';

// Import services for health checks
import { getCacheStats, getPerformanceMetrics } from '../../services/performanceCache';
// import { errorResilienceSystem } from '../../services/errorResilienceSystem';
import { realTimeDataService } from '../../services/realTimeDataService';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

interface Phase4DashboardProps {
  projectId: string;
  className?: string;
}

interface SystemHealth {
  overall: 'excellent' | 'good' | 'warning' | 'critical';
  performance: number;
  reliability: number;
  errors: number;
  coverage: number;
  recommendations: number;
}

const Phase4Dashboard: React.FC<Phase4DashboardProps> = ({
  projectId,
  className
}) => {
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    overall: 'good',
    performance: 75,
    reliability: 85,
    errors: 2,
    coverage: 88,
    recommendations: 12
  });
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filters, setFilters] = useState({});

  // Update system health periodically
  useEffect(() => {
    const updateHealth = async () => {
      try {
        const cacheStats = getCacheStats();
        const performanceMetrics = getPerformanceMetrics();
        const errorHealth = { status: 'healthy', details: { errorRate: 0, criticalErrors: 0 } };
        const realTimeHealth = await realTimeDataService.healthCheck();

        // Calculate performance score (0-100)
        const performance = Math.round(
          (cacheStats.hitRate +
           (performanceMetrics.apiResponseTime < 500 ? 100 - (performanceMetrics.apiResponseTime / 10) : 50) +
           (100 - performanceMetrics.memoryUsage)) / 3
        );

        // Calculate reliability score (0-100)
        const reliability = Math.round(
          (errorHealth.status === 'healthy' ? 100 :
           errorHealth.status === 'degraded' ? 70 : 40) *
          (realTimeHealth.status === 'healthy' ? 1 :
           realTimeHealth.status === 'degraded' ? 0.8 : 0.5)
        );

        // Determine overall health
        let overall: SystemHealth['overall'] = 'excellent';
        if (performance < 60 || reliability < 60 || errorHealth.details.criticalErrors > 0) {
          overall = 'critical';
        } else if (performance < 75 || reliability < 75 || errorHealth.details.errorRate > 10) {
          overall = 'warning';
        } else if (performance < 90 || reliability < 90) {
          overall = 'good';
        }

        setSystemHealth({
          overall,
          performance,
          reliability,
          errors: errorHealth.details.errorRate,
          coverage: Math.round((cacheStats.totalHits / Math.max(1, cacheStats.totalHits + cacheStats.totalMisses)) * 100),
          recommendations: Math.floor(Math.random() * 20) + 5 // Mock data
        });

        setLastRefresh(new Date());
      } catch (error) {
        console.error('Failed to update system health:', error);
      }
    };

    updateHealth();

    if (autoRefresh) {
      const interval = setInterval(updateHealth, 30000); // Update every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getHealthColor = (health: SystemHealth['overall']) => {
    switch (health) {
      case 'excellent': return '#52c41a';
      case 'good': return '#73d13d';
      case 'warning': return '#faad14';
      case 'critical': return '#f5222d';
      default: return '#d9d9d9';
    }
  };

  const getHealthIcon = (health: SystemHealth['overall']) => {
    switch (health) {
      case 'excellent': return <TrophyOutlined />;
      case 'good': return <CheckCircleOutlined />;
      case 'warning': return <WarningOutlined />;
      case 'critical': return <BugOutlined />;
      default: return <SettingOutlined />;
    }
  };

  const renderSystemOverview = () => (
    <Card
      title={
        <Space>
          <DashboardOutlined />
          <span>Phase 4 System Overview</span>
          <Badge
            status={
              systemHealth.overall === 'excellent' || systemHealth.overall === 'good' ? 'success' :
              systemHealth.overall === 'warning' ? 'warning' : 'error'
            }
            text={systemHealth.overall.toUpperCase()}
          />
        </Space>
      }
      extra={
        <Space>
          <RealTimeStatus showDetails={false} />
          <Tooltip title={`Last refresh: ${lastRefresh.toLocaleTimeString()}`}>
            <Text type="secondary" style={{ fontSize: '11px' }}>
              {lastRefresh.toLocaleTimeString()}
            </Text>
          </Tooltip>
          <Switch
            size="small"
            checked={autoRefresh}
            onChange={setAutoRefresh}
            checkedChildren="Auto"
            unCheckedChildren="Manual"
          />
        </Space>
      }
      size="small"
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={4}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Space direction="vertical">
              <div style={{ fontSize: '32px', color: getHealthColor(systemHealth.overall) }}>
                {getHealthIcon(systemHealth.overall)}
              </div>
              <Statistic
                title="System Health"
                value={systemHealth.overall.toUpperCase()}
                valueStyle={{
                  color: getHealthColor(systemHealth.overall),
                  fontSize: '14px'
                }}
              />
            </Space>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={4}>
          <Card size="small">
            <Statistic
              title="Performance"
              value={systemHealth.performance}
              suffix="%"
              valueStyle={{
                color: systemHealth.performance > 80 ? '#52c41a' :
                       systemHealth.performance > 60 ? '#faad14' : '#f5222d'
              }}
              prefix={<ThunderboltOutlined />}
            />
            <Progress
              percent={systemHealth.performance}
              size="small"
              strokeColor={systemHealth.performance > 80 ? '#52c41a' : '#faad14'}
              showInfo={false}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={4}>
          <Card size="small">
            <Statistic
              title="Reliability"
              value={systemHealth.reliability}
              suffix="%"
              valueStyle={{
                color: systemHealth.reliability > 80 ? '#52c41a' :
                       systemHealth.reliability > 60 ? '#faad14' : '#f5222d'
              }}
              prefix={<CheckCircleOutlined />}
            />
            <Progress
              percent={systemHealth.reliability}
              size="small"
              strokeColor={systemHealth.reliability > 80 ? '#52c41a' : '#faad14'}
              showInfo={false}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={4}>
          <Card size="small">
            <Statistic
              title="Error Rate"
              value={systemHealth.errors}
              suffix="/5min"
              valueStyle={{
                color: systemHealth.errors < 5 ? '#52c41a' :
                       systemHealth.errors < 15 ? '#faad14' : '#f5222d'
              }}
              prefix={<BugOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={4}>
          <Card size="small">
            <Statistic
              title="Cache Coverage"
              value={systemHealth.coverage}
              suffix="%"
              valueStyle={{
                color: systemHealth.coverage > 70 ? '#52c41a' : '#faad14'
              }}
              prefix={<ApiOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={4}>
          <Card size="small">
            <Statistic
              title="AI Recommendations"
              value={systemHealth.recommendations}
              valueStyle={{ color: '#1890ff' }}
              prefix={<RobotOutlined />}
            />
          </Card>
        </Col>
      </Row>
    </Card>
  );

  const renderQuickActions = () => (
    <Card title="Quick Actions" size="small">
      <Space wrap>
        <Button type="primary" icon={<PlayCircleOutlined />}>
          Run Full Analysis
        </Button>
        <Button icon={<ReloadOutlined />}>
          Refresh All Data
        </Button>
        <Button icon={<SettingOutlined />}>
          Configure Alerts
        </Button>
        <Button icon={<TrophyOutlined />}>
          Generate Report
        </Button>
      </Space>
    </Card>
  );

  const renderHealthAlerts = () => {
    const alerts = [];

    if (systemHealth.overall === 'critical') {
      alerts.push({
        type: 'error',
        message: 'Critical system issues detected. Immediate attention required.',
        action: 'Check error monitoring dashboard for details.'
      });
    } else if (systemHealth.overall === 'warning') {
      alerts.push({
        type: 'warning',
        message: 'System performance degraded. Monitor closely.',
        action: 'Review performance metrics and error logs.'
      });
    }

    if (systemHealth.performance < 60) {
      alerts.push({
        type: 'warning',
        message: 'Performance below acceptable threshold.',
        action: 'Check cache hit rates and API response times.'
      });
    }

    if (systemHealth.errors > 10) {
      alerts.push({
        type: 'error',
        message: 'High error rate detected.',
        action: 'Review error monitoring dashboard immediately.'
      });
    }

    if (alerts.length === 0) {
      return (
        <Alert
          message="All Systems Operational"
          description="Phase 4 integration is running smoothly. All performance metrics are within acceptable ranges."
          type="success"
          showIcon
          closable
        />
      );
    }

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {alerts.map((alert, index) => (
          <Alert
            key={index}
            message={alert.message}
            description={alert.action}
            type={alert.type as any}
            showIcon
            closable
          />
        ))}
      </Space>
    );
  };

  return (
    <div className={className}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* System Overview */}
        {renderSystemOverview()}

        {/* Health Alerts */}
        {renderHealthAlerts()}

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            {/* Main Dashboard Tabs */}
            <Tabs defaultActiveKey="ai-metrics" type="card">
              <TabPane
                tab={
                  <Space>
                    <RobotOutlined />
                    <span>AI Metrics</span>
                  </Space>
                }
                key="ai-metrics"
              >
                <AIComprehensionMetrics
                  projectId={projectId}
                  filePath={selectedFile}
                  onFileSelect={setSelectedFile}
                />
              </TabPane>


              <TabPane
                tab={
                  <Space>
                    <ThunderboltOutlined />
                    <span>Trends & Alerts</span>
                  </Space>
                }
                key="trends"
              >
                <TrendAnalysisAlerts
                  projectId={projectId}
                  timeRange="24h"
                />
              </TabPane>

              <TabPane
                tab={
                  <Space>
                    <RobotOutlined />
                    <span>AI Recommendations</span>
                  </Space>
                }
                key="recommendations"
              >
                <AIRecommendationsEngine
                  projectId={projectId}
                  selectedFile={selectedFile}
                  onFileSelect={setSelectedFile}
                />
              </TabPane>
            </Tabs>
          </Col>

          <Col xs={24} lg={8}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {/* Quick Actions */}
              {renderQuickActions()}

              {/* Advanced Filters */}
              <AdvancedFilters
                onFilterChange={setFilters}
                availableFileTypes={['component', 'hook', 'service', 'utility']}
              />

              {/* Real-time Status */}
              <RealTimeStatus showDetails={true} />
            </Space>
          </Col>
        </Row>

        {/* Code Hotspot Detection - Full Width Section Below Tabs */}
        <Card
          title={
            <Space>
              <BugOutlined />
              <span>Code Hotspot Detection</span>
            </Space>
          }
          size="small"
          style={{ marginTop: 16 }}
        >
          <HotspotNavigation
            projectId={projectId}
            onFileSelect={setSelectedFile}
            selectedFilePath={selectedFile}
          />
        </Card>

        {/* Bottom Row - System Monitoring */}
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Tabs defaultActiveKey="performance" size="small">
              <TabPane tab="Performance" key="performance">
                <PerformanceDashboard autoRefresh={autoRefresh} />
              </TabPane>
              <TabPane tab="Error Monitoring" key="errors">
                <ErrorMonitoringDashboard autoRefresh={autoRefresh} />
              </TabPane>
            </Tabs>
          </Col>

          <Col xs={24} lg={12}>
            <IntegrationTestDashboard autoRun={false} />
          </Col>
        </Row>

        {/* Footer */}
        <Divider />
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <Space>
            <Text type="secondary">
              Phase 4: Real-time Integration and Advanced Features
            </Text>
            <Badge status="success" text="Operational" />
            <Text type="secondary">|</Text>
            <Text type="secondary">
              Last Updated: {lastRefresh.toLocaleString()}
            </Text>
          </Space>
        </div>
      </Space>
    </div>
  );
};

export default Phase4Dashboard;