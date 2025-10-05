import React, { useState, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Select,
  Space,
  Typography,
  Spin,
  Alert,
  Button,
  Statistic,
} from 'antd';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  RocketOutlined,
  FireOutlined,
  CodeOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useSessionAnalytics, useSessionTrends } from '../hooks/useSessionAnalytics';
import { useProjectContext } from '../contexts/ProjectContext';

const { Title, Text } = Typography;
const { Option } = Select;

type TimeRange = 7 | 30 | 90;

const Analytics: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>(30);
  const { currentProject } = useProjectContext();

  // Fetch analytics data
  const {
    data: analytics,
    isLoading: analyticsLoading,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useSessionAnalytics(currentProject?.id);

  const {
    data: trends,
    isLoading: trendsLoading,
    refetch: refetchTrends,
  } = useSessionTrends(timeRange, currentProject?.id);

  // Process trends data for chart
  const chartData = useMemo(() => {
    if (!trends || !Array.isArray(trends)) return [];

    return trends.map((trend) => ({
      date: new Date(trend.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(timeRange === 90 && { year: '2-digit' }),
      }),
      sessions: trend.session_count,
      tokens: Math.round(trend.total_tokens_used / 1000), // Convert to thousands
      contexts: trend.total_contexts,
      tasks: trend.total_tasks_created,
    }));
  }, [trends, timeRange]);

  const handleRefresh = () => {
    refetchAnalytics();
    refetchTrends();
  };

  const isLoading = analyticsLoading || trendsLoading;

  if (analyticsError) {
    return (
      <div style={{ padding: '24px' }}>
        <Alert
          message="Failed to Load Analytics"
          description={analyticsError.message || 'Unknown error occurred'}
          type="error"
          action={
            <Button onClick={handleRefresh}>
              <ReloadOutlined /> Retry
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space direction="vertical">
            <Title level={2}>Session Analytics</Title>
            <Text type="secondary">
              {currentProject
                ? `Analytics for ${currentProject.name}`
                : 'Analytics across all projects'}
            </Text>
          </Space>
          <Space>
            <Select
              value={timeRange}
              onChange={(value: TimeRange) => setTimeRange(value)}
              style={{ width: 120 }}
              suffixIcon={<CalendarOutlined />}
            >
              <Option value={7}>Last 7 Days</Option>
              <Option value={30}>Last 30 Days</Option>
              <Option value={90}>Last 90 Days</Option>
            </Select>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={isLoading}
            >
              Refresh
            </Button>
          </Space>
        </Space>

        {/* Stats Cards */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Total Sessions"
                value={analytics?.total_sessions ?? 0}
                prefix={<RocketOutlined />}
                loading={analyticsLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Total Tokens"
                value={analytics?.total_tokens_used ?? 0}
                prefix={<FireOutlined />}
                valueStyle={{ color: '#ff4d4f' }}
                formatter={(value) => (value as number).toLocaleString()}
                loading={analyticsLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Total Contexts"
                value={analytics?.total_contexts ?? 0}
                prefix={<CodeOutlined />}
                valueStyle={{ color: '#1890ff' }}
                formatter={(value) => (value as number).toLocaleString()}
                loading={analyticsLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Active This Week"
                value={analytics?.sessions_this_week ?? 0}
                prefix={<ClockCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
                loading={analyticsLoading}
              />
            </Card>
          </Col>
        </Row>

        {/* Secondary Stats */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Card>
              <Statistic
                title="Sessions This Month"
                value={analytics?.sessions_this_month ?? 0}
                prefix={<RocketOutlined />}
                loading={analyticsLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card>
              <Statistic
                title="Average Tokens per Session"
                value={analytics?.average_tokens_per_session ?? 0}
                prefix={<FireOutlined />}
                formatter={(value) => Math.round(value as number).toLocaleString()}
                loading={analyticsLoading}
              />
            </Card>
          </Col>
        </Row>

        {/* Trends Chart */}
        <Card
          title={
            <Space>
              <span>Session Activity Trends</span>
              <Text type="secondary" style={{ fontSize: 14, fontWeight: 'normal' }}>
                ({timeRange} days)
              </Text>
            </Space>
          }
        >
          {trendsLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text>Loading trend data...</Text>
              </div>
            </div>
          ) : chartData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <Text type="secondary">No data available for the selected time range</Text>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1890ff" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#1890ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff4d4f" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#ff4d4f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  stroke="#666"
                  fontSize={12}
                  tick={{ fill: '#666' }}
                />
                <YAxis
                  yAxisId="left"
                  stroke="#666"
                  fontSize={12}
                  tick={{ fill: '#666' }}
                  label={{
                    value: 'Sessions / Contexts / Tasks',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 12, fill: '#666' },
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#666"
                  fontSize={12}
                  tick={{ fill: '#666' }}
                  label={{
                    value: 'Tokens (K)',
                    angle: 90,
                    position: 'insideRight',
                    style: { fontSize: 12, fill: '#666' },
                  }}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #d9d9d9',
                    borderRadius: '6px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === 'tokens') {
                      return [`${value}K`, 'Tokens (K)'];
                    }
                    return [value, name.charAt(0).toUpperCase() + name.slice(1)];
                  }}
                />
                <Legend />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="sessions"
                  stroke="#1890ff"
                  fillOpacity={1}
                  fill="url(#colorSessions)"
                  strokeWidth={2}
                  name="Sessions"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="tokens"
                  stroke="#ff4d4f"
                  fillOpacity={1}
                  fill="url(#colorTokens)"
                  strokeWidth={2}
                  name="Tokens (K)"
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="contexts"
                  stroke="#52c41a"
                  fill="#52c41a"
                  fillOpacity={0.3}
                  strokeWidth={2}
                  name="Contexts"
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="tasks"
                  stroke="#722ed1"
                  fill="#722ed1"
                  fillOpacity={0.3}
                  strokeWidth={2}
                  name="Tasks"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </Space>
    </div>
  );
};

export default Analytics;
