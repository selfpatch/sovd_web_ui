import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'react-toastify';
import type { SovdEntity, SovdEntityDetails, EntityTreeNode, ComponentTopic, TopicNodeData } from './types';
import { createSovdClient, type SovdApiClient } from './sovd-api';

const STORAGE_KEY = 'sovd_web_ui_server_url';

export interface AppState {
  // Connection state
  serverUrl: string | null;
  baseEndpoint: string;
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  client: SovdApiClient | null;

  // Entity tree state
  rootEntities: EntityTreeNode[];
  loadingPaths: string[];
  expandedPaths: string[];

  // Selection state
  selectedPath: string | null;
  selectedEntity: SovdEntityDetails | null;
  isLoadingDetails: boolean;
  isRefreshing: boolean;

  // Actions
  connect: (url: string, baseEndpoint?: string) => Promise<boolean>;
  disconnect: () => void;
  loadRootEntities: () => Promise<void>;
  loadChildren: (path: string) => Promise<void>;
  toggleExpanded: (path: string) => void;
  selectEntity: (path: string) => Promise<void>;
  refreshSelectedEntity: () => Promise<void>;
  clearSelection: () => void;
}

/**
 * Convert SovdEntity to EntityTreeNode
 */
function toTreeNode(entity: SovdEntity, parentPath: string = ''): EntityTreeNode {
  const path = parentPath ? `${parentPath}/${entity.id}` : `/${entity.id}`;

  // If this is a component with topicsInfo, pre-populate children
  let children: EntityTreeNode[] | undefined;
  if (entity.type === 'component' && entity.topicsInfo) {
    const allTopics = new Set<string>();

    // Collect unique topics from publishes and subscribes
    entity.topicsInfo.publishes?.forEach(t => allTopics.add(t));
    entity.topicsInfo.subscribes?.forEach(t => allTopics.add(t));

    if (allTopics.size > 0) {
      children = Array.from(allTopics).sort().map(topicName => {
        const cleanName = topicName.startsWith('/') ? topicName.slice(1) : topicName;
        // Use percent-encoding for topic names in URLs
        // e.g., 'powertrain/engine/temp' -> 'powertrain%2Fengine%2Ftemp'
        const encodedName = encodeURIComponent(cleanName);
        const isPublisher = entity.topicsInfo?.publishes?.includes(topicName) ?? false;
        const isSubscriber = entity.topicsInfo?.subscribes?.includes(topicName) ?? false;

        return {
          id: encodedName,
          name: topicName,
          type: 'topic',
          href: `${path}/${encodedName}`,
          path: `${path}/${encodedName}`,
          hasChildren: false,
          isLoading: false,
          isExpanded: false,
          // Store topic direction info
          data: {
            topic: topicName,
            isPublisher,
            isSubscriber
          }
        };
      });
    }
  }

  return {
    ...entity,
    path,
    children,
    isLoading: false,
    isExpanded: false,
  };
}

/**
 * Recursively update a node in the tree
 */
function updateNodeInTree(
  nodes: EntityTreeNode[],
  targetPath: string,
  updater: (node: EntityTreeNode) => EntityTreeNode
): EntityTreeNode[] {
  return nodes.map(node => {
    if (node.path === targetPath) {
      return updater(node);
    }
    if (node.children && targetPath.startsWith(node.path)) {
      return {
        ...node,
        children: updateNodeInTree(node.children, targetPath, updater),
      };
    }
    return node;
  });
}

/**
 * Find a node in the tree by path
 */
function findNode(nodes: EntityTreeNode[], path: string): EntityTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }
    if (node.children) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      serverUrl: null,
      baseEndpoint: '',
      isConnected: false,
      isConnecting: false,
      connectionError: null,
      client: null,

      rootEntities: [],
      loadingPaths: [],
      expandedPaths: [],

      // Selection state
      selectedPath: null,
      selectedEntity: null,
      isLoadingDetails: false,
      isRefreshing: false,

      // Connect to SOVD server
      connect: async (url: string, baseEndpoint: string = '') => {
        set({ isConnecting: true, connectionError: null });

        try {
          const client = createSovdClient(url, baseEndpoint);
          const isOk = await client.ping();

          if (!isOk) {
            set({
              isConnecting: false,
              connectionError: 'Unable to connect to server. Check the URL and try again.',
            });
            return false;
          }

          set({
            serverUrl: url,
            baseEndpoint,
            isConnected: true,
            isConnecting: false,
            connectionError: null,
            client,
          });

          // Load root entities after successful connection
          await get().loadRootEntities();
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Connection failed';
          set({
            isConnecting: false,
            connectionError: message,
          });
          return false;
        }
      },

      // Disconnect from server
      disconnect: () => {
        set({
          serverUrl: null,
          baseEndpoint: '',
          isConnected: false,
          isConnecting: false,
          connectionError: null,
          client: null,
          rootEntities: [],
          loadingPaths: [],
          expandedPaths: [],
          selectedPath: null,
          selectedEntity: null,
        });
      },

      // Load root entities
      loadRootEntities: async () => {
        const { client } = get();
        if (!client) return;

        try {
          const entities = await client.getEntities();
          const treeNodes = entities.map((e: SovdEntity) => toTreeNode(e));
          set({ rootEntities: treeNodes });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Failed to load entities: ${message}`);
        }
      },

      // Load children for a specific node
      loadChildren: async (path: string) => {
        const { client, loadingPaths, rootEntities, isLoadingDetails } = get();
        if (!client || loadingPaths.includes(path)) return;

        // If currently loading details, wait for it instead of making duplicate request
        if (isLoadingDetails) {
          return;
        }

        // Check if we already have this data in the tree
        const node = findNode(rootEntities, path);
        if (node && Array.isArray(node.children) && node.children.length > 0) {
          // Check if children have full data or just TopicNodeData
          // TopicNodeData has isPublisher/isSubscriber but no 'type' field in data
          // Full ComponentTopic has 'type' field (e.g., "sensor_msgs/msg/Temperature")
          const firstChild = node.children[0];
          const hasFullData = firstChild.data &&
            typeof firstChild.data === 'object' &&
            'type' in (firstChild.data as object);

          if (hasFullData) {
            // Already have full data, skip fetch
            return;
          }
          // Have only TopicNodeData - need to fetch full data
        }

        // Mark as loading
        set({ loadingPaths: [...loadingPaths, path] });

        try {
          const entities = await client.getEntities(path);
          const children = entities.map((e: SovdEntity) => toTreeNode(e, path));

          // Update tree with children
          const updatedTree = updateNodeInTree(rootEntities, path, node => ({
            ...node,
            children,
            isLoading: false,
          }));

          // Remove from loading and update tree
          set({
            rootEntities: updatedTree,
            loadingPaths: get().loadingPaths.filter(p => p !== path),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Failed to load children for ${path}: ${message}`);
          set({ loadingPaths: get().loadingPaths.filter(p => p !== path) });
        }
      },

      // Toggle expanded state
      toggleExpanded: (path: string) => {
        const { expandedPaths } = get();

        if (expandedPaths.includes(path)) {
          set({ expandedPaths: expandedPaths.filter(p => p !== path) });
        } else {
          set({ expandedPaths: [...expandedPaths, path] });
        }
      },

      // Select an entity and load its details
      selectEntity: async (path: string) => {
        const { client, selectedPath, rootEntities, expandedPaths } = get();
        if (!client || path === selectedPath) return;

        // OPTIMIZATION: Check if tree already has this data
        const node = findNode(rootEntities, path);

        // Optimization for Topic - check if we have TopicNodeData or full ComponentTopic
        if (node && node.type === 'topic' && node.data) {
          const data = node.data as TopicNodeData | ComponentTopic;

          // Check if it's TopicNodeData (from topicsInfo - only has isPublisher/isSubscriber)
          // vs full ComponentTopic (from /components/{id}/data - has type, publishers, QoS etc)
          const isTopicNodeData = 'isPublisher' in data && 'isSubscriber' in data && !('type' in data);

          if (isTopicNodeData) {
            // Preserve isPublisher/isSubscriber info from TopicNodeData
            const { isPublisher, isSubscriber } = data as TopicNodeData;

            // This is TopicNodeData - fetch actual topic details with full metadata
            set({
              selectedPath: path,
              isLoadingDetails: true,
              selectedEntity: null,
            });

            try {
              const details = await client.getEntityDetails(path);

              // Update tree node with full data MERGED with direction info
              // This preserves isPublisher/isSubscriber for the tree icons
              const updatedTree = updateNodeInTree(rootEntities, path, n => ({
                ...n,
                data: {
                  ...details.topicData,
                  isPublisher,
                  isSubscriber,
                }
              }));
              set({ rootEntities: updatedTree });

              set({ selectedEntity: details, isLoadingDetails: false });
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unknown error';
              toast.error(`Failed to load topic details: ${message}`);
              set({
                selectedEntity: {
                  id: node.id,
                  name: node.name,
                  type: 'topic',
                  href: node.href,
                  error: 'Failed to load details'
                },
                isLoadingDetails: false
              });
            }
            return;
          }

          // Full ComponentTopic data available (from expanded component children)
          const topicData = data as ComponentTopic;
          set({
            selectedPath: path,
            isLoadingDetails: false,
            selectedEntity: {
              id: node.id,
              name: node.name,
              href: node.href,
              topicData,
              rosType: topicData.type,
              type: 'topic',
            }
          });
          return;
        }

        // Optimization for Component - check if we have full ComponentTopic data in children
        if (node && node.type === 'component') {
          // Auto-expand component to show topics
          const newExpandedPaths = expandedPaths.includes(path)
            ? expandedPaths
            : [...expandedPaths, path];

          // Check if children have FULL ComponentTopic data (not just TopicNodeData)
          const hasFullTopicData = node.children &&
            node.children.length > 0 &&
            node.children[0].data &&
            typeof node.children[0].data === 'object' &&
            'type' in (node.children[0].data as object);

          if (hasFullTopicData) {
            // Use full ComponentTopic data from tree cache
            const fullTopics = node.children!
              .filter(child => child.type === 'topic' && child.data)
              .map(child => child.data as ComponentTopic);

            set({
              selectedPath: path,
              expandedPaths: newExpandedPaths,
              isLoadingDetails: false,
              selectedEntity: {
                id: node.id,
                name: node.name,
                type: node.type,
                href: node.href,
                // Full topic data with QoS, publishers, subscribers
                topics: fullTopics,
                // Simple lists for navigation
                topicsInfo: {
                  publishes: fullTopics.map(t => t.topic),
                  subscribes: [],
                }
              }
            });
            return;
          }

          // Children only have TopicNodeData (from topicsInfo) - need to fetch full data from API
          // Fall through to the API fetch below
        }

        set({
          selectedPath: path,
          isLoadingDetails: true,
          selectedEntity: null,
        });

        try {
          const details = await client.getEntityDetails(path);

          // SYNC: Update tree with fetched topics AND auto-expand the node
          // Prefer full topics array (with QoS, publishers) over topicsInfo (names only)
          if (details.topics && details.topics.length > 0) {
            const children = details.topics.map(topic => {
              const cleanName = topic.topic.startsWith('/') ? topic.topic.slice(1) : topic.topic;
              const encodedName = encodeURIComponent(cleanName);
              return {
                id: encodedName,
                name: topic.topic,
                type: 'topic' as const,
                href: `${path}/${encodedName}`,
                hasChildren: false,
                path: `${path}/${encodedName}`,
                // Store FULL ComponentTopic data for rich view
                data: topic
              };
            });

            const updatedTree = updateNodeInTree(rootEntities, path, n => ({
              ...n,
              children,
              isLoading: false
            }));

            // Auto-expand the node if it has topics
            const newExpandedPaths = expandedPaths.includes(path)
              ? expandedPaths
              : [...expandedPaths, path];

            set({
              rootEntities: updatedTree,
              expandedPaths: newExpandedPaths
            });
          } else if (details.topicsInfo) {
            // Fallback to topicsInfo if topics array not available
            const allTopics = new Set<string>();
            details.topicsInfo.publishes?.forEach(t => allTopics.add(t));
            details.topicsInfo.subscribes?.forEach(t => allTopics.add(t));

            const children = Array.from(allTopics).sort().map(topicName => {
              const cleanName = topicName.startsWith('/') ? topicName.slice(1) : topicName;
              const encodedName = encodeURIComponent(cleanName);
              return {
                id: encodedName,
                name: topicName,
                type: 'topic' as const,
                href: `${path}/${encodedName}`,
                hasChildren: false,
                path: `${path}/${encodedName}`,
                data: {
                  topic: topicName,
                  isPublisher: details.topicsInfo?.publishes?.includes(topicName) ?? false,
                  isSubscriber: details.topicsInfo?.subscribes?.includes(topicName) ?? false,
                }
              };
            });

            const updatedTree = updateNodeInTree(rootEntities, path, n => ({
              ...n,
              children,
              isLoading: false
            }));

            // Auto-expand the node if it has topics
            const newExpandedPaths = expandedPaths.includes(path)
              ? expandedPaths
              : [...expandedPaths, path];

            set({
              rootEntities: updatedTree,
              expandedPaths: newExpandedPaths
            });
          }

          set({ selectedEntity: details, isLoadingDetails: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Failed to load entity details for ${path}: ${message}`);

          // Set fallback entity to allow panel to render
          // Infer entity type from path structure
          const segments = path.split('/').filter(Boolean);
          const id = segments[segments.length - 1] || path;
          let inferredType: string;
          if (segments.length === 1) {
            inferredType = 'area';
          } else if (segments.length === 2) {
            inferredType = 'component';
          } else {
            inferredType = 'unknown';
          }

          set({
            selectedEntity: {
              id,
              name: id,
              type: inferredType,
              href: path,
              error: 'Failed to load details'
            },
            isLoadingDetails: false
          });
        }
      },

      // Refresh the currently selected entity (re-fetch from server)
      refreshSelectedEntity: async () => {
        const { selectedPath, client } = get();
        if (!selectedPath || !client) {
          return;
        }

        set({ isRefreshing: true });

        try {
          const details = await client.getEntityDetails(selectedPath);
          set({ selectedEntity: details, isRefreshing: false });
        } catch {
          toast.error('Failed to refresh data');
          set({ isRefreshing: false });
        }
      },

      // Clear selection
      clearSelection: () => {
        set({
          selectedPath: null,
          selectedEntity: null,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state: AppState) => ({
        serverUrl: state.serverUrl,
        baseEndpoint: state.baseEndpoint
      }),
    }
  )
);
