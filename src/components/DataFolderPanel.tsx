import { useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import { Database, Loader2, RefreshCw, Radio, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppStore, type AppState } from '@/lib/store';

interface DataFolderPanelProps {
    /** Base path for navigation (e.g., /root/route_server) */
    basePath: string;
}

export function DataFolderPanel({ basePath }: DataFolderPanelProps) {
    const { rootEntities, selectEntity, loadChildren, expandedPaths, toggleExpanded } = useAppStore(
        useShallow((state: AppState) => ({
            client: state.client,
            rootEntities: state.rootEntities,
            selectEntity: state.selectEntity,
            loadChildren: state.loadChildren,
            expandedPaths: state.expandedPaths,
            toggleExpanded: state.toggleExpanded,
        }))
    );

    // Find the data folder node in the tree
    const dataFolderPath = `${basePath}/data`;
    const findNode = useCallback((nodes: typeof rootEntities, path: string): (typeof rootEntities)[0] | null => {
        for (const node of nodes) {
            if (node.path === path) return node;
            if (node.children) {
                const found = findNode(node.children, path);
                if (found) return found;
            }
        }
        return null;
    }, []);

    const dataFolder = findNode(rootEntities, dataFolderPath);
    const topics = dataFolder?.children || [];
    const isLoading = !dataFolder?.children && dataFolder !== null;

    // Load children if not loaded yet
    useEffect(() => {
        if (dataFolder && !dataFolder.children) {
            loadChildren(dataFolderPath);
        }
    }, [dataFolder, dataFolderPath, loadChildren]);

    const handleRefresh = useCallback(() => {
        loadChildren(dataFolderPath);
    }, [dataFolderPath, loadChildren]);

    const handleTopicClick = useCallback(
        (topicPath: string) => {
            // Expand the data folder if not expanded
            if (!expandedPaths.includes(dataFolderPath)) {
                toggleExpanded(dataFolderPath);
            }
            // Navigate to topic
            selectEntity(topicPath);
        },
        [dataFolderPath, expandedPaths, toggleExpanded, selectEntity]
    );

    if (isLoading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-base">Data</CardTitle>
                        <span className="text-xs text-muted-foreground">({topics.length} items)</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleRefresh}>
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {topics.length === 0 ? (
                    <div className="text-center text-muted-foreground py-4">No data available for this component.</div>
                ) : (
                    <div className="space-y-2">
                        {topics.map((topic) => {
                            // Extract direction info from topic data
                            const topicData = topic.data as
                                | { isPublisher?: boolean; isSubscriber?: boolean; type?: string }
                                | undefined;
                            const isPublisher = topicData?.isPublisher ?? false;
                            const isSubscriber = topicData?.isSubscriber ?? false;
                            const topicType = topicData?.type || 'Unknown';

                            return (
                                <div
                                    key={topic.path}
                                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 cursor-pointer group transition-colors"
                                    onClick={() => handleTopicClick(topic.path)}
                                >
                                    <Radio className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <div className="font-mono text-sm truncate">{topic.name}</div>
                                        <div className="text-xs text-muted-foreground truncate">{topicType}</div>
                                    </div>
                                    {/* Direction indicators */}
                                    <div className="flex items-center gap-1">
                                        {isPublisher && (
                                            <span title="Publishes">
                                                <ArrowUp className="w-3 h-3 text-green-500" />
                                            </span>
                                        )}
                                        {isSubscriber && (
                                            <span title="Subscribes">
                                                <ArrowDown className="w-3 h-3 text-blue-500" />
                                            </span>
                                        )}
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
