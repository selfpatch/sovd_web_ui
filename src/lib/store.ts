import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'react-toastify';
import type { SovdEntity, SovdEntityDetails, EntityTreeNode } from './types';
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

  // Actions
  connect: (url: string, baseEndpoint?: string) => Promise<boolean>;
  disconnect: () => void;
  loadRootEntities: () => Promise<void>;
  loadChildren: (path: string) => Promise<void>;
  toggleExpanded: (path: string) => void;
  selectEntity: (path: string) => Promise<void>;
  clearSelection: () => void;
}

/**
 * Convert SovdEntity to EntityTreeNode
 */
function toTreeNode(entity: SovdEntity, parentPath: string = ''): EntityTreeNode {
  const path = parentPath ? `${parentPath}/${entity.id}` : `/${entity.id}`;
  return {
    ...entity,
    path,
    children: undefined,
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
        const { client, loadingPaths, rootEntities } = get();
        if (!client || loadingPaths.includes(path)) return;

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
        const { client, selectedPath } = get();
        if (!client || path === selectedPath) return;

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
              topics: [],
              error: 'Failed to load details'
            },
            isLoadingDetails: false
          });
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
