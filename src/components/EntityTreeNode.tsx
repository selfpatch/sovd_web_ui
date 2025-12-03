import { useEffect } from 'react';
import { useShallow } from 'zustand/shallow';
import { ChevronRight, Loader2, Server, Folder, FileJson, Box, MessageSquare, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAppStore } from '@/lib/store';
import type { EntityTreeNode as EntityTreeNodeType, TopicNodeData } from '@/lib/types';

interface EntityTreeNodeProps {
    node: EntityTreeNodeType;
    depth: number;
}

/**
 * Get icon for entity type
 */
function getEntityIcon(type: string) {
    switch (type.toLowerCase()) {
        case 'device':
        case 'server':
            return Server;
        case 'component':
        case 'ecu':
            return Box;
        case 'folder':
        case 'area':
            return Folder;
        case 'topic':
            return MessageSquare;
        default:
            return FileJson;
    }
}

/**
 * Check if node data is TopicNodeData (from topicsInfo)
 */
function isTopicNodeData(data: unknown): data is TopicNodeData {
    return !!data && typeof data === 'object' && 'isPublisher' in data && 'isSubscriber' in data;
}

export function EntityTreeNode({ node, depth }: EntityTreeNodeProps) {
    const {
        expandedPaths,
        loadingPaths,
        selectedPath,
        toggleExpanded,
        loadChildren,
        selectEntity,
    } = useAppStore(
        useShallow((state) => ({
            expandedPaths: state.expandedPaths,
            loadingPaths: state.loadingPaths,
            selectedPath: state.selectedPath,
            toggleExpanded: state.toggleExpanded,
            loadChildren: state.loadChildren,
            selectEntity: state.selectEntity,
        }))
    );

    const isExpanded = expandedPaths.includes(node.path);
    const isLoading = loadingPaths.includes(node.path);
    const isSelected = selectedPath === node.path;
    const hasChildren = node.hasChildren !== false; // Default to true if not specified
    const Icon = getEntityIcon(node.type);

    // Get topic direction info if available
    const topicData = isTopicNodeData(node.data) ? node.data : null;

    // Load children when expanded and no children loaded yet
    useEffect(() => {
        if (isExpanded && !node.children && !isLoading && hasChildren) {
            loadChildren(node.path);
        }
    }, [isExpanded, node, isLoading, hasChildren, loadChildren]);

    const handleToggle = () => {
        if (hasChildren) {
            toggleExpanded(node.path);
        }
    };

    const handleSelect = (e: React.MouseEvent) => {
        e.stopPropagation();
        selectEntity(node.path);
    };

    return (
        <Collapsible open={isExpanded} onOpenChange={handleToggle}>
            <div
                className={cn(
                    'flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer hover:bg-accent/50 transition-colors',
                    isSelected && 'bg-primary/10 text-primary font-medium',
                )}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={handleSelect}
            >
                <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <button
                        className={cn(
                            'p-0.5 rounded hover:bg-primary/10 transition-transform',
                            !hasChildren && 'invisible',
                        )}
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : (
                            <ChevronRight
                                className={cn(
                                    'w-4 h-4 text-muted-foreground transition-transform',
                                    isExpanded && 'rotate-90',
                                    isSelected && 'text-primary'
                                )}
                            />
                        )}
                    </button>
                </CollapsibleTrigger>

                <Icon className={cn(
                    "w-4 h-4 shrink-0",
                    isSelected ? "text-primary" : "text-muted-foreground"
                )} />

                <span className="text-sm truncate flex-1">{node.name}</span>

                {/* Topic direction indicators */}
                {topicData && (
                    <div className="flex items-center gap-0.5 mr-1" title={`${topicData.isPublisher ? 'Publishes' : ''}${topicData.isPublisher && topicData.isSubscriber ? ' & ' : ''}${topicData.isSubscriber ? 'Subscribes' : ''}`}>
                        {topicData.isPublisher && (
                            <ArrowUp className="w-3 h-3 text-green-500" />
                        )}
                        {topicData.isSubscriber && (
                            <ArrowDown className="w-3 h-3 text-blue-500" />
                        )}
                    </div>
                )}

                <span className={cn(
                    "text-xs shrink-0",
                    isSelected ? "text-primary/70" : "text-muted-foreground"
                )}>
                    {node.type}
                </span>
            </div>

            {hasChildren && (
                <CollapsibleContent>
                    {node.children?.map((child) => (
                        <EntityTreeNode key={child.path} node={child} depth={depth + 1} />
                    ))}
                </CollapsibleContent>
            )}
        </Collapsible>
    );
}
