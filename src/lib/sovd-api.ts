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
    DataItemResponse,
    Parameter,
    // New SOVD-compliant types
    Execution,
    CreateExecutionRequest,
    CreateExecutionResponse,
    ListExecutionsResponse,
    App,
    AppCapabilities,
    SovdFunction,
    FunctionCapabilities,
    Fault,
    FaultSeverity,
    FaultStatus,
    ListFaultsResponse,
    ListSnapshotsResponse,
    ServerCapabilities,
    VersionInfo,
    SovdError,
    SovdResourceEntityType,
} from './types';
import { convertJsonSchemaToTopicSchema } from './schema-utils';

// Re-export SovdResourceEntityType for convenience
export type { SovdResourceEntityType };

/** Resource collection types available on entities */
export type ResourceCollectionType = 'data' | 'operations' | 'configurations' | 'faults';

/** Map of resource types to their list result types */
export interface ResourceListResults {
    data: ComponentTopic[];
    operations: Operation[];
    configurations: ComponentConfigurations;
    faults: ListFaultsResponse;
}

/**
 * Helper to unwrap items from SOVD API response
 * API returns {items: [...]} format, but we often want just the array
 */
function unwrapItems<T>(response: unknown): T[] {
    if (Array.isArray(response)) {
        return response as T[];
    }
    const wrapped = response as { items?: T[] };
    return wrapped.items ?? [];
}

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
 * Strip direction suffix (:publish, :subscribe, :both) from topic name
 * The frontend adds these suffixes to uniqueKey for UI purposes,
 * but the API expects the original topic ID without the suffix.
 */
function stripDirectionSuffix(topicName: string): string {
    return topicName.replace(/:(publish|subscribe|both)$/, '');
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

    // ===========================================================================
    // GENERIC RESOURCE API (unified entry point for all resource collections)
    // ===========================================================================

    /**
     * Generic method to fetch any resource collection for any entity type.
     * This is the single entry point for all resource operations to ensure consistency.
     *
     * @param entityType The type of entity (areas, components, apps, functions)
     * @param entityId The entity identifier
     * @param resourceType The resource collection type (data, operations, configurations, faults)
     * @returns The resource collection with appropriate type
     */
    async getResources<T extends ResourceCollectionType>(
        entityType: SovdResourceEntityType,
        entityId: string,
        resourceType: T
    ): Promise<ResourceListResults[T]> {
        const response = await fetchWithTimeout(this.getUrl(`${entityType}/${entityId}/${resourceType}`), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            if (response.status === 404) {
                // Return empty collection for 404
                return this.emptyResourceResult(resourceType);
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const rawData = await response.json();
        return this.transformResourceData(resourceType, rawData, entityId);
    }

    /**
     * Get empty result for a resource type (used for 404 responses)
     */
    private emptyResourceResult<T extends ResourceCollectionType>(resourceType: T): ResourceListResults[T] {
        const results: ResourceListResults = {
            data: [],
            operations: [],
            configurations: { component_id: '', node_name: '', parameters: [] },
            faults: { items: [], count: 0 },
        };
        return results[resourceType] as ResourceListResults[T];
    }

    /**
     * Transform raw API response to typed resource collection
     */
    private transformResourceData<T extends ResourceCollectionType>(
        resourceType: T,
        rawData: unknown,
        entityId: string
    ): ResourceListResults[T] {
        switch (resourceType) {
            case 'data':
                return this.transformDataResponse(rawData) as ResourceListResults[T];
            case 'operations':
                return unwrapItems<Operation>(rawData) as ResourceListResults[T];
            case 'configurations':
                return this.transformConfigurationsResponse(rawData, entityId) as ResourceListResults[T];
            case 'faults':
                return this.transformFaultsResponse(rawData) as ResourceListResults[T];
            default:
                throw new Error(`Unknown resource type: ${resourceType}`);
        }
    }

    /**
     * Transform data API response to ComponentTopic[]
     */
    private transformDataResponse(rawData: unknown): ComponentTopic[] {
        interface DataItem {
            id: string;
            name: string;
            category?: string;
            'x-medkit'?: {
                ros2?: { topic?: string; type?: string; direction?: string };
                type_info?: { schema?: unknown; default_value?: unknown };
            };
        }
        const dataItems = unwrapItems<DataItem>(rawData);
        return dataItems.map((item) => {
            const rawTypeInfo = item['x-medkit']?.type_info;
            const convertedSchema = rawTypeInfo?.schema
                ? convertJsonSchemaToTopicSchema(rawTypeInfo.schema)
                : undefined;
            const direction = item['x-medkit']?.ros2?.direction;
            const topicName = item.name || item['x-medkit']?.ros2?.topic || item.id;
            return {
                topic: topicName,
                timestamp: Date.now() * 1000000,
                data: null,
                status: 'metadata_only' as const,
                type: item['x-medkit']?.ros2?.type,
                type_info: convertedSchema
                    ? {
                          schema: convertedSchema,
                          default_value: rawTypeInfo?.default_value as Record<string, unknown>,
                      }
                    : undefined,
                // Direction-based fields for apps/functions
                isPublisher: direction === 'publish' || direction === 'both',
                isSubscriber: direction === 'subscribe' || direction === 'both',
                uniqueKey: direction ? `${topicName}:${direction}` : topicName,
            };
        });
    }

    /**
     * Transform configurations API response to ComponentConfigurations
     */
    private transformConfigurationsResponse(rawData: unknown, entityId: string): ComponentConfigurations {
        const data = rawData as {
            'x-medkit'?: {
                entity_id?: string;
                ros2?: { node?: string };
                parameters?: Parameter[];
            };
        };
        const xMedkit = data['x-medkit'] || {};
        return {
            component_id: xMedkit.entity_id || entityId,
            node_name: xMedkit.ros2?.node || entityId,
            parameters: xMedkit.parameters || [],
        };
    }

    /**
     * Transform faults API response to ListFaultsResponse
     */
    private transformFaultsResponse(rawData: unknown): ListFaultsResponse {
        const data = rawData as {
            items?: unknown[];
            'x-medkit'?: { count?: number };
        };
        const items = (data.items || []).map((f: unknown) =>
            this.transformFault(f as Parameters<typeof this.transformFault>[0])
        );
        return { items, count: data['x-medkit']?.count || items.length };
    }

    // ===========================================================================
    // ENTITY TREE NAVIGATION
    // ===========================================================================

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
            const areasResponse = await response.json();
            // Handle both array and wrapped {areas: [...]} response formats
            const areas = Array.isArray(areasResponse)
                ? areasResponse
                : (areasResponse.areas ?? areasResponse.items ?? []);

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
            const componentsResponse = await response.json();
            // Handle both array and wrapped {components: [...]} response formats
            const components = Array.isArray(componentsResponse)
                ? componentsResponse
                : (componentsResponse.components ?? componentsResponse.items ?? []);

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

            // API returns {items: [{id, name, category, x-medkit}]}
            interface DataItem {
                id: string;
                name: string;
                category?: string;
                'x-medkit'?: { ros2?: { topic?: string; direction?: string } };
            }
            const dataItems = unwrapItems<DataItem>(await response.json());

            // Return entities with transformed data
            return dataItems.map((item) => {
                const topicName = item.name || item['x-medkit']?.ros2?.topic || item.id;
                const cleanTopicName = topicName.startsWith('/') ? topicName.slice(1) : topicName;
                const encodedTopicName = encodeURIComponent(cleanTopicName);

                return {
                    id: encodedTopicName,
                    name: topicName,
                    type: 'topic',
                    href: `/${parts[0]}/${parts[1]}/${encodedTopicName}`,
                    hasChildren: false,
                    // Store transformed data as ComponentTopic
                    data: {
                        topic: topicName,
                        timestamp: Date.now() * 1000000,
                        data: null,
                        status: 'metadata_only' as const,
                    },
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
        // Path comes from the tree, e.g. "/server/area_id/component_id" or "/area_id/component_id"
        let parts = path.split('/').filter((p) => p);

        // Remove 'server' prefix if present (tree paths start with /server)
        if (parts[0] === 'server') {
            parts = parts.slice(1);
        }

        // Handle virtual folder paths with /data/
        // Patterns:
        //   /area/data/topic → areas/{area}/data/{topic}
        //   /area/component/data/topic → components/{component}/data/{topic}
        //   /area/component/apps/app/data/topic → apps/{app}/data/{topic}
        //   /functions/function/data/topic → functions/{function}/data/{topic}
        if (parts.includes('data')) {
            const dataIndex = parts.indexOf('data');
            const topicName = parts[dataIndex + 1];

            if (!topicName) {
                throw new Error('Invalid path: missing topic name after /data/');
            }

            const decodedTopicName = decodeURIComponent(topicName);

            // Determine entity type and ID based on path structure
            let entityType: SovdResourceEntityType;
            let entityId: string;

            const appsIndex = parts.indexOf('apps');
            const functionsIndex = parts.indexOf('functions');

            if (appsIndex !== -1 && appsIndex < dataIndex) {
                // App topic: /area/component/apps/app/data/topic
                entityType = 'apps';
                entityId = parts[appsIndex + 1]!;
            } else if (functionsIndex !== -1 && functionsIndex < dataIndex) {
                // Function topic: /functions/function/data/topic
                entityType = 'functions';
                entityId = parts[functionsIndex + 1]!;
            } else if (dataIndex === 1) {
                // Area topic: /area/data/topic (dataIndex is 1, meaning only area before data)
                entityType = 'areas';
                entityId = parts[0]!;
            } else {
                // Component topic: /area/component/data/topic (dataIndex is 2+)
                entityType = 'components';
                entityId = parts[dataIndex - 1]!;
            }

            // Use the generic getTopicDetails method
            const topic = await this.getTopicDetails(entityType, entityId, decodedTopicName);

            return {
                id: topicName,
                name: topic.topic,
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

            // Use the generic getTopicDetails method
            const topic = await this.getTopicDetails('components', componentId, decodedTopicName);

            return {
                id: encodedTopicName,
                name: topic.topic,
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
            // Use the proper transformation to convert API format to ComponentTopic[]
            const topicsData = this.transformDataResponse(await response.json());

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
     * Publish to entity data (generic for components, apps, functions, areas)
     * @param entityType Entity type (components, apps, functions, areas)
     * @param entityId Entity ID
     * @param topicName Topic name (full path without leading slash)
     * @param request Publish request with type and data
     */
    async publishToEntityData(
        entityType: SovdResourceEntityType,
        entityId: string,
        topicName: string,
        request: ComponentTopicPublishRequest
    ): Promise<void> {
        const response = await fetchWithTimeout(
            this.getUrl(`${entityType}/${entityId}/data/${topicName}`),
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
     * List all configurations (parameters) for an entity
     * @param entityId Entity ID
     * @param entityType Entity type
     */
    async listConfigurations(
        entityId: string,
        entityType: SovdResourceEntityType = 'components'
    ): Promise<ComponentConfigurations> {
        return this.getResources(entityType, entityId, 'configurations');
    }

    /**
     * Get a specific configuration (parameter) value and metadata
     * @param entityId Entity ID
     * @param paramName Parameter name
     * @param entityType Entity type
     */
    async getConfiguration(
        entityId: string,
        paramName: string,
        entityType: SovdResourceEntityType = 'components'
    ): Promise<ConfigurationDetail> {
        const response = await fetchWithTimeout(
            this.getUrl(`${entityType}/${entityId}/configurations/${encodeURIComponent(paramName)}`),
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
     * @param entityId Entity ID
     * @param paramName Parameter name
     * @param request Request with new value
     * @param entityType Entity type
     */
    async setConfiguration(
        entityId: string,
        paramName: string,
        request: SetConfigurationRequest,
        entityType: SovdResourceEntityType = 'components'
    ): Promise<SetConfigurationResponse> {
        const response = await fetchWithTimeout(
            this.getUrl(`${entityType}/${entityId}/configurations/${encodeURIComponent(paramName)}`),
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
     * @param entityId Entity ID
     * @param paramName Parameter name
     * @param entityType Entity type
     */
    async resetConfiguration(
        entityId: string,
        paramName: string,
        entityType: SovdResourceEntityType = 'components'
    ): Promise<ResetConfigurationResponse> {
        const response = await fetchWithTimeout(
            this.getUrl(`${entityType}/${entityId}/configurations/${encodeURIComponent(paramName)}`),
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

        // 204 No Content means success - return the response body or defaults
        const data = await response.json().catch(() => ({}));
        return data as ResetConfigurationResponse;
    }

    /**
     * Reset all configurations for an entity to their default values
     * @param entityId Entity ID
     * @param entityType Entity type
     */
    async resetAllConfigurations(
        entityId: string,
        entityType: SovdResourceEntityType = 'components'
    ): Promise<ResetAllConfigurationsResponse> {
        const response = await fetchWithTimeout(this.getUrl(`${entityType}/${entityId}/configurations`), {
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
    // OPERATIONS API (ROS 2 Services & Actions) - SOVD Executions Model
    // ===========================================================================

    /**
     * List all operations (services + actions) for an entity (component or app)
     * @param entityType Entity type
     * @param entityId Entity ID
     */
    async listOperations(entityId: string, entityType: SovdResourceEntityType = 'components'): Promise<Operation[]> {
        return this.getResources(entityType, entityId, 'operations');
    }

    /**
     * Get details of a specific operation
     * @param entityId Entity ID
     * @param operationName Operation name
     * @param entityType Entity type
     */
    async getOperation(
        entityId: string,
        operationName: string,
        entityType: SovdResourceEntityType = 'components'
    ): Promise<Operation> {
        const response = await fetchWithTimeout(
            this.getUrl(`${entityType}/${entityId}/operations/${encodeURIComponent(operationName)}`),
            {
                method: 'GET',
                headers: { Accept: 'application/json' },
            }
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as SovdError;
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Create an execution (invoke an operation) - SOVD-compliant
     * @param entityId Entity ID (component or app)
     * @param operationName Operation name
     * @param request Execution request with input data
     * @param entityType Entity type
     */
    async createExecution(
        entityId: string,
        operationName: string,
        request: CreateExecutionRequest,
        entityType: SovdResourceEntityType = 'components'
    ): Promise<CreateExecutionResponse> {
        const response = await fetchWithTimeout(
            this.getUrl(`${entityType}/${entityId}/operations/${encodeURIComponent(operationName)}/executions`),
            {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            },
            30000
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as SovdError;
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * List all executions for an operation
     * @param entityId Entity ID
     * @param operationName Operation name
     * @param entityType Entity type
     */
    async listExecutions(
        entityId: string,
        operationName: string,
        entityType: SovdResourceEntityType = 'components'
    ): Promise<ListExecutionsResponse> {
        const response = await fetchWithTimeout(
            this.getUrl(`${entityType}/${entityId}/operations/${encodeURIComponent(operationName)}/executions`),
            {
                method: 'GET',
                headers: { Accept: 'application/json' },
            }
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as SovdError;
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Get execution status by ID
     * @param entityId Entity ID
     * @param operationName Operation name
     * @param executionId Execution ID
     * @param entityType Entity type
     */
    async getExecution(
        entityId: string,
        operationName: string,
        executionId: string,
        entityType: SovdResourceEntityType = 'components'
    ): Promise<Execution> {
        const response = await fetchWithTimeout(
            this.getUrl(
                `${entityType}/${entityId}/operations/${encodeURIComponent(operationName)}/executions/${encodeURIComponent(executionId)}`
            ),
            {
                method: 'GET',
                headers: { Accept: 'application/json' },
            }
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as SovdError;
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Cancel an execution (for actions)
     * @param entityId Entity ID
     * @param operationName Operation name
     * @param executionId Execution ID
     * @param entityType Entity type
     */
    async cancelExecution(
        entityId: string,
        operationName: string,
        executionId: string,
        entityType: SovdResourceEntityType = 'components'
    ): Promise<Execution> {
        const response = await fetchWithTimeout(
            this.getUrl(
                `${entityType}/${entityId}/operations/${encodeURIComponent(operationName)}/executions/${encodeURIComponent(executionId)}`
            ),
            {
                method: 'DELETE',
                headers: { Accept: 'application/json' },
            }
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as SovdError;
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    // ===========================================================================
    // APPS API (ROS 2 Nodes)
    // ===========================================================================

    /**
     * List all apps (ROS 2 nodes) in the system
     */
    async listApps(): Promise<App[]> {
        const response = await fetchWithTimeout(this.getUrl('apps'), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        interface ApiAppResponse {
            id: string;
            name: string;
            href?: string;
            'x-medkit'?: {
                component_id?: string;
                is_online?: boolean;
                ros2?: { node?: string };
                source?: string;
            };
        }

        const items = unwrapItems<ApiAppResponse>(await response.json());
        // Transform API response to App interface by extracting x-medkit fields
        return items.map((item) => {
            const xMedkit = item['x-medkit'] || {};
            const nodePath = xMedkit.ros2?.node || `/${item.name}`;
            const lastSlash = nodePath.lastIndexOf('/');
            const namespace = lastSlash > 0 ? nodePath.substring(0, lastSlash) : '/';
            const nodeName = lastSlash >= 0 ? nodePath.substring(lastSlash + 1) : item.name;

            return {
                id: item.id,
                name: item.name,
                href: item.href || `/api/v1/apps/${item.id}`,
                type: 'app',
                hasChildren: true,
                node_name: nodeName,
                namespace: namespace,
                fqn: nodePath,
                component_id: xMedkit.component_id,
            };
        });
    }

    /**
     * List apps (ROS 2 nodes) belonging to a specific component
     * Uses GET /components/{id}/hosts endpoint for efficient server-side filtering
     * @param componentId Component ID
     */
    async listComponentApps(componentId: string): Promise<App[]> {
        const response = await fetchWithTimeout(this.getUrl(`components/${componentId}/hosts`), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        interface ApiAppResponse {
            id: string;
            name: string;
            href?: string;
            'x-medkit'?: {
                is_online?: boolean;
                ros2?: { node?: string };
                source?: string;
            };
        }

        const items = unwrapItems<ApiAppResponse>(await response.json());
        return items.map((item) => {
            const xMedkit = item['x-medkit'] || {};
            const nodePath = xMedkit.ros2?.node || `/${item.name}`;
            const lastSlash = nodePath.lastIndexOf('/');
            const namespace = lastSlash > 0 ? nodePath.substring(0, lastSlash) : '/';
            const nodeName = lastSlash >= 0 ? nodePath.substring(lastSlash + 1) : item.name;

            return {
                id: item.id,
                name: item.name,
                href: item.href || `/api/v1/apps/${item.id}`,
                type: 'app',
                hasChildren: true,
                node_name: nodeName,
                namespace: namespace,
                fqn: nodePath,
                component_id: componentId,
            };
        });
    }

    /**
     * Get app capabilities
     * @param appId App identifier
     */
    async getApp(appId: string): Promise<AppCapabilities> {
        const response = await fetchWithTimeout(this.getUrl(`apps/${appId}`), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as SovdError;
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Get all topics (data) for an app
     * @param appId App identifier
     */
    async getAppData(appId: string): Promise<ComponentTopic[]> {
        return this.getResources('apps', appId, 'data');
    }

    /**
     * Get a specific topic for an app
     * @param appId App identifier
     * @param topicName Topic name (will be URL encoded)
     */
    async getAppDataItem(appId: string, topicName: string): Promise<ComponentTopic> {
        const response = await fetchWithTimeout(this.getUrl(`apps/${appId}/data/${encodeURIComponent(topicName)}`), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as SovdError;
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        // API returns {data, id, x-medkit: {ros2: {type, topic, direction}, ...}}
        const item = (await response.json()) as DataItemResponse;
        const xMedkit = item['x-medkit'];
        const ros2 = xMedkit?.ros2;

        return {
            topic: ros2?.topic || topicName,
            timestamp: xMedkit?.timestamp || Date.now() * 1000000,
            data: item.data,
            status: (xMedkit?.status as 'data' | 'metadata_only') || 'data',
            type: ros2?.type,
            publisher_count: xMedkit?.publisher_count,
            subscriber_count: xMedkit?.subscriber_count,
            isPublisher: ros2?.direction === 'publish',
            isSubscriber: ros2?.direction === 'subscribe',
        };
    }

    /**
     * Publish to an app topic
     * @param appId App identifier
     * @param topicName Topic name
     * @param request Publish request
     */
    async publishToAppTopic(appId: string, topicName: string, request: ComponentTopicPublishRequest): Promise<void> {
        const response = await fetchWithTimeout(
            this.getUrl(`apps/${appId}/data/${topicName}`),
            {
                method: 'PUT',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            },
            10000
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as SovdError;
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }
    }

    /**
     * Get app dependencies
     * @param appId App identifier
     */
    async getAppDependsOn(appId: string): Promise<string[]> {
        const response = await fetchWithTimeout(this.getUrl(`apps/${appId}/depends-on`), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        return data.items || [];
    }

    // ===========================================================================
    // FUNCTIONS API (Capability Groupings)
    // ===========================================================================

    /**
     * List all functions
     */
    async listFunctions(): Promise<SovdFunction[]> {
        const response = await fetchWithTimeout(this.getUrl('functions'), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return unwrapItems<SovdFunction>(await response.json());
    }

    /**
     * Get function capabilities
     * @param functionId Function identifier
     */
    async getFunction(functionId: string): Promise<FunctionCapabilities> {
        const response = await fetchWithTimeout(this.getUrl(`functions/${functionId}`), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as SovdError;
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Get apps hosting a function
     * @param functionId Function identifier
     * @returns Array of host objects (with id, name, href)
     */
    async getFunctionHosts(functionId: string): Promise<unknown[]> {
        const response = await fetchWithTimeout(this.getUrl(`functions/${functionId}/hosts`), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        return data.items || [];
    }

    /**
     * Get aggregated data for a function
     * @param functionId Function identifier
     */
    async getFunctionData(functionId: string): Promise<ComponentTopic[]> {
        return this.getResources('functions', functionId, 'data');
    }

    /**
     * Get aggregated operations for a function
     * @param functionId Function identifier
     */
    async getFunctionOperations(functionId: string): Promise<Operation[]> {
        return this.getResources('functions', functionId, 'operations');
    }

    // ===========================================================================
    // GENERIC ENTITY RESOURCES (for aggregated views)
    // ===========================================================================

    /**
     * Get data items for any entity type (areas, components, apps, functions)
     * Returns aggregated data from child entities
     * @param entityType Entity type
     * @param entityId Entity identifier
     */
    async getEntityData(entityType: SovdResourceEntityType, entityId: string): Promise<ComponentTopic[]> {
        return this.getResources(entityType, entityId, 'data');
    }

    // ===========================================================================
    // GENERIC TOPIC DETAILS (works for all entity types)
    // ===========================================================================

    /**
     * Get topic details for any entity type (areas, components, apps, functions)
     * @param entityType The type of entity
     * @param entityId The entity identifier
     * @param topicName The topic name (will strip direction suffix if present)
     */
    async getTopicDetails(
        entityType: SovdResourceEntityType,
        entityId: string,
        topicName: string
    ): Promise<ComponentTopic> {
        // Strip direction suffix (:publish/:subscribe/:both) that frontend adds for unique keys
        const cleanTopicName = stripDirectionSuffix(topicName);
        const encodedTopicName = encodeURIComponent(cleanTopicName);

        const response = await fetchWithTimeout(this.getUrl(`${entityType}/${entityId}/data/${encodedTopicName}`), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as SovdError;
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        // API returns {data, id, x-medkit: {ros2: {type, topic, direction}, type_info: {schema, default_value}, ...}}
        const item = (await response.json()) as DataItemResponse;
        const xMedkit = item['x-medkit'];
        const ros2 = xMedkit?.ros2;

        const rawTypeInfo = xMedkit?.type_info as { schema?: unknown; default_value?: unknown } | undefined;
        const convertedSchema = rawTypeInfo?.schema ? convertJsonSchemaToTopicSchema(rawTypeInfo.schema) : undefined;

        return {
            topic: ros2?.topic || cleanTopicName,
            timestamp: xMedkit?.timestamp || Date.now() * 1000000,
            data: item.data,
            status: (xMedkit?.status as 'data' | 'metadata_only') || 'data',
            type: ros2?.type,
            type_info: convertedSchema
                ? {
                      schema: convertedSchema,
                      default_value: rawTypeInfo?.default_value as Record<string, unknown>,
                  }
                : undefined,
            publisher_count: xMedkit?.publisher_count,
            subscriber_count: xMedkit?.subscriber_count,
            publishers: xMedkit?.publishers,
            subscribers: xMedkit?.subscribers,
            isPublisher: ros2?.direction === 'publish' || ros2?.direction === 'both',
            isSubscriber: ros2?.direction === 'subscribe' || ros2?.direction === 'both',
        };
    }

    // ===========================================================================
    // FAULTS API (Diagnostic Trouble Codes)
    // ===========================================================================

    /**
     * Transform API fault response to Fault interface
     * API returns: {fault_code, description, severity (number), severity_label, status, first_occurred, ...}
     * We need: {code, message, severity (string), status (lowercase), timestamp, entity_id, entity_type}
     */
    private transformFault(apiFault: {
        fault_code: string;
        description: string;
        severity: number;
        severity_label: string;
        status: string;
        first_occurred: number;
        last_occurred?: number;
        occurrence_count?: number;
        reporting_sources?: string[];
    }): Fault {
        // Map severity number/label to FaultSeverity
        // Order matters: check critical first, then error, then warning
        let severity: FaultSeverity = 'info';
        const label = apiFault.severity_label?.toLowerCase() || '';
        if (label === 'critical' || apiFault.severity >= 3) {
            severity = 'critical';
        } else if (label === 'error' || apiFault.severity === 2) {
            severity = 'error';
        } else if (label === 'warn' || label === 'warning' || apiFault.severity === 1) {
            severity = 'warning';
        }

        // Map status to FaultStatus
        let status: FaultStatus = 'active';
        const apiStatus = apiFault.status?.toLowerCase() || '';
        if (apiStatus === 'confirmed' || apiStatus === 'active') {
            status = 'active';
        } else if (apiStatus === 'pending') {
            status = 'pending';
        } else if (apiStatus === 'cleared' || apiStatus === 'resolved') {
            status = 'cleared';
        }

        // Extract entity info from reporting_sources
        const source = apiFault.reporting_sources?.[0] || '';
        const entity_id = source.split('/').pop() || 'unknown';
        const entity_type = source.includes('/bridge/') ? 'bridge' : 'component';

        return {
            code: apiFault.fault_code,
            message: apiFault.description,
            severity,
            status,
            timestamp: new Date(apiFault.first_occurred * 1000).toISOString(),
            entity_id,
            entity_type,
            parameters: {
                occurrence_count: apiFault.occurrence_count,
                last_occurred: apiFault.last_occurred,
                reporting_sources: apiFault.reporting_sources,
            },
        };
    }

    /**
     * List all faults across the system
     */
    async listAllFaults(): Promise<ListFaultsResponse> {
        const response = await fetchWithTimeout(this.getUrl('faults'), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const items = (data.items || []).map((f: unknown) =>
            this.transformFault(f as Parameters<typeof this.transformFault>[0])
        );
        return { items, count: data['x-medkit']?.count || items.length };
    }

    /**
     * List faults for a specific entity
     * @param entityType Entity type
     * @param entityId Entity identifier
     */
    async listEntityFaults(entityType: SovdResourceEntityType, entityId: string): Promise<ListFaultsResponse> {
        return this.getResources(entityType, entityId, 'faults');
    }

    /**
     * Get a specific fault by code
     * @param entityType Entity type
     * @param entityId Entity identifier
     * @param faultCode Fault code
     */
    async getFault(entityType: SovdResourceEntityType, entityId: string, faultCode: string): Promise<Fault> {
        const response = await fetchWithTimeout(
            this.getUrl(`${entityType}/${entityId}/faults/${encodeURIComponent(faultCode)}`),
            {
                method: 'GET',
                headers: { Accept: 'application/json' },
            }
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as SovdError;
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Clear a specific fault
     * @param entityType Entity type
     * @param entityId Entity identifier
     * @param faultCode Fault code
     */
    async clearFault(entityType: SovdResourceEntityType, entityId: string, faultCode: string): Promise<void> {
        const response = await fetchWithTimeout(
            this.getUrl(`${entityType}/${entityId}/faults/${encodeURIComponent(faultCode)}`),
            {
                method: 'DELETE',
                headers: { Accept: 'application/json' },
            }
        );

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as SovdError;
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }
    }

    /**
     * Clear all faults for an entity
     * @param entityType Entity type
     * @param entityId Entity identifier
     */
    async clearAllFaults(entityType: SovdResourceEntityType, entityId: string): Promise<void> {
        const response = await fetchWithTimeout(this.getUrl(`${entityType}/${entityId}/faults`), {
            method: 'DELETE',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as SovdError;
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }
    }

    /**
     * Get fault snapshots
     * @param faultCode Fault code
     */
    async getFaultSnapshots(faultCode: string): Promise<ListSnapshotsResponse> {
        const response = await fetchWithTimeout(this.getUrl(`faults/${encodeURIComponent(faultCode)}/snapshots`), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            if (response.status === 404) {
                return { items: [], count: 0 };
            }
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Get fault snapshots for a specific entity
     * @param entityType Entity type
     * @param entityId Entity identifier
     * @param faultCode Fault code
     */
    async getEntityFaultSnapshots(
        entityType: SovdResourceEntityType,
        entityId: string,
        faultCode: string
    ): Promise<ListSnapshotsResponse> {
        const response = await fetchWithTimeout(
            this.getUrl(`${entityType}/${entityId}/faults/${encodeURIComponent(faultCode)}/snapshots`),
            {
                method: 'GET',
                headers: { Accept: 'application/json' },
            }
        );

        if (!response.ok) {
            if (response.status === 404) {
                return { items: [], count: 0 };
            }
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Subscribe to real-time fault events via SSE
     * @param onFault Callback for new fault events
     * @param onError Callback for errors
     * @returns Cleanup function to close the connection
     */
    subscribeFaultStream(onFault: (fault: Fault) => void, onError?: (error: Error) => void): () => void {
        const eventSource = new EventSource(this.getUrl('faults/stream'));

        eventSource.onmessage = (event) => {
            try {
                // API may return raw fault format that needs transformation
                const rawData = JSON.parse(event.data);
                // Check if this is the raw API format (has fault_code) or already transformed
                if ('fault_code' in rawData) {
                    const fault = this.transformFault(rawData);
                    onFault(fault);
                } else {
                    // Already in Fault format
                    onFault(rawData as Fault);
                }
            } catch {
                onError?.(new Error('Failed to parse fault event'));
            }
        };

        eventSource.onerror = () => {
            onError?.(new Error('Fault stream connection error'));
        };

        return () => {
            eventSource.close();
        };
    }

    // ===========================================================================
    // SERVER CAPABILITIES API (SOVD Discovery)
    // ===========================================================================

    /**
     * Get server capabilities (root endpoint)
     */
    async getServerCapabilities(): Promise<ServerCapabilities> {
        const response = await fetchWithTimeout(this.getUrl(''), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Get SOVD version information
     */
    async getVersionInfo(): Promise<VersionInfo> {
        const response = await fetchWithTimeout(this.getUrl('version-info'), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    }

    // ===========================================================================
    // HIERARCHY API (Subareas & Subcomponents)
    // ===========================================================================

    /**
     * List subareas for an area
     * @param areaId Area identifier
     */
    async listSubareas(areaId: string): Promise<SovdEntity[]> {
        const response = await fetchWithTimeout(this.getUrl(`areas/${areaId}/subareas`), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            if (response.status === 404) {
                return [];
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const items = Array.isArray(data) ? data : (data.items ?? data.subareas ?? []);
        return items.map((item: { id: string; name?: string }) => ({
            id: item.id,
            name: item.name || item.id,
            type: 'subarea',
            href: `/areas/${areaId}/subareas/${item.id}`,
            hasChildren: true,
        }));
    }

    /**
     * List subcomponents for a component
     * @param componentId Component identifier
     */
    async listSubcomponents(componentId: string): Promise<SovdEntity[]> {
        const response = await fetchWithTimeout(this.getUrl(`components/${componentId}/subcomponents`), {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            if (response.status === 404) {
                return [];
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const items = Array.isArray(data) ? data : (data.items ?? data.subcomponents ?? []);
        return items.map((item: { id: string; name?: string; fqn?: string }) => ({
            id: item.id,
            name: item.fqn || item.name || item.id,
            type: 'subcomponent',
            href: `/components/${componentId}/subcomponents/${item.id}`,
            hasChildren: true,
        }));
    }
}

/**
 * Create a new SOVD API client instance
 */
export function createSovdClient(serverUrl: string, baseEndpoint: string = ''): SovdApiClient {
    return new SovdApiClient(serverUrl, baseEndpoint);
}
