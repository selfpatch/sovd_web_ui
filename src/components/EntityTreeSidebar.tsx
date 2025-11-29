import { useShallow } from 'zustand/shallow';
import { Server, Settings, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EntityTreeNode } from '@/components/EntityTreeNode';
import { EmptyState } from '@/components/EmptyState';
import { useAppStore } from '@/lib/store';

interface EntityTreeSidebarProps {
    onSettingsClick: () => void;
}

export function EntityTreeSidebar({ onSettingsClick }: EntityTreeSidebarProps) {
    const {
        isConnected,
        serverUrl,
        rootEntities,
        loadRootEntities,
    } = useAppStore(
        useShallow((state) => ({
            isConnected: state.isConnected,
            serverUrl: state.serverUrl,
            rootEntities: state.rootEntities,
            loadRootEntities: state.loadRootEntities,
        }))
    );

    return (
        <aside className="w-80 border-r bg-card flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-primary" />
                    <h2 className="font-semibold">Entity Tree</h2>
                </div>
                <div className="flex items-center gap-1">
                    {isConnected ? (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => loadRootEntities()}
                                title="Refresh entities"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={onSettingsClick}
                                title="Server settings"
                            >
                                <Settings className="w-4 h-4" />
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={onSettingsClick}
                        >
                            Connect
                        </Button>
                    )}
                </div>
            </div>

            {/* Connection status */}
            {isConnected && serverUrl && (
                <div className="px-4 py-2 border-b">
                    <div className="flex items-center gap-2">
                        <div className={cn(
                            'w-2 h-2 rounded-full',
                            isConnected ? 'bg-green-500' : 'bg-red-500'
                        )} />
                        <span className="text-xs text-muted-foreground truncate">
                            {serverUrl}
                        </span>
                    </div>
                </div>
            )}

            {/* Tree content */}
            <div className="flex-1 overflow-y-auto p-2">
                {!isConnected ? (
                    <EmptyState type="no-connection" />
                ) : rootEntities.length === 0 ? (
                    <EmptyState type="no-entities" />
                ) : (
                    <div className="space-y-0.5">
                        {rootEntities.map((entity) => (
                            <EntityTreeNode key={entity.path} node={entity} depth={0} />
                        ))}
                    </div>
                )}
            </div>
        </aside>
    );
}
