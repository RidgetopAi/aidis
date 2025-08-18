import React, { useState } from 'react';
import { Typography, Tabs, Card, Space, Alert } from 'antd';
import {
  HeatMapOutlined,
  DotChartOutlined,
  GroupOutlined,
  ThunderboltOutlined,
  BarChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useEmbeddingStore } from '../stores/embeddingStore';
import SimilarityHeatmap from '../components/embedding/SimilarityHeatmap';
import ScatterProjection from '../components/embedding/ScatterProjection';

const { Title, Text } = Typography;

const Embedding: React.FC = () => {
  const { activeTab, setActiveTab } = useEmbeddingStore();

  const tabItems = [
    {
      key: 'heatmap',
      label: (
        <Space>
          <HeatMapOutlined />
          Similarity Heatmap
        </Space>
      ),
      children: <SimilarityHeatmap />,
    },
    {
      key: 'scatter',
      label: (
        <Space>
          <DotChartOutlined />
          2D Projection
        </Space>
      ),
      children: <ScatterProjection />,
    },
    {
      key: 'cluster',
      label: (
        <Space>
          <GroupOutlined />
          Clustering
        </Space>
      ),
      children: (
        <Card title="Embedding Clusters" bordered={false}>
          <Alert
            message="Phase 3: k-means Clustering Overlay"
            description="Clustering analysis with k-means algorithm and cluster visualization."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Text type="secondary">
            Apply clustering algorithms to group similar embeddings and visualize 
            the clusters with different colors and labels.
          </Text>
        </Card>
      ),
    },
    {
      key: '3d',
      label: (
        <Space>
          <ThunderboltOutlined />
          3D View
        </Space>
      ),
      children: (
        <Card title="3D Embedding Space" bordered={false}>
          <Alert
            message="Phase 4: 3D Toggle with Plotly"
            description="Interactive 3D visualization using react-plotly.js for immersive exploration."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Text type="secondary">
            Explore embeddings in 3D space with interactive rotation, zoom, and hover details
            for a more immersive understanding of the embedding space.
          </Text>
        </Card>
      ),
    },
    {
      key: 'metrics',
      label: (
        <Space>
          <BarChartOutlined />
          Metrics
        </Space>
      ),
      children: (
        <Card title="Embedding Quality Metrics" bordered={false}>
          <Alert
            message="Phase 5: Quality Metrics Dashboard"
            description="Statistical analysis and quality metrics for embedding evaluation."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Text type="secondary">
            Comprehensive metrics including silhouette scores, inertia, 
            variance explained, and other quality indicators.
          </Text>
        </Card>
      ),
    },
    {
      key: 'settings',
      label: (
        <Space>
          <SettingOutlined />
          Settings
        </Space>
      ),
      children: (
        <Card title="Visualization Settings" bordered={false}>
          <Alert
            message="Phase 6: Performance & Polish"
            description="Configuration options, performance optimizations, and export capabilities."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Text type="secondary">
            Configure visualization parameters, performance settings, 
            and export options for sharing insights.
          </Text>
        </Card>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>Embedding Visualization System</Title>
        <Text type="secondary">
          Interactive visualization and analysis of embedding vectors from your AIDIS context data.
          Explore similarities, clusters, and patterns in high-dimensional space.
        </Text>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="large"
        tabPosition="top"
      />
    </div>
  );
};

export default Embedding;
