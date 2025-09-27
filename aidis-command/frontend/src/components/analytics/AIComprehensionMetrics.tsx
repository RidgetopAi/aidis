import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Row,
  Col,
  Statistic,
  Progress,
  Spin,
  Alert,
  Space,
  Tag,
  Tooltip,
  Button,
  Tabs,
  Divider,
  Badge
} from 'antd';
import {
  ReloadOutlined,
  CodeOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  ApiOutlined,
  BugOutlined,
  EyeOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import {
  useFileAIComprehension,
  useProjectAIInsights,
  type AIComprehensionMetrics as AIMetrics,
  type FileAnalysis
} from '../../hooks/useAIComprehension';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;

interface AIComprehensionMetricsProps {
  projectId: string;
  filePath?: string;
  refreshInterval?: number;
  className?: string;
  onFileSelect?: (filePath: string) => void;
}

const AIComprehensionMetrics: React.FC<AIComprehensionMetricsProps> = ({
  projectId,
  filePath,
  refreshInterval = 30000, // Default 30 seconds
  className,
  onFileSelect
}) => {
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Fetch file-specific data if a file is selected
  const {
    data: fileAnalysis,
    isLoading: fileLoading,
    error: fileError,
    refetch: refetchFile
  } = useFileAIComprehension(filePath || null, {
    enabled: !!filePath,
    refetchInterval: isAutoRefresh ? refreshInterval : undefined
  });

  // Fetch project-wide insights
  const {
    data: projectInsights,
    isLoading: projectLoading,
    error: projectError,
    refetch: refetchProject
  } = useProjectAIInsights(projectId, {
    refetchInterval: isAutoRefresh ? refreshInterval * 2 : undefined // Project data refreshes slower
  });

  // Auto-refresh effect
  useEffect(() => {
    if (isAutoRefresh) {
      const interval = setInterval(() => {
        setLastRefresh(new Date());
      }, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [isAutoRefresh, refreshInterval]);

  const handleRefresh = () => {
    refetchFile();
    refetchProject();
    setLastRefresh(new Date());
  };

  const getComplexityColor = (score: number): string => {
    if (score <= 3) return '#52c41a'; // Green - Low complexity
    if (score <= 7) return '#faad14'; // Yellow - Medium complexity
    if (score <= 10) return '#fa8c16'; // Orange - High complexity
    return '#f5222d'; // Red - Very high complexity
  };

  const getReadabilityColor = (score: number): string => {
    if (score >= 80) return '#52c41a'; // Green - Excellent
    if (score >= 60) return '#faad14'; // Yellow - Good
    if (score >= 40) return '#fa8c16'; // Orange - Fair
    return '#f5222d'; // Red - Poor
  };

  const renderProjectOverview = () => {
    if (projectLoading) {
      return (
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>Loading project insights...</Text>
          </div>
        </div>
      );
    }

    if (projectError) {
      return (
        <Alert
          message="Failed to Load Project Data"
          description={projectError.message}
          type="error"
          showIcon
        />
      );
    }

    if (!projectInsights) {
      return (
        <Alert
          message="No Project Data Available"
          description="Unable to fetch project insights at this time."
          type="info"
          showIcon
        />
      );
    }

    return (
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title="Overall Health"
              value={projectInsights.overallHealth || 75}
              suffix="%"
              valueStyle={{ color: getReadabilityColor(projectInsights.overallHealth || 75) }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title="Code Quality"
              value={projectInsights.codeQuality || 70}
              suffix="%"
              valueStyle={{ color: getReadabilityColor(projectInsights.codeQuality || 70) }}
              prefix={<CodeOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title="Active Files"
              value={projectInsights.fileCount || 0}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title="Last Analysis"
              value={new Date(projectInsights.timestamp || Date.now()).toLocaleTimeString()}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>
    );
  };

  const renderFileAnalysis = () => {
    if (!filePath) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <FileTextOutlined style={{ fontSize: '48px', color: '#d9d9d9' }} />
          <div style={{ marginTop: 16 }}>
            <Title level={4}>No File Selected</Title>
            <Text type="secondary">
              Select a file to view detailed AI comprehension metrics
            </Text>
          </div>
        </div>
      );
    }

    if (fileLoading) {
      return (
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>Analyzing file with AST engine...</Text>
          </div>
        </div>
      );
    }

    if (fileError) {
      return (
        <Alert
          message="Analysis Failed"
          description={`Failed to analyze ${filePath}: ${fileError.message}`}
          type="error"
          showIcon
          action={
            <Button onClick={() => refetchFile()} size="small">
              <ReloadOutlined /> Retry
            </Button>
          }
        />
      );
    }

    if (!fileAnalysis) {
      return (
        <Alert
          message="No Analysis Data"
          description="File analysis completed but no data was returned."
          type="warning"
          showIcon
        />
      );
    }

    const metrics = fileAnalysis.aiComprehension;

    return (
      <Tabs defaultActiveKey="overview" type="card">
        <TabPane tab="Overview" key="overview">
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <Title level={5}>File: {filePath}</Title>
              <Text type="secondary">
                Total Components: {fileAnalysis.components?.length || 0} |
                Total Complexity: {fileAnalysis.totalComplexity || 0}
              </Text>
            </div>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} md={8}>
                <Card size="small">
                  <Statistic
                    title="Cyclomatic Complexity"
                    value={metrics.cyclomaticComplexity}
                    valueStyle={{ color: getComplexityColor(metrics.cyclomaticComplexity) }}
                    prefix={<BugOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card size="small">
                  <Statistic
                    title="Readability Score"
                    value={metrics.readabilityScore}
                    suffix="%"
                    valueStyle={{ color: getReadabilityColor(metrics.readabilityScore) }}
                    prefix={<EyeOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card size="small">
                  <Statistic
                    title="Structural Complexity"
                    value={metrics.structuralComplexityIndex}
                    valueStyle={{ color: getComplexityColor(metrics.structuralComplexityIndex) }}
                    prefix={<CodeOutlined />}
                  />
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Card size="small" title="Function Metrics">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text>Function Length:</Text>
                      <Tag color={metrics.functionLength > 50 ? 'red' : 'green'}>
                        {metrics.functionLength} lines
                      </Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text>Parameter Count:</Text>
                      <Tag color={metrics.parameterCount > 5 ? 'orange' : 'green'}>
                        {metrics.parameterCount}
                      </Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text>Nesting Depth:</Text>
                      <Tag color={metrics.nestingDepth > 4 ? 'red' : 'green'}>
                        {metrics.nestingDepth} levels
                      </Tag>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card size="small" title="Comment Quality">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Progress
                      percent={metrics.commentQuality.commentQualityScore}
                      strokeColor={getReadabilityColor(metrics.commentQuality.commentQualityScore)}
                      format={(percent) => `${percent}%`}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text>Has JSDoc:</Text>
                      <Tag color={metrics.commentQuality.hasJSDoc ? 'green' : 'red'}>
                        {metrics.commentQuality.hasJSDoc ? 'Yes' : 'No'}
                      </Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text>Comment Density:</Text>
                      <Tag>{metrics.commentQuality.commentDensity}%</Tag>
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>
          </Space>
        </TabPane>

        <TabPane tab="Dependencies" key="dependencies">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card size="small" title="Import/Export Analysis">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Statistic
                    title="Total Imports"
                    value={metrics.dependencyPatterns.importCount}
                    prefix={<ApiOutlined />}
                  />
                  <Statistic
                    title="Total Exports"
                    value={metrics.dependencyPatterns.exportCount}
                    prefix={<ApiOutlined />}
                  />
                  <Divider />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>Internal Dependencies:</Text>
                    <Badge count={metrics.dependencyPatterns.internalDependencies} style={{ backgroundColor: '#52c41a' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>External Dependencies:</Text>
                    <Badge count={metrics.dependencyPatterns.externalDependencies} style={{ backgroundColor: '#1890ff' }} />
                  </div>
                </Space>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small" title="API Surface Area">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Progress
                    percent={metrics.apiSurfaceArea.apiDesignQuality}
                    strokeColor={getReadabilityColor(metrics.apiSurfaceArea.apiDesignQuality)}
                    format={(percent) => `Design Quality: ${percent}%`}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>Public Functions:</Text>
                    <Tag color="blue">{metrics.apiSurfaceArea.publicFunctions}</Tag>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>Private Functions:</Text>
                    <Tag color="default">{metrics.apiSurfaceArea.privateFunctions}</Tag>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>Exposure Ratio:</Text>
                    <Tag color={metrics.apiSurfaceArea.exposureRatio > 0.5 ? 'orange' : 'green'}>
                      {(metrics.apiSurfaceArea.exposureRatio * 100).toFixed(1)}%
                    </Tag>
                  </div>
                </Space>
              </Card>
            </Col>
          </Row>
        </TabPane>

        <TabPane tab="Module Info" key="module">
          <Card size="small" title="Module Analysis">
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Statistic
                  title="Module Type"
                  value={fileAnalysis.moduleMetrics?.moduleType || 'Unknown'}
                  prefix={<InfoCircleOutlined />}
                />
              </Col>
              <Col xs={24} md={8}>
                <Statistic
                  title="Module Complexity"
                  value={fileAnalysis.moduleMetrics?.moduleComplexity || 0}
                  valueStyle={{ color: getComplexityColor(fileAnalysis.moduleMetrics?.moduleComplexity || 0) }}
                />
              </Col>
              <Col xs={24} md={8}>
                <Statistic
                  title="Navigation Friendliness"
                  value={fileAnalysis.moduleMetrics?.navigationFriendliness || 0}
                  suffix="%"
                  valueStyle={{ color: getReadabilityColor(fileAnalysis.moduleMetrics?.navigationFriendliness || 0) }}
                />
              </Col>
            </Row>
          </Card>
        </TabPane>
      </Tabs>
    );
  };

  return (
    <Card
      title={
        <Space>
          <CodeOutlined />
          <span>AI Comprehension Metrics</span>
          {isAutoRefresh && <Badge status="processing" text="Live" />}
        </Space>
      }
      className={className}
      style={{ marginBottom: 24 }}
      extra={
        <Space>
          <Tooltip title={`Last refresh: ${lastRefresh.toLocaleTimeString()}`}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {lastRefresh.toLocaleTimeString()}
            </Text>
          </Tooltip>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={fileLoading || projectLoading}
          >
            Refresh
          </Button>
          <Button
            size="small"
            type={isAutoRefresh ? "primary" : "default"}
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
          >
            {isAutoRefresh ? 'Live' : 'Auto'}
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Project Overview */}
        <div>
          <Title level={5}>Project Overview: {projectId}</Title>
          {renderProjectOverview()}
        </div>

        <Divider />

        {/* File-Specific Analysis */}
        <div>
          <Title level={5}>File Analysis</Title>
          {renderFileAnalysis()}
        </div>
      </Space>
    </Card>
  );
};

export default AIComprehensionMetrics;