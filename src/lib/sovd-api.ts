import type { SovdEntity, SovdEntityDetails, ComponentTopic, ComponentTopicPublishRequest } from './types';

/**
 * Timeout wrapper for fetch requests
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout - server did not respond in time');
    }
    throw error;
  }
}

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
  private baseEndpoint: string;

  constructor(serverUrl: string, baseEndpoint: string = '') {
    this.baseUrl = normalizeUrl(serverUrl);
    // Normalize base endpoint: remove leading/trailing slashes
    this.baseEndpoint = baseEndpoint.replace(/^\/+|\/+$/g, '');
  }

  /**
   * Helper to construct full URL
   */
  private getUrl(endpoint: string): string {
    const prefix = this.baseEndpoint ? `${this.baseEndpoint}/` : '';
    return `${this.baseUrl}/${prefix}${endpoint}`;
  }

  /**
   * Test connection to the SOVD server
   */
  async ping(): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(this.getUrl('health'), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }, 3000); // 3 second timeout for ping
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
    // Root level -> fetch areas
    if (!path || path === '/') {
      const response = await fetchWithTimeout(this.getUrl('areas'), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const areas = await response.json();

      return areas.map((area: { id: string }) => ({
        id: area.id,
        name: area.id,
        type: 'area',
        href: `/areas/${area.id}`,
        hasChildren: true
      }));
    }

    // Area level -> fetch components
    // Path format: /area_id
    const areaId = path.replace(/^\//, '');
    // Check if it's a nested path (component inside area)
    if (areaId.includes('/')) {
      // We don't support children of components in this simple mapping yet
      return [];
    }

    const response = await fetchWithTimeout(this.getUrl(`areas/${areaId}/components`), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const components = await response.json();

    return components.map((comp: { id: string }) => ({
      id: comp.id,
      name: comp.id,
      type: 'component',
      href: `/components/${comp.id}`,
      hasChildren: false // Components are leaves in this view
    }));
  }

  /**
   * Get detailed information about a specific entity
   * @param path Entity path (e.g., "/area/component")
   */
  async getEntityDetails(path: string): Promise<SovdEntityDetails> {
    // Path comes from the tree, e.g. "/area_id/component_id"
    const parts = path.split('/').filter(p => p);

    if (parts.length === 2) {
      const componentId = parts[1];
      const response = await fetchWithTimeout(this.getUrl(`components/${componentId}/data`), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const topicsData = await response.json() as ComponentTopic[];

      // Return entity details with topics array
      return {
        id: componentId,
        name: componentId,
        type: 'component',
        href: path,
        topics: topicsData,
      };
    }

    // If it's an area (length 1), maybe return basic info?
    // For now return empty object or basic info
    return {
      id: parts[0],
      name: parts[0],
      type: 'area',
      href: path,
      hasChildren: true
    };
  }

  /**
   * Get the base URL of the server
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Publish to a component topic
   * @param componentId Component ID
   * @param topicName Topic name (relative to component namespace)
   * @param request Publish request with type and data
   */
  async publishToComponentTopic(
    componentId: string,
    topicName: string,
    request: ComponentTopicPublishRequest
  ): Promise<void> {
    const response = await fetchWithTimeout(this.getUrl(`components/${componentId}/data/${topicName}`), {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    }, 10000); // 10 second timeout for publish

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      throw new Error(errorData.error || errorData.message || `Server error (HTTP ${response.status})`);
    }
  }


}

/**
 * Create a new SOVD API client instance
 */
export function createSovdClient(serverUrl: string, baseEndpoint: string = ''): SovdApiClient {
  return new SovdApiClient(serverUrl, baseEndpoint);
}
