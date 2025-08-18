import { create } from 'zustand';
import { 
  EmbeddingDataset, 
  SimilarityMatrix, 
  Projection, 
  ClusterResult, 
  QualityMetrics,
  EmbeddingService 
} from '../services/embeddingService';

interface EmbeddingState {
  // Data
  datasets: EmbeddingDataset[];
  selectedDataset: string | null;
  similarityMatrix: SimilarityMatrix | null;
  projection: Projection | null;
  clusters: ClusterResult | null;
  metrics: QualityMetrics | null;

  // UI State
  isLoading: boolean;
  error: string | null;
  activeTab: string;

  // Settings
  heatmapSize: { rows: number; cols: number };
  projectionAlgorithm: string;
  clusterCount: number;
  sampleSize: number;

  // Actions
  loadDatasets: (projectName?: string) => Promise<void>;
  setDatasets: (datasets: EmbeddingDataset[]) => void;
  setSelectedDataset: (datasetId: string | null) => void;
  setSimilarityMatrix: (matrix: SimilarityMatrix | null) => void;
  setProjection: (projection: Projection | null) => void;
  setClusters: (clusters: ClusterResult | null) => void;
  setMetrics: (metrics: QualityMetrics | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setActiveTab: (tab: string) => void;
  updateHeatmapSize: (size: { rows: number; cols: number }) => void;
  updateProjectionAlgorithm: (algorithm: string) => void;
  updateClusterCount: (count: number) => void;
  updateSampleSize: (size: number) => void;
  clearData: () => void;
}

export const useEmbeddingStore = create<EmbeddingState>((set) => ({
  // Initial state
  datasets: [],
  selectedDataset: null,
  similarityMatrix: null,
  projection: null,
  clusters: null,
  metrics: null,
  isLoading: false,
  error: null,
  activeTab: 'heatmap',
  heatmapSize: { rows: 50, cols: 50 },
  projectionAlgorithm: 'pca',
  clusterCount: 8,
  sampleSize: 1000,

  // Actions
  loadDatasets: async (projectName) => {
    set({ isLoading: true, error: null });
    try {
      const datasets = await EmbeddingService.getDatasets(projectName);
      set({ datasets, selectedDataset: datasets.length > 0 ? datasets[0].id : null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load datasets' });
    } finally {
      set({ isLoading: false });
    }
  },
  setDatasets: (datasets) => set({ datasets }),
  setSelectedDataset: (selectedDataset) => set({ selectedDataset }),
  setSimilarityMatrix: (similarityMatrix) => set({ similarityMatrix }),
  setProjection: (projection) => set({ projection }),
  setClusters: (clusters) => set({ clusters }),
  setMetrics: (metrics) => set({ metrics }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setActiveTab: (activeTab) => set({ activeTab }),
  updateHeatmapSize: (heatmapSize) => set({ heatmapSize }),
  updateProjectionAlgorithm: (projectionAlgorithm) => set({ projectionAlgorithm }),
  updateClusterCount: (clusterCount) => set({ clusterCount }),
  updateSampleSize: (sampleSize) => set({ sampleSize }),
  clearData: () => set({ 
    similarityMatrix: null, 
    projection: null, 
    clusters: null, 
    metrics: null 
  }),
}));
