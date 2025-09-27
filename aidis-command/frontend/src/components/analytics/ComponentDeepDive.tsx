import React, { useState, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Space,
  Tag,
  Progress,
  Statistic,
  Table,
  Tree,
  Tabs,
  Button,
  Tooltip,
  Badge,
  Alert,
  Collapse,
  List,
  Descriptions,
  Input,
  Select,
  Drawer,
  Modal
} from 'antd';
import {
  CodeOutlined,
  FunctionOutlined,
  FileTextOutlined,
  BranchesOutlined,
  EyeOutlined,
  SearchOutlined,
  ExpandOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  BugOutlined,
  LinkOutlined,
  ClusterOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import {
  useFileAIComprehension,
  type ComponentAnalysis,
  type FileAnalysis,
  type AIComprehensionMetrics
} from '../../hooks/useAIComprehension';

const { Text, Title, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Panel } = Collapse;
const { Option } = Select;
const { Search } = Input;

interface ComponentDeepDiveProps {
  filePath: string;
  selectedComponent?: string;
  onComponentSelect?: (component: ComponentAnalysis) => void;
  className?: string;
}

interface ComponentNode extends DataNode {
  component: ComponentAnalysis;
  level: number;
}

const ComponentDeepDive: React.FC<ComponentDeepDiveProps> = ({
  filePath,
  selectedComponent,
  onComponentSelect,
  className
}) => {
  const [activeComponent, setActiveComponent] = useState<ComponentAnalysis | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'function' | 'class' | 'interface'>('all');
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  const {
    data: fileAnalysis,
    isLoading,
    error,
    refetch
  } = useFileAIComprehension(filePath);

  // Filter and search components
  const filteredComponents = useMemo(() => {
    if (!fileAnalysis?.components) return [];

    let filtered = fileAnalysis.components.filter(component => {
      // Filter by type
      if (filterType !== 'all' && component.type !== filterType) {
        return false;
      }

      // Filter by search term
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return component.name.toLowerCase().includes(searchLower);
      }

      return true;
    });

    // Sort by complexity (highest first)
    filtered.sort((a, b) => b.complexity - a.complexity);

    return filtered;
  }, [fileAnalysis?.components, filterType, searchTerm]);

  // Generate tree structure for component hierarchy
  const componentTree = useMemo((): ComponentNode[] => {
    if (!fileAnalysis?.components) return [];

    return fileAnalysis.components.map((component, index) => ({
      title: (
        <Space>
          {component.type === 'function' ? <FunctionOutlined /> :
           component.type === 'class' ? <ClusterOutlined /> : <FileTextOutlined />}
          <Text strong>{component.name}</Text>
          <Tag color={getComplexityColor(component.complexity)}>
            {component.complexity}
          </Tag>
          {component.aiComprehension && (
            <Tag color={getReadabilityColor(component.aiComprehension.readabilityScore)}>
              {component.aiComprehension.readabilityScore.toFixed(0)}%
            </Tag>
          )}
        </Space>
      ),
      key: `${component.type}-${component.name}-${index}`,
      component,
      level: 0,
      isLeaf: true
    }));
  }, [fileAnalysis?.components]);

  const getComplexityColor = (complexity: number): string => {
    if (complexity <= 3) return 'green';
    if (complexity <= 7) return 'yellow';
    if (complexity <= 12) return 'orange';
    return 'red';
  };

  const getReadabilityColor = (readability: number): string => {
    if (readability >= 80) return 'green';
    if (readability >= 60) return 'yellow';
    if (readability >= 40) return 'orange';
    return 'red';
  };

  const getMetricStatus = (value: number, thresholds: { good: number; warning: number }): 'success' | 'normal' | 'exception' => {
    if (value >= thresholds.good) return 'success';
    if (value >= thresholds.warning) return 'normal';
    return 'exception';
  };

  const handleComponentSelect = (component: ComponentAnalysis) => {
    setActiveComponent(component);
    setDrawerVisible(true);
    onComponentSelect?.(component);
  };

  const renderMetricCard = (
    title: string,
    value: number,
    suffix: string = '',
    thresholds: { good: number; warning: number },
    description?: string
  ) => {
    const status = getMetricStatus(value, thresholds);
    const color = status === 'success' ? '#52c41a' : status === 'normal' ? '#faad14' : '#f5222d';

    return (
      <Card size="small" hoverable onClick={() => setSelectedMetric(selectedMetric === title ? null : title)}>
        <Statistic
          title={title}
          value={value}
          suffix={suffix}
          valueStyle={{ color }}
        />
        <Progress
          percent={Math.min((value / thresholds.good) * 100, 100)}
          status={status}
          showInfo={false}
          size="small"
          style={{ marginTop: 8 }}
        />
        {selectedMetric === title && description && (
          <div style={{ marginTop: 8, padding: '8px', backgroundColor: '#fafafa', borderRadius: '4px' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {description}
            </Text>
          </div>
        )}
      </Card>
    );
  };

  const renderComponentOverview = (component: ComponentAnalysis) => {
    if (!component.aiComprehension) return null;

    const { aiComprehension } = component;

    return (
      <Row gutter={[16, 16]}>
        <Col span={12}>
          {renderMetricCard(
            'Readability Score',
            aiComprehension.readabilityScore,
            '%',
            { good: 80, warning: 60 },
            'How easy this component is for AI and humans to understand'
          )}
        </Col>
        <Col span={12}>
          {renderMetricCard(
            'Complexity Index',
            aiComprehension.structuralComplexityIndex,
            '',
            { good: 20, warning: 40 },
            'Overall structural complexity combining multiple factors'
          )}
        </Col>
        <Col span={12}>
          {renderMetricCard(
            'Cyclomatic Complexity',
            aiComprehension.cyclomaticComplexity,
            '',
            { good: 5, warning: 10 },
            'Number of linearly independent paths through the code'
          )}
        </Col>
        <Col span={12}>
          {renderMetricCard(
            'Function Length',
            aiComprehension.functionLength,
            ' lines',
            { good: 30, warning: 50 },
            'Length of the component in lines of code'
          )}
        </Col>
        <Col span={12}>
          {renderMetricCard(
            'Nesting Depth',
            aiComprehension.nestingDepth,
            '',
            { good: 3, warning: 5 },
            'Maximum nesting level within the component'
          )}
        </Col>
        <Col span={12}>
          {renderMetricCard(
            'Parameter Count',
            aiComprehension.parameterCount,
            '',
            { good: 3, warning: 5 },
            'Number of parameters in function signature'
          )}
        </Col>
      </Row>
    );
  };

  const renderCommentAnalysis = (metrics: AIComprehensionMetrics) => (
    <Row gutter={[16, 16]}>
      <Col span={8}>
        <Card size="small">
          <Statistic
            title="Comment Density"
            value={metrics.commentQuality.commentDensity}
            suffix="%"
            valueStyle={{ color: metrics.commentQuality.commentDensity >= 15 ? '#52c41a' : '#f5222d' }}
          />
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small">
          <Statistic
            title="Comment Quality"
            value={metrics.commentQuality.commentQualityScore}
            suffix="/100"
            valueStyle={{ color: metrics.commentQuality.commentQualityScore >= 70 ? '#52c41a' : '#f5222d' }}
          />
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small">
          <Statistic
            title="JSDoc Completeness"
            value={metrics.commentQuality.jsDocCompleteness}
            suffix="%"
            valueStyle={{ color: metrics.commentQuality.jsDocCompleteness >= 80 ? '#52c41a' : '#f5222d' }}
          />
        </Card>
      </Col>
      <Col span={24}>
        {metrics.commentQuality.missingDocumentation.length > 0 && (
          <Alert
            message="Missing Documentation"
            description={
              <div>
                <Text>The following items need documentation:</Text>
                <div style={{ marginTop: 8 }}>
                  {metrics.commentQuality.missingDocumentation.map((item, index) => (
                    <Tag key={index} color="orange" style={{ marginBottom: 4 }}>
                      {item}
                    </Tag>
                  ))}
                </div>
              </div>
            }
            type="warning"
            showIcon
          />
        )}
      </Col>
    </Row>
  );

  const renderDependencyAnalysis = (metrics: AIComprehensionMetrics) => (
    <Row gutter={[16, 16]}>
      <Col span={8}>
        <Card size="small">
          <Statistic
            title="Import Count"
            value={metrics.dependencyPatterns.importCount}
            prefix={<LinkOutlined />}
          />
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small">
          <Statistic
            title="Coupling Strength"
            value={metrics.dependencyPatterns.couplingStrength}
            suffix="%"
            valueStyle={{ color: metrics.dependencyPatterns.couplingStrength <= 30 ? '#52c41a' : '#f5222d' }}
          />
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small">
          <Statistic
            title="Dependency Complexity"
            value={metrics.dependencyPatterns.dependencyComplexity}
            valueStyle={{ color: metrics.dependencyPatterns.dependencyComplexity <= 20 ? '#52c41a' : '#f5222d' }}
          />
        </Card>
      </Col>
      <Col span={12}>
        <Card size="small" title="Internal Dependencies">
          <Text style={{ fontSize: '20px', fontWeight: 'bold' }}>
            {metrics.dependencyPatterns.internalDependencies}
          </Text>
        </Card>
      </Col>
      <Col span={12}>
        <Card size="small" title="External Dependencies">
          <Text style={{ fontSize: '20px', fontWeight: 'bold' }}>
            {metrics.dependencyPatterns.externalDependencies}
          </Text>
        </Card>
      </Col>
    </Row>
  );

  const renderApiAnalysis = (metrics: AIComprehensionMetrics) => (
    <Row gutter={[16, 16]}>
      <Col span={6}>
        <Card size="small">
          <Statistic
            title="Public Functions"
            value={metrics.apiSurfaceArea.publicFunctions}
            prefix={<FunctionOutlined />}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card size="small">
          <Statistic
            title="Private Functions"
            value={metrics.apiSurfaceArea.privateFunctions}
            prefix={<FunctionOutlined />}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card size="small">
          <Statistic
            title="Exposure Ratio"
            value={metrics.apiSurfaceArea.exposureRatio * 100}
            suffix="%"
            valueStyle={{ color: metrics.apiSurfaceArea.exposureRatio <= 0.5 ? '#52c41a' : '#f5222d' }}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card size="small">
          <Statistic
            title="API Design Quality"
            value={metrics.apiSurfaceArea.apiDesignQuality}
            suffix="/100"
            valueStyle={{ color: metrics.apiSurfaceArea.apiDesignQuality >= 70 ? '#52c41a' : '#f5222d' }}
          />
        </Card>
      </Col>
    </Row>
  );

  const componentsTableColumns: ColumnsType<ComponentAnalysis> = [
    {
      title: 'Component',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: ComponentAnalysis) => (
        <Space>
          {record.type === 'function' ? <FunctionOutlined /> :
           record.type === 'class' ? <ClusterOutlined /> : <FileTextOutlined />}
          <Text strong>{name}</Text>
          <Tag color="blue">{record.type}</Tag>
        </Space>
      ),
    },
    {
      title: 'Complexity',
      dataIndex: 'complexity',
      key: 'complexity',
      render: (complexity: number) => (
        <Badge
          count={complexity}
          style={{ backgroundColor: getComplexityColor(complexity) }}
        />
      ),
      sorter: (a, b) => a.complexity - b.complexity,
    },
    {
      title: 'Lines',
      dataIndex: 'lines',
      key: 'lines',
      sorter: (a, b) => a.lines - b.lines,
    },
    {
      title: 'Readability',
      key: 'readability',
      render: (_, record: ComponentAnalysis) => {
        const score = record.aiComprehension?.readabilityScore ?? 0;
        return (
          <Progress
            percent={score}
            size="small"
            status={getMetricStatus(score, { good: 80, warning: 60 })}
            format={() => `${score.toFixed(0)}%`}
          />
        );
      },
      sorter: (a, b) => (a.aiComprehension?.readabilityScore ?? 0) - (b.aiComprehension?.readabilityScore ?? 0),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record: ComponentAnalysis) => (
        <Button
          size="small"
          type="link"
          icon={<EyeOutlined />}
          onClick={() => handleComponentSelect(record)}
        >
          Analyze
        </Button>
      ),
    },
  ];

  if (isLoading) {
    return (
      <Card className={className} loading>
        <div style={{ height: 400 }} />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <Alert
          message="Failed to Load Component Analysis"
          description={error.message || 'Unknown error occurred'}
          type="error"
          showIcon
        />
      </Card>
    );
  }

  if (!fileAnalysis) {
    return (
      <Card className={className}>
        <Alert
          message="No Analysis Data"
          description="No component analysis data available for this file."
          type="info"
          showIcon
        />
      </Card>
    );
  }

  return (
    <>
      <Card
        className={className}
        title={
          <Space>
            <CodeOutlined />
            <span>Component Deep Dive</span>
            <Tag color="green">{fileAnalysis.components.length} components</Tag>
          </Space>
        }
        extra={
          <Space>
            <Button size="small" icon={<ExpandOutlined />} onClick={() => setDrawerVisible(true)}>
              Full View
            </Button>
          </Space>
        }
      >
        <Tabs defaultActiveKey="overview">
          <TabPane tab="Overview" key="overview">
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              {/* Filters */}
              <Row gutter={[16, 16]} align="middle">
                <Col xs={24} sm={12}>
                  <Search
                    placeholder="Search components..."
                    allowClear
                    onChange={(e) => setSearchTerm(e.target.value)}
                    prefix={<SearchOutlined />}
                  />
                </Col>
                <Col xs={24} sm={6}>
                  <Select
                    value={filterType}
                    onChange={setFilterType}
                    style={{ width: '100%' }}
                  >
                    <Option value="all">All Types</Option>
                    <Option value="function">Functions</Option>
                    <Option value="class">Classes</Option>
                    <Option value="interface">Interfaces</Option>
                  </Select>
                </Col>
              </Row>

              {/* Components Table */}
              <Table
                columns={componentsTableColumns}
                dataSource={filteredComponents}
                rowKey="name"
                size="small"
                pagination={{ pageSize: 10 }}
              />
            </Space>
          </TabPane>

          <TabPane tab="Tree View" key="tree">
            <Tree
              treeData={componentTree}
              defaultExpandAll
              onSelect={(selectedKeys, info) => {
                if (info.node && 'component' in info.node) {
                  handleComponentSelect((info.node as ComponentNode).component);
                }
              }}
            />
          </TabPane>

          <TabPane tab="File Metrics" key="file">
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <Descriptions title="File Information" bordered size="small">
                <Descriptions.Item label="File Path">{fileAnalysis.filePath}</Descriptions.Item>
                <Descriptions.Item label="Module Type">{fileAnalysis.moduleMetrics.moduleType}</Descriptions.Item>
                <Descriptions.Item label="Total Components">{fileAnalysis.components.length}</Descriptions.Item>
                <Descriptions.Item label="Total Complexity">{fileAnalysis.totalComplexity}</Descriptions.Item>
                <Descriptions.Item label="Imports">{fileAnalysis.imports.length}</Descriptions.Item>
                <Descriptions.Item label="Exports">{fileAnalysis.exports.length}</Descriptions.Item>
              </Descriptions>

              {renderComponentOverview({
                name: 'File Overview',
                type: 'file',
                complexity: fileAnalysis.totalComplexity,
                lines: 0,
                aiComprehension: fileAnalysis.aiComprehension
              } as ComponentAnalysis)}
            </Space>
          </TabPane>
        </Tabs>
      </Card>

      {/* Component Detail Drawer */}
      <Drawer
        title={
          activeComponent ? (
            <Space>
              {activeComponent.type === 'function' ? <FunctionOutlined /> :
               activeComponent.type === 'class' ? <ClusterOutlined /> : <FileTextOutlined />}
              <span>{activeComponent.name}</span>
              <Tag color="blue">{activeComponent.type}</Tag>
            </Space>
          ) : 'Component Details'
        }
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        width={800}
      >
        {activeComponent?.aiComprehension && (
          <Tabs defaultActiveKey="metrics">
            <TabPane tab="Metrics" key="metrics">
              {renderComponentOverview(activeComponent)}
            </TabPane>
            <TabPane tab="Comments" key="comments">
              {renderCommentAnalysis(activeComponent.aiComprehension)}
            </TabPane>
            <TabPane tab="Dependencies" key="dependencies">
              {renderDependencyAnalysis(activeComponent.aiComprehension)}
            </TabPane>
            <TabPane tab="API Surface" key="api">
              {renderApiAnalysis(activeComponent.aiComprehension)}
            </TabPane>
          </Tabs>
        )}
      </Drawer>
    </>
  );
};

export default ComponentDeepDive;