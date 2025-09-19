import React, { useEffect, useState, useCallback } from 'react';
import { Card, Spin, Alert, Select, Space, InputNumber, Button } from 'antd';
import { Heatmap } from '@ant-design/plots';
import { ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { useEmbeddingStore } from '../../stores/embeddingStore';
import { EmbeddingService } from '../../services/embeddingService';
import { useProjectContext } from '../../contexts/ProjectContext';

const { Option } = Select;

interface HeatmapData {
  x: string;
  y: string;
  value: number;
}

const SimilarityHeatmap: React.FC = () => {
  const {
    datasets,
    selectedDataset,
    similarityMatrix,
    isLoading,
    error,
    heatmapSize,
    setDatasets,
    setSelectedDataset,
    setSimilarityMatrix,
    setLoading,
    setError,
    updateHeatmapSize,
  } = useEmbeddingStore();

  const { currentProject } = useProjectContext();
  const [showSettings, setShowSettings] = useState(false);

  // Load datasets on component mount
  const loadDatasets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await EmbeddingService.getDatasets(currentProject?.name);
      setDatasets(data);
      
      // Auto-select first dataset if available
      if (data.length > 0 && !selectedDataset) {
        setSelectedDataset(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load datasets');
    } finally {
      setLoading(false);
    }
  }, [currentProject?.name, setDatasets, setError, setLoading, selectedDataset, setSelectedDataset]);

  const loadSimilarityMatrix = useCallback(async () => {
    if (!selectedDataset) return;

    try {
      setLoading(true);
      setError(null);
      const data = await EmbeddingService.getSimilarityMatrix(
        selectedDataset,
        heatmapSize.rows,
        heatmapSize.cols,
        currentProject?.name
      );
      setSimilarityMatrix(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load similarity matrix');
    } finally {
      setLoading(false);
    }
  }, [selectedDataset, heatmapSize.rows, heatmapSize.cols, currentProject?.name, setError, setLoading, setSimilarityMatrix]);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  useEffect(() => {
    if (selectedDataset) {
      loadSimilarityMatrix();
    }
  }, [selectedDataset, heatmapSize, loadSimilarityMatrix]);

  const formatHeatmapData = (): HeatmapData[] => {
    if (!similarityMatrix) return [];

    const data: HeatmapData[] = [];
    const { matrix, labels } = similarityMatrix;

    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix[i].length; j++) {
        data.push({
          x: labels[j] || `Item ${j}`,
          y: labels[i] || `Item ${i}`,
          value: matrix[i][j],
        });
      }
    }

    return data;
  };

  const heatmapConfig = {
    data: formatHeatmapData(),
    xField: 'x',
    yField: 'y',
    colorField: 'value',
    reflect: 'y' as const,
    shape: 'square' as const,
    meta: {
      value: {
        min: 0,
        max: 1,
      },
    },
    xAxis: {
      label: {
        autoRotate: true,
        autoHide: true,
        style: {
          fontSize: 10,
        },
      },
    },
    yAxis: {
      label: {
        autoHide: true,
        style: {
          fontSize: 10,
        },
      },
    },
    tooltip: {
      title: 'Similarity',
      formatter: (datum: any) => ({
        name: 'Cosine Similarity',
        value: datum.value.toFixed(3),
      }),
    },
    color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffcc', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'],
    legend: {
      position: 'right' as const,
    },
    height: 500,
  };

  if (error) {
    return (
      <Card title="Similarity Heatmap">
        <Alert message="Error" description={error} type="error" showIcon />
        <Button 
          onClick={loadDatasets} 
          style={{ marginTop: 16 }}
          icon={<ReloadOutlined />}
        >
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <Card
      title="Embedding Similarity Heatmap"
      extra={
        <Space>
          <Button
            icon={<SettingOutlined />}
            onClick={() => setShowSettings(!showSettings)}
            type={showSettings ? 'primary' : 'default'}
          >
            Settings
          </Button>
          <Button 
            icon={<ReloadOutlined />}
            onClick={loadSimilarityMatrix}
            disabled={!selectedDataset}
          >
            Refresh
          </Button>
        </Space>
      }
    >
      {/* Settings Panel */}
      {showSettings && (
        <Card size="small" style={{ marginBottom: 16, backgroundColor: '#f9f9f9' }}>
          <Space wrap>
            <div>
              <label>Dataset: </label>
              <Select
                value={selectedDataset}
                onChange={setSelectedDataset}
                style={{ width: 200 }}
                placeholder="Select dataset"
              >
                {datasets.map(dataset => (
                  <Option key={dataset.id} value={dataset.id}>
                    {dataset.name} ({dataset.count} items)
                  </Option>
                ))}
              </Select>
            </div>
            
            <div>
              <label>Matrix Size: </label>
              <Space.Compact>
                <InputNumber
                  value={heatmapSize.rows}
                  onChange={(value) => updateHeatmapSize({ ...heatmapSize, rows: value || 50 })}
                  min={10}
                  max={100}
                  style={{ width: 80 }}
                  placeholder="Rows"
                />
                <span style={{ padding: '0 4px' }}>×</span>
                <InputNumber
                  value={heatmapSize.cols}
                  onChange={(value) => updateHeatmapSize({ ...heatmapSize, cols: value || 50 })}
                  min={10}
                  max={100}
                  style={{ width: 80 }}
                  placeholder="Cols"
                />
              </Space.Compact>
            </div>
          </Space>
        </Card>
      )}

      {/* Heatmap Visualization */}
      <Spin spinning={isLoading} tip="Loading similarity matrix...">
        {similarityMatrix ? (
          <div style={{ width: '100%', height: '500px' }}>
            <Heatmap {...heatmapConfig} />
            <div style={{ marginTop: 16, fontSize: '12px', color: '#666' }}>
              Showing {similarityMatrix.metadata.rows}×{similarityMatrix.metadata.cols} similarity matrix.
              Values range from 0 (completely different) to 1 (identical).
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
            {datasets.length === 0 
              ? 'No embedding datasets available. Create some contexts with embeddings first.'
              : 'Select a dataset to view the similarity heatmap.'
            }
          </div>
        )}
      </Spin>
    </Card>
  );
};

export default SimilarityHeatmap;
