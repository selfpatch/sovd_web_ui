import type { SovdEntity, SovdEntityDetails } from './types';

/**
 * Normalize URL to ensure it has a protocol
 * Accepts: "ip:port", "http://ip:port", "https://domain"
 */
function normalizeUrl(url: string): string {
  let normalized = url.trim();

  // Remove trailing slash
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  // Add http:// if no protocol specified
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `http://${normalized}`;
  }

  return normalized;
}

/**
 * SOVD API Client for discovery endpoints
 */
export class SovdApiClient {
  private baseUrl: string;

  constructor(serverUrl: string) {
    this.baseUrl = normalizeUrl(serverUrl);
  }

  /**
   * Test connection to the SOVD server
   */
  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/entities`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get root entities or children of a specific path
   * @param path Optional path to get children of (e.g., "/devices/robot1")
   */
  async getEntities(path?: string): Promise<SovdEntity[]> {
    try {
      const url = path
        ? `${this.baseUrl}/api/entities${path}`
        : `${this.baseUrl}/api/entities`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Handle both array response and wrapped response
      if (Array.isArray(data)) {
        return data;
      }

      if (data.entities && Array.isArray(data.entities)) {
        return data.entities;
      }

      // Single entity response - wrap in array
      if (data.id) {
        return [data];
      }

      return [];
    } catch (error) {
      console.error(`Failed to fetch entities from ${path || 'root'}:`, error);
      throw error;
    }
  }

  /**
   * Get detailed information about a specific entity
   * @param path Entity path (e.g., "/devices/robot1/components/lidar")
   */
  async getEntityDetails(path: string): Promise<SovdEntityDetails> {
    try {
      const response = await fetch(`${this.baseUrl}/api/entities${path}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to fetch entity details for ${path}:`, error);
      throw error;
    }
  }

  /**
   * Get the base URL of the server
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

/**
 * Create a new SOVD API client instance
 */
export function createSovdClient(serverUrl: string): SovdApiClient {
  return new SovdApiClient(serverUrl);
}
