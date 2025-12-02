/**
 * SOVD Entity types for discovery endpoints
 */

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
}

/**
 * Full entity details (response from GET /entities/{path})
 */
export interface SovdEntityDetails extends SovdEntity {
  /** Topics available for this component */
  topics?: ComponentTopic[];
  /** Error message if fetching details failed */
  error?: string;
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
  /** Optional raw data associated with the entity (e.g. ComponentTopic) */
  data?: unknown;
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


