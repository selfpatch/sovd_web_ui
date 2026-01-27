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
    App,
    VersionInfo,
} from './types';
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
    fetchConfigurations: (entityId: string, entityType?: 'components' | 'apps') => Promise<void>;
    setParameter: (
        entityId: string,
        paramName: string,
        value: unknown,
        entityType?: 'components' | 'apps'
    ) => Promise<boolean>;
    resetParameter: (entityId: string, paramName: string, entityType?: 'components' | 'apps') => Promise<boolean>;
    resetAllConfigurations: (
        entityId: string,
        entityType?: 'components' | 'apps'
    ) => Promise<{ reset_count: number; failed_count: number }>;

    // Operations actions - updated for SOVD Execution model
    fetchOperations: (entityId: string, entityType?: 'components' | 'apps') => Promise<void>;
    createExecution: (
        entityId: string,
        operationName: string,
        request: CreateExecutionRequest,
        entityType?: 'components' | 'apps'
    ) => Promise<CreateExecutionResponse | null>;
    refreshExecutionStatus: (
        entityId: string,
        operationName: string,
        executionId: string,
        entityType?: 'components' | 'apps'
    ) => Promise<void>;
    cancelExecution: (
        entityId: string,
        operationName: string,
        executionId: string,
        entityType?: 'components' | 'apps'
    ) => Promise<boolean>;
    setAutoRefreshExecutions: (enabled: boolean) => void;

    // Faults actions
    fetchFaults: () => Promise<void>;
    clearFault: (entityType: 'components' | 'apps', entityId: string, faultCode: string) => Promise<boolean>;
    subscribeFaultStream: () => void;
    unsubscribeFaultStream: () => void;
}

/**
 * Convert SovdEntity to EntityTreeNode
 *
 * Structure - flat hierarchy with type tags:
 * - Area: subareas and components loaded as direct children on expand
 * - Subarea: same as Area
 * - Component: subcomponents and apps loaded as direct children on expand
 * - Subcomponent: same as Component
 * - App: leaf node (no children in tree)
 *
 * Resources (data, operations, configurations, faults) are shown in the detail panel,
 * not as tree nodes.
 */
function toTreeNode(entity: SovdEntity, parentPath: string = ''): EntityTreeNode {
    const path = parentPath ? `${parentPath}/${entity.id}` : `/${entity.id}`;
    const entityType = entity.type.toLowerCase();

    // Prefer explicit metadata / existing children if available; fall back to type heuristic.
    let hasChildren: boolean;
    const entityAny = entity as unknown as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(entityAny, 'hasChildren') && typeof entityAny.hasChildren === 'boolean') {
        hasChildren = entityAny.hasChildren as boolean;
    } else if (Array.isArray(entityAny.children)) {
        hasChildren = (entityAny.children as unknown[]).length > 0;
    } else {
        // Areas and components typically have children (loaded on expand)
        // Apps are usually leaf nodes - their resources are shown in the detail panel
        hasChildren = entityType !== 'app';
    }

    return {
        ...entity,
        path,
        children: undefined, // Children loaded lazily on expand
        isLoading: false,
        isExpanded: false,
        hasChildren,
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

            // Load root entities - creates a server node as root with areas as children
            loadRootEntities: async () => {
                const { client, serverUrl } = get();
                if (!client) return;

                try {
                    // Fetch version info and areas in parallel
                    const [versionInfo, entities] = await Promise.all([
                        client.getVersionInfo().catch((error: unknown) => {
                            const message = error instanceof Error ? error.message : 'Unknown error';
                            toast.warn(`Failed to fetch server version info: ${message}`);
                            return null as VersionInfo | null;
                        }),
                        client.getEntities(),
                    ]);

                    // Extract server info from version-info response
                    const sovdInfo = versionInfo?.sovd_info?.[0];
                    const serverName = sovdInfo?.vendor_info?.name || 'SOVD Server';
                    const serverVersion = sovdInfo?.vendor_info?.version || '';
                    const sovdVersion = sovdInfo?.version || '';

                    // Create server root node with areas as children
                    const serverNode: EntityTreeNode = {
                        id: 'server',
                        name: serverName,
                        type: 'server',
                        href: serverUrl || '',
                        path: '/server',
                        hasChildren: true,
                        isLoading: false,
                        isExpanded: false,
                        children: entities.map((e: SovdEntity) => toTreeNode(e, '/server')),
                        data: {
                            versionInfo,
                            serverVersion,
                            sovdVersion,
                            serverUrl,
                        },
                    };

                    set({ rootEntities: [serverNode], expandedPaths: ['/server'] });
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

                // Regular node loading for entities (server, areas, subareas, components, subcomponents)
                // These load their direct children
                const nodeType = node?.type?.toLowerCase() || '';

                // Handle server node - children (areas) are already loaded in loadRootEntities
                if (nodeType === 'server') {
                    // Server children (areas) are pre-loaded, nothing to do
                    return;
                }

                // Check if this is a loadable entity type
                const isAreaOrSubarea = nodeType === 'area' || nodeType === 'subarea';
                const isComponentOrSubcomponent = nodeType === 'component' || nodeType === 'subcomponent';

                if (node && (isAreaOrSubarea || isComponentOrSubcomponent)) {
                    // Check if we already loaded children
                    if (node.children && node.children.length > 0) {
                        // Already loaded children, skip fetch
                        return;
                    }

                    set({ loadingPaths: [...loadingPaths, path] });

                    try {
                        let loadedEntities: EntityTreeNode[] = [];

                        // Convert tree path to API path (remove /server prefix)
                        const apiPath = path.replace(/^\/server/, '');

                        if (isAreaOrSubarea) {
                            // Load both subareas and components for this area
                            // API returns mixed: components come from getEntities, subareas from listSubareas
                            const [components, subareas] = await Promise.all([
                                client.getEntities(apiPath),
                                client.listSubareas(node.id).catch(() => []),
                            ]);

                            // Components from getEntities
                            const componentNodes = components.map((e: SovdEntity) => toTreeNode(e, path));
                            // Subareas with type 'subarea'
                            const subareaNodes = subareas.map((subarea) =>
                                toTreeNode({ ...subarea, type: 'subarea', hasChildren: true }, path)
                            );

                            loadedEntities = [...subareaNodes, ...componentNodes];
                        } else if (isComponentOrSubcomponent) {
                            // Load both subcomponents and apps for this component
                            const [apps, subcomponents] = await Promise.all([
                                client.listComponentApps(node.id),
                                client.listSubcomponents(node.id).catch(() => []),
                            ]);

                            // Apps - leaf nodes (no children in tree, resources shown in panel)
                            const appNodes = apps.map((app) =>
                                toTreeNode({ ...app, type: 'app', hasChildren: false }, path)
                            );
                            // Subcomponents with type 'subcomponent'
                            const subcompNodes = subcomponents.map((subcomp) =>
                                toTreeNode({ ...subcomp, type: 'subcomponent', hasChildren: true }, path)
                            );

                            loadedEntities = [...subcompNodes, ...appNodes];
                        }

                        const updatedTree = updateNodeInTree(rootEntities, path, (n) => ({
                            ...n,
                            children: loadedEntities,
                            hasChildren: loadedEntities.length > 0,
                            isLoading: false,
                        }));

                        set({
                            rootEntities: updatedTree,
                            loadingPaths: get().loadingPaths.filter((p) => p !== path),
                        });
                    } catch (error) {
                        const message = error instanceof Error ? error.message : 'Unknown error';
                        if (!message.includes('not found') && !message.includes('404')) {
                            toast.error(`Failed to load children for ${path}: ${message}`);
                        }
                        set({ loadingPaths: get().loadingPaths.filter((p) => p !== path) });
                    }
                    return;
                }

                // For non-entity nodes, use regular loading
                if (node && Array.isArray(node.children) && node.children.length > 0) {
                    // Check if children have full data or just TopicNodeData
                    const firstChild = node.children[0];
                    const hasFullData =
                        firstChild?.data && typeof firstChild.data === 'object' && 'type' in firstChild.data;

                    if (hasFullData) {
                        // Already have full data, skip fetch
                        return;
                    }
                }

                // Mark as loading
                set({ loadingPaths: [...loadingPaths, path] });

                try {
                    // Convert tree path to API path (remove /server prefix)
                    const apiPath = path.replace(/^\/server/, '');
                    const entities = await client.getEntities(apiPath);
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
                            // Convert tree path to API path (remove /server prefix)
                            const apiPath = path.replace(/^\/server/, '');
                            const details = await client.getEntityDetails(apiPath);

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

                // Handle Server node selection - show server info panel
                if (node && node.type === 'server') {
                    const newExpandedPaths = expandedPaths.includes(path) ? expandedPaths : [...expandedPaths, path];
                    const serverData = node.data as {
                        versionInfo?: VersionInfo;
                        serverVersion?: string;
                        sovdVersion?: string;
                        serverUrl?: string;
                    };

                    set({
                        selectedPath: path,
                        expandedPaths: newExpandedPaths,
                        isLoadingDetails: false,
                        selectedEntity: {
                            id: node.id,
                            name: node.name,
                            type: 'server',
                            href: node.href,
                            versionInfo: serverData?.versionInfo,
                            serverVersion: serverData?.serverVersion,
                            sovdVersion: serverData?.sovdVersion,
                            serverUrl: serverData?.serverUrl,
                        },
                    });
                    return;
                }

                // Optimization for Component/Subcomponent - just select it and auto-expand
                // Don't modify children - virtual folders (resources/, subcomponents/) are already there
                if (node && (node.type === 'component' || node.type === 'subcomponent')) {
                    // Auto-expand to show virtual folders
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

                // Handle Area/Subarea entity selection - auto-expand to show virtual folders
                if (node && (node.type === 'area' || node.type === 'subarea')) {
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
                    // Convert tree path to API path (remove /server prefix)
                    const apiPath = path.replace(/^\/server/, '');
                    const details = await client.getEntityDetails(apiPath);
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

            fetchConfigurations: async (entityId: string, entityType: 'components' | 'apps' = 'components') => {
                const { client, configurations } = get();
                if (!client) return;

                set({ isLoadingConfigurations: true });

                try {
                    const result = await client.listConfigurations(entityId, entityType);
                    const newConfigs = new Map(configurations);
                    newConfigs.set(entityId, result.parameters);
                    set({ configurations: newConfigs, isLoadingConfigurations: false });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    toast.error(`Failed to load configurations: ${message}`);
                    set({ isLoadingConfigurations: false });
                }
            },

            setParameter: async (
                entityId: string,
                paramName: string,
                value: unknown,
                entityType: 'components' | 'apps' = 'components'
            ) => {
                const { client, configurations } = get();
                if (!client) return false;

                try {
                    const result = await client.setConfiguration(entityId, paramName, { value }, entityType);

                    // API returns {data: ..., id: ..., x-medkit: {parameter: {...}}}
                    // Success is indicated by presence of x-medkit.parameter (no status field)
                    const xMedkit = (result as { 'x-medkit'?: { parameter?: { name: string; value: unknown } } })[
                        'x-medkit'
                    ];
                    const parameter = xMedkit?.parameter;

                    if (parameter) {
                        // Update local state with new value
                        const newConfigs = new Map(configurations);
                        const params = newConfigs.get(entityId) || [];
                        const updatedParams = params.map((p) =>
                            p.name === paramName ? { ...p, value: parameter.value } : p
                        );
                        newConfigs.set(entityId, updatedParams);
                        set({ configurations: newConfigs });
                        toast.success(`Parameter ${paramName} updated`);
                        return true;
                    } else if ((result as { status?: string }).status === 'success') {
                        // Legacy format fallback
                        const legacyResult = result as { parameter: { value: unknown } };
                        const newConfigs = new Map(configurations);
                        const params = newConfigs.get(entityId) || [];
                        const updatedParams = params.map((p) =>
                            p.name === paramName ? { ...p, value: legacyResult.parameter.value } : p
                        );
                        newConfigs.set(entityId, updatedParams);
                        set({ configurations: newConfigs });
                        toast.success(`Parameter ${paramName} updated`);
                        return true;
                    } else {
                        toast.error(
                            `Failed to set parameter: ${(result as { error?: string }).error || 'Unknown error'}`
                        );
                        return false;
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    toast.error(`Failed to set parameter: ${message}`);
                    return false;
                }
            },

            resetParameter: async (
                entityId: string,
                paramName: string,
                entityType: 'components' | 'apps' = 'components'
            ) => {
                const { client, configurations } = get();
                if (!client) return false;

                try {
                    const result = await client.resetConfiguration(entityId, paramName, entityType);

                    // Update local state with reset value
                    const newConfigs = new Map(configurations);
                    const params = newConfigs.get(entityId) || [];
                    const updatedParams = params.map((p) => (p.name === paramName ? { ...p, value: result.value } : p));
                    newConfigs.set(entityId, updatedParams);
                    set({ configurations: newConfigs });
                    toast.success(`Parameter ${paramName} reset to default`);
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    toast.error(`Failed to reset parameter: ${message}`);
                    return false;
                }
            },

            resetAllConfigurations: async (entityId: string, entityType: 'components' | 'apps' = 'components') => {
                const { client, fetchConfigurations } = get();
                if (!client) return { reset_count: 0, failed_count: 0 };

                try {
                    const result = await client.resetAllConfigurations(entityId, entityType);

                    if (result.failed_count === 0) {
                        toast.success(`Reset ${result.reset_count} parameters to defaults`);
                    } else {
                        toast.warning(`Reset ${result.reset_count} parameters, ${result.failed_count} failed`);
                    }

                    // Refresh configurations to get updated values
                    await fetchConfigurations(entityId, entityType);

                    return { reset_count: result.reset_count, failed_count: result.failed_count };
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    toast.error(`Failed to reset configurations: ${message}`);
                    return { reset_count: 0, failed_count: 0 };
                }
            },

            // ===========================================================================
            // OPERATIONS ACTIONS (ROS 2 Services & Actions) - SOVD Execution Model
            // ===========================================================================

            fetchOperations: async (entityId: string, entityType: 'components' | 'apps' = 'components') => {
                const { client, operations } = get();
                if (!client) return;

                set({ isLoadingOperations: true });

                try {
                    const result = await client.listOperations(entityId, entityType);
                    const newOps = new Map(operations);
                    newOps.set(entityId, result);
                    set({ operations: newOps, isLoadingOperations: false });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    toast.error(`Failed to load operations: ${message}`);
                    set({ isLoadingOperations: false });
                }
            },

            createExecution: async (
                entityId: string,
                operationName: string,
                request: CreateExecutionRequest,
                entityType: 'components' | 'apps' = 'components'
            ) => {
                const { client, activeExecutions } = get();
                if (!client) return null;

                try {
                    const result = await client.createExecution(entityId, operationName, request, entityType);

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
                        toast.error(`Operation failed: ${result.error}`);
                    }

                    return result;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    toast.error(`Operation failed: ${message}`);
                    return null;
                }
            },

            refreshExecutionStatus: async (
                entityId: string,
                operationName: string,
                executionId: string,
                entityType: 'components' | 'apps' = 'components'
            ) => {
                const { client, activeExecutions } = get();
                if (!client) return;

                try {
                    const execution = await client.getExecution(entityId, operationName, executionId, entityType);
                    const newExecutions = new Map(activeExecutions);
                    newExecutions.set(executionId, execution);
                    set({ activeExecutions: newExecutions });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    toast.error(`Failed to refresh execution status: ${message}`);
                }
            },

            cancelExecution: async (
                entityId: string,
                operationName: string,
                executionId: string,
                entityType: 'components' | 'apps' = 'components'
            ) => {
                const { client, activeExecutions } = get();
                if (!client) return false;

                try {
                    const execution = await client.cancelExecution(entityId, operationName, executionId, entityType);
                    const newExecutions = new Map(activeExecutions);
                    newExecutions.set(executionId, execution);
                    set({ activeExecutions: newExecutions });
                    toast.success(`Cancel request sent for execution ${executionId.slice(0, 8)}...`);
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
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
