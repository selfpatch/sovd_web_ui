import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'react-toastify';
import type {
  SovdEntity,
  SovdEntityDetails,
  EntityTreeNode,
  ComponentTopic,
  TopicNodeData,
  Parameter,
  Operation,
  ActionGoalStatus,
  InvokeOperationRequest,
  OperationResponse,
  VirtualFolderData,
} from './types';
import { isVirtualFolderData } from './types';
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

  // Configurations state (ROS 2 Parameters)
  configurations: Map<string, Parameter[]>; // componentId -> parameters
  isLoadingConfigurations: boolean;

  // Operations state (ROS 2 Services & Actions)
  operations: Map<string, Operation[]>; // componentId -> operations
  isLoadingOperations: boolean;

  // Active action goals (for monitoring async actions)
  activeGoals: Map<string, ActionGoalStatus>; // goalId -> status
  autoRefreshGoals: boolean; // checkbox state for auto-refresh

  // Actions
  connect: (url: string, baseEndpoint?: string) => Promise<boolean>;
  disconnect: () => void;
  loadRootEntities: () => Promise<void>;
  loadChildren: (path: string) => Promise<void>;
  toggleExpanded: (path: string) => void;
  selectEntity: (path: string) => Promise<void>;
  refreshSelectedEntity: () => Promise<void>;
  clearSelection: () => void;

  // Configurations actions
  fetchConfigurations: (componentId: string) => Promise<void>;
  setParameter: (componentId: string, paramName: string, value: unknown) => Promise<boolean>;
  resetParameter: (componentId: string, paramName: string) => Promise<boolean>;
  resetAllConfigurations: (componentId: string) => Promise<{ reset_count: number; failed_count: number }>;

  // Operations actions
  fetchOperations: (componentId: string) => Promise<void>;
  invokeOperation: (componentId: string, operationName: string, request: InvokeOperationRequest) => Promise<OperationResponse | null>;
  refreshActionStatus: (componentId: string, operationName: string, goalId: string) => Promise<void>;
  cancelActionGoal: (componentId: string, operationName: string, goalId: string) => Promise<boolean>;
  setAutoRefreshGoals: (enabled: boolean) => void;
}

/**
 * Convert SovdEntity to EntityTreeNode
 */
function toTreeNode(entity: SovdEntity, parentPath: string = ''): EntityTreeNode {
  const path = parentPath ? `${parentPath}/${entity.id}` : `/${entity.id}`;

  // If this is a component, create virtual subfolders: data/, operations/, configurations/
  let children: EntityTreeNode[] | undefined;
  if (entity.type === 'component') {
    // Create virtual subfolder nodes for component
    children = [
      {
        id: 'data',
        name: 'data',
        type: 'folder',
        href: `${path}/data`,
        path: `${path}/data`,
        hasChildren: true, // Topics will be loaded here
        isLoading: false,
        isExpanded: false,
        data: { folderType: 'data', componentId: entity.id, topicsInfo: entity.topicsInfo }
      },
      {
        id: 'operations',
        name: 'operations',
        type: 'folder',
        href: `${path}/operations`,
        path: `${path}/operations`,
        hasChildren: true, // Services/actions loaded on demand
        isLoading: false,
        isExpanded: false,
        data: { folderType: 'operations', componentId: entity.id }
      },
      {
        id: 'configurations',
        name: 'configurations',
        type: 'folder',
        href: `${path}/configurations`,
        path: `${path}/configurations`,
        hasChildren: true, // Parameters loaded on demand
        isLoading: false,
        isExpanded: false,
        data: { folderType: 'configurations', componentId: entity.id }
      }
    ];
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

      // Configurations state
      configurations: new Map(),
      isLoadingConfigurations: false,

      // Operations state
      operations: new Map(),
      isLoadingOperations: false,

      // Active goals state
      activeGoals: new Map(),
      autoRefreshGoals: false,

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

        // Handle virtual folders (data/, operations/, configurations/)
        if (node && isVirtualFolderData(node.data)) {
          const folderData = node.data as VirtualFolderData;

          // Skip if already has loaded children
          if (node.children && node.children.length > 0) {
            return;
          }

          set({ loadingPaths: [...loadingPaths, path] });

          try {
            let children: EntityTreeNode[] = [];

            if (folderData.folderType === 'data') {
              // Load topics for data folder
              const topics = await client.getEntities(path.replace('/data', ''));
              children = topics.map((topic: SovdEntity & { data?: ComponentTopic }) => {
                const cleanName = topic.name.startsWith('/') ? topic.name.slice(1) : topic.name;
                const encodedName = encodeURIComponent(cleanName);
                return {
                  id: encodedName,
                  name: topic.name,
                  type: 'topic',
                  href: `${path}/${encodedName}`,
                  path: `${path}/${encodedName}`,
                  hasChildren: false,
                  isLoading: false,
                  isExpanded: false,
                  data: topic.data || {
                    topic: topic.name,
                    isPublisher: folderData.topicsInfo?.publishes?.includes(topic.name) ?? false,
                    isSubscriber: folderData.topicsInfo?.subscribes?.includes(topic.name) ?? false,
                  }
                };
              });
            } else if (folderData.folderType === 'operations') {
              // Load operations for operations folder
              const ops = await client.listOperations(folderData.componentId);
              children = ops.map(op => ({
                id: op.name,
                name: op.name,
                type: op.kind === 'service' ? 'service' : 'action',
                href: `${path}/${op.name}`,
                path: `${path}/${op.name}`,
                hasChildren: false,
                isLoading: false,
                isExpanded: false,
                data: op
              }));
            } else if (folderData.folderType === 'configurations') {
              // Load parameters for configurations folder
              const config = await client.listConfigurations(folderData.componentId);
              children = config.parameters.map(param => ({
                id: param.name,
                name: param.name,
                type: 'parameter',
                href: `${path}/${param.name}`,
                path: `${path}/${param.name}`,
                hasChildren: false,
                isLoading: false,
                isExpanded: false,
                data: param
              }));
            }

            const updatedTree = updateNodeInTree(rootEntities, path, n => ({
              ...n,
              children,
              hasChildren: children.length > 0,
              isLoading: false,
            }));

            set({
              rootEntities: updatedTree,
              loadingPaths: get().loadingPaths.filter(p => p !== path),
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            // Don't show error for empty results - some components may not have operations/configs
            if (!message.includes('not found')) {
              toast.error(`Failed to load ${folderData.folderType}: ${message}`);
            }
            // Still update tree to show empty folder
            const updatedTree = updateNodeInTree(rootEntities, path, n => ({
              ...n,
              children: [],
              hasChildren: false,
              isLoading: false,
            }));
            set({
              rootEntities: updatedTree,
              loadingPaths: get().loadingPaths.filter(p => p !== path),
            });
          }
          return;
        }

        // Regular node loading (areas, components)
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
        const { client, selectedPath, rootEntities, expandedPaths, loadChildren } = get();
        if (!client || path === selectedPath) return;

        // Auto-expand parent paths and load children if needed
        // This ensures navigation to deep paths (like /area/component/data/topic) works
        const pathParts = path.split('/').filter(Boolean);
        const newExpandedPaths = [...expandedPaths];
        let currentPath = '';

        for (let i = 0; i < pathParts.length - 1; i++) {
          currentPath += '/' + pathParts[i];
          if (!newExpandedPaths.includes(currentPath)) {
            newExpandedPaths.push(currentPath);
          }
          // Check if this node needs children loaded
          const parentNode = findNode(rootEntities, currentPath);
          if (parentNode && parentNode.hasChildren !== false && !parentNode.children) {
            // Trigger load but don't await - let it happen in background
            loadChildren(currentPath);
          }
        }

        if (newExpandedPaths.length !== expandedPaths.length) {
          set({ expandedPaths: newExpandedPaths });
        }

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

        // Optimization for Component - just select it and auto-expand
        // Don't modify children - virtual folders (data/, operations/, configurations/) are already there
        if (node && node.type === 'component') {
          // Auto-expand component to show virtual folders
          const newExpandedPaths = expandedPaths.includes(path)
            ? expandedPaths
            : [...expandedPaths, path];

          set({
            selectedPath: path,
            expandedPaths: newExpandedPaths,
            isLoadingDetails: false,
            selectedEntity: {
              id: node.id,
              name: node.name,
              type: node.type,
              href: node.href,
              // Pass topicsInfo if available for the Data tab
              topicsInfo: node.topicsInfo,
            }
          });
          return;
        }

        // Handle virtual folder selection - show appropriate panel
        if (node && isVirtualFolderData(node.data)) {
          const folderData = node.data as VirtualFolderData;
          set({
            selectedPath: path,
            isLoadingDetails: false,
            selectedEntity: {
              id: node.id,
              name: `${folderData.componentId} / ${node.name}`,
              type: 'folder',
              href: node.href,
              // Pass folder info so detail panel knows what to show
              folderType: folderData.folderType,
              componentId: folderData.componentId,
            }
          });
          return;
        }

        // Handle parameter selection - show parameter detail with data from tree
        if (node && node.type === 'parameter' && node.data) {
          // Extract componentId from path: /area/component/configurations/paramName
          const pathSegments = path.split('/').filter(Boolean);
          const componentId = pathSegments.length >= 2 ? pathSegments[1] : pathSegments[0];

          set({
            selectedPath: path,
            isLoadingDetails: false,
            selectedEntity: {
              id: node.id,
              name: node.name,
              type: 'parameter',
              href: node.href,
              data: node.data,
              componentId,
            }
          });
          return;
        }

        // Handle service/action selection - show operation detail with data from tree
        if (node && (node.type === 'service' || node.type === 'action') && node.data) {
          // Extract componentId from path: /area/component/operations/opName
          const pathSegments = path.split('/').filter(Boolean);
          const componentId = pathSegments.length >= 2 ? pathSegments[1] : pathSegments[0];

          set({
            selectedPath: path,
            isLoadingDetails: false,
            selectedEntity: {
              id: node.id,
              name: node.name,
              type: node.type,
              href: node.href,
              data: node.data,
              componentId,
            }
          });
          return;
        }

        set({
          selectedPath: path,
          isLoadingDetails: true,
          selectedEntity: null,
        });

        try {
          const details = await client.getEntityDetails(path);
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

      // ===========================================================================
      // CONFIGURATIONS ACTIONS (ROS 2 Parameters)
      // ===========================================================================

      fetchConfigurations: async (componentId: string) => {
        const { client, configurations } = get();
        if (!client) return;

        set({ isLoadingConfigurations: true });

        try {
          const result = await client.listConfigurations(componentId);
          const newConfigs = new Map(configurations);
          newConfigs.set(componentId, result.parameters);
          set({ configurations: newConfigs, isLoadingConfigurations: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Failed to load configurations: ${message}`);
          set({ isLoadingConfigurations: false });
        }
      },

      setParameter: async (componentId: string, paramName: string, value: unknown) => {
        const { client, configurations } = get();
        if (!client) return false;

        try {
          const result = await client.setConfiguration(componentId, paramName, { value });

          if (result.status === 'success') {
            // Update local state with new value
            const newConfigs = new Map(configurations);
            const params = newConfigs.get(componentId) || [];
            const updatedParams = params.map(p =>
              p.name === paramName ? { ...p, value: result.parameter.value } : p
            );
            newConfigs.set(componentId, updatedParams);
            set({ configurations: newConfigs });
            toast.success(`Parameter ${paramName} updated`);
            return true;
          } else {
            toast.error(`Failed to set parameter: ${result.error}`);
            return false;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Failed to set parameter: ${message}`);
          return false;
        }
      },

      resetParameter: async (componentId: string, paramName: string) => {
        const { client, configurations } = get();
        if (!client) return false;

        try {
          const result = await client.resetConfiguration(componentId, paramName);

          // Update local state with reset value
          const newConfigs = new Map(configurations);
          const params = newConfigs.get(componentId) || [];
          const updatedParams = params.map(p =>
            p.name === paramName ? { ...p, value: result.value } : p
          );
          newConfigs.set(componentId, updatedParams);
          set({ configurations: newConfigs });
          toast.success(`Parameter ${paramName} reset to default`);
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Failed to reset parameter: ${message}`);
          return false;
        }
      },

      resetAllConfigurations: async (componentId: string) => {
        const { client, fetchConfigurations } = get();
        if (!client) return { reset_count: 0, failed_count: 0 };

        try {
          const result = await client.resetAllConfigurations(componentId);

          if (result.failed_count === 0) {
            toast.success(`Reset ${result.reset_count} parameters to defaults`);
          } else {
            toast.warning(`Reset ${result.reset_count} parameters, ${result.failed_count} failed`);
          }

          // Refresh configurations to get updated values
          await fetchConfigurations(componentId);

          return { reset_count: result.reset_count, failed_count: result.failed_count };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Failed to reset configurations: ${message}`);
          return { reset_count: 0, failed_count: 0 };
        }
      },

      // ===========================================================================
      // OPERATIONS ACTIONS (ROS 2 Services & Actions)
      // ===========================================================================

      fetchOperations: async (componentId: string) => {
        const { client, operations } = get();
        if (!client) return;

        set({ isLoadingOperations: true });

        try {
          const result = await client.listOperations(componentId);
          const newOps = new Map(operations);
          newOps.set(componentId, result);
          set({ operations: newOps, isLoadingOperations: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Failed to load operations: ${message}`);
          set({ isLoadingOperations: false });
        }
      },

      invokeOperation: async (componentId: string, operationName: string, request: InvokeOperationRequest) => {
        const { client, activeGoals } = get();
        if (!client) return null;

        try {
          const result = await client.invokeOperation(componentId, operationName, request);

          if (result.kind === 'action' && result.status === 'success') {
            // Track the new action goal
            // goal_status can be 'accepted', 'executing', etc. - use it directly
            const newGoals = new Map(activeGoals);
            newGoals.set(result.goal_id, {
              goal_id: result.goal_id,
              status: result.goal_status as ActionGoalStatus['status'],
              action_path: `/${componentId}/${operationName}`,
              action_type: request.type || 'unknown',
            });
            set({ activeGoals: newGoals });
            toast.success(`Action goal ${result.goal_id.slice(0, 8)}... accepted`);
          } else if (result.kind === 'service') {
            toast.success(`Service ${operationName} called successfully`);
          }

          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Operation failed: ${message}`);
          return null;
        }
      },

      refreshActionStatus: async (componentId: string, operationName: string, goalId: string) => {
        const { client, activeGoals } = get();
        if (!client) return;

        try {
          const status = await client.getActionStatus(componentId, operationName, goalId);
          const newGoals = new Map(activeGoals);
          newGoals.set(goalId, status);
          set({ activeGoals: newGoals });

          // If goal is terminal, fetch result
          if (['succeeded', 'canceled', 'aborted'].includes(status.status)) {
            try {
              const result = await client.getActionResult(componentId, operationName, goalId);
              const updatedGoals = new Map(get().activeGoals);
              const existing = updatedGoals.get(goalId);
              if (existing) {
                updatedGoals.set(goalId, { ...existing, last_feedback: result.result });
              }
              set({ activeGoals: updatedGoals });
            } catch {
              // Result might not be available yet
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Failed to refresh action status: ${message}`);
        }
      },

      cancelActionGoal: async (componentId: string, operationName: string, goalId: string) => {
        const { client, activeGoals } = get();
        if (!client) return false;

        try {
          const result = await client.cancelAction(componentId, operationName, goalId);

          if (result.status === 'canceling') {
            const newGoals = new Map(activeGoals);
            const existing = newGoals.get(goalId);
            if (existing) {
              newGoals.set(goalId, { ...existing, status: 'canceling' });
            }
            set({ activeGoals: newGoals });
            toast.success(`Cancel request sent for goal ${goalId.slice(0, 8)}...`);
            return true;
          } else {
            toast.error(`Failed to cancel: ${result.message}`);
            return false;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Failed to cancel action: ${message}`);
          return false;
        }
      },

      setAutoRefreshGoals: (enabled: boolean) => {
        set({ autoRefreshGoals: enabled });
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
