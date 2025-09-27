import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Switch,
  Select,
  Space,
  Typography,
  Tag,
  Button,
  Tooltip,
  Badge,
  Alert,
  Progress,
  Statistic,
  Modal,
  List,
  Timeline
} from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
  WifiOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  SettingOutlined,
  BellOutlined
} from '@ant-design/icons';

const { Text, Title } = Typography;
const { Option } = Select;

interface LiveUpdateManagerProps {
  onRefreshTrigger?: () => void;
  className?: string;
}

interface UpdateEvent {
  id: string;
  timestamp: string;
  type: 'data_refresh' | 'error' | 'status_change' | 'metric_alert';
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  source: string;
}

interface RefreshSettings {
  interval: number;
  autoRefresh: boolean;
  components: string[];
  alertThresholds: {
    complexity: number;
    readability: number;
    hotspots: number;
  };
}

const LiveUpdateManager: React.FC<LiveUpdateManagerProps> = ({
  onRefreshTrigger,
  className
}) => {
  const [isLive, setIsLive] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [events, setEvents] = useState<UpdateEvent[]>([]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  const [nextUpdate, setNextUpdate] = useState<number>(0);

  const [settings, setSettings] = useState<RefreshSettings>({
    interval: 30,
    autoRefresh: true,
    components: ['metrics', 'hotspots', 'trends', 'components'],
    alertThresholds: {
      complexity: 15,
      readability: 50,
      hotspots: 5
    }
  });

  // Timer for countdown
  useEffect(() => {
    if (!isLive) return;

    const timer = setInterval(() => {
      setNextUpdate(prev => {
        if (prev <= 1) {
          triggerRefresh();
          return refreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLive, refreshInterval]);

  // Initialize countdown when live updates start
  useEffect(() => {
    if (isLive) {
      setNextUpdate(refreshInterval);
    }
  }, [isLive, refreshInterval]);

  const addEvent = useCallback((event: Omit<UpdateEvent, 'id' | 'timestamp'>) => {
    const newEvent: UpdateEvent = {
      ...event,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString()
    };

    setEvents(prev => [newEvent, ...prev.slice(0, 49)]); // Keep last 50 events
  }, []);

  const triggerRefresh = useCallback(() => {
    setLastUpdate(new Date());
    setUpdateCount(prev => prev + 1);
    setConnectionStatus('connected');

    // Simulate API calls
    addEvent({
      type: 'data_refresh',
      message: `Refreshed ${settings.components.length} components`,
      severity: 'success',
      source: 'Auto-refresh'
    });

    // Trigger external refresh callback
    onRefreshTrigger?.();

    // Simulate occasional alerts
    if (Math.random() < 0.1) {
      addEvent({
        type: 'metric_alert',
        message: 'High complexity detected in DataProcessor component',
        severity: 'warning',
        source: 'Hotspot Detection'
      });
    }
  }, [settings.components.length, onRefreshTrigger, addEvent]);

  const handleLiveToggle = (checked: boolean) => {
    setIsLive(checked);

    if (checked) {
      addEvent({
        type: 'status_change',
        message: 'Live updates enabled',
        severity: 'info',
        source: 'User Action'
      });
      setConnectionStatus('connected');
      setNextUpdate(refreshInterval);
    } else {
      addEvent({
        type: 'status_change',
        message: 'Live updates disabled',
        severity: 'info',
        source: 'User Action'
      });
      setConnectionStatus('disconnected');
      setNextUpdate(0);
    }
  };

  const handleManualRefresh = () => {
    if (isLive) {
      setNextUpdate(refreshInterval); // Reset countdown
    }
    triggerRefresh();
  };

  const handleIntervalChange = (value: number) => {
    setRefreshInterval(value);
    setSettings(prev => ({ ...prev, interval: value }));

    if (isLive) {
      setNextUpdate(value);
    }

    addEvent({
      type: 'status_change',
      message: `Refresh interval changed to ${value} seconds`,
      severity: 'info',
      source: 'Settings'
    });
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return '#52c41a';
      case 'error': return '#f5222d';
      default: return '#d9d9d9';
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <WifiOutlined />;
      case 'error': return <AlertOutlined />;
      default: return <WifiOutlined />;
    }
  };

  const formatTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const past = new Date(timestamp);
    const seconds = Math.floor((now.getTime() - past.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const renderEventIcon = (type: string, severity: string) => {
    switch (type) {
      case 'data_refresh': return <SyncOutlined style={{ color: '#52c41a' }} />;
      case 'error': return <AlertOutlined style={{ color: '#f5222d' }} />;
      case 'metric_alert': return <BellOutlined style={{ color: '#fa8c16' }} />;
      case 'status_change': return <CheckCircleOutlined style={{ color: '#1890ff' }} />;
      default: return <CheckCircleOutlined />;
    }
  };

  const renderSettingsModal = () => (
    <Modal
      title="Live Update Settings"
      open={settingsVisible}
      onCancel={() => setSettingsVisible(false)}
      onOk={() => setSettingsVisible(false)}
      width={600}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <Title level={5}>Refresh Configuration</Title>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>Auto-refresh enabled:</Text>
              <Switch
                checked={settings.autoRefresh}
                onChange={(checked) => setSettings(prev => ({ ...prev, autoRefresh: checked }))}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>Refresh interval:</Text>
              <Select
                value={settings.interval}
                onChange={(value) => setSettings(prev => ({ ...prev, interval: value }))}
                style={{ width: 120 }}
              >
                <Option value={10}>10 seconds</Option>
                <Option value={30}>30 seconds</Option>
                <Option value={60}>1 minute</Option>
                <Option value={300}>5 minutes</Option>
                <Option value={600}>10 minutes</Option>
              </Select>
            </div>
          </Space>
        </div>

        <div>
          <Title level={5}>Alert Thresholds</Title>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>Complexity alert threshold:</Text>
              <Select
                value={settings.alertThresholds.complexity}
                onChange={(value) => setSettings(prev => ({
                  ...prev,
                  alertThresholds: { ...prev.alertThresholds, complexity: value }
                }))}
                style={{ width: 80 }}
              >
                <Option value={10}>10</Option>
                <Option value={15}>15</Option>
                <Option value={20}>20</Option>
                <Option value={25}>25</Option>
              </Select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>Readability alert threshold:</Text>
              <Select
                value={settings.alertThresholds.readability}
                onChange={(value) => setSettings(prev => ({
                  ...prev,
                  alertThresholds: { ...prev.alertThresholds, readability: value }
                }))}
                style={{ width: 80 }}
              >
                <Option value={30}>30%</Option>
                <Option value={40}>40%</Option>
                <Option value={50}>50%</Option>
                <Option value={60}>60%</Option>
              </Select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>Hotspots alert threshold:</Text>
              <Select
                value={settings.alertThresholds.hotspots}
                onChange={(value) => setSettings(prev => ({
                  ...prev,
                  alertThresholds: { ...prev.alertThresholds, hotspots: value }
                }))}
                style={{ width: 80 }}
              >
                <Option value={3}>3</Option>
                <Option value={5}>5</Option>
                <Option value={10}>10</Option>
                <Option value={20}>20</Option>
              </Select>
            </div>
          </Space>
        </div>
      </Space>
    </Modal>
  );

  return (
    <>
      <Card
        className={className}
        size="small"
        title={
          <Space>
            <span style={{ color: getStatusColor() }}>
              {getStatusIcon()}
            </span>
            <span>Live Updates</span>
            <Badge
              status={isLive ? 'processing' : 'default'}
              text={isLive ? 'Active' : 'Inactive'}
            />
          </Space>
        }
        extra={
          <Button
            size="small"
            icon={<SettingOutlined />}
            onClick={() => setSettingsVisible(true)}
          />
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Tooltip title={isLive ? 'Disable live updates' : 'Enable live updates'}>
                <Switch
                  checked={isLive}
                  onChange={handleLiveToggle}
                  checkedChildren={<PlayCircleOutlined />}
                  unCheckedChildren={<PauseCircleOutlined />}
                />
              </Tooltip>
              <Select
                value={refreshInterval}
                onChange={handleIntervalChange}
                size="small"
                style={{ width: 100 }}
                disabled={!isLive}
              >
                <Option value={10}>10s</Option>
                <Option value={30}>30s</Option>
                <Option value={60}>1m</Option>
                <Option value={300}>5m</Option>
              </Select>
            </Space>

            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={handleManualRefresh}
              loading={false}
            >
              Refresh
            </Button>
          </div>

          {/* Status */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Status: <span style={{ color: getStatusColor() }}>{connectionStatus}</span>
              </Text>
            </div>
            {isLive && (
              <div>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  Next update in: <Text strong>{nextUpdate}s</Text>
                </Text>
              </div>
            )}
          </div>

          {/* Progress bar for countdown */}
          {isLive && (
            <Progress
              percent={((refreshInterval - nextUpdate) / refreshInterval) * 100}
              showInfo={false}
              size="small"
              strokeColor="#52c41a"
            />
          )}

          {/* Statistics */}
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            <Statistic
              title="Updates"
              value={updateCount}
              prefix={<SyncOutlined />}
              valueStyle={{ fontSize: '16px' }}
            />
            <Statistic
              title="Last Update"
              value={lastUpdate ? formatTimeAgo(lastUpdate.toISOString()) : 'Never'}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ fontSize: '16px' }}
            />
          </div>

          {/* Recent Events */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ fontSize: '12px' }}>Recent Events</Text>
              <Badge count={events.length} style={{ backgroundColor: '#1890ff' }} />
            </div>

            {events.length === 0 ? (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                No events yet
              </Text>
            ) : (
              <List
                size="small"
                dataSource={events.slice(0, 3)}
                renderItem={(event) => (
                  <List.Item style={{ padding: '4px 0' }}>
                    <List.Item.Meta
                      avatar={renderEventIcon(event.type, event.severity)}
                      title={
                        <Text style={{ fontSize: '11px' }}>
                          {event.message}
                        </Text>
                      }
                      description={
                        <Space>
                          <Text type="secondary" style={{ fontSize: '10px' }}>
                            {formatTimeAgo(event.timestamp)}
                          </Text>
                          <Tag color="blue">
                            {event.source}
                          </Tag>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </div>

          {/* Connection Warning */}
          {connectionStatus === 'error' && (
            <Alert
              message="Connection Issue"
              description="Unable to fetch latest data. Retrying..."
              type="warning"
              showIcon
            />
          )}
        </Space>
      </Card>

      {renderSettingsModal()}
    </>
  );
};

export default LiveUpdateManager;