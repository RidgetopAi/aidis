import React, { useState, useMemo } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Button,
  Modal,
  Typography,
  Row,
  Col,
  Statistic,
  Progress,
  Alert,
  Tooltip,
  Badge,
  List,
  Tabs,
  Select,
  Input,
  Spin,
  Popover,
  Timeline
} from 'antd';
import {
  FireOutlined,
  BugOutlined,
  WarningOutlined,
  SearchOutlined,
  EyeOutlined,
  FilterOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  FileTextOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useCodeHotspots, type HotspotData } from '../../hooks/useAIComprehension';

const { Text, Title, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;
const { Search } = Input;

interface HotspotDetectionProps {
  projectId: string;
  onHotspotSelect?: (hotspot: HotspotData) => void;
  className?: string;
}

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
type SortField = 'severity' | 'complexity' | 'readability' | 'maintainability';

const HotspotDetection: React.FC<HotspotDetectionProps> = ({
  projectId,
  onHotspotSelect,
  className
}) => {
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotData | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('severity');

  const {
    data: hotspots,
    isLoading,
    error,
    refetch
  } = useCodeHotspots(projectId);

  // Process and filter hotspots
  const filteredHotspots = useMemo(() => {
    if (!hotspots) return [];

    let filtered = hotspots.filter(hotspot => {
      // Filter by severity
      if (severityFilter !== 'all' && hotspot.severity !== severityFilter) {
        return false;
      }

      // Filter by search term
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          hotspot.componentName.toLowerCase().includes(searchLower) ||
          hotspot.filePath.toLowerCase().includes(searchLower) ||
          hotspot.issues.some(issue => issue.toLowerCase().includes(searchLower))
        );
      }

      return true;
    });

    // Sort hotspots
    filtered.sort((a, b) => {
      switch (sortField) {
        case 'severity':
          const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          return severityOrder[b.severity] - severityOrder[a.severity];
        case 'complexity':
          return b.metrics.complexity - a.metrics.complexity;
        case 'readability':
          return a.metrics.readability - b.metrics.readability;
        case 'maintainability':
          return a.metrics.maintainability - b.metrics.maintainability;
        default:
          return 0;
      }
    });

    return filtered;
  }, [hotspots, severityFilter, searchTerm, sortField]);

  // Calculate statistics
  const hotspotStats = useMemo(() => {
    if (!hotspots) return null;

    const bySeverity = hotspots.reduce((acc, hotspot) => {
      acc[hotspot.severity] = (acc[hotspot.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgComplexity = hotspots.reduce((sum, h) => sum + h.metrics.complexity, 0) / hotspots.length;
    const avgReadability = hotspots.reduce((sum, h) => sum + h.metrics.readability, 0) / hotspots.length;
    const avgMaintainability = hotspots.reduce((sum, h) => sum + h.metrics.maintainability, 0) / hotspots.length;

    return {
      total: hotspots.length,
      critical: bySeverity.critical || 0,
      high: bySeverity.high || 0,
      medium: bySeverity.medium || 0,
      low: bySeverity.low || 0,
      avgComplexity: Math.round(avgComplexity),
      avgReadability: Math.round(avgReadability),
      avgMaintainability: Math.round(avgMaintainability)
    };
  }, [hotspots]);

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical': return '#f5222d';
      case 'high': return '#fa8c16';
      case 'medium': return '#faad14';
      case 'low': return '#52c41a';
      default: return '#d9d9d9';
    }
  };

  const getSeverityIcon = (severity: string): React.ReactNode => {
    switch (severity) {
      case 'critical': return <AlertOutlined />;
      case 'high': return <WarningOutlined />;
      case 'medium': return <ExclamationCircleOutlined />;
      case 'low': return <InfoCircleOutlined />;
      default: return <InfoCircleOutlined />;
    }
  };

  const handleHotspotClick = (hotspot: HotspotData) => {
    setSelectedHotspot(hotspot);
    setModalVisible(true);
    onHotspotSelect?.(hotspot);
  };

  const renderHotspotCard = (hotspot: HotspotData) => (
    <Card
      size="small"
      hoverable
      onClick={() => handleHotspotClick(hotspot)}
      style={{
        borderColor: getSeverityColor(hotspot.severity),
        borderWidth: 2,
        marginBottom: 8
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <span style={{ color: getSeverityColor(hotspot.severity) }}>
              {getSeverityIcon(hotspot.severity)}
            </span>
            <Text strong>{hotspot.componentName}</Text>
          </Space>
          <Tag color={getSeverityColor(hotspot.severity)} style={{ color: 'white' }}>
            {hotspot.severity.toUpperCase()}
          </Tag>
        </div>

        <Text type="secondary" style={{ fontSize: '12px' }}>
          {hotspot.filePath}
        </Text>

        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="Complexity"
              value={hotspot.metrics.complexity}
              valueStyle={{ fontSize: '16px', color: getSeverityColor(hotspot.severity) }}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="Readability"
              value={hotspot.metrics.readability}
              suffix="%"
              valueStyle={{ fontSize: '16px', color: hotspot.metrics.readability < 50 ? '#f5222d' : '#52c41a' }}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="Maintainability"
              value={hotspot.metrics.maintainability}
              suffix="%"
              valueStyle={{ fontSize: '16px', color: hotspot.metrics.maintainability < 50 ? '#f5222d' : '#52c41a' }}
            />
          </Col>
        </Row>

        <div style={{ marginTop: 8 }}>
          <Text strong style={{ fontSize: '12px' }}>Issues ({hotspot.issues.length}):</Text>
          <div style={{ marginTop: 4 }}>
            {hotspot.issues.slice(0, 2).map((issue, index) => (
              <Tag key={index} style={{ marginBottom: 2 }}>
                {issue}
              </Tag>
            ))}
            {hotspot.issues.length > 2 && (
              <Tag style={{ marginBottom: 2 }}>
                +{hotspot.issues.length - 2} more
              </Tag>
            )}
          </div>
        </div>
      </Space>
    </Card>
  );

  const renderStatsOverview = () => {
    if (!hotspotStats) return null;

    return (
      <Row gutter={[16, 16]}>
        <Col xs={6}>
          <Card size="small">
            <Statistic
              title="Total Hotspots"
              value={hotspotStats.total}
              prefix={<FireOutlined />}
              valueStyle={{ color: hotspotStats.total > 5 ? '#f5222d' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={6}>
          <Card size="small">
            <Statistic
              title="Critical"
              value={hotspotStats.critical}
              prefix={<AlertOutlined />}
              valueStyle={{ color: '#f5222d' }}
            />
          </Card>
        </Col>
        <Col xs={6}>
          <Card size="small">
            <Statistic
              title="High Priority"
              value={hotspotStats.high}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={6}>
          <Card size="small">
            <Statistic
              title="Avg Complexity"
              value={hotspotStats.avgComplexity}
              prefix={<CodeOutlined />}
              valueStyle={{ color: hotspotStats.avgComplexity > 10 ? '#f5222d' : '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>
    );
  };

  const renderDetailModal = () => (
    <Modal
      title={
        <Space>
          <span style={{ color: getSeverityColor(selectedHotspot?.severity || 'low') }}>
            {getSeverityIcon(selectedHotspot?.severity || 'low')}
          </span>
          <span>{selectedHotspot?.componentName}</span>
          <Tag color={getSeverityColor(selectedHotspot?.severity || 'low')} style={{ color: 'white' }}>
            {selectedHotspot?.severity.toUpperCase()}
          </Tag>
        </Space>
      }
      open={modalVisible}
      onCancel={() => setModalVisible(false)}
      width={800}
      footer={[
        <Button key="close" onClick={() => setModalVisible(false)}>
          Close
        </Button>,
        <Button key="view" type="primary" icon={<EyeOutlined />}>
          View in Editor
        </Button>
      ]}
    >
      {selectedHotspot && (
        <Tabs defaultActiveKey="overview">
          <TabPane tab="Overview" key="overview">
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <div>
                <Title level={5}>File Path</Title>
                <Text code>{selectedHotspot.filePath}</Text>
              </div>

              <Row gutter={24}>
                <Col span={8}>
                  <Card size="small">
                    <Statistic
                      title="Complexity Score"
                      value={selectedHotspot.metrics.complexity}
                      valueStyle={{ color: getSeverityColor(selectedHotspot.severity) }}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small">
                    <Statistic
                      title="Readability"
                      value={selectedHotspot.metrics.readability}
                      suffix="%"
                      valueStyle={{ color: selectedHotspot.metrics.readability < 50 ? '#f5222d' : '#52c41a' }}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small">
                    <Statistic
                      title="Maintainability"
                      value={selectedHotspot.metrics.maintainability}
                      suffix="%"
                      valueStyle={{ color: selectedHotspot.metrics.maintainability < 50 ? '#f5222d' : '#52c41a' }}
                    />
                  </Card>
                </Col>
              </Row>
            </Space>
          </TabPane>

          <TabPane tab="Issues" key="issues">
            <List
              dataSource={selectedHotspot.issues}
              renderItem={(issue, index) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Badge count={index + 1} style={{ backgroundColor: getSeverityColor(selectedHotspot.severity) }} />}
                    title={issue}
                    description="Detected by AI analysis engine"
                  />
                </List.Item>
              )}
            />
          </TabPane>

          <TabPane tab="Recommendations" key="recommendations">
            <Timeline>
              <Timeline.Item color="red" dot={<AlertOutlined />}>
                <Title level={5}>Immediate Actions</Title>
                <Paragraph>
                  Address high complexity issues by breaking down large functions into smaller, more manageable pieces.
                </Paragraph>
              </Timeline.Item>
              <Timeline.Item color="orange" dot={<WarningOutlined />}>
                <Title level={5}>Short-term Improvements</Title>
                <Paragraph>
                  Add comprehensive documentation and improve variable naming for better readability.
                </Paragraph>
              </Timeline.Item>
              <Timeline.Item color="green" dot={<CheckCircleOutlined />}>
                <Title level={5}>Long-term Strategy</Title>
                <Paragraph>
                  Consider refactoring this component using modern design patterns to improve maintainability.
                </Paragraph>
              </Timeline.Item>
            </Timeline>
          </TabPane>
        </Tabs>
      )}
    </Modal>
  );

  if (isLoading) {
    return (
      <Card className={className}>
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>Detecting code hotspots...</Text>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <Alert
          message="Failed to Load Hotspot Data"
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
          <FireOutlined style={{ color: '#f5222d' }} />
          <span>Code Hotspot Detection</span>
          <Badge count={hotspotStats?.total || 0} style={{ backgroundColor: '#f5222d' }} />
        </Space>
      }
      extra={
        <Space>
          <Button size="small" onClick={() => refetch()}>
            <ReloadOutlined />
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Statistics Overview */}
        {renderStatsOverview()}

        {/* Filters */}
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8}>
            <Search
              placeholder="Search hotspots..."
              allowClear
              onChange={(e) => setSearchTerm(e.target.value)}
              prefix={<SearchOutlined />}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              value={severityFilter}
              onChange={setSeverityFilter}
              style={{ width: '100%' }}
              placeholder="Severity"
            >
              <Option value="all">All Severity</Option>
              <Option value="critical">Critical</Option>
              <Option value="high">High</Option>
              <Option value="medium">Medium</Option>
              <Option value="low">Low</Option>
            </Select>
          </Col>
          <Col xs={12} sm={4}>
            <Select
              value={sortField}
              onChange={setSortField}
              style={{ width: '100%' }}
              placeholder="Sort by"
            >
              <Option value="severity">Severity</Option>
              <Option value="complexity">Complexity</Option>
              <Option value="readability">Readability</Option>
              <Option value="maintainability">Maintainability</Option>
            </Select>
          </Col>
        </Row>

        {/* Hotspots List */}
        {filteredHotspots.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <CheckCircleOutlined style={{ fontSize: '48px', color: '#52c41a' }} />
            <div style={{ marginTop: 16 }}>
              <Title level={4}>No Code Hotspots Found!</Title>
              <Text type="secondary">
                {searchTerm || severityFilter !== 'all'
                  ? 'Try adjusting your filters to see more results.'
                  : 'Your codebase is in excellent shape with no critical issues detected.'}
              </Text>
            </div>
          </div>
        ) : (
          <Row gutter={[16, 16]}>
            {filteredHotspots.map((hotspot, index) => (
              <Col xs={24} lg={12} xl={8} key={`${hotspot.filePath}-${hotspot.componentName}-${index}`}>
                {renderHotspotCard(hotspot)}
              </Col>
            ))}
          </Row>
        )}
      </Space>

      {renderDetailModal()}
    </Card>
  );
};

export default HotspotDetection;