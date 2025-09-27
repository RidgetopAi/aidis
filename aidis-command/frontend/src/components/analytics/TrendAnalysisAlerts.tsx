import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Space,
  Typography,
  Row,
  Col,
  Alert,
  Button,
  Badge,
  Tag,
  Statistic,
  Progress,
  Timeline,
  Tabs,
  Select,
  Switch,
  Slider,
  Modal,
  List,
  Tooltip,
  Divider,
  notification,
  Form,
  Input,
  InputNumber
} from 'antd';
import {
  ArrowUpOutlined as TrendingUpOutlined,
  ArrowDownOutlined as TrendingDownOutlined,
  WarningOutlined,
  BellOutlined,
  LineChartOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  FireOutlined,
  BugOutlined
} from '@ant-design/icons';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
  Bar
} from 'recharts';
import { useCodeHealthTrends } from '../../hooks/useAIComprehension';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

export interface TrendAlert {
  id: string;
  type: 'threshold' | 'trend' | 'pattern' | 'anomaly';
  severity: 'info' | 'warning' | 'error' | 'critical';
  metric: string;
  condition: string;
  value: number;
  threshold: number;
  message: string;
  timestamp: Date;
  isActive: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export interface AlertRule {
  id: string;
  name: string;
  type: 'threshold' | 'trend' | 'pattern' | 'anomaly';
  metric: 'complexity' | 'readability' | 'maintainability' | 'coverage' | 'hotspots';
  condition: 'gt' | 'lt' | 'eq' | 'increasing' | 'decreasing' | 'spike' | 'drop';
  threshold: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  enabled: boolean;
  notificationChannels: ('browser' | 'email' | 'slack')[];
  cooldownMinutes: number;
}

interface TrendAnalysisAlertsProps {
  projectId: string;
  timeRange?: '1h' | '6h' | '24h' | '7d' | '30d';
  onAlertClick?: (alert: TrendAlert) => void;
  className?: string;
}

const TrendAnalysisAlerts: React.FC<TrendAnalysisAlertsProps> = ({
  projectId,
  timeRange = '24h',
  onAlertClick,
  className
}) => {
  const [alerts, setAlerts] = useState<TrendAlert[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [lastAnalysisTime, setLastAnalysisTime] = useState<Date>(new Date());
  const [alertStats, setAlertStats] = useState({
    total: 0,
    active: 0,
    critical: 0,
    acknowledged: 0
  });

  const {
    data: trendsData,
    isLoading,
    error,
    refetch
  } = useCodeHealthTrends(projectId, selectedTimeRange);

  // Initialize default alert rules
  useEffect(() => {
    const defaultRules: AlertRule[] = [
      {
        id: 'complexity-threshold',
        name: 'High Complexity Threshold',
        type: 'threshold',
        metric: 'complexity',
        condition: 'gt',
        threshold: 10,
        severity: 'warning',
        enabled: true,
        notificationChannels: ['browser'],
        cooldownMinutes: 30
      },
      {
        id: 'readability-drop',
        name: 'Readability Score Drop',
        type: 'trend',
        metric: 'readability',
        condition: 'decreasing',
        threshold: 5,
        severity: 'warning',
        enabled: true,
        notificationChannels: ['browser'],
        cooldownMinutes: 60
      },
      {
        id: 'critical-hotspots',
        name: 'Critical Hotspots Spike',
        type: 'pattern',
        metric: 'hotspots',
        condition: 'spike',
        threshold: 3,
        severity: 'critical',
        enabled: true,
        notificationChannels: ['browser'],
        cooldownMinutes: 15
      }
    ];
    setAlertRules(defaultRules);
  }, []);

  // Analyze trends and generate alerts
  const analyzeAndGenerateAlerts = useCallback(() => {
    if (!trendsData || trendsData.length < 2) return;

    const newAlerts: TrendAlert[] = [];
    const now = new Date();

    alertRules.forEach(rule => {
      if (!rule.enabled) return;

      const recentData = trendsData.slice(-5); // Last 5 data points
      const latest = recentData[recentData.length - 1];
      const previous = recentData[recentData.length - 2];

      let shouldAlert = false;
      let alertMessage = '';
      let currentValue = 0;

      switch (rule.metric) {
        case 'complexity':
          currentValue = latest.complexityIndex;
          if (rule.condition === 'gt' && currentValue > rule.threshold) {
            shouldAlert = true;
            alertMessage = `Complexity index (${currentValue.toFixed(1)}) exceeds threshold (${rule.threshold})`;
          }
          break;

        case 'readability':
          currentValue = latest.readabilityScore;
          if (rule.condition === 'decreasing') {
            const trend = currentValue - previous.readabilityScore;
            if (trend < -rule.threshold) {
              shouldAlert = true;
              alertMessage = `Readability score dropped by ${Math.abs(trend).toFixed(1)} points`;
            }
          }
          break;

        case 'maintainability':
          currentValue = latest.commentQuality;
          if (rule.condition === 'lt' && currentValue < rule.threshold) {
            shouldAlert = true;
            alertMessage = `Maintainability score (${currentValue.toFixed(1)}) below threshold (${rule.threshold})`;
          }
          break;
      }

      if (shouldAlert) {
        // Check for existing similar alert in cooldown period
        const existingAlert = alerts.find(a =>
          a.metric === rule.metric &&
          a.isActive &&
          (now.getTime() - a.timestamp.getTime()) < (rule.cooldownMinutes * 60 * 1000)
        );

        if (!existingAlert) {
          const newAlert: TrendAlert = {
            id: `${rule.id}-${now.getTime()}`,
            type: rule.type,
            severity: rule.severity,
            metric: rule.metric,
            condition: rule.condition,
            value: currentValue,
            threshold: rule.threshold,
            message: alertMessage,
            timestamp: now,
            isActive: true
          };

          newAlerts.push(newAlert);

          // Show browser notification
          if (rule.notificationChannels.includes('browser') && alertsEnabled) {
            notification[rule.severity === 'critical' ? 'error' : rule.severity === 'warning' ? 'warning' : 'info']({
              message: rule.name,
              description: alertMessage,
              placement: 'topRight',
              duration: rule.severity === 'critical' ? 0 : 6
            });
          }
        }
      }
    });

    if (newAlerts.length > 0) {
      setAlerts(prev => [...prev, ...newAlerts]);
    }
  }, [trendsData, alertRules, alerts, alertsEnabled]);

  // Run analysis when trends data changes
  useEffect(() => {
    if (trendsData && alertsEnabled) {
      analyzeAndGenerateAlerts();
      setLastAnalysisTime(new Date());
    }
  }, [trendsData, analyzeAndGenerateAlerts, alertsEnabled]);

  // Update alert statistics
  useEffect(() => {
    const total = alerts.length;
    const active = alerts.filter(a => a.isActive).length;
    const critical = alerts.filter(a => a.severity === 'critical' && a.isActive).length;
    const acknowledged = alerts.filter(a => a.acknowledgedBy).length;

    setAlertStats({ total, active, critical, acknowledged });
  }, [alerts]);

  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts(prev => prev.map(alert =>
      alert.id === alertId
        ? { ...alert, acknowledgedBy: 'user', acknowledgedAt: new Date(), isActive: false }
        : alert
    ));
  };

  const handleDismissAlert = (alertId: string) => {
    setAlerts(prev => prev.map(alert =>
      alert.id === alertId
        ? { ...alert, isActive: false }
        : alert
    ));
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#f5222d';
      case 'error': return '#ff4d4f';
      case 'warning': return '#faad14';
      case 'info': return '#1890ff';
      default: return '#d9d9d9';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <FireOutlined />;
      case 'error': return <CloseCircleOutlined />;
      case 'warning': return <WarningOutlined />;
      case 'info': return <CheckCircleOutlined />;
      default: return <CheckCircleOutlined />;
    }
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return <TrendingUpOutlined style={{ color: '#52c41a' }} />;
      case 'down': return <TrendingDownOutlined style={{ color: '#f5222d' }} />;
      default: return <LineChartOutlined style={{ color: '#faad14' }} />;
    }
  };

  const calculateTrend = (data: any[], metric: string) => {
    if (!data || data.length < 2) return 'stable';

    const recent = data.slice(-3);
    const values = recent.map(d => d[metric]).filter(v => v !== undefined);

    if (values.length < 2) return 'stable';

    const trend = values[values.length - 1] - values[0];
    const threshold = Math.abs(values[0] * 0.05); // 5% change threshold

    if (trend > threshold) return 'up';
    if (trend < -threshold) return 'down';
    return 'stable';
  };

  const renderTrendCharts = () => {
    if (!trendsData || trendsData.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <LineChartOutlined style={{ fontSize: '48px', color: '#d9d9d9' }} />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">No trend data available</Text>
          </div>
        </div>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={trendsData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value) => new Date(value).toLocaleDateString()}
          />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <RechartsTooltip
            labelFormatter={(value) => new Date(value).toLocaleString()}
            formatter={(value: any, name: string) => [
              typeof value === 'number' ? value.toFixed(2) : value,
              name
            ]}
          />
          <Legend />

          <Area
            yAxisId="left"
            type="monotone"
            dataKey="readabilityScore"
            fill="#52c41a"
            fillOpacity={0.3}
            stroke="#52c41a"
            name="Readability"
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="complexityIndex"
            stroke="#f5222d"
            strokeWidth={2}
            name="Complexity"
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="commentQuality"
            stroke="#1890ff"
            strokeWidth={2}
            name="Comment Quality"
          />
          <Bar
            yAxisId="right"
            dataKey="apiDesignQuality"
            fill="#faad14"
            opacity={0.8}
            name="API Design"
          />
        </ComposedChart>
      </ResponsiveContainer>
    );
  };

  const renderActiveAlerts = () => {
    const activeAlerts = alerts.filter(a => a.isActive);

    if (activeAlerts.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <CheckCircleOutlined style={{ fontSize: '32px', color: '#52c41a' }} />
          <div style={{ marginTop: 8 }}>
            <Text>No active alerts</Text>
          </div>
        </div>
      );
    }

    return (
      <List
        size="small"
        dataSource={activeAlerts.slice(0, 10)} // Show latest 10
        renderItem={(alert) => (
          <List.Item
            actions={[
              <Button
                type="link"
                size="small"
                onClick={() => handleAcknowledgeAlert(alert.id)}
              >
                Acknowledge
              </Button>,
              <Button
                type="link"
                size="small"
                onClick={() => handleDismissAlert(alert.id)}
              >
                Dismiss
              </Button>
            ]}
          >
            <List.Item.Meta
              avatar={
                <Badge
                  dot
                  color={getSeverityColor(alert.severity)}
                  style={{ marginTop: 8 }}
                />
              }
              title={
                <Space>
                  <span style={{ color: getSeverityColor(alert.severity) }}>
                    {getSeverityIcon(alert.severity)}
                  </span>
                  <Text strong>{alert.message}</Text>
                  <Tag color={getSeverityColor(alert.severity)}>
                    {alert.severity.toUpperCase()}
                  </Tag>
                </Space>
              }
              description={
                <Space>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {alert.timestamp.toLocaleString()}
                  </Text>
                  <Tag>{alert.metric}</Tag>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    Value: {alert.value.toFixed(2)} | Threshold: {alert.threshold}
                  </Text>
                </Space>
              }
            />
          </List.Item>
        )}
      />
    );
  };

  const renderMetricSummary = () => {
    if (!trendsData || trendsData.length === 0) return null;

    const latest = trendsData[trendsData.length - 1];

    return (
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Readability"
              value={latest.readabilityScore}
              suffix="%"
              prefix={getTrendIcon(calculateTrend(trendsData, 'readabilityScore'))}
              valueStyle={{
                color: latest.readabilityScore > 70 ? '#52c41a' :
                       latest.readabilityScore > 50 ? '#faad14' : '#f5222d'
              }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Complexity"
              value={latest.complexityIndex}
              prefix={getTrendIcon(calculateTrend(trendsData, 'complexityIndex'))}
              valueStyle={{
                color: latest.complexityIndex < 5 ? '#52c41a' :
                       latest.complexityIndex < 10 ? '#faad14' : '#f5222d'
              }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Comment Quality"
              value={latest.commentQuality}
              suffix="%"
              prefix={getTrendIcon(calculateTrend(trendsData, 'commentQuality'))}
              valueStyle={{
                color: latest.commentQuality > 60 ? '#52c41a' :
                       latest.commentQuality > 40 ? '#faad14' : '#f5222d'
              }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="API Design"
              value={latest.apiDesignQuality}
              suffix="%"
              prefix={getTrendIcon(calculateTrend(trendsData, 'apiDesignQuality'))}
              valueStyle={{
                color: latest.apiDesignQuality > 70 ? '#52c41a' :
                       latest.apiDesignQuality > 50 ? '#faad14' : '#f5222d'
              }}
            />
          </Card>
        </Col>
      </Row>
    );
  };

  const renderAlertConfiguration = () => (
    <Modal
      title="Alert Configuration"
      open={configModalVisible}
      onCancel={() => setConfigModalVisible(false)}
      width={800}
      footer={null}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <Space align="center">
            <Text strong>Enable Alerts:</Text>
            <Switch
              checked={alertsEnabled}
              onChange={setAlertsEnabled}
            />
          </Space>
        </div>

        <Divider />

        <div>
          <Title level={5}>Alert Rules</Title>
          <List
            dataSource={alertRules}
            renderItem={(rule) => (
              <List.Item
                actions={[
                  <Switch
                    size="small"
                    checked={rule.enabled}
                    onChange={(checked) => {
                      setAlertRules(prev => prev.map(r =>
                        r.id === rule.id ? { ...r, enabled: checked } : r
                      ));
                    }}
                  />
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong>{rule.name}</Text>
                      <Tag color={getSeverityColor(rule.severity)}>
                        {rule.severity}
                      </Tag>
                    </Space>
                  }
                  description={
                    <Text type="secondary">
                      {rule.metric} {rule.condition} {rule.threshold} - Cooldown: {rule.cooldownMinutes}min
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      </Space>
    </Modal>
  );

  return (
    <Card
      className={className}
      title={
        <Space>
          <LineChartOutlined />
          <span>Trend Analysis & Alerts</span>
          {alertStats.active > 0 && (
            <Badge count={alertStats.active} style={{ backgroundColor: '#f5222d' }} />
          )}
        </Space>
      }
      extra={
        <Space>
          <Select
            size="small"
            value={selectedTimeRange}
            onChange={(value) => setSelectedTimeRange(value)}
            style={{ width: 80 }}
          >
            <Select.Option value="1h">1H</Select.Option>
            <Select.Option value="6h">6H</Select.Option>
            <Select.Option value="24h">24H</Select.Option>
            <Select.Option value="7d">7D</Select.Option>
            <Select.Option value="30d">30D</Select.Option>
          </Select>
          <Button
            size="small"
            icon={<SettingOutlined />}
            onClick={() => setConfigModalVisible(true)}
          >
            Config
          </Button>
          <Tooltip title={`Last analysis: ${lastAnalysisTime.toLocaleTimeString()}`}>
            <Button
              size="small"
              icon={<BellOutlined />}
              type={alertsEnabled ? "primary" : "default"}
              onClick={() => setAlertsEnabled(!alertsEnabled)}
            >
              Alerts {alertsEnabled ? 'ON' : 'OFF'}
            </Button>
          </Tooltip>
        </Space>
      }
    >
      <Tabs defaultActiveKey="trends">
        <TabPane tab="Trends" key="trends">
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {renderMetricSummary()}
            <div style={{ height: 400 }}>
              {renderTrendCharts()}
            </div>
          </Space>
        </TabPane>

        <TabPane
          tab={
            <Badge count={alertStats.active} size="small">
              <span>Active Alerts</span>
            </Badge>
          }
          key="alerts"
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Row gutter={16}>
              <Col span={6}>
                <Statistic
                  title="Total Alerts"
                  value={alertStats.total}
                  prefix={<BellOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Active"
                  value={alertStats.active}
                  prefix={<AlertOutlined />}
                  valueStyle={{ color: alertStats.active > 0 ? '#f5222d' : '#52c41a' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Critical"
                  value={alertStats.critical}
                  prefix={<FireOutlined />}
                  valueStyle={{ color: '#f5222d' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Acknowledged"
                  value={alertStats.acknowledged}
                  prefix={<CheckCircleOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
            </Row>

            <Divider />

            {renderActiveAlerts()}
          </Space>
        </TabPane>

        <TabPane tab="History" key="history">
          <Timeline>
            {alerts.slice(-10).reverse().map((alert) => (
              <Timeline.Item
                key={alert.id}
                color={getSeverityColor(alert.severity)}
                dot={getSeverityIcon(alert.severity)}
              >
                <Space direction="vertical" size="small">
                  <Space>
                    <Text strong>{alert.message}</Text>
                    <Tag color={getSeverityColor(alert.severity)}>
                      {alert.severity}
                    </Tag>
                    {alert.acknowledgedBy && (
                      <Tag color="green">Acknowledged</Tag>
                    )}
                  </Space>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {alert.timestamp.toLocaleString()} - {alert.metric} |
                    Value: {alert.value.toFixed(2)} | Threshold: {alert.threshold}
                  </Text>
                </Space>
              </Timeline.Item>
            ))}
          </Timeline>
        </TabPane>
      </Tabs>

      {renderAlertConfiguration()}
    </Card>
  );
};

export default TrendAnalysisAlerts;