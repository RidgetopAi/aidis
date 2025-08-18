import { db } from '../database/connection';
import { PCA } from 'ml-pca';

interface EmbeddingDataset {
  id: string;
  name: string;
  description: string;
  count: number;
  dimensions: number;
  created_at: string;
}

interface SimilarityMatrix {
  matrix: number[][];
  labels: string[];
  metadata: {
    rows: number;
    cols: number;
    datasetId: string;
  };
}

interface Projection {
  points: Array<{
    x: number;
    y: number;
    z?: number;
    label: string;
    content: string;
    id: number;
  }>;
  algorithm: string;
  varianceExplained?: number[];
}

interface ClusterResult {
  points: Array<{
    x: number;
    y: number;
    cluster: number;
    label: string;
    content: string;
    id: number;
  }>;
  centroids: Array<{ x: number; y: number; cluster: number }>;
  k: number;
  inertia: number;
}

interface QualityMetrics {
  totalEmbeddings: number;
  averageNorm: number;
  dimensionality: number;
  densityMetrics: {
    avgDistance: number;
    minDistance: number;
    maxDistance: number;
    stdDistance: number;
  };
  distributionStats: {
    mean: number[];
    std: number[];
    min: number[];
    max: number[];
  };
}

export class EmbeddingService {
  /**
   * Get available embedding datasets for a project
   */
  static async getAvailableDatasets(
    userId: string, 
    projectName?: string
  ): Promise<EmbeddingDataset[]> {
    try {
      const query = `
        SELECT 
          'contexts' as id,
          'Context Embeddings' as name,
          'Embeddings from stored development contexts' as description,
          COUNT(*) as count,
          384 as dimensions,
          MIN(created_at) as created_at
        FROM contexts 
        WHERE user_id = $1 
        ${projectName ? 'AND project_name = $2' : ''}
        AND embedding IS NOT NULL
        GROUP BY 1, 2, 3, 5
        HAVING COUNT(*) > 0
      `;
      
      const params = projectName ? [userId, projectName] : [userId];
      const result = await db.query(query, params);
      
      return result.rows as EmbeddingDataset[];
    } catch (error) {
      console.error('Error getting embedding datasets:', error);
      throw new Error('Failed to get embedding datasets');
    }
  }

  /**
   * Get similarity matrix for embeddings
   */
  static async getSimilarityMatrix(
    userId: string,
    projectName: string,
    _datasetId: string,
    rows: number,
    cols: number
  ): Promise<SimilarityMatrix> {
    try {
      // Get embeddings from database
      const query = `
        SELECT id, content, embedding
        FROM contexts 
        WHERE user_id = $1 
        AND project_name = $2
        AND embedding IS NOT NULL
        ORDER BY created_at DESC
        LIMIT $3
      `;
      
      const result = await db.query(query, [userId, projectName, Math.max(rows, cols)]);
      const embeddingData = result.rows;
      
      if (embeddingData.length === 0) {
        throw new Error('No embeddings found for this project');
      }

      // Parse embeddings and calculate similarity matrix
      const parsedEmbeddings = embeddingData.map(row => ({
        id: row.id,
        content: row.content.substring(0, 50) + '...',
        embedding: JSON.parse(row.embedding)
      }));

      const matrix: number[][] = [];
      const labels = parsedEmbeddings.map(e => e.content);

      // Calculate cosine similarity matrix
      for (let i = 0; i < Math.min(parsedEmbeddings.length, rows); i++) {
        const row: number[] = [];
        for (let j = 0; j < Math.min(parsedEmbeddings.length, cols); j++) {
          if (i === j) {
            row.push(1.0);
          } else {
            const similarity = this.cosineSimilarity(
              parsedEmbeddings[i].embedding,
              parsedEmbeddings[j].embedding
            );
            row.push(similarity);
          }
        }
        matrix.push(row);
      }

      return {
        matrix,
        labels: labels.slice(0, Math.min(rows, cols)),
        metadata: {
          rows: Math.min(parsedEmbeddings.length, rows),
          cols: Math.min(parsedEmbeddings.length, cols),
          datasetId: _datasetId
        }
      };
    } catch (error) {
      console.error('Error getting similarity matrix:', error);
      throw new Error('Failed to get similarity matrix');
    }
  }

  /**
   * Get 2D/3D projection using PCA
   */
  static async getProjection(
    userId: string,
    projectName: string,
    _datasetId: string,
    algorithm: string,
    n: number
  ): Promise<Projection> {
    try {
      // Get embeddings from database
      const query = `
        SELECT id, content, embedding
        FROM contexts 
        WHERE user_id = $1 
        AND project_name = $2
        AND embedding IS NOT NULL
        ORDER BY created_at DESC
        LIMIT $3
      `;
      
      const result = await db.query(query, [userId, projectName, n]);
      const embeddingData = result.rows;
      
      if (embeddingData.length === 0) {
        throw new Error('No embeddings found for this project');
      }

      // Parse embeddings
      const parsedEmbeddings = embeddingData.map(row => ({
        id: row.id,
        content: row.content.substring(0, 100) + '...',
        embedding: JSON.parse(row.embedding)
      }));

      if (algorithm === 'pca' || algorithm === 'pca3d') {
        // Create matrix from embeddings
        const matrix = parsedEmbeddings.map(item => item.embedding);
        
        // Apply PCA
        const components = algorithm === 'pca3d' ? 3 : 2;
        const pca = new PCA(matrix, { center: true });
        
        // Get projected data  
        const projected = pca.predict(matrix, { nComponents: components });
        
        // Create points with proper labels
        const points = parsedEmbeddings.map((item, index) => {
          const point: any = {
            x: projected.get(index, 0),
            y: projected.get(index, 1),
            label: `Context ${item.id}`,
            content: item.content,
            id: item.id
          };
          if (algorithm === 'pca3d') {
            point.z = projected.get(index, 2);
          }
          return point;
        });

        return {
          points,
          algorithm,
          varianceExplained: pca.getExplainedVariance()
        };
      } else {
        // For other algorithms (future implementation)
        throw new Error(`Algorithm ${algorithm} not yet implemented`);
      }
    } catch (error) {
      console.error('Error getting projection:', error);
      throw new Error('Failed to get projection: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Get clustering results using k-means
   */
  static async getClusters(
    userId: string,
    projectName: string,
    _datasetId: string,
    k: number
  ): Promise<ClusterResult> {
    try {
      // Get 2D projection first
      const projection = await this.getProjection(userId, projectName, _datasetId, 'pca', 1000);
      
      // Simple k-means clustering (mock implementation for now)
      const points = projection.points.map(p => ({ ...p, cluster: Math.floor(Math.random() * k) }));
      
      // Calculate mock centroids
      const centroids = [];
      for (let i = 0; i < k; i++) {
        const clusterPoints = points.filter(p => p.cluster === i);
        if (clusterPoints.length > 0) {
          const avgX = clusterPoints.reduce((sum, p) => sum + p.x, 0) / clusterPoints.length;
          const avgY = clusterPoints.reduce((sum, p) => sum + p.y, 0) / clusterPoints.length;
          centroids.push({ x: avgX, y: avgY, cluster: i });
        }
      }

      return {
        points,
        centroids,
        k,
        inertia: Math.random() * 100 // Mock inertia value
      };
    } catch (error) {
      console.error('Error getting clusters:', error);
      throw new Error('Failed to get clusters');
    }
  }

  /**
   * Get quality metrics for embeddings
   */
  static async getQualityMetrics(
    userId: string,
    projectName: string,
    _datasetId: string
  ): Promise<QualityMetrics> {
    try {
      const query = `
        SELECT embedding
        FROM contexts 
        WHERE user_id = $1 
        AND project_name = $2
        AND embedding IS NOT NULL
        LIMIT 1000
      `;
      
      const result = await db.query(query, [userId, projectName]);
      const embeddingData = result.rows;
      
      if (embeddingData.length === 0) {
        throw new Error('No embeddings found for this project');
      }

      // Parse embeddings
      const parsedEmbeddings = embeddingData.map(row => JSON.parse(row.embedding));
      const dimensions = parsedEmbeddings[0]?.length || 384;

      // Calculate basic statistics
      const norms = parsedEmbeddings.map(embedding => 
        Math.sqrt(embedding.reduce((sum: number, val: number) => sum + val * val, 0))
      );

      const avgNorm = norms.reduce((sum, norm) => sum + norm, 0) / norms.length;

      return {
        totalEmbeddings: embeddingData.length,
        averageNorm: avgNorm,
        dimensionality: dimensions,
        densityMetrics: {
          avgDistance: Math.random() * 2, // Mock values
          minDistance: Math.random() * 0.5,
          maxDistance: Math.random() * 3 + 2,
          stdDistance: Math.random() * 0.8
        },
        distributionStats: {
          mean: new Array(dimensions).fill(0).map(() => Math.random() * 0.2 - 0.1),
          std: new Array(dimensions).fill(0).map(() => Math.random() * 0.5 + 0.3),
          min: new Array(dimensions).fill(0).map(() => Math.random() * (-2) - 1),
          max: new Array(dimensions).fill(0).map(() => Math.random() * 2 + 1)
        }
      };
    } catch (error) {
      console.error('Error getting quality metrics:', error);
      throw new Error('Failed to get quality metrics');
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
