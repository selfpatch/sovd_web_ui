/**
 * SOVD Entity types for discovery endpoints
 */

/**
 * QoS profile for a topic endpoint
 */
export interface QosProfile {
    reliability: 'reliable' | 'best_effort' | 'system_default' | 'best_available' | 'unknown';
    durability: 'volatile' | 'transient_local' | 'system_default' | 'best_available' | 'unknown';
    history: 'keep_last' | 'keep_all' | 'system_default' | 'unknown';
    depth: number;
    liveliness: 'automatic' | 'manual_by_topic' | 'system_default' | 'best_available' | 'unknown';
}

/**
 * Topic endpoint (publisher or subscriber) with QoS info
 */
export interface TopicEndpoint {
    node_name: string;
    node_namespace: string;
    fqn: string;
    qos: QosProfile;
}

/**
 * Topics associated with a component (node) - publishes and subscribes lists
 */
export interface ComponentTopicsInfo {
    /** Topics this component publishes to */
    publishes: string[];
    /** Topics this component subscribes to */
    subscribes: string[];
}

/**
 * Base entity from discovery endpoint
 */
export interface SovdEntity {
    /** Unique identifier */
    id: string;
    /** Display name */
    name: string;
    /** Entity type (e.g., "component", "application", "signal") */
    type: string;
    /** API path for this entity */
    href: string;
    /** Whether this entity has children that can be expanded */
    hasChildren?: boolean;
    /** Component's topics info (publishes/subscribes) - present for components */
    topicsInfo?: ComponentTopicsInfo;
}

/**
 * Full entity details (response from GET /entities/{path})
 */
export interface SovdEntityDetails extends SovdEntity {
    /**
     * Full topic data array with rich metadata (QoS, publishers, subscribers, schema).
     * Used for component detail view when full topic information is available.
     * Prefer this over topicsInfo when available as it contains more detailed information.
     */
    topics?: ComponentTopic[];
    /** Single topic data (when viewing a topic entity directly) */
    topicData?: ComponentTopic;
    /**
     * Lightweight topic lists (publishes/subscribes arrays of topic names).
     * Used for navigation and tree display. Falls back to this when full topics
     * array is not available. Does not contain QoS or publisher information.
     */
    topicsInfo?: ComponentTopicsInfo;
    /** Error message if fetching details failed */
    error?: string;
    /** ROS message type (preserved separately when entity type is 'topic') */
    rosType?: string;
    /** Additional properties vary by entity type */
    [key: string]: unknown;
}

/**
 * API response wrapper for entity lists
 */
export interface SovdEntitiesResponse {
    entities: SovdEntity[];
}

/**
 * Connection state for the SOVD server
 */
export interface ConnectionState {
    serverUrl: string | null;
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
}

/**
 * Entity tree node with loading state
 */
export interface EntityTreeNode extends SovdEntity {
    children?: EntityTreeNode[];
    isLoading?: boolean;
    isExpanded?: boolean;
    path: string;
    /**
     * Raw data associated with the entity.
     * - For topic nodes created from topicsInfo: contains TopicNodeData
     *   with { topic, isPublisher, isSubscriber } for tree icon display.
     * - For topic nodes fetched from API: contains full ComponentTopic data
     *   with type, schema, QoS, publishers, subscribers, etc.
     * Use type guards to distinguish between these two shapes.
     */
    data?: unknown;
}

/**
 * Topic node data when created from topicsInfo
 */
export interface TopicNodeData {
    topic: string;
    isPublisher: boolean;
    isSubscriber: boolean;
}

/**
 * Virtual folder data for component subfolders
 */
export interface VirtualFolderData {
    /** Type of virtual folder: data, operations, or configurations */
    folderType: 'data' | 'operations' | 'configurations';
    /** Parent component ID */
    componentId: string;
    /** Topics info (for data folder) */
    topicsInfo?: ComponentTopicsInfo;
}

/**
 * Type guard for VirtualFolderData
 */
export function isVirtualFolderData(data: unknown): data is VirtualFolderData {
    return !!data && typeof data === 'object' && 'folderType' in data && 'componentId' in data;
}

/**
 * Component topic data from GET /components/{id}/data
 */
export interface ComponentTopic {
    /** Full topic path */
    topic: string;
    /** Timestamp in nanoseconds */
    timestamp: number;
    /** Topic message data (present when status='data') */
    data: unknown;
    /** Status indicating if actual data or only metadata is available */
    status?: 'data' | 'metadata_only';
    /** ROS 2 message type name (e.g., "sensor_msgs/msg/Temperature") */
    type?: string;
    /** Type information including schema and default values */
    type_info?: TopicTypeInfo;
    /** Number of publishers for this topic */
    publisher_count?: number;
    /** Number of subscribers for this topic */
    subscriber_count?: number;
    /** List of publisher endpoints with QoS */
    publishers?: TopicEndpoint[];
    /** List of subscriber endpoints with QoS */
    subscribers?: TopicEndpoint[];
}

/**
 * Type information for a ROS 2 message type
 */
export interface TopicTypeInfo {
    /** JSON schema describing field types */
    schema: TopicSchema;
    /** Default values for all fields */
    default_value: Record<string, unknown>;
}

/**
 * Schema entry for a single field
 */
export interface SchemaFieldType {
    /** Primitive type name (e.g., "double", "int32", "string", "bool") or nested type path */
    type: string;
    /** For nested message types, contains the fields of that type */
    fields?: TopicSchema;
    /** For array types, describes the item type */
    items?: SchemaFieldType;
    /** For fixed-size arrays */
    size?: number;
    /** For bounded sequences */
    max_size?: number;
    /** For bounded strings */
    max_length?: number;
}

/**
 * Schema mapping field names to their type information
 */
export type TopicSchema = Record<string, SchemaFieldType>;

/**
 * Request to publish to a component topic via PUT
 */
export interface ComponentTopicPublishRequest {
    /** Message type (e.g., "geometry_msgs/msg/Twist") */
    type: string;
    /** Message data as JSON */
    data: unknown;
}

// =============================================================================
// CONFIGURATIONS (ROS 2 Parameters)
// =============================================================================

/**
 * Parameter type from ROS 2
 */
export type ParameterType =
    | 'bool'
    | 'int'
    | 'double'
    | 'string'
    | 'byte_array'
    | 'bool_array'
    | 'int_array'
    | 'double_array'
    | 'string_array';

/**
 * Single parameter info from configurations endpoint
 */
export interface Parameter {
    /** Parameter name */
    name: string;
    /** Current parameter value */
    value: unknown;
    /** Parameter type (bool, int, double, string, arrays) */
    type: ParameterType;
    /** Optional description of the parameter */
    description?: string;
    /** Whether the parameter is read-only */
    read_only?: boolean;
}

/**
 * Response from GET /components/{id}/configurations
 */
export interface ComponentConfigurations {
    component_id: string;
    node_name: string;
    parameters: Parameter[];
}

/**
 * Response from GET /components/{id}/configurations/{param}
 */
export interface ConfigurationDetail {
    component_id: string;
    parameter: Parameter;
}

/**
 * Request body for PUT /components/{id}/configurations/{param}
 */
export interface SetConfigurationRequest {
    value: unknown;
}

/**
 * Response from PUT /components/{id}/configurations/{param}
 */
export interface SetConfigurationResponse {
    status: 'success' | 'error';
    component_id: string;
    parameter: Parameter;
    error?: string;
}

/**
 * Response from DELETE /components/{id}/configurations/{param}
 * Reset single parameter to default value
 */
export interface ResetConfigurationResponse {
    name: string;
    value: unknown;
    type: ParameterType;
    reset_to_default: boolean;
}

/**
 * Response from DELETE /components/{id}/configurations
 * Reset all parameters to default values
 */
export interface ResetAllConfigurationsResponse {
    node_name: string;
    reset_count: number;
    failed_count: number;
    failed_parameters?: string[];
}

// =============================================================================
// OPERATIONS (ROS 2 Services & Actions)
// =============================================================================

/**
 * Operation kind - service is sync, action is async
 */
export type OperationKind = 'service' | 'action';

/**
 * Service schema with request and response types
 */
export interface ServiceSchema {
    request: TopicSchema;
    response: TopicSchema;
}

/**
 * Action schema with goal, result, and feedback types
 */
export interface ActionSchema {
    goal: TopicSchema;
    result: TopicSchema;
    feedback: TopicSchema;
}

/**
 * Type information for an operation (service or action)
 */
export interface OperationTypeInfo {
    /** JSON schema describing request/response or goal/result/feedback types */
    schema: ServiceSchema | ActionSchema;
    /** Default values for the request/goal as YAML string */
    default_value?: string;
}

/**
 * Operation info from component discovery
 */
export interface Operation {
    /** Operation name (e.g., "calibrate") */
    name: string;
    /** Full ROS path (e.g., "/powertrain/engine/calibrate") */
    path: string;
    /** ROS interface type (e.g., "std_srvs/srv/Trigger") */
    type: string;
    /** Whether it's a service or action */
    kind: OperationKind;
    /** Type information including schema for request/response */
    type_info?: OperationTypeInfo;
}

/**
 * Request body for POST /components/{id}/operations/{op}
 */
export interface InvokeOperationRequest {
    /** Optional type override (auto-detected if not provided) */
    type?: string;
    /** Service request data (for services) */
    request?: unknown;
    /** Action goal data (for actions) */
    goal?: unknown;
}

/**
 * Response from POST /components/{id}/operations/{op} for services
 */
export interface ServiceOperationResponse {
    status: 'success' | 'error';
    kind: 'service';
    component_id: string;
    operation: string;
    response: unknown;
    error?: string;
}

/**
 * Response from POST /components/{id}/operations/{op} for actions
 */
export interface ActionOperationResponse {
    status: 'success' | 'error';
    kind: 'action';
    component_id: string;
    operation: string;
    goal_id: string;
    goal_status: 'accepted' | 'rejected';
    error?: string;
}

/**
 * Union type for operation response
 */
export type OperationResponse = ServiceOperationResponse | ActionOperationResponse;

/**
 * Action goal status values
 */
export type ActionGoalStatusValue = 'accepted' | 'executing' | 'canceling' | 'succeeded' | 'canceled' | 'aborted';

/**
 * Response from GET /components/{id}/operations/{op}/status
 */
export interface ActionGoalStatus {
    goal_id: string;
    status: ActionGoalStatusValue;
    action_path: string;
    action_type: string;
    last_feedback?: unknown;
}

/**
 * Response from GET /components/{id}/operations/{op}/status?all=true
 */
export interface AllActionGoalsStatus {
    action_path: string;
    goals: ActionGoalStatus[];
    count: number;
}

/**
 * Response from GET /components/{id}/operations/{op}/result
 */
export interface ActionGoalResult {
    goal_id: string;
    status: ActionGoalStatusValue;
    result: unknown;
}

/**
 * Response from DELETE /components/{id}/operations/{op}
 */
export interface ActionCancelResponse {
    status: 'canceling' | 'error';
    goal_id: string;
    message: string;
}

// =============================================================================
// COMPONENT EXTENDED (with operations list from discovery)
// =============================================================================

/**
 * Extended component info including operations
 */
export interface ComponentWithOperations {
    id: string;
    namespace: string;
    fqn: string;
    type: string;
    area: string;
    /** List of available operations (services + actions) */
    operations?: Operation[];
}
