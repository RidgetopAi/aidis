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
  Tabs,
  Tooltip,
  Tag
} from 'antd';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import {
  RiseOutlined,
  FallOutlined,
  BarChartOutlined,
  LineChartOutlined,
  RadarChartOutlined,
  ReloadOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import { useCodeHealthTrends, type CodeHealthTrend } from '../../hooks/useAIComprehension';

const { Text, Title } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

interface CodeTrendChartsProps {
  projectId: string;
  className?: string;
  height?: number;
}

type TimeRange = '7d' | '30d' | '90d';
type ChartType = 'line' | 'area' | 'bar' | 'radar';

const CodeTrendCharts: React.FC<CodeTrendChartsProps> = ({
  projectId,
  className,
  height = 400
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [chartType, setChartType] = useState<ChartType>('line');

  const {
    data: trendsData,
    isLoading,
    error,
    refetch
  } = useCodeHealthTrends(projectId, timeRange);

  // Process trends data for charts
  const processedData = useMemo(() => {
    if (!trendsData || !Array.isArray(trendsData)) return [];

    return trendsData.map((trend: CodeHealthTrend) => ({
      date: new Date(trend.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(timeRange === '90d' && { year: '2-digit' })
      }),
      timestamp: trend.timestamp,
      readability: Math.round(trend.readabilityScore),
      complexity: Math.round(100 - trend.complexityIndex), // Invert complexity for better visual
      documentation: Math.round(trend.commentQuality),
      apiDesign: Math.round(trend.apiDesignQuality),
      overall: Math.round((trend.readabilityScore + (100 - trend.complexityIndex) +
                          trend.commentQuality + trend.apiDesignQuality) / 4)
    }));
  }, [trendsData, timeRange]);

  // Calculate trend statistics
  const trendStats = useMemo(() => {
    if (!processedData || processedData.length < 2) return null;

    const latest = processedData[processedData.length - 1];
    const previous = processedData[0];

    const calculateChange = (current: number, prev: number) => {
      const change = current - prev;
      const percentage = prev !== 0 ? (change / prev) * 100 : 0;
      return { change, percentage };
    };

    return {
      readability: calculateChange(latest.readability, previous.readability),
      complexity: calculateChange(latest.complexity, previous.complexity),
      documentation: calculateChange(latest.documentation, previous.documentation),
      apiDesign: calculateChange(latest.apiDesign, previous.apiDesign),
      overall: calculateChange(latest.overall, previous.overall)
    };
  }, [processedData]);

  const renderTrendIndicator = (change: number, percentage: number) => {
    const isPositive = change >= 0;
    const color = isPositive ? '#52c41a' : '#f5222d';
    const icon = isPositive ? <RiseOutlined /> : <FallOutlined />;

    return (
      <Space>
        <span style={{ color }}>{icon}</span>
        <Text style={{ color }}>
          {isPositive ? '+' : ''}{change.toFixed(1)} ({percentage.toFixed(1)}%)
        </Text>
      </Space>
    );
  };

  const renderLineChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={processedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          stroke="#666"
          fontSize={12}
          tick={{ fill: '#666' }}
        />
        <YAxis
          stroke="#666"
          fontSize={12}
          tick={{ fill: '#666' }}
          domain={[0, 100]}
        />
        <RechartsTooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #d9d9d9',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}
          formatter={(value: number, name: string) => [
            `${value}%`,
            name.charAt(0).toUpperCase() + name.slice(1)
          ]}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="readability"
          stroke="#1890ff"
          strokeWidth={3}
          dot={{ fill: '#1890ff', strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, stroke: '#1890ff', strokeWidth: 2 }}
          name="Readability"
        />
        <Line
          type="monotone"
          dataKey="complexity"
          stroke="#52c41a"
          strokeWidth={3}
          dot={{ fill: '#52c41a', strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, stroke: '#52c41a', strokeWidth: 2 }}
          name="Complexity"
        />
        <Line
          type="monotone"
          dataKey="documentation"
          stroke="#722ed1"
          strokeWidth={3}
          dot={{ fill: '#722ed1', strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, stroke: '#722ed1', strokeWidth: 2 }}
          name="Documentation"
        />
        <Line
          type="monotone"
          dataKey="apiDesign"
          stroke="#fa8c16"
          strokeWidth={3}
          dot={{ fill: '#fa8c16', strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, stroke: '#fa8c16', strokeWidth: 2 }}
          name="API Design"
        />
      </LineChart>
    </ResponsiveContainer>
  );

  const renderAreaChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={processedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" stroke="#666" fontSize={12} />
        <YAxis stroke="#666" fontSize={12} domain={[0, 100]} />
        <RechartsTooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #d9d9d9',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}
        />
        <Legend />
        <Area
          type="monotone"
          dataKey="overall"
          stroke="#1890ff"
          fill="#1890ff"
          fillOpacity={0.3}
          strokeWidth={2}
          name="Overall Health"
        />
      </AreaChart>
    </ResponsiveContainer>
  );

  const renderBarChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={processedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" stroke="#666" fontSize={12} />
        <YAxis stroke="#666" fontSize={12} domain={[0, 100]} />
        <RechartsTooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #d9d9d9',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}
        />
        <Legend />
        <Bar dataKey="readability" fill="#1890ff" name="Readability" />
        <Bar dataKey="complexity" fill="#52c41a" name="Complexity" />
        <Bar dataKey="documentation" fill="#722ed1" name="Documentation" />
        <Bar dataKey="apiDesign" fill="#fa8c16" name="API Design" />
      </BarChart>
    </ResponsiveContainer>
  );

  const renderRadarChart = () => {
    if (!processedData || processedData.length === 0) return null;

    const latestData = processedData[processedData.length - 1];
    const radarData = [
      { metric: 'Readability', value: latestData.readability, fullMark: 100 },
      { metric: 'Low Complexity', value: latestData.complexity, fullMark: 100 },
      { metric: 'Documentation', value: latestData.documentation, fullMark: 100 },
      { metric: 'API Design', value: latestData.apiDesign, fullMark: 100 },
    ];

    return (
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
          <PolarGrid stroke="#d9d9d9" />
          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 10 }}
            axisLine={false}
          />
          <Radar
            name="Current Metrics"
            dataKey="value"
            stroke="#1890ff"
            fill="#1890ff"
            fillOpacity={0.3}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    );
  };

  const renderChart = () => {
    switch (chartType) {
      case 'area': return renderAreaChart();
      case 'bar': return renderBarChart();
      case 'radar': return renderRadarChart();
      default: return renderLineChart();
    }
  };

  const renderStatsCard = () => {
    if (!trendStats) return null;

    return (
      <Card title="Trend Summary" size="small">
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <div>
              <Text strong>Readability</Text>
              {renderTrendIndicator(trendStats.readability.change, trendStats.readability.percentage)}
            </div>
          </Col>
          <Col span={12}>
            <div>
              <Text strong>Complexity</Text>
              {renderTrendIndicator(trendStats.complexity.change, trendStats.complexity.percentage)}
            </div>
          </Col>
          <Col span={12}>
            <div>
              <Text strong>Documentation</Text>
              {renderTrendIndicator(trendStats.documentation.change, trendStats.documentation.percentage)}
            </div>
          </Col>
          <Col span={12}>
            <div>
              <Text strong>API Design</Text>
              {renderTrendIndicator(trendStats.apiDesign.change, trendStats.apiDesign.percentage)}
            </div>
          </Col>
        </Row>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>Loading trend data...</Text>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <Alert
          message="Failed to Load Trend Data"
          description={error.message || 'Unknown error occurred'}
          type="error"
          action={
            <Button onClick={() => refetch()}>
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
          <BarChartOutlined />
          <span>Code Health Trends</span>
          <Tag color="blue">AI Analytics</Tag>
        </Space>
      }
      extra={
        <Space>
          <Select
            value={timeRange}
            onChange={(value: TimeRange) => setTimeRange(value)}
            size="small"
            style={{ width: 80 }}
            suffixIcon={<CalendarOutlined />}
          >
            <Option value="7d">7d</Option>
            <Option value="30d">30d</Option>
            <Option value="90d">90d</Option>
          </Select>
          <Select
            value={chartType}
            onChange={(value: ChartType) => setChartType(value)}
            size="small"
            style={{ width: 100 }}
          >
            <Option value="line">
              <Space>
                <LineChartOutlined />
                Line
              </Space>
            </Option>
            <Option value="area">
              <Space>
                <BarChartOutlined />
                Area
              </Space>
            </Option>
            <Option value="bar">
              <Space>
                <BarChartOutlined />
                Bar
              </Space>
            </Option>
            <Option value="radar">
              <Space>
                <RadarChartOutlined />
                Radar
              </Space>
            </Option>
          </Select>
          <Button size="small" onClick={() => refetch()}>
            <ReloadOutlined />
          </Button>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={18}>
          <div style={{ height: height + 20 }}>
            {renderChart()}
          </div>
        </Col>
        <Col xs={24} lg={6}>
          {renderStatsCard()}
        </Col>
      </Row>
    </Card>
  );
};

export default CodeTrendCharts;