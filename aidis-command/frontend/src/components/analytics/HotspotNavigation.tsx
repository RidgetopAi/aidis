import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Card,
  Tree,
  Breadcrumb,
  Space,
  Typography,
  Tag,
  Button,
  Input,
  Row,
  Col,
  Divider,
  Tooltip,
  Badge,
  Spin,
  Empty,
  List,
  Progress,
  Modal,
  Switch,
  Select,
  Statistic
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  FolderOutlined,
  FileOutlined,
  CodeOutlined,
  BugOutlined,
  WarningOutlined,
  SearchOutlined,
  FilterOutlined,
  HomeOutlined,
  ArrowRightOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  AlertOutlined,
  CloseCircleOutlined,
  FunctionOutlined
} from '@ant-design/icons';
import { useRealTimeHotspots, type HotspotData } from '../../hooks/useAIComprehension';

const { Text, Title } = Typography;
const { Search } = Input;
const { Option } = Select;

interface FileTreeNode extends DataNode {
  key: string;
  title: React.ReactNode;
  isLeaf?: boolean;
  children?: FileTreeNode[];
  filePath?: string;
  hotspots?: HotspotData[];
  severity?: 'low' | 'medium' | 'high' | 'critical';
  complexityScore?: number;
}

interface HotspotNavigationProps {
  projectId: string;
  onFileSelect?: (filePath: string) => void;
  onHotspotSelect?: (hotspot: HotspotData) => void;
  selectedFilePath?: string;
  className?: string;
}

interface NavigationPath {
  type: 'folder' | 'file';
  name: string;
  path: string;
}

const HotspotNavigation: React.FC<HotspotNavigationProps> = ({
  projectId,
  onFileSelect,
  onHotspotSelect,
  selectedFilePath,
  className
}) => {
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [showOnlyProblems, setShowOnlyProblems] = useState(false);
  const [navigationPath, setNavigationPath] = useState<NavigationPath[]>([
    { type: 'folder', name: 'Project Root', path: '/' }
  ]);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotData | null>(null);
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('list');

  const {
    data: hotspots,
    isLoading,
    error,
    refetch
  } = useRealTimeHotspots(projectId, {
    enabled: !!projectId,
    interval: 30000 // Update every 30 seconds
  });

  // Build file tree from hotspots data
  const fileTree = useMemo(() => {
    if (!hotspots || hotspots.length === 0) return [];

    const tree: Record<string, FileTreeNode> = {};

    // Process each hotspot
    hotspots.forEach((hotspot) => {
      const pathParts = hotspot.filePath.split('/').filter(part => part);
      let currentPath = '';

      pathParts.forEach((part, index) => {
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
        const isFile = index === pathParts.length - 1;

        if (!tree[currentPath]) {
          const severity = isFile ? hotspot.severity : undefined;
          const complexityScore = isFile ? hotspot.metrics.complexity : undefined;

          tree[currentPath] = {
            key: currentPath,
            title: isFile ? (
              <Space>
                <FileOutlined />
                <Text>{part}</Text>
                {severity && (
                  <Tag
                    color={getSeverityColor(severity)}
                    style={{ color: 'white', fontSize: '10px' }}
                  >
                    {severity.toUpperCase()}
                  </Tag>
                )}
                {complexityScore !== undefined && (
                  <Badge count={complexityScore} style={{
                    backgroundColor: getComplexityColor(complexityScore),
                    fontSize: '10px'
                  }} />
                )}
              </Space>
            ) : (
              <Space>
                <FolderOutlined />
                <Text>{part}</Text>
              </Space>
            ),
            isLeaf: isFile,
            children: [],
            filePath: isFile ? hotspot.filePath : undefined,
            hotspots: isFile ? [hotspot] : undefined,
            severity: isFile ? severity : undefined,
            complexityScore: isFile ? complexityScore : undefined
          };

          // Add to parent's children
          if (parentPath && tree[parentPath]) {
            tree[parentPath].children = tree[parentPath].children || [];
            if (!tree[parentPath].children!.find(child => child.key === currentPath)) {
              tree[parentPath].children!.push(tree[currentPath]);
            }
          }
        } else if (isFile) {
          // Merge hotspot data for files with multiple issues
          tree[currentPath].hotspots = tree[currentPath].hotspots || [];
          tree[currentPath].hotspots!.push(hotspot);

          // Update severity to highest level
          if (tree[currentPath].severity) {
            const severityLevels = { low: 1, medium: 2, high: 3, critical: 4 };
            if (severityLevels[hotspot.severity] > severityLevels[tree[currentPath].severity!]) {
              tree[currentPath].severity = hotspot.severity;
            }
          }
        }
      });
    });

    // Build root level structure
    const rootNodes: FileTreeNode[] = [];
    Object.values(tree).forEach(node => {
      const pathParts = node.key.toString().split('/').filter(part => part);
      if (pathParts.length === 1) {
        rootNodes.push(node);
      }
    });

    return rootNodes;
  }, [hotspots]);

  // Filter tree based on search and filters
  const filteredTree = useMemo(() => {
    if (!searchValue && severityFilter === 'all' && !showOnlyProblems) {
      return fileTree;
    }

    const filterNode = (node: FileTreeNode): FileTreeNode | null => {
      let shouldInclude = true;

      // Search filter
      if (searchValue) {
        const nodeName = typeof node.title === 'string' ? node.title : node.key.toString();
        shouldInclude = nodeName.toLowerCase().includes(searchValue.toLowerCase());
      }

      // Severity filter
      if (severityFilter !== 'all' && node.severity) {
        shouldInclude = shouldInclude && node.severity === severityFilter;
      }

      // Only problems filter
      if (showOnlyProblems && !node.hotspots) {
        shouldInclude = false;
      }

      // Filter children
      const filteredChildren = node.children
        ?.map(child => filterNode(child))
        .filter(child => child !== null) as FileTreeNode[] || [];

      // Include node if it matches criteria or has matching children
      if (shouldInclude || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren
        };
      }

      return null;
    };

    return fileTree.map(node => filterNode(node)).filter(node => node !== null) as FileTreeNode[];
  }, [fileTree, searchValue, severityFilter, showOnlyProblems]);

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical': return '#f5222d';
      case 'high': return '#fa8c16';
      case 'medium': return '#faad14';
      case 'low': return '#52c41a';
      default: return '#d9d9d9';
    }
  };

  const getComplexityColor = (complexity: number): string => {
    if (complexity <= 3) return '#52c41a';
    if (complexity <= 7) return '#faad14';
    if (complexity <= 10) return '#fa8c16';
    return '#f5222d';
  };

  const handleTreeSelect = (selectedKeys: React.Key[], info: any) => {
    const key = selectedKeys[0]?.toString();
    if (!key) return;

    setSelectedKeys(selectedKeys);

    const selectedNode = info.node;
    if (selectedNode?.isLeaf && selectedNode.filePath) {
      // File selected
      onFileSelect?.(selectedNode.filePath);

      // Update navigation path
      const pathParts = key.split('/').filter(part => part);
      const newPath: NavigationPath[] = [
        { type: 'folder', name: 'Project Root', path: '/' }
      ];

      let currentPath = '';
      pathParts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
        newPath.push({
          type: index === pathParts.length - 1 ? 'file' : 'folder',
          name: part,
          path: currentPath
        });
      });

      setNavigationPath(newPath);
    }
  };

  const handleExpand = (expandedKeys: React.Key[]) => {
    setExpandedKeys(expandedKeys);
    setAutoExpandParent(false);
  };

  const handleHotspotClick = (hotspot: HotspotData) => {
    setSelectedHotspot(hotspot);
    setDetailModalVisible(true);
    onHotspotSelect?.(hotspot);
  };

  const renderHotspotDetails = (hotspots: HotspotData[]) => (
    <Row gutter={[16, 16]}>
      {hotspots.map((hotspot, index) => (
        <Col xs={24} sm={12} lg={8} key={index}>
          <Card
            size="small"
            style={{ height: '100%' }}
            extra={
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => handleHotspotClick(hotspot)}
              >
                Details
              </Button>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ textAlign: 'center' }}>
                <Space>
                  <Badge
                    count={hotspot.metrics.complexity}
                    style={{ backgroundColor: getSeverityColor(hotspot.severity) }}
                  />
                  <Text strong>{hotspot.componentName}</Text>
                  <Tag color={getSeverityColor(hotspot.severity)}>
                    {hotspot.severity}
                  </Tag>
                </Space>
              </div>

              <div style={{ textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: '11px' }}>
                  {hotspot.filePath}
                </Text>
              </div>

              <Row gutter={8}>
                <Col span={12}>
                  <Statistic
                    title="Readability"
                    value={hotspot.metrics.readability}
                    suffix="%"
                    valueStyle={{
                      fontSize: '14px',
                      color: hotspot.metrics.readability > 60 ? '#52c41a' : '#f5222d'
                    }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Maintainability"
                    value={hotspot.metrics.maintainability}
                    suffix="%"
                    valueStyle={{
                      fontSize: '14px',
                      color: hotspot.metrics.maintainability > 60 ? '#52c41a' : '#f5222d'
                    }}
                  />
                </Col>
              </Row>

              <div>
                <Text strong style={{ fontSize: '12px' }}>Issues ({hotspot.issues.length}):</Text>
                <div style={{ marginTop: 4 }}>
                  {hotspot.issues.slice(0, 2).map((issue, idx) => (
                    <Tag key={idx} style={{ marginBottom: 2, fontSize: '10px' }}>
                      {issue}
                    </Tag>
                  ))}
                  {hotspot.issues.length > 2 && (
                    <Tag style={{ fontSize: '10px' }}>+{hotspot.issues.length - 2} more</Tag>
                  )}
                </div>
              </div>
            </Space>
          </Card>
        </Col>
      ))}
    </Row>
  );

  const renderTreeView = () => (
    <Tree
      showLine
      showIcon
      onExpand={handleExpand}
      expandedKeys={expandedKeys}
      autoExpandParent={autoExpandParent}
      onSelect={handleTreeSelect}
      selectedKeys={selectedKeys}
      treeData={filteredTree}
      style={{ minHeight: 300 }}
    />
  );

  const renderListView = () => {
    const filteredHotspots = hotspots?.filter(hotspot => {
      if (severityFilter !== 'all' && hotspot.severity !== severityFilter) return false;
      if (searchValue && !hotspot.filePath.toLowerCase().includes(searchValue.toLowerCase()) &&
          !hotspot.componentName.toLowerCase().includes(searchValue.toLowerCase())) return false;
      return true;
    }) || [];

    return (
      <Row gutter={[16, 16]}>
        {filteredHotspots.map((hotspot, index) => (
          <Col xs={24} sm={12} lg={8} key={index}>
            <Card
              size="small"
              style={{ height: '100%' }}
              actions={[
                <Button
                  type="link"
                  size="small"
                  onClick={() => onFileSelect?.(hotspot.filePath)}
                  key="open"
                >
                  Open File
                </Button>,
                <Button
                  type="primary"
                  size="small"
                  onClick={() => handleHotspotClick(hotspot)}
                  key="details"
                >
                  View Details
                </Button>
              ]}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ textAlign: 'center' }}>
                  <Space>
                    <Badge
                      count={hotspot.metrics.complexity}
                      style={{ backgroundColor: getSeverityColor(hotspot.severity) }}
                    />
                    <Text strong>{hotspot.componentName}</Text>
                    <Tag color={getSeverityColor(hotspot.severity)}>
                      {hotspot.severity}
                    </Tag>
                  </Space>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: '11px' }}>
                    {hotspot.filePath}
                  </Text>
                </div>

                <Row gutter={8}>
                  <Col span={12}>
                    <Statistic
                      title="Readability"
                      value={hotspot.metrics.readability}
                      suffix="%"
                      valueStyle={{
                        fontSize: '14px',
                        color: hotspot.metrics.readability > 60 ? '#52c41a' : '#f5222d'
                      }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="Maintainability"
                      value={hotspot.metrics.maintainability}
                      suffix="%"
                      valueStyle={{
                        fontSize: '14px',
                        color: hotspot.metrics.maintainability > 60 ? '#52c41a' : '#f5222d'
                      }}
                    />
                  </Col>
                </Row>

                <div>
                  <Text strong style={{ fontSize: '12px' }}>Issues ({hotspot.issues.length}):</Text>
                  <div style={{ marginTop: 4 }}>
                    {hotspot.issues.slice(0, 2).map((issue, idx) => (
                      <Tag key={idx} style={{ marginBottom: 2, fontSize: '10px' }}>
                        {issue}
                      </Tag>
                    ))}
                    {hotspot.issues.length > 2 && (
                      <Tag style={{ fontSize: '10px' }}>+{hotspot.issues.length - 2} more</Tag>
                    )}
                  </div>
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    );
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>Loading hotspot navigation...</Text>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <CloseCircleOutlined style={{ fontSize: '48px', color: '#f5222d' }} />
          <div style={{ marginTop: 16 }}>
            <Title level={4}>Failed to Load Navigation</Title>
            <Text type="secondary">{error.message}</Text>
            <div style={{ marginTop: 16 }}>
              <Button type="primary" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={className}
      title={
        <Space>
          <CodeOutlined />
          <span>Hotspot Navigation</span>
          <Badge count={hotspots?.length || 0} style={{ backgroundColor: '#f5222d' }} />
        </Space>
      }
      extra={
        <Space>
          <Select
            size="small"
            value={viewMode}
            onChange={setViewMode}
            style={{ width: 80 }}
          >
            <Option value="tree">Tree</Option>
            <Option value="list">List</Option>
          </Select>
          <Button size="small" onClick={refetch}>
            <SearchOutlined />
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* Navigation Breadcrumb */}
        <Breadcrumb>
          {navigationPath.map((pathItem, index) => (
            <Breadcrumb.Item key={pathItem.path}>
              <Space size={4}>
                {index === 0 ? <HomeOutlined /> :
                 pathItem.type === 'folder' ? <FolderOutlined /> : <FileOutlined />}
                <span>{pathItem.name}</span>
              </Space>
            </Breadcrumb.Item>
          ))}
        </Breadcrumb>

        {/* Filters */}
        <Row gutter={[16, 8]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <Search
              placeholder="Search files and components..."
              allowClear
              size="small"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              prefix={<SearchOutlined />}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              size="small"
              value={severityFilter}
              onChange={setSeverityFilter}
              style={{ width: '100%' }}
              placeholder="Severity"
            >
              <Option value="all">All</Option>
              <Option value="critical">Critical</Option>
              <Option value="high">High</Option>
              <Option value="medium">Medium</Option>
              <Option value="low">Low</Option>
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Space>
              <Text style={{ fontSize: '12px' }}>Issues Only</Text>
              <Switch
                size="small"
                checked={showOnlyProblems}
                onChange={setShowOnlyProblems}
              />
            </Space>
          </Col>
        </Row>

        <Divider style={{ margin: '12px 0' }} />

        {/* Content */}
        {filteredTree.length === 0 ? (
          <Empty
            description={
              searchValue || severityFilter !== 'all' || showOnlyProblems
                ? 'No results match your filters'
                : 'No code hotspots found'
            }
            style={{ padding: '48px 24px' }}
          />
        ) : (
          <>
            {viewMode === 'tree' ? renderTreeView() : renderListView()}
          </>
        )}

        {/* Selected File Details */}
        {selectedFilePath && (
          <Card size="small" title="File Hotspots" style={{ marginTop: 16 }}>
            {(() => {
              const fileHotspots = hotspots?.filter(h => h.filePath === selectedFilePath) || [];
              return fileHotspots.length > 0 ? (
                renderHotspotDetails(fileHotspots)
              ) : (
                <Empty description="No hotspots in selected file" />
              );
            })()}
          </Card>
        )}
      </Space>

      {/* Detail Modal */}
      {selectedHotspot && (
        <Modal
          title={
            <Space>
              <BugOutlined style={{ color: getSeverityColor(selectedHotspot.severity) }} />
              <span>{selectedHotspot.componentName}</span>
              <Tag color={getSeverityColor(selectedHotspot.severity)}>
                {selectedHotspot.severity.toUpperCase()}
              </Tag>
            </Space>
          }
          open={detailModalVisible}
          onCancel={() => setDetailModalVisible(false)}
          footer={[
            <Button key="close" onClick={() => setDetailModalVisible(false)}>
              Close
            </Button>,
            <Button key="open" type="primary" onClick={() => onFileSelect?.(selectedHotspot.filePath)}>
              Open File
            </Button>
          ]}
          width={800}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text strong>File Path:</Text>
              <Text code style={{ marginLeft: 8 }}>{selectedHotspot.filePath}</Text>
            </div>

            <Row gutter={16}>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="Complexity"
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
                    valueStyle={{ color: selectedHotspot.metrics.readability > 60 ? '#52c41a' : '#f5222d' }}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="Maintainability"
                    value={selectedHotspot.metrics.maintainability}
                    suffix="%"
                    valueStyle={{ color: selectedHotspot.metrics.maintainability > 60 ? '#52c41a' : '#f5222d' }}
                  />
                </Card>
              </Col>
            </Row>

            <div>
              <Text strong>Issues Detected:</Text>
              <div style={{ marginTop: 8 }}>
                {selectedHotspot.issues.map((issue, index) => (
                  <Tag key={index} style={{ marginBottom: 4, display: 'block', width: 'fit-content' }}>
                    {issue}
                  </Tag>
                ))}
              </div>
            </div>
          </Space>
        </Modal>
      )}
    </Card>
  );
};

export default HotspotNavigation;