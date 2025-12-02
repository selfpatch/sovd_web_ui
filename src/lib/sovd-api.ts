import type { SovdEntity, SovdEntityDetails, ComponentTopic, ComponentTopicPublishRequest } from './types';

/**
 * Timeout wrapper for fetch requests
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 10000): Promise<Response> {
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
    const parts = path.replace(/^\//, '').split('/');

    // Level 1: /area -> fetch components
    if (parts.length === 1) {
      const areaId = parts[0];
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
        href: `/${areaId}/${comp.id}`,
        hasChildren: true // Components now have topics as children
      }));
    }

    // Level 2: /area/component -> fetch topics
    if (parts.length === 2) {
      const componentId = parts[1];
      const response = await fetchWithTimeout(this.getUrl(`components/${componentId}/data`), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const topics = await response.json() as ComponentTopic[];

      return topics.map(topic => {
        // Clean up topic name for ID/href to avoid double slashes
        // If topic name starts with /, remove it for ID purposes if needed,
        // but usually we want the full name.
        // The issue is href construction: `/${parts[0]}/${parts[1]}/${topic.topic}`
        // If topic.topic is "/foo", we get "/area/comp//foo".

        const cleanTopicName = topic.topic.startsWith('/') ? topic.topic.slice(1) : topic.topic;
        // Use the last part of the topic name as the ID for the tree view if it's very long?
        // No, keep full name but fix href.

        return {
          id: topic.topic,
          name: topic.topic,
          type: 'topic',
          href: `/${parts[0]}/${parts[1]}/${cleanTopicName}`,
          hasChildren: false,
          // Store the full topic data so we can reuse it in the UI without re-fetching
          data: topic
        };
      });
    }

    return [];
  }

  /**
   * Get detailed information about a specific entity
   * @param path Entity path (e.g., "/area/component")
   */
  async getEntityDetails(path: string): Promise<SovdEntityDetails> {
    // Path comes from the tree, e.g. "/area_id/component_id"
    const parts = path.split('/').filter(p => p);

    // Level 3: /area/component/topic -> fetch topic details
    if (parts.length === 3) {
      const componentId = parts[1];
      const topicName = parts[2];

      // We need to fetch all topics to find the specific one, or use a specific endpoint if available
      // For now, we'll fetch all and filter, as the API seems to be component-centric
      const response = await fetchWithTimeout(this.getUrl(`components/${componentId}/data`), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const topicsData = await response.json() as ComponentTopic[];

      // Match topic name - handle potential leading slashes in topic name vs path
      const topic = topicsData.find(t => {
        const tName = t.topic.startsWith('/') ? t.topic.slice(1) : t.topic;
        return tName === topicName || t.topic === topicName;
      });

      if (!topic) {
        throw new Error(`Topic ${topicName} not found in component ${componentId}`);
      }

      return {
        id: topicName,
        name: topicName,
        href: path,
        // We wrap the single topic in an array to reuse the topic display logic if needed,
        // or we can handle it specifically in the UI
        topics: [topic],
        // Add specific topic data to the root of the entity details for easier access
        ...topic,
        // IMPORTANT: Set type AFTER spreading topic to ensure it's not overwritten by topic.type (which is the ROS message type)
        type: 'topic',
      };
    }

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
        href: `/${parts[0]}/${parts[1]}`,
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
