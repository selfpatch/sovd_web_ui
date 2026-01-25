import type {
    SovdEntity,
    SovdEntityDetails,
    ComponentTopic,
    ComponentTopicPublishRequest,
    ComponentTopicsInfo,
    ComponentConfigurations,
    ConfigurationDetail,
    SetConfigurationRequest,
    SetConfigurationResponse,
    ResetConfigurationResponse,
    ResetAllConfigurationsResponse,
    Operation,
    InvokeOperationRequest,
    OperationResponse,
    ActionGoalStatus,
    AllActionGoalsStatus,
    ActionGoalResult,
    ActionCancelResponse,
} from './types';

/**
 * Timeout wrapper for fetch requests.
 * Default timeout is 10 seconds to accommodate slower connections and large topic data responses.
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
 * Normalize base endpoint path
 * Accepts: "api/v1", "/api/v1", "/api/v1/", "api/v1/"
 * Returns: "api/v1" (no leading or trailing slashes)
 */
function normalizeBasePath(path: string): string {
    let normalized = path.trim();

    // Remove leading slashes
    while (normalized.startsWith('/')) {
        normalized = normalized.slice(1);
    }

    // Remove trailing slashes
    while (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
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
        // Normalize base endpoint using helper function
        this.baseEndpoint = normalizeBasePath(baseEndpoint);
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
            const response = await fetchWithTimeout(
                this.getUrl('health'),
                {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                    },
                },
                3000
            ); // 3 second timeout for ping
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
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const areas = await response.json();

            return areas.map((area: { id: string }) => ({
                id: area.id,
                name: area.id,
                type: 'area',
                href: `/areas/${area.id}`,
                hasChildren: true,
            }));
        }

        // Area level -> fetch components
        // Path format: /area_id
        const parts = path.replace(/^\//, '').split('/');

        // Level 1: /area -> fetch components
        if (parts.length === 1) {
            const areaId = parts[0]!;
            const response = await fetchWithTimeout(this.getUrl(`areas/${areaId}/components`), {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const components = await response.json();

            return components.map((comp: { id: string; fqn?: string; topics?: ComponentTopicsInfo }) => {
                // Check if component has any topics (publishes or subscribes)
                const hasTopics =
                    comp.topics &&
                    ((comp.topics.publishes?.length ?? 0) > 0 || (comp.topics.subscribes?.length ?? 0) > 0);

                return {
                    id: comp.id,
                    name: comp.fqn || comp.id,
                    type: 'component',
                    href: `/${areaId}/${comp.id}`,
                    hasChildren: hasTopics,
                    topicsInfo: comp.topics,
                };
            });
        }

        // Level 2: /area/component -> fetch full topic data with QoS, publishers, subscribers
        // This fetches actual topic samples which include rich metadata
        if (parts.length === 2) {
            const componentId = parts[1]!;
            const response = await fetchWithTimeout(this.getUrl(`components/${componentId}/data`), {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const topics = (await response.json()) as ComponentTopic[];

            // Return entities with FULL ComponentTopic data preserved
            // This includes: type, type_info, publishers, subscribers, QoS, etc.
            return topics.map((topic) => {
                const cleanTopicName = topic.topic.startsWith('/') ? topic.topic.slice(1) : topic.topic;
                const encodedTopicName = encodeURIComponent(cleanTopicName);

                return {
                    id: encodedTopicName,
                    name: topic.topic,
                    type: 'topic',
                    href: `/${parts[0]}/${parts[1]}/${encodedTopicName}`,
                    hasChildren: false,
                    // IMPORTANT: Store full ComponentTopic for rich topic view
                    data: topic,
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
        const parts = path.split('/').filter((p) => p);

        // Handle virtual folder paths: /area/component/data/topic
        // Transform to: /area/component/topic for API call
        if (parts.length === 4 && parts[2] === 'data') {
            const componentId = parts[1]!;
            const encodedTopicName = parts[3]!;

            // Decode topic name using standard percent-decoding
            const decodedTopicName = decodeURIComponent(encodedTopicName);

            const response = await fetchWithTimeout(this.getUrl(`components/${componentId}/data/${encodedTopicName}`), {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`Topic ${decodedTopicName} not found for component ${componentId}`);
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const topic = (await response.json()) as ComponentTopic;

            return {
                id: encodedTopicName,
                name: topic.topic || `/${decodedTopicName}`,
                href: path,
                topicData: topic,
                rosType: topic.type,
                type: 'topic',
            };
        }

        // Level 3: /area/component/topic -> fetch topic details (legacy path format)
        if (parts.length === 3) {
            const componentId = parts[1]!;
            const encodedTopicName = parts[2]!;

            // Decode topic name using standard percent-decoding
            // e.g., 'powertrain%2Fengine%2Ftemp' -> 'powertrain/engine/temp'
            const decodedTopicName = decodeURIComponent(encodedTopicName);

            // Use the dedicated single-topic endpoint
            // The REST API expects percent-encoded topic name in the URL
            const response = await fetchWithTimeout(this.getUrl(`components/${componentId}/data/${encodedTopicName}`), {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`Topic ${decodedTopicName} not found for component ${componentId}`);
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const topic = (await response.json()) as ComponentTopic;

            return {
                id: encodedTopicName,
                name: topic.topic || `/${decodedTopicName}`,
                href: path,
                topicData: topic,
                rosType: topic.type,
                type: 'topic',
            };
        }

        if (parts.length === 2) {
            const componentId = parts[1]!;
            const response = await fetchWithTimeout(this.getUrl(`components/${componentId}/data`), {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const topicsData = (await response.json()) as ComponentTopic[];

            // Build topicsInfo from fetched data for navigation
            // AND keep full topics array for detailed view (QoS, publishers, etc.)
            const topicNames = topicsData.map((t) => t.topic);
            return {
                id: componentId,
                name: componentId,
                type: 'component',
                href: `/${parts[0]!}/${parts[1]!}`,
                // Full topic data with QoS, publishers, subscribers
                topics: topicsData,
                // Simple lists for navigation
                topicsInfo: {
                    publishes: topicNames,
                    subscribes: [],
                },
            };
        }

        // If it's an area (length 1), maybe return basic info?
        // For now return empty object or basic info
        return {
            id: parts[0] ?? path,
            name: parts[0] ?? path,
            type: 'area',
            href: path,
            hasChildren: true,
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
        const response = await fetchWithTimeout(
            this.getUrl(`components/${componentId}/data/${topicName}`),
            {
                method: 'PUT',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            },
            10000
        ); // 10 second timeout for publish

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
            };
            throw new Error(errorData.error || errorData.message || `Server error (HTTP ${response.status})`);
        }
    }

    /**
     * Force a server-side refresh of the entity tree and topic map
     * This triggers the backend to rebuild its cache immediately
     * @returns Refresh stats (duration_ms, areas_count, components_count)
     */
    async refreshTree(): Promise<{
        duration_ms: number;
        areas_count: number;
        components_count: number;
    }> {
        const response = await fetchWithTimeout(
            this.getUrl('refresh'),
            {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                },
            },
            30000
        ); // 30 second timeout for full refresh

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
            };
            throw new Error(errorData.error || errorData.message || `Server error (HTTP ${response.status})`);
        }

        return await response.json();
    }

    // ===========================================================================
    // CONFIGURATIONS API (ROS 2 Parameters)
    // ===========================================================================

    /**
     * List all configurations (parameters) for a component
     * @param componentId Component ID
     */
    async listConfigurations(componentId: string): Promise<ComponentConfigurations> {
        const response = await fetchWithTimeout(this.getUrl(`components/${componentId}/configurations`), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as {
                error?: string;
                details?: string;
            };
            throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Get a specific configuration (parameter) value and metadata
     * @param componentId Component ID
     * @param paramName Parameter name
     */
    async getConfiguration(componentId: string, paramName: string): Promise<ConfigurationDetail> {
        const response = await fetchWithTimeout(
            this.getUrl(`components/${componentId}/configurations/${encodeURIComponent(paramName)}`),
            {
                method: 'GET',
                headers: { Accept: 'application/json' },
            }
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as {
                error?: string;
                details?: string;
            };
            throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Set a configuration (parameter) value
     * @param componentId Component ID
     * @param paramName Parameter name
     * @param request Request with new value
     */
    async setConfiguration(
        componentId: string,
        paramName: string,
        request: SetConfigurationRequest
    ): Promise<SetConfigurationResponse> {
        const response = await fetchWithTimeout(
            this.getUrl(`components/${componentId}/configurations/${encodeURIComponent(paramName)}`),
            {
                method: 'PUT',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            }
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as {
                error?: string;
                details?: string;
            };
            throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Reset a configuration (parameter) to its default value
     * @param componentId Component ID
     * @param paramName Parameter name
     */
    async resetConfiguration(componentId: string, paramName: string): Promise<ResetConfigurationResponse> {
        const response = await fetchWithTimeout(
            this.getUrl(`components/${componentId}/configurations/${encodeURIComponent(paramName)}`),
            {
                method: 'DELETE',
                headers: {
                    Accept: 'application/json',
                },
            }
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as {
                error?: string;
                details?: string;
            };
            throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Reset all configurations for a component to their default values
     * @param componentId Component ID
     */
    async resetAllConfigurations(componentId: string): Promise<ResetAllConfigurationsResponse> {
        const response = await fetchWithTimeout(this.getUrl(`components/${componentId}/configurations`), {
            method: 'DELETE',
            headers: {
                Accept: 'application/json',
            },
        });

        // Accept both 200 (full success) and 207 (partial success)
        if (!response.ok && response.status !== 207) {
            const errorData = (await response.json().catch(() => ({}))) as {
                error?: string;
                details?: string;
            };
            throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    // ===========================================================================
    // OPERATIONS API (ROS 2 Services & Actions)
    // ===========================================================================

    /**
     * List all operations (services + actions) for a component
     * This data comes from the component operations endpoint
     * @param componentId Component ID
     */
    async listOperations(componentId: string): Promise<Operation[]> {
        // Fetch from dedicated operations endpoint which includes type_info with schema
        const response = await fetchWithTimeout(this.getUrl(`components/${componentId}/operations`), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            if (response.status === 404) {
                // Component not found or has no operations
                return [];
            }
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Invoke an operation (service call or action goal)
     * @param componentId Component ID
     * @param operationName Operation name
     * @param request Request data (request for services, goal for actions)
     */
    async invokeOperation(
        componentId: string,
        operationName: string,
        request: InvokeOperationRequest
    ): Promise<OperationResponse> {
        const response = await fetchWithTimeout(
            this.getUrl(`components/${componentId}/operations/${encodeURIComponent(operationName)}`),
            {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            },
            30000 // 30 second timeout for operations
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as {
                error?: string;
                details?: string;
            };
            throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Get action goal status
     * @param componentId Component ID
     * @param operationName Action name
     * @param goalId Optional specific goal ID
     */
    async getActionStatus(componentId: string, operationName: string, goalId?: string): Promise<ActionGoalStatus> {
        const url = goalId
            ? this.getUrl(
                  `components/${componentId}/operations/${encodeURIComponent(operationName)}/status?goal_id=${encodeURIComponent(goalId)}`
              )
            : this.getUrl(`components/${componentId}/operations/${encodeURIComponent(operationName)}/status`);

        const response = await fetchWithTimeout(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as {
                error?: string;
                details?: string;
            };
            throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Get all action goals status for an operation
     * @param componentId Component ID
     * @param operationName Action name
     */
    async getAllActionGoalsStatus(componentId: string, operationName: string): Promise<AllActionGoalsStatus> {
        const response = await fetchWithTimeout(
            this.getUrl(`components/${componentId}/operations/${encodeURIComponent(operationName)}/status?all=true`),
            {
                method: 'GET',
                headers: { Accept: 'application/json' },
            }
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as {
                error?: string;
                details?: string;
            };
            throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Get action goal result (for completed goals)
     * @param componentId Component ID
     * @param operationName Action name
     * @param goalId Goal UUID
     */
    async getActionResult(componentId: string, operationName: string, goalId: string): Promise<ActionGoalResult> {
        const response = await fetchWithTimeout(
            this.getUrl(
                `components/${componentId}/operations/${encodeURIComponent(operationName)}/result?goal_id=${encodeURIComponent(goalId)}`
            ),
            {
                method: 'GET',
                headers: { Accept: 'application/json' },
            }
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as {
                error?: string;
                details?: string;
            };
            throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Cancel an action goal
     * @param componentId Component ID
     * @param operationName Action name
     * @param goalId Goal UUID to cancel
     */
    async cancelAction(componentId: string, operationName: string, goalId: string): Promise<ActionCancelResponse> {
        const response = await fetchWithTimeout(
            this.getUrl(
                `components/${componentId}/operations/${encodeURIComponent(operationName)}?goal_id=${encodeURIComponent(goalId)}`
            ),
            {
                method: 'DELETE',
                headers: { Accept: 'application/json' },
            }
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as {
                error?: string;
                details?: string;
            };
            throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`);
        }

        return await response.json();
    }
}

/**
 * Create a new SOVD API client instance
 */
export function createSovdClient(serverUrl: string, baseEndpoint: string = ''): SovdApiClient {
    return new SovdApiClient(serverUrl, baseEndpoint);
}
