import React, { useEffect, useState } from 'react';
import { Card, Spin, Alert, Row, Col, Statistic, Select, Slider, Divider, Button } from 'antd';
import { Scatter } from '@ant-design/plots';
import { ReloadOutlined } from '@ant-design/icons';
import { useEmbeddingStore } from '../../stores/embeddingStore';
import { EmbeddingService } from '../../services/embeddingService';

const { Option } = Select;

interface ProjectionPoint {
  x: number;
  y: number;
  z?: number;
  label: string;
  content: string;
  id: number;
}

interface ProjectionData {
  points: ProjectionPoint[];
  algorithm: string;
  varianceExplained?: number[];
}

const ScatterProjection: React.FC = () => {
  const { selectedDataset, datasets, loadDatasets } = useEmbeddingStore();
  const [projectionData, setProjectionData] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Settings state
  const [algorithm, setAlgorithm] = useState<string>('pca');
  const [sampleSize, setSampleSize] = useState<number>(500);
  
  // Selected point state
  const [selectedPoint, setSelectedPoint] = useState<ProjectionPoint | null>(null);

  useEffect(() => {
    if (datasets.length === 0) {
      loadDatasets();
    }
  }, [datasets.length, loadDatasets]);

  useEffect(() => {
    if (selectedDataset) {
      fetchProjection();
    }
  }, [selectedDataset, algorithm, sampleSize]);

  const fetchProjection = async () => {
    if (!selectedDataset) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await EmbeddingService.getProjection(
        selectedDataset,
        algorithm,
        sampleSize
      );
      setProjectionData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projection data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchProjection();
  };

  const config = {
    appendPadding: 10,
    data: projectionData?.points || [],
    xField: 'x',
    yField: 'y',
    colorField: 'id',
    size: 4,
    shape: 'circle',
    tooltip: {
      fields: ['label', 'content', 'x', 'y'],
      formatter: (datum: ProjectionPoint) => ({
        name: datum.label,
        value: `${datum.content}\nCoords: (${datum.x.toFixed(3)}, ${datum.y.toFixed(3)})`
      }),
    },
    interactions: [
      {
        type: 'brush',
        enable: true,
      },
      {
        type: 'zoom-canvas',
        enable: true,
      },
      {
        type: 'drag-canvas',
        enable: true,
      },
    ],
    onReady: (plot: any) => {
      plot.on('plot:click', (evt: any) => {
        const { data } = evt;
        if (data) {
          setSelectedPoint(data.data);
        }
      });
    },
    xAxis: {
      title: {
        text: `PC1 ${projectionData?.varianceExplained ? 
          `(${(projectionData.varianceExplained[0] * 100).toFixed(1)}%)` : ''}`,
      },
      grid: {
        line: {
          style: {
            stroke: '#f0f0f0',
          },
        },
      },
    },
    yAxis: {
      title: {
        text: `PC2 ${projectionData?.varianceExplained ? 
          `(${(projectionData.varianceExplained[1] * 100).toFixed(1)}%)` : ''}`,
      },
      grid: {
        line: {
          style: {
            stroke: '#f0f0f0',
          },
        },
      },
    },
    legend: false,
  };

  const totalVarianceExplained = projectionData?.varianceExplained?.reduce((sum, val) => sum + val, 0) || 0;

  if (datasets.length === 0) {
    return (
      <Card title="2D Scatter Plot Projection" bordered={false}>
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading datasets...</div>
        </div>
      </Card>
    );
  }

  if (!selectedDataset) {
    return (
      <Card title="2D Scatter Plot Projection" bordered={false}>
        <Alert
          message="No Dataset Selected"
          description="Please select an embedding dataset to visualize the 2D projection."
          type="info"
          showIcon
        />
      </Card>
    );
  }

  return (
    <Row gutter={16}>
      <Col span={selectedPoint ? 16 : 24}>
        <Card 
          title="2D Scatter Plot Projection" 
          bordered={false}
          extra={
            <Button 
              icon={<ReloadOutlined />} 
              onClick={handleRefresh}
              loading={loading}
            >
              Refresh
            </Button>
          }
        >
          {/* Settings Panel */}
          <Card 
            size="small" 
            title="Projection Settings" 
            style={{ marginBottom: 16 }}
            bodyStyle={{ padding: '12px 16px' }}
          >
            <Row gutter={16} align="middle">
              <Col span={6}>
                <label>Algorithm:</label>
                <Select
                  value={algorithm}
                  onChange={setAlgorithm}
                  style={{ width: '100%', marginTop: 4 }}
                  size="small"
                >
                  <Option value="pca">PCA (2D)</Option>
                  <Option value="pca3d" disabled>PCA (3D) - Phase 4</Option>
                  <Option value="tsne" disabled>t-SNE - Phase 3</Option>
                </Select>
              </Col>
              <Col span={10}>
                <label>Sample Size: {sampleSize}</label>
                <Slider
                  min={50}
                  max={1000}
                  step={50}
                  value={sampleSize}
                  onChange={setSampleSize}
                  style={{ marginTop: 4 }}
                />
              </Col>
              <Col span={8}>
                {projectionData && (
                  <Row gutter={8}>
                    <Col span={12}>
                      <Statistic
                        title="Points"
                        value={projectionData.points.length}
                        style={{ textAlign: 'center' }}
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="Variance"
                        value={`${(totalVarianceExplained * 100).toFixed(1)}%`}
                        style={{ textAlign: 'center' }}
                      />
                    </Col>
                  </Row>
                )}
              </Col>
            </Row>
          </Card>

          {/* Visualization */}
          {error && (
            <Alert
              message="Error Loading Projection"
              description={error}
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              action={
                <Button size="small" onClick={handleRefresh}>
                  Retry
                </Button>
              }
            />
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '100px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>Computing projection...</div>
            </div>
          )}

          {!loading && !error && projectionData && (
            <div style={{ height: 500 }}>
              <Scatter {...config} />
            </div>
          )}

          {!loading && !error && !projectionData && (
            <div style={{ textAlign: 'center', padding: '100px 0', color: '#999' }}>
              No projection data available. Click refresh to compute.
            </div>
          )}
        </Card>
      </Col>

      {/* Side Panel for Selected Point */}
      {selectedPoint && (
        <Col span={8}>
          <Card 
            title="Selected Point" 
            bordered={false}
            size="small"
            extra={
              <Button 
                type="text" 
                size="small"
                onClick={() => setSelectedPoint(null)}
              >
                ×
              </Button>
            }
          >
            <div style={{ marginBottom: 12 }}>
              <strong>Label:</strong> {selectedPoint.label}
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <strong>Coordinates:</strong><br />
              X: {selectedPoint.x.toFixed(4)}<br />
              Y: {selectedPoint.y.toFixed(4)}
            </div>

            <Divider size="small" />
            
            <div>
              <strong>Content Preview:</strong>
              <div style={{ 
                marginTop: 8,
                padding: 8, 
                backgroundColor: '#fafafa', 
                borderRadius: 4,
                fontSize: '12px',
                lineHeight: 1.4,
                maxHeight: 200,
                overflow: 'auto'
              }}>
                {selectedPoint.content}
              </div>
            </div>
          </Card>
        </Col>
      )}
    </Row>
  );
};

export default ScatterProjection;
