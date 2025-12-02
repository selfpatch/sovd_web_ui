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
}

/**
 * Component topic data from GET /components/{id}/data
 */
export interface ComponentTopic {
  /** Full topic path */
  topic: string;
  /** Timestamp in nanoseconds */
  timestamp: number;
  /** Topic message data */
  data: unknown;
}

/**
 * Request to publish to a component topic via PUT
 */
export interface ComponentTopicPublishRequest {
  /** Message type (e.g., "geometry_msgs/msg/Twist") */
  type: string;
  /** Message data as JSON */
  data: unknown;
}


