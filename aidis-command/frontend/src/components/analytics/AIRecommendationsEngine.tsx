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
  List,
  Progress,
  Tooltip,
  Modal,
  Tabs,
  Steps,
  Timeline,
  Rate,
  Switch,
  Select,
  Divider,
  Statistic,
  notification
} from 'antd';
import {
  BulbOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  CodeOutlined,
  FileTextOutlined,
  SettingOutlined,
  StarOutlined,
  ArrowRightOutlined,
  BugOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  EyeOutlined,
  BookOutlined,
  ToolOutlined
} from '@ant-design/icons';
import {
  useProjectAIInsights,
  useCodeHotspots,
  useCodeHealthTrends,
  type HotspotData
} from '../../hooks/useAIComprehension';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Step } = Steps;

export interface Recommendation {
  id: string;
  type: 'refactor' | 'optimization' | 'documentation' | 'testing' | 'architecture' | 'security';
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'code_quality' | 'performance' | 'maintainability' | 'security' | 'best_practices';
  title: string;
  description: string;
  rationale: string;
  impact: {
    readability: number;
    maintainability: number;
    performance: number;
    security: number;
  };
  effort: 'low' | 'medium' | 'high';
  confidence: number; // 0-100
  filePath?: string;
  lineRange?: [number, number];
  codeExample?: {
    before: string;
    after: string;
  };
  implementation: {
    steps: string[];
    estimatedTime: string;
    resources: string[];
  };
  metrics: {
    complexityReduction?: number;
    performanceGain?: number;
    maintainabilityImprovement?: number;
  };
  dependencies: string[];
  tags: string[];
  aiReasoning: string;
  timestamp: Date;
  applied?: boolean;
  appliedAt?: Date;
  feedback?: {
    rating: number;
    helpful: boolean;
    comment?: string;
  };
}

interface AIRecommendationsEngineProps {
  projectId: string;
  selectedFile?: string;
  onRecommendationApply?: (recommendation: Recommendation) => void;
  onFileSelect?: (filePath: string) => void;
  className?: string;
}

const AIRecommendationsEngine: React.FC<AIRecommendationsEngineProps> = ({
  projectId,
  selectedFile,
  onRecommendationApply,
  onFileSelect,
  className
}) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [selectedRecommendation, setSelectedRecommendation] = useState<Recommendation | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [filters, setFilters] = useState({
    type: 'all',
    priority: 'all',
    category: 'all',
    effort: 'all'
  });
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [lastGeneration, setLastGeneration] = useState<Date | null>(null);

  const {
    data: projectInsights,
    isLoading: insightsLoading
  } = useProjectAIInsights(projectId);

  const {
    data: hotspots,
    isLoading: hotspotsLoading
  } = useCodeHotspots(projectId);

  const {
    data: trends
  } = useCodeHealthTrends(projectId, '7d');

  // Generate AI recommendations based on available data
  const generateRecommendations = useCallback(async () => {
    if (!projectInsights && !hotspots) return;

    setIsGenerating(true);

    try {
      // Simulate AI analysis and recommendation generation
      const generatedRecommendations: Recommendation[] = [];

      // Analyze hotspots for refactoring recommendations
      if (hotspots) {
        hotspots.forEach((hotspot, index) => {
          if (hotspot.severity === 'critical' || hotspot.severity === 'high') {
            generatedRecommendations.push({
              id: `hotspot-${index}`,
              type: 'refactor',
              priority: hotspot.severity === 'critical' ? 'critical' : 'high',
              category: 'code_quality',
              title: `Refactor High-Complexity Component: ${hotspot.componentName}`,
              description: `The component ${hotspot.componentName} has high complexity (${hotspot.metrics.complexity}) and low readability (${hotspot.metrics.readability}%). Consider breaking it into smaller, more focused components.`,
              rationale: `High complexity makes code harder to understand, test, and maintain. Breaking down complex components improves readability and reduces bug introduction risk.`,
              impact: {
                readability: 35,
                maintainability: 40,
                performance: 15,
                security: 10
              },
              effort: hotspot.metrics.complexity > 15 ? 'high' : 'medium',
              confidence: 85 + Math.random() * 15,
              filePath: hotspot.filePath,
              codeExample: {
                before: `// Complex component with ${hotspot.metrics.complexity} complexity\nfunction ${hotspot.componentName}() {\n  // Multiple responsibilities...\n}`,
                after: `// Refactored into focused components\nfunction ${hotspot.componentName}() {\n  return <ComponentA><ComponentB /></ComponentA>;\n}\n\nfunction ComponentA() { /* Focused logic */ }\nfunction ComponentB() { /* Focused logic */ }`
              },
              implementation: {
                steps: [
                  'Identify distinct responsibilities within the component',
                  'Extract each responsibility into a separate component',
                  'Define clear interfaces between components',
                  'Update tests to cover new component structure',
                  'Verify functionality remains unchanged'
                ],
                estimatedTime: hotspot.metrics.complexity > 15 ? '4-6 hours' : '2-3 hours',
                resources: ['React Refactoring Guide', 'Component Design Patterns']
              },
              metrics: {
                complexityReduction: Math.round(hotspot.metrics.complexity * 0.6),
                maintainabilityImprovement: 100 - hotspot.metrics.maintainability
              },
              dependencies: [],
              tags: ['refactor', 'complexity', 'readability'],
              aiReasoning: `AI detected high cyclomatic complexity (${hotspot.metrics.complexity}) combined with low readability (${hotspot.metrics.readability}%). The component violates the Single Responsibility Principle and would benefit from decomposition.`,
              timestamp: new Date()
            });
          }

          // Documentation recommendations for components with poor comment quality
          if (hotspot.metrics.readability < 50) {
            generatedRecommendations.push({
              id: `docs-${index}`,
              type: 'documentation',
              priority: 'medium',
              category: 'maintainability',
              title: `Improve Documentation for ${hotspot.componentName}`,
              description: `Add comprehensive documentation and comments to improve readability from ${hotspot.metrics.readability}% to 80%+.`,
              rationale: 'Well-documented code reduces onboarding time for new developers and makes maintenance significantly easier.',
              impact: {
                readability: 50,
                maintainability: 30,
                performance: 0,
                security: 5
              },
              effort: 'low',
              confidence: 90,
              filePath: hotspot.filePath,
              implementation: {
                steps: [
                  'Add JSDoc comments for all public functions',
                  'Document complex logic with inline comments',
                  'Add README for component usage',
                  'Include code examples in documentation'
                ],
                estimatedTime: '1-2 hours',
                resources: ['JSDoc Guide', 'Documentation Best Practices']
              },
              metrics: {
                maintainabilityImprovement: 50 - hotspot.metrics.readability
              },
              dependencies: [],
              tags: ['documentation', 'readability', 'maintenance'],
              aiReasoning: `Low readability score indicates insufficient documentation. Adding proper comments and documentation will significantly improve code comprehension.`,
              timestamp: new Date()
            });
          }
        });
      }

      // Performance optimization recommendations based on trends
      if (trends && trends.length > 2) {
        const latestTrend = trends[trends.length - 1];
        const previousTrend = trends[trends.length - 2];

        if (latestTrend.complexityIndex > previousTrend.complexityIndex) {
          generatedRecommendations.push({
            id: 'perf-trend',
            type: 'optimization',
            priority: 'high',
            category: 'performance',
            title: 'Address Rising Complexity Trend',
            description: `Project complexity has increased by ${(latestTrend.complexityIndex - previousTrend.complexityIndex).toFixed(1)} points. Implement performance optimizations to prevent degradation.`,
            rationale: 'Increasing complexity trends often lead to performance issues and maintenance challenges if not addressed early.',
            impact: {
              readability: 20,
              maintainability: 25,
              performance: 40,
              security: 5
            },
            effort: 'medium',
            confidence: 75,
            implementation: {
              steps: [
                'Identify performance bottlenecks using profiling tools',
                'Implement code splitting for large components',
                'Add memoization for expensive calculations',
                'Optimize data structures and algorithms',
                'Set up performance monitoring'
              ],
              estimatedTime: '1-2 days',
              resources: ['React Performance Guide', 'Code Splitting Strategies']
            },
            metrics: {
              complexityReduction: Math.round(latestTrend.complexityIndex * 0.2),
              performanceGain: 25
            },
            dependencies: ['babel-plugin-import', 'react-lazy'],
            tags: ['performance', 'optimization', 'complexity'],
            aiReasoning: `Trend analysis shows complexity increasing over time, which correlates with performance degradation in similar codebases.`,
            timestamp: new Date()
          });
        }
      }

      // Architecture recommendations based on project insights
      if (projectInsights && projectInsights.codeQuality < 70) {
        generatedRecommendations.push({
          id: 'arch-quality',
          type: 'architecture',
          priority: 'high',
          category: 'code_quality',
          title: 'Implement Code Quality Standards',
          description: `Project code quality score is ${projectInsights.codeQuality}%. Establish coding standards and automated quality checks.`,
          rationale: 'Consistent code quality standards reduce bugs, improve team productivity, and make the codebase more maintainable.',
          impact: {
            readability: 30,
            maintainability: 45,
            performance: 15,
            security: 20
          },
          effort: 'high',
          confidence: 88,
          implementation: {
            steps: [
              'Set up ESLint with strict rules',
              'Configure Prettier for code formatting',
              'Implement pre-commit hooks',
              'Add SonarQube for code quality analysis',
              'Create coding standards documentation',
              'Set up automated quality gates in CI/CD'
            ],
            estimatedTime: '3-5 days',
            resources: ['ESLint Setup Guide', 'Code Quality Best Practices', 'SonarQube Documentation']
          },
          metrics: {
            maintainabilityImprovement: 70 - projectInsights.codeQuality
          },
          dependencies: ['eslint', 'prettier', 'husky', 'sonarqube'],
          tags: ['architecture', 'quality', 'standards', 'automation'],
          aiReasoning: `Code quality score below 70% indicates need for systematic quality improvement through tooling and standards.`,
          timestamp: new Date()
        });
      }

      // Security recommendations
      generatedRecommendations.push({
        id: 'security-audit',
        type: 'security',
        priority: 'medium',
        category: 'security',
        title: 'Implement Security Best Practices',
        description: 'Add comprehensive security measures including dependency scanning, HTTPS enforcement, and input validation.',
        rationale: 'Proactive security measures prevent vulnerabilities and protect user data.',
        impact: {
          readability: 5,
          maintainability: 10,
          performance: 5,
          security: 80
        },
        effort: 'medium',
        confidence: 82,
        implementation: {
          steps: [
            'Set up automated dependency vulnerability scanning',
            'Implement Content Security Policy (CSP)',
            'Add input validation and sanitization',
            'Configure HTTPS and secure headers',
            'Implement authentication and authorization checks',
            'Add security testing to CI/CD pipeline'
          ],
          estimatedTime: '2-3 days',
          resources: ['OWASP Security Guide', 'React Security Best Practices']
        },
        metrics: {
          complexityReduction: 0,
          performanceGain: 0,
          maintainabilityImprovement: 0
        },
        dependencies: ['helmet', 'joi', 'bcrypt'],
        tags: ['security', 'vulnerability', 'authentication'],
        aiReasoning: 'Security analysis indicates standard security measures should be implemented to protect against common vulnerabilities.',
        timestamp: new Date()
      });

      // Sort by priority and confidence
      const sortedRecommendations = generatedRecommendations.sort((a, b) => {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[a.priority];
        const bPriority = priorityOrder[b.priority];

        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }

        return b.confidence - a.confidence;
      });

      setRecommendations(sortedRecommendations);
      setLastGeneration(new Date());

      notification.success({
        message: 'AI Recommendations Generated',
        description: `Generated ${sortedRecommendations.length} recommendations based on project analysis.`,
        placement: 'topRight'
      });

    } catch (error) {
      console.error('Failed to generate recommendations:', error);
      notification.error({
        message: 'Recommendation Generation Failed',
        description: 'Unable to generate AI recommendations. Please try again.',
        placement: 'topRight'
      });
    } finally {
      setIsGenerating(false);
    }
  }, [projectInsights, hotspots, trends]);

  // Auto-generate recommendations when data is available
  useEffect(() => {
    if (autoGenerate && !isGenerating && (projectInsights || hotspots) && recommendations.length === 0) {
      generateRecommendations();
    }
  }, [autoGenerate, projectInsights, hotspots, generateRecommendations, isGenerating, recommendations.length]);

  // Filter recommendations
  const filteredRecommendations = useMemo(() => {
    return recommendations.filter(rec => {
      if (filters.type !== 'all' && rec.type !== filters.type) return false;
      if (filters.priority !== 'all' && rec.priority !== filters.priority) return false;
      if (filters.category !== 'all' && rec.category !== filters.category) return false;
      if (filters.effort !== 'all' && rec.effort !== filters.effort) return false;
      return true;
    });
  }, [recommendations, filters]);

  const handleApplyRecommendation = (recommendation: Recommendation) => {
    const updatedRec = {
      ...recommendation,
      applied: true,
      appliedAt: new Date()
    };

    setRecommendations(prev => prev.map(r => r.id === recommendation.id ? updatedRec : r));
    onRecommendationApply?.(updatedRec);

    notification.success({
      message: 'Recommendation Applied',
      description: `Applied: ${recommendation.title}`,
      placement: 'topRight'
    });
  };

  const handleProvideFeedback = (recommendationId: string, feedback: { rating: number; helpful: boolean; comment?: string }) => {
    setRecommendations(prev => prev.map(r =>
      r.id === recommendationId ? { ...r, feedback } : r
    ));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return '#f5222d';
      case 'high': return '#fa8c16';
      case 'medium': return '#faad14';
      case 'low': return '#52c41a';
      default: return '#d9d9d9';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'refactor': return <CodeOutlined />;
      case 'optimization': return <ThunderboltOutlined />;
      case 'documentation': return <FileTextOutlined />;
      case 'testing': return <BugOutlined />;
      case 'architecture': return <SettingOutlined />;
      case 'security': return <WarningOutlined />;
      default: return <BulbOutlined />;
    }
  };

  const renderRecommendationCard = (recommendation: Recommendation) => (
    <Card
      key={recommendation.id}
      size="small"
      hoverable
      style={{
        marginBottom: 12,
        borderLeft: `4px solid ${getPriorityColor(recommendation.priority)}`,
        opacity: recommendation.applied ? 0.7 : 1
      }}
      actions={[
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedRecommendation(recommendation);
            setDetailModalVisible(true);
          }}
        >
          View Details
        </Button>,
        <Button
          type="primary"
          size="small"
          disabled={recommendation.applied}
          onClick={() => handleApplyRecommendation(recommendation)}
        >
          {recommendation.applied ? 'Applied' : 'Apply'}
        </Button>,
        recommendation.filePath && (
          <Button
            type="link"
            size="small"
            onClick={() => onFileSelect?.(recommendation.filePath!)}
          >
            Open File
          </Button>
        )
      ].filter(Boolean)}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Space>
            <span style={{ color: getPriorityColor(recommendation.priority) }}>
              {getTypeIcon(recommendation.type)}
            </span>
            <Text strong>{recommendation.title}</Text>
            {recommendation.applied && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
          </Space>
          <Space>
            <Tag color={getPriorityColor(recommendation.priority)}>
              {recommendation.priority}
            </Tag>
            <Tooltip title={`AI Confidence: ${recommendation.confidence}%`}>
              <Badge count={`${recommendation.confidence}%`} style={{ backgroundColor: '#1890ff' }} />
            </Tooltip>
          </Space>
        </div>

        <Text type="secondary" style={{ fontSize: '13px' }}>
          {recommendation.description}
        </Text>

        <div>
          <Space wrap>
            <Tag>{recommendation.effort} effort</Tag>
            <Tag>{recommendation.implementation.estimatedTime}</Tag>
            {recommendation.filePath && (
              <Tag color="blue">
                {recommendation.filePath.split('/').pop()}
              </Tag>
            )}
          </Space>
        </div>

        <Row gutter={8}>
          <Col span={6}>
            <Progress
              percent={recommendation.impact.readability}
              size="small"
              format={() => 'Read'}
              strokeColor="#52c41a"
            />
          </Col>
          <Col span={6}>
            <Progress
              percent={recommendation.impact.maintainability}
              size="small"
              format={() => 'Maint'}
              strokeColor="#1890ff"
            />
          </Col>
          <Col span={6}>
            <Progress
              percent={recommendation.impact.performance}
              size="small"
              format={() => 'Perf'}
              strokeColor="#faad14"
            />
          </Col>
          <Col span={6}>
            <Progress
              percent={recommendation.impact.security}
              size="small"
              format={() => 'Sec'}
              strokeColor="#f5222d"
            />
          </Col>
        </Row>
      </Space>
    </Card>
  );

  const renderDetailModal = () => (
    <Modal
      title={
        <Space>
          <RobotOutlined style={{ color: '#1890ff' }} />
          <span>AI Recommendation Details</span>
          <Tag color={getPriorityColor(selectedRecommendation?.priority || 'low')}>
            {selectedRecommendation?.priority}
          </Tag>
        </Space>
      }
      open={detailModalVisible}
      onCancel={() => setDetailModalVisible(false)}
      width={1000}
      footer={[
        <Button key="close" onClick={() => setDetailModalVisible(false)}>
          Close
        </Button>,
        selectedRecommendation?.filePath && (
          <Button
            key="open"
            onClick={() => onFileSelect?.(selectedRecommendation.filePath!)}
          >
            Open File
          </Button>
        ),
        <Button
          key="apply"
          type="primary"
          disabled={selectedRecommendation?.applied}
          onClick={() => {
            if (selectedRecommendation) {
              handleApplyRecommendation(selectedRecommendation);
              setDetailModalVisible(false);
            }
          }}
        >
          {selectedRecommendation?.applied ? 'Already Applied' : 'Apply Recommendation'}
        </Button>
      ].filter(Boolean)}
    >
      {selectedRecommendation && (
        <Tabs defaultActiveKey="overview">
          <TabPane tab="Overview" key="overview">
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <div>
                <Title level={4}>{selectedRecommendation.title}</Title>
                <Paragraph>{selectedRecommendation.description}</Paragraph>
              </div>

              <Alert
                message="AI Rationale"
                description={selectedRecommendation.rationale}
                type="info"
                showIcon
                icon={<RobotOutlined />}
              />

              <Card title="Expected Impact" size="small">
                <Row gutter={16}>
                  {Object.entries(selectedRecommendation.impact).map(([key, value]) => (
                    <Col span={6} key={key}>
                      <Statistic
                        title={key.charAt(0).toUpperCase() + key.slice(1)}
                        value={value}
                        suffix="%"
                        valueStyle={{
                          color: value > 30 ? '#52c41a' : value > 15 ? '#faad14' : '#f5222d'
                        }}
                      />
                      <Progress
                        percent={value}
                        size="small"
                        showInfo={false}
                        strokeColor={value > 30 ? '#52c41a' : value > 15 ? '#faad14' : '#f5222d'}
                      />
                    </Col>
                  ))}
                </Row>
              </Card>

              {selectedRecommendation.metrics && (
                <Card title="Quantified Benefits" size="small">
                  <Row gutter={16}>
                    {selectedRecommendation.metrics.complexityReduction && (
                      <Col span={8}>
                        <Statistic
                          title="Complexity Reduction"
                          value={selectedRecommendation.metrics.complexityReduction}
                          prefix="−"
                          valueStyle={{ color: '#52c41a' }}
                        />
                      </Col>
                    )}
                    {selectedRecommendation.metrics.performanceGain && (
                      <Col span={8}>
                        <Statistic
                          title="Performance Gain"
                          value={selectedRecommendation.metrics.performanceGain}
                          suffix="%"
                          prefix="+"
                          valueStyle={{ color: '#52c41a' }}
                        />
                      </Col>
                    )}
                    {selectedRecommendation.metrics.maintainabilityImprovement && (
                      <Col span={8}>
                        <Statistic
                          title="Maintainability"
                          value={selectedRecommendation.metrics.maintainabilityImprovement}
                          prefix="+"
                          suffix="pts"
                          valueStyle={{ color: '#52c41a' }}
                        />
                      </Col>
                    )}
                  </Row>
                </Card>
              )}
            </Space>
          </TabPane>

          <TabPane tab="Implementation" key="implementation">
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <Card title="Implementation Steps" size="small">
                <Steps direction="vertical" size="small">
                  {selectedRecommendation.implementation.steps.map((step, index) => (
                    <Step
                      key={index}
                      title={`Step ${index + 1}`}
                      description={step}
                      icon={<ArrowRightOutlined />}
                    />
                  ))}
                </Steps>
              </Card>

              <Row gutter={16}>
                <Col span={12}>
                  <Card title="Time Estimate" size="small">
                    <Statistic
                      value={selectedRecommendation.implementation.estimatedTime}
                      prefix={<ClockCircleOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={12}>
                  <Card title="Effort Level" size="small">
                    <Tag
                      color={
                        selectedRecommendation.effort === 'high' ? 'red' :
                        selectedRecommendation.effort === 'medium' ? 'orange' : 'green'
                      }
                      style={{ fontSize: '14px', padding: '4px 8px' }}
                    >
                      {selectedRecommendation.effort.toUpperCase()} EFFORT
                    </Tag>
                  </Card>
                </Col>
              </Row>

              {selectedRecommendation.implementation.resources.length > 0 && (
                <Card title="Helpful Resources" size="small">
                  <List
                    size="small"
                    dataSource={selectedRecommendation.implementation.resources}
                    renderItem={(resource) => (
                      <List.Item>
                        <BookOutlined style={{ marginRight: 8 }} />
                        {resource}
                      </List.Item>
                    )}
                  />
                </Card>
              )}
            </Space>
          </TabPane>

          {selectedRecommendation.codeExample && (
            <TabPane tab="Code Example" key="code">
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Card title="Before" size="small">
                  <pre style={{
                    background: '#f5f5f5',
                    padding: '12px',
                    borderRadius: '4px',
                    overflow: 'auto'
                  }}>
                    {selectedRecommendation.codeExample.before}
                  </pre>
                </Card>

                <Card title="After" size="small">
                  <pre style={{
                    background: '#f6ffed',
                    padding: '12px',
                    borderRadius: '4px',
                    overflow: 'auto',
                    border: '1px solid #b7eb8f'
                  }}>
                    {selectedRecommendation.codeExample.after}
                  </pre>
                </Card>
              </Space>
            </TabPane>
          )}

          <TabPane tab="AI Analysis" key="analysis">
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <Alert
                message="AI Reasoning"
                description={selectedRecommendation.aiReasoning}
                type="info"
                showIcon
                icon={<RobotOutlined />}
              />

              <Row gutter={16}>
                <Col span={12}>
                  <Card title="Confidence Score" size="small">
                    <Progress
                      type="circle"
                      percent={selectedRecommendation.confidence}
                      format={(percent) => `${percent}%`}
                      strokeColor={
                        selectedRecommendation.confidence > 80 ? '#52c41a' :
                        selectedRecommendation.confidence > 60 ? '#faad14' : '#f5222d'
                      }
                    />
                  </Card>
                </Col>
                <Col span={12}>
                  <Card title="Tags" size="small">
                    <Space wrap>
                      {selectedRecommendation.tags.map(tag => (
                        <Tag key={tag} color="blue">{tag}</Tag>
                      ))}
                    </Space>
                  </Card>
                </Col>
              </Row>

              <Card title="Provide Feedback" size="small">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div>
                    <Text>How helpful is this recommendation?</Text>
                    <Rate
                      style={{ marginLeft: 12 }}
                      onChange={(rating) => {
                        handleProvideFeedback(selectedRecommendation.id, {
                          rating,
                          helpful: rating >= 3
                        });
                      }}
                    />
                  </div>
                </Space>
              </Card>
            </Space>
          </TabPane>
        </Tabs>
      )}
    </Modal>
  );

  const renderStats = () => {
    const stats = {
      total: recommendations.length,
      applied: recommendations.filter(r => r.applied).length,
      critical: recommendations.filter(r => r.priority === 'critical').length,
      avgConfidence: recommendations.length > 0 ?
        Math.round(recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length) : 0
    };

    return (
      <Row gutter={16}>
        <Col span={6}>
          <Statistic
            title="Total Recommendations"
            value={stats.total}
            prefix={<BulbOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Applied"
            value={stats.applied}
            prefix={<CheckCircleOutlined />}
            valueStyle={{ color: '#52c41a' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Critical Priority"
            value={stats.critical}
            prefix={<WarningOutlined />}
            valueStyle={{ color: '#f5222d' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Avg Confidence"
            value={stats.avgConfidence}
            suffix="%"
            prefix={<TrophyOutlined />}
            valueStyle={{
              color: stats.avgConfidence > 80 ? '#52c41a' :
                     stats.avgConfidence > 60 ? '#faad14' : '#f5222d'
            }}
          />
        </Col>
      </Row>
    );
  };

  return (
    <Card
      className={className}
      title={
        <Space>
          <RobotOutlined style={{ color: '#1890ff' }} />
          <span>AI Recommendations Engine</span>
          <Badge count={filteredRecommendations.filter(r => !r.applied).length} />
        </Space>
      }
      extra={
        <Space>
          <Text type="secondary" style={{ fontSize: '11px' }}>
            {lastGeneration ? `Last: ${lastGeneration.toLocaleTimeString()}` : 'Not generated'}
          </Text>
          <Switch
            size="small"
            checked={autoGenerate}
            onChange={setAutoGenerate}
            checkedChildren="Auto"
            unCheckedChildren="Manual"
          />
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={isGenerating}
            onClick={generateRecommendations}
          >
            Generate
          </Button>
        </Space>
      }
      loading={insightsLoading || hotspotsLoading}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Statistics */}
        {renderStats()}

        <Divider style={{ margin: '12px 0' }} />

        {/* Filters */}
        <Row gutter={[16, 8]}>
          <Col xs={12} sm={6}>
            <Select
              placeholder="Type"
              value={filters.type}
              onChange={(value) => setFilters(prev => ({ ...prev, type: value }))}
              style={{ width: '100%' }}
              size="small"
            >
              <Select.Option value="all">All Types</Select.Option>
              <Select.Option value="refactor">Refactor</Select.Option>
              <Select.Option value="optimization">Optimization</Select.Option>
              <Select.Option value="documentation">Documentation</Select.Option>
              <Select.Option value="testing">Testing</Select.Option>
              <Select.Option value="architecture">Architecture</Select.Option>
              <Select.Option value="security">Security</Select.Option>
            </Select>
          </Col>
          <Col xs={12} sm={6}>
            <Select
              placeholder="Priority"
              value={filters.priority}
              onChange={(value) => setFilters(prev => ({ ...prev, priority: value }))}
              style={{ width: '100%' }}
              size="small"
            >
              <Select.Option value="all">All Priorities</Select.Option>
              <Select.Option value="critical">Critical</Select.Option>
              <Select.Option value="high">High</Select.Option>
              <Select.Option value="medium">Medium</Select.Option>
              <Select.Option value="low">Low</Select.Option>
            </Select>
          </Col>
          <Col xs={12} sm={6}>
            <Select
              placeholder="Category"
              value={filters.category}
              onChange={(value) => setFilters(prev => ({ ...prev, category: value }))}
              style={{ width: '100%' }}
              size="small"
            >
              <Select.Option value="all">All Categories</Select.Option>
              <Select.Option value="code_quality">Code Quality</Select.Option>
              <Select.Option value="performance">Performance</Select.Option>
              <Select.Option value="maintainability">Maintainability</Select.Option>
              <Select.Option value="security">Security</Select.Option>
              <Select.Option value="best_practices">Best Practices</Select.Option>
            </Select>
          </Col>
          <Col xs={12} sm={6}>
            <Select
              placeholder="Effort"
              value={filters.effort}
              onChange={(value) => setFilters(prev => ({ ...prev, effort: value }))}
              style={{ width: '100%' }}
              size="small"
            >
              <Select.Option value="all">All Effort Levels</Select.Option>
              <Select.Option value="low">Low Effort</Select.Option>
              <Select.Option value="medium">Medium Effort</Select.Option>
              <Select.Option value="high">High Effort</Select.Option>
            </Select>
          </Col>
        </Row>

        {/* Recommendations List */}
        <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
          {filteredRecommendations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <RobotOutlined style={{ fontSize: '48px', color: '#d9d9d9' }} />
              <div style={{ marginTop: 16 }}>
                <Title level={4}>No Recommendations Available</Title>
                <Text type="secondary">
                  {isGenerating ? 'Generating AI recommendations...' :
                   recommendations.length === 0 ? 'Click "Generate" to create AI-powered recommendations' :
                   'No recommendations match your current filters'}
                </Text>
              </div>
            </div>
          ) : (
            filteredRecommendations.map(renderRecommendationCard)
          )}
        </div>
      </Space>

      {renderDetailModal()}
    </Card>
  );
};

export default AIRecommendationsEngine;