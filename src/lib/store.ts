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
    Execution,
    CreateExecutionRequest,
    CreateExecutionResponse,
    Fault,
    VirtualFolderData,
    App,
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

    // Active executions (for monitoring async actions) - SOVD Execution Model
    activeExecutions: Map<string, Execution>; // executionId -> execution
    autoRefreshExecutions: boolean; // checkbox state for auto-refresh

    // Faults state (diagnostic trouble codes)
    faults: Fault[];
    isLoadingFaults: boolean;
    faultStreamCleanup: (() => void) | null;

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

    // Operations actions - updated for SOVD Execution model
    fetchOperations: (componentId: string) => Promise<void>;
    createExecution: (
        componentId: string,
        operationName: string,
        request: CreateExecutionRequest
    ) => Promise<CreateExecutionResponse | null>;
    refreshExecutionStatus: (componentId: string, operationName: string, executionId: string) => Promise<void>;
    cancelExecution: (componentId: string, operationName: string, executionId: string) => Promise<boolean>;
    setAutoRefreshExecutions: (enabled: boolean) => void;

    // Faults actions
    fetchFaults: () => Promise<void>;
    clearFault: (entityType: 'components' | 'apps', entityId: string, faultCode: string) => Promise<boolean>;
    subscribeFaultStream: () => void;
    unsubscribeFaultStream: () => void;
}

/**
 * Convert SovdEntity to EntityTreeNode
 */
function toTreeNode(entity: SovdEntity, parentPath: string = ''): EntityTreeNode {
    const path = parentPath ? `${parentPath}/${entity.id}` : `/${entity.id}`;

    // If this is a component, create virtual subfolders: data/, operations/, configurations/, faults/, apps/
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
                data: {
                    folderType: 'data',
                    componentId: entity.id,
                    entityType: 'component',
                    topicsInfo: entity.topicsInfo,
                },
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
                data: { folderType: 'operations', componentId: entity.id, entityType: 'component' },
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
                data: { folderType: 'configurations', componentId: entity.id, entityType: 'component' },
            },
            {
                id: 'faults',
                name: 'faults',
                type: 'folder',
                href: `${path}/faults`,
                path: `${path}/faults`,
                hasChildren: true, // Faults loaded on demand
                isLoading: false,
                isExpanded: false,
                data: { folderType: 'faults', componentId: entity.id, entityType: 'component' },
            },
            {
                id: 'apps',
                name: 'apps',
                type: 'folder',
                href: `${path}/apps`,
                path: `${path}/apps`,
                hasChildren: true, // Apps (ROS 2 nodes) loaded on demand
                isLoading: false,
                isExpanded: false,
                data: { folderType: 'apps', componentId: entity.id, entityType: 'component' },
            },
        ];
    }
    // If this is an app, create virtual subfolders: data/, operations/, configurations/, faults/
    else if (entity.type === 'app') {
        children = [
            {
                id: 'data',
                name: 'data',
                type: 'folder',
                href: `${path}/data`,
                path: `${path}/data`,
                hasChildren: true,
                isLoading: false,
                isExpanded: false,
                data: { folderType: 'data', componentId: entity.id, entityType: 'app' },
            },
            {
                id: 'operations',
                name: 'operations',
                type: 'folder',
                href: `${path}/operations`,
                path: `${path}/operations`,
                hasChildren: true,
                isLoading: false,
                isExpanded: false,
                data: { folderType: 'operations', componentId: entity.id, entityType: 'app' },
            },
            {
                id: 'configurations',
                name: 'configurations',
                type: 'folder',
                href: `${path}/configurations`,
                path: `${path}/configurations`,
                hasChildren: true,
                isLoading: false,
                isExpanded: false,
                data: { folderType: 'configurations', componentId: entity.id, entityType: 'app' },
            },
            {
                id: 'faults',
                name: 'faults',
                type: 'folder',
                href: `${path}/faults`,
                path: `${path}/faults`,
                hasChildren: true,
                isLoading: false,
                isExpanded: false,
                data: { folderType: 'faults', componentId: entity.id, entityType: 'app' },
            },
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
    return nodes.map((node) => {
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

            // Active executions state - SOVD Execution model
            activeExecutions: new Map(),
            autoRefreshExecutions: false,

            // Faults state
            faults: [],
            isLoadingFaults: false,
            faultStreamCleanup: null,

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
                    console.error('[DEBUG] Failed to load entities:', error);
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
                            // For apps, use apps API; for components, use getEntities
                            if (folderData.entityType === 'app') {
                                const topics = await client.getAppData(folderData.componentId);
                                children = topics.map((topic) => {
                                    // Use uniqueKey if available (includes direction), otherwise just topic name
                                    const uniqueId = topic.uniqueKey || topic.topic;
                                    const cleanName = uniqueId.startsWith('/') ? uniqueId.slice(1) : uniqueId;
                                    const encodedName = encodeURIComponent(cleanName);
                                    return {
                                        id: encodedName,
                                        name: topic.topic,
                                        type: 'topic',
                                        href: `${path}/${encodedName}`,
                                        path: `${path}/${encodedName}`,
                                        hasChildren: false,
                                        isLoading: false,
                                        isExpanded: false,
                                        data: {
                                            ...topic,
                                            isPublisher: topic.isPublisher ?? false,
                                            isSubscriber: topic.isSubscriber ?? false,
                                        },
                                    };
                                });
                            } else {
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
                                            isPublisher:
                                                folderData.topicsInfo?.publishes?.includes(topic.name) ?? false,
                                            isSubscriber:
                                                folderData.topicsInfo?.subscribes?.includes(topic.name) ?? false,
                                        },
                                    };
                                });
                            }
                        } else if (folderData.folderType === 'operations') {
                            // Load operations for operations folder
                            const entityType = folderData.entityType === 'app' ? 'apps' : 'components';
                            const ops = await client.listOperations(folderData.componentId, entityType);
                            children = ops.map((op) => ({
                                id: op.name,
                                name: op.name,
                                type: op.kind === 'service' ? 'service' : 'action',
                                href: `${path}/${op.name}`,
                                path: `${path}/${op.name}`,
                                hasChildren: false,
                                isLoading: false,
                                isExpanded: false,
                                data: op,
                            }));
                        } else if (folderData.folderType === 'configurations') {
                            // Load parameters for configurations folder
                            const config = await client.listConfigurations(folderData.componentId);
                            children = config.parameters.map((param) => ({
                                id: param.name,
                                name: param.name,
                                type: 'parameter',
                                href: `${path}/${param.name}`,
                                path: `${path}/${param.name}`,
                                hasChildren: false,
                                isLoading: false,
                                isExpanded: false,
                                data: param,
                            }));
                        } else if (folderData.folderType === 'faults') {
                            // Load faults for this entity
                            const entityType = folderData.entityType === 'app' ? 'apps' : 'components';
                            const faultsResponse = await client.listEntityFaults(entityType, folderData.componentId);
                            children = faultsResponse.items.map((fault) => ({
                                id: fault.code,
                                name: `${fault.code}: ${fault.message}`,
                                type: 'fault',
                                href: `${path}/${encodeURIComponent(fault.code)}`,
                                path: `${path}/${encodeURIComponent(fault.code)}`,
                                hasChildren: false,
                                isLoading: false,
                                isExpanded: false,
                                data: fault,
                            }));
                        } else if (folderData.folderType === 'apps') {
                            // Load apps belonging to this component
                            // Filter apps by component_id
                            const allApps = await client.listApps();
                            const componentApps = allApps.filter((app) => app.component_id === folderData.componentId);
                            children = componentApps.map((app) =>
                                toTreeNode({ ...app, type: 'app', hasChildren: true }, path)
                            );
                        }

                        const updatedTree = updateNodeInTree(rootEntities, path, (n) => ({
                            ...n,
                            children,
                            hasChildren: children.length > 0,
                            isLoading: false,
                        }));

                        set({
                            rootEntities: updatedTree,
                            loadingPaths: get().loadingPaths.filter((p) => p !== path),
                        });
                    } catch (error) {
                        const message = error instanceof Error ? error.message : 'Unknown error';
                        console.error(`[DEBUG] Failed to load ${folderData.folderType}:`, error);
                        // Don't show error for empty results - some components may not have operations/configs
                        if (!message.includes('not found')) {
                            toast.error(`Failed to load ${folderData.folderType}: ${message}`);
                        }
                        // Still update tree to show empty folder
                        const updatedTree = updateNodeInTree(rootEntities, path, (n) => ({
                            ...n,
                            children: [],
                            hasChildren: false,
                            isLoading: false,
                        }));
                        set({
                            rootEntities: updatedTree,
                            loadingPaths: get().loadingPaths.filter((p) => p !== path),
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
                    const hasFullData =
                        firstChild?.data && typeof firstChild.data === 'object' && 'type' in firstChild.data;

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
                    const updatedTree = updateNodeInTree(rootEntities, path, (node) => ({
                        ...node,
                        children,
                        isLoading: false,
                    }));

                    // Remove from loading and update tree
                    set({
                        rootEntities: updatedTree,
                        loadingPaths: get().loadingPaths.filter((p) => p !== path),
                    });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error(`[DEBUG] Failed to load children for ${path}:`, error);
                    toast.error(`Failed to load children for ${path}: ${message}`);
                    set({ loadingPaths: get().loadingPaths.filter((p) => p !== path) });
                }
            },

            // Toggle expanded state
            toggleExpanded: (path: string) => {
                const { expandedPaths } = get();

                if (expandedPaths.includes(path)) {
                    set({ expandedPaths: expandedPaths.filter((p) => p !== path) });
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
                            const updatedTree = updateNodeInTree(rootEntities, path, (n) => ({
                                ...n,
                                data: {
                                    ...details.topicData,
                                    isPublisher,
                                    isSubscriber,
                                },
                            }));
                            set({ rootEntities: updatedTree });

                            set({ selectedEntity: details, isLoadingDetails: false });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : 'Unknown error';
                            console.error('[DEBUG] Failed to load topic details:', error);
                            toast.error(`Failed to load topic details: ${message}`);
                            set({
                                selectedEntity: {
                                    id: node.id,
                                    name: node.name,
                                    type: 'topic',
                                    href: node.href,
                                    error: 'Failed to load details',
                                },
                                isLoadingDetails: false,
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
                        },
                    });
                    return;
                }

                // Optimization for Component - just select it and auto-expand
                // Don't modify children - virtual folders (data/, operations/, configurations/, faults/, apps/) are already there
                if (node && node.type === 'component') {
                    // Auto-expand component to show virtual folders
                    const newExpandedPaths = expandedPaths.includes(path) ? expandedPaths : [...expandedPaths, path];

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
                        },
                    });
                    return;
                }

                // Handle App entity selection - auto-expand to show virtual folders
                if (node && node.type === 'app') {
                    const newExpandedPaths = expandedPaths.includes(path) ? expandedPaths : [...expandedPaths, path];
                    const appData = node.data as App | undefined;

                    set({
                        selectedPath: path,
                        expandedPaths: newExpandedPaths,
                        isLoadingDetails: false,
                        selectedEntity: {
                            id: node.id,
                            name: node.name,
                            type: 'app',
                            href: node.href,
                            // Pass app-specific data
                            fqn: appData?.fqn || node.name,
                            node_name: appData?.node_name,
                            namespace: appData?.namespace,
                            component_id: appData?.component_id,
                        },
                    });
                    return;
                }

                // Handle fault selection - show fault details
                if (node && node.type === 'fault' && node.data) {
                    const fault = node.data as Fault;
                    // Extract entity info from path: /area/component/faults/code
                    const pathSegments = path.split('/').filter(Boolean);
                    const entityId = pathSegments.length >= 2 ? pathSegments[pathSegments.length - 3] : '';

                    set({
                        selectedPath: path,
                        isLoadingDetails: false,
                        selectedEntity: {
                            id: node.id,
                            name: fault.message,
                            type: 'fault',
                            href: node.href,
                            data: fault,
                            entityId,
                        },
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
                            entityType: folderData.entityType,
                        },
                    });
                    return;
                }

                // Handle parameter selection - show parameter detail with data from tree
                if (node && node.type === 'parameter' && node.data) {
                    // Extract componentId from path: /area/component/configurations/paramName
                    const pathSegments = path.split('/').filter(Boolean);
                    const componentId = (pathSegments.length >= 2 ? pathSegments[1] : pathSegments[0]) ?? '';

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
                        },
                    });
                    return;
                }

                // Handle service/action selection - show operation detail with data from tree
                if (node && (node.type === 'service' || node.type === 'action') && node.data) {
                    // Extract componentId from path: /area/component/operations/opName
                    const pathSegments = path.split('/').filter(Boolean);
                    const componentId = (pathSegments.length >= 2 ? pathSegments[1] : pathSegments[0]) ?? '';

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
                        },
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
                    console.error(`[DEBUG] Failed to load entity details for ${path}:`, error);
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
                            error: 'Failed to load details',
                        },
                        isLoadingDetails: false,
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
                } catch (error) {
                    console.error('[DEBUG] Failed to refresh data:', error);
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
                    console.error('[DEBUG] Failed to load configurations:', error);
                    toast.error(`Failed to load configurations: ${message}`);
                    set({ isLoadingConfigurations: false });
                }
            },

            setParameter: async (componentId: string, paramName: string, value: unknown) => {
                const { client, configurations } = get();
                if (!client) return false;

                try {
                    const result = await client.setConfiguration(componentId, paramName, { value });

                    // API returns {data: ..., id: ..., x-medkit: {parameter: {...}}}
                    // Success is indicated by presence of x-medkit.parameter (no status field)
                    const xMedkit = (result as { 'x-medkit'?: { parameter?: { name: string; value: unknown } } })[
                        'x-medkit'
                    ];
                    const parameter = xMedkit?.parameter;

                    if (parameter) {
                        // Update local state with new value
                        const newConfigs = new Map(configurations);
                        const params = newConfigs.get(componentId) || [];
                        const updatedParams = params.map((p) =>
                            p.name === paramName ? { ...p, value: parameter.value } : p
                        );
                        newConfigs.set(componentId, updatedParams);
                        set({ configurations: newConfigs });
                        toast.success(`Parameter ${paramName} updated`);
                        return true;
                    } else if ((result as { status?: string }).status === 'success') {
                        // Legacy format fallback
                        const legacyResult = result as { parameter: { value: unknown } };
                        const newConfigs = new Map(configurations);
                        const params = newConfigs.get(componentId) || [];
                        const updatedParams = params.map((p) =>
                            p.name === paramName ? { ...p, value: legacyResult.parameter.value } : p
                        );
                        newConfigs.set(componentId, updatedParams);
                        set({ configurations: newConfigs });
                        toast.success(`Parameter ${paramName} updated`);
                        return true;
                    } else {
                        console.error('[DEBUG] Failed to set parameter - result:', result);
                        toast.error(
                            `Failed to set parameter: ${(result as { error?: string }).error || 'Unknown error'}`
                        );
                        return false;
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[DEBUG] Failed to set parameter:', error);
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
                    const updatedParams = params.map((p) => (p.name === paramName ? { ...p, value: result.value } : p));
                    newConfigs.set(componentId, updatedParams);
                    set({ configurations: newConfigs });
                    toast.success(`Parameter ${paramName} reset to default`);
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[DEBUG] Failed to reset parameter:', error);
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
                    console.error('[DEBUG] Failed to reset configurations:', error);
                    toast.error(`Failed to reset configurations: ${message}`);
                    return { reset_count: 0, failed_count: 0 };
                }
            },

            // ===========================================================================
            // OPERATIONS ACTIONS (ROS 2 Services & Actions) - SOVD Execution Model
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
                    console.error('[DEBUG] Failed to load operations:', error);
                    toast.error(`Failed to load operations: ${message}`);
                    set({ isLoadingOperations: false });
                }
            },

            createExecution: async (componentId: string, operationName: string, request: CreateExecutionRequest) => {
                const { client, activeExecutions } = get();
                if (!client) return null;

                try {
                    const result = await client.createExecution(componentId, operationName, request);

                    if (result.kind === 'action' && !result.error) {
                        // Track the new execution for actions
                        const newExecutions = new Map(activeExecutions);
                        newExecutions.set(result.id, {
                            id: result.id,
                            status: result.status,
                            created_at: new Date().toISOString(),
                            result: result.result,
                        });
                        set({ activeExecutions: newExecutions });
                        toast.success(`Action execution ${result.id.slice(0, 8)}... started`);
                    } else if (result.kind === 'service' && !result.error) {
                        toast.success(`Service ${operationName} executed successfully`);
                    } else if (result.error) {
                        console.error('[DEBUG] Operation result error:', result);
                        toast.error(`Operation failed: ${result.error}`);
                    }

                    return result;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[DEBUG] Operation execution failed:', error);
                    toast.error(`Operation failed: ${message}`);
                    return null;
                }
            },

            refreshExecutionStatus: async (componentId: string, operationName: string, executionId: string) => {
                const { client, activeExecutions } = get();
                if (!client) return;

                try {
                    const execution = await client.getExecution(componentId, operationName, executionId);
                    const newExecutions = new Map(activeExecutions);
                    newExecutions.set(executionId, execution);
                    set({ activeExecutions: newExecutions });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[DEBUG] Failed to refresh execution status:', error);
                    toast.error(`Failed to refresh execution status: ${message}`);
                }
            },

            cancelExecution: async (componentId: string, operationName: string, executionId: string) => {
                const { client, activeExecutions } = get();
                if (!client) return false;

                try {
                    const execution = await client.cancelExecution(componentId, operationName, executionId);
                    const newExecutions = new Map(activeExecutions);
                    newExecutions.set(executionId, execution);
                    set({ activeExecutions: newExecutions });
                    toast.success(`Cancel request sent for execution ${executionId.slice(0, 8)}...`);
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[DEBUG] Failed to cancel execution:', error);
                    toast.error(`Failed to cancel execution: ${message}`);
                    return false;
                }
            },

            setAutoRefreshExecutions: (enabled: boolean) => {
                set({ autoRefreshExecutions: enabled });
            },

            // ===========================================================================
            // FAULTS ACTIONS (Diagnostic Trouble Codes)
            // ===========================================================================

            fetchFaults: async () => {
                const { client } = get();
                if (!client) return;

                set({ isLoadingFaults: true });

                try {
                    const result = await client.listAllFaults();
                    set({ faults: result.items, isLoadingFaults: false });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[DEBUG] Failed to load faults:', error);
                    toast.error(`Failed to load faults: ${message}`);
                    set({ isLoadingFaults: false });
                }
            },

            clearFault: async (entityType: 'components' | 'apps', entityId: string, faultCode: string) => {
                const { client, fetchFaults } = get();
                if (!client) return false;

                try {
                    await client.clearFault(entityType, entityId, faultCode);
                    toast.success(`Fault ${faultCode} cleared`);
                    // Refresh faults list
                    await fetchFaults();
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[DEBUG] Failed to clear fault:', error);
                    toast.error(`Failed to clear fault: ${message}`);
                    return false;
                }
            },

            subscribeFaultStream: () => {
                const { client, faultStreamCleanup } = get();
                if (!client) return;

                // Clean up existing subscription
                if (faultStreamCleanup) {
                    faultStreamCleanup();
                }

                const cleanup = client.subscribeFaultStream(
                    (fault) => {
                        const { faults } = get();
                        // Add or update fault in the list
                        const existingIndex = faults.findIndex(
                            (f) => f.code === fault.code && f.entity_id === fault.entity_id
                        );
                        if (existingIndex >= 0) {
                            const newFaults = [...faults];
                            newFaults[existingIndex] = fault;
                            set({ faults: newFaults });
                        } else {
                            set({ faults: [...faults, fault] });
                        }
                        toast.warning(`Fault: ${fault.message}`, { autoClose: 5000 });
                    },
                    (error) => {
                        toast.error(`Fault stream error: ${error.message}`);
                    }
                );

                set({ faultStreamCleanup: cleanup });
            },

            unsubscribeFaultStream: () => {
                const { faultStreamCleanup } = get();
                if (faultStreamCleanup) {
                    faultStreamCleanup();
                    set({ faultStreamCleanup: null });
                }
            },
        }),
        {
            name: STORAGE_KEY,
            partialize: (state: AppState) => ({
                serverUrl: state.serverUrl,
                baseEndpoint: state.baseEndpoint,
            }),
        }
    )
);
