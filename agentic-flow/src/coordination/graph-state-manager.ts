/**
 * Graph-Based Agent State Management
 * Uses @ruvector/graph-node for hypergraph state tracking.
 * Falls back to in-memory maps when the native backend is unavailable.
 */

interface GraphNode {
  id: string;
  type: 'agent' | 'task' | 'episode' | 'skill';
  properties: Record<string, any>;
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
  properties: Record<string, any>;
  timestamp: number;
}

interface GraphStats {
  nodes: number;
  edges: number;
  available: boolean;
}

export class GraphStateManager {
  private graphDb: any = null;
  private available = false;
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];

  /**
   * Attempt to load @ruvector/graph-node.
   * Returns true if the native graph backend is available.
   */
  async initialize(): Promise<boolean> {
    try {
      const graphModule = await import('@ruvector/graph-node');
      const GraphDB = (graphModule as any).GraphDB || (graphModule as any).default;
      if (GraphDB) {
        this.graphDb = new GraphDB();
        this.available = true;
      }
      return this.available;
    } catch {
      this.available = false;
      return false;
    }
  }

  /**
   * Add a node to the graph. Persists in the native backend when available.
   */
  async addNode(node: GraphNode): Promise<void> {
    this.nodes.set(node.id, node);
    if (this.graphDb) {
      try {
        await this.graphDb.addNode(node);
      } catch { /* in-memory fallback already persisted */ }
    }
  }

  /**
   * Add an edge between two nodes.
   */
  async addEdge(edge: GraphEdge): Promise<void> {
    this.edges.push(edge);
    if (this.graphDb) {
      try {
        await this.graphDb.addEdge(edge.from, edge.type, edge.to, edge.properties);
      } catch { /* in-memory fallback already persisted */ }
    }
  }

  /**
   * Remove a node and all associated edges.
   */
  async removeNode(nodeId: string): Promise<void> {
    this.nodes.delete(nodeId);
    this.edges = this.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
    if (this.graphDb) {
      try {
        await this.graphDb.removeNode(nodeId);
      } catch { /* in-memory already cleaned */ }
    }
  }

  /**
   * Query the graph. Falls back to returning all nodes of matching type.
   */
  async query(cypher: string): Promise<any[]> {
    if (this.graphDb) {
      try {
        return await this.graphDb.query(cypher);
      } catch { /* fall through to in-memory */ }
    }

    // Simple in-memory query: extract type filter from MATCH (:Type) patterns
    const typeMatch = cypher.match(/:\s*(\w+)/);
    if (typeMatch) {
      const filterType = typeMatch[1].toLowerCase();
      return Array.from(this.nodes.values()).filter(
        n => n.type.toLowerCase() === filterType
      );
    }
    return Array.from(this.nodes.values());
  }

  /**
   * Get all edges connected to a node.
   */
  async getRelationships(nodeId: string): Promise<GraphEdge[]> {
    return this.edges.filter(e => e.from === nodeId || e.to === nodeId);
  }

  /**
   * Get a specific node by ID.
   */
  getNode(nodeId: string): GraphNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get all nodes of a given type.
   */
  getNodesByType(type: GraphNode['type']): GraphNode[] {
    return Array.from(this.nodes.values()).filter(n => n.type === type);
  }

  /**
   * Return current graph statistics.
   */
  getStats(): GraphStats {
    return {
      nodes: this.nodes.size,
      edges: this.edges.length,
      available: this.available,
    };
  }

  isAvailable(): boolean {
    return this.available;
  }
}

export const graphStateManager = new GraphStateManager();
