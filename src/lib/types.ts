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


