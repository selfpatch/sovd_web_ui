import { useShallow } from 'zustand/shallow';
import { Copy, Loader2, Radio, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { TopicDiagnosticsPanel } from '@/components/TopicDiagnosticsPanel';
import { useAppStore, type AppState } from '@/lib/store';
import type { ComponentTopic } from '@/lib/types';

interface EntityDetailPanelProps {
    onConnectClick: () => void;
}

export function EntityDetailPanel({ onConnectClick }: EntityDetailPanelProps) {
    const {
        selectedPath,
        selectedEntity,
        isLoadingDetails,
        isRefreshing,
        isConnected,
        client,
        selectEntity,
        refreshSelectedEntity,
    } = useAppStore(
        useShallow((state: AppState) => ({
            selectedPath: state.selectedPath,
            selectedEntity: state.selectedEntity,
            isLoadingDetails: state.isLoadingDetails,
            isRefreshing: state.isRefreshing,
            isConnected: state.isConnected,
            client: state.client,
            selectEntity: state.selectEntity,
            refreshSelectedEntity: state.refreshSelectedEntity,
        }))
    );

    const handleCopyEntity = async () => {
        if (selectedEntity) {
            await navigator.clipboard.writeText(JSON.stringify(selectedEntity, null, 2));
        }
    };

    // Not connected - show empty state
    if (!isConnected) {
        return (
            <main className="flex-1 flex items-center justify-center bg-background">
                <EmptyState type="no-connection" onAction={onConnectClick} />
            </main>
        );
    }

    // No selection
    if (!selectedPath) {
        return (
            <main className="flex-1 flex items-center justify-center bg-background">
                <EmptyState type="no-selection" />
            </main>
        );
    }

    // Loading
    if (isLoadingDetails) {
        return (
            <main className="flex-1 flex items-center justify-center bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </main>
        );
    }

    // Entity detail view
    if (selectedEntity) {
        const isTopic = selectedEntity.type === 'topic';
        const isComponent = selectedEntity.type === 'component';
        const hasTopicData = isTopic && selectedEntity.topicData;
        // Prefer full topics array (with QoS, type info) over topicsInfo (names only)
        const hasTopicsArray = isComponent && selectedEntity.topics && selectedEntity.topics.length > 0;
        const hasTopicsInfo = isComponent && !hasTopicsArray && selectedEntity.topicsInfo &&
            ((selectedEntity.topicsInfo.publishes?.length ?? 0) > 0 ||
                (selectedEntity.topicsInfo.subscribes?.length ?? 0) > 0);
        const hasError = !!selectedEntity.error;

        return (
            <main className="flex-1 overflow-y-auto p-6 bg-background">
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* Component Header */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div>
                                    <CardTitle>{selectedEntity.name}</CardTitle>
                                    <CardDescription>
                                        {selectedEntity.type} • {selectedPath}
                                    </CardDescription>
                                </div>
                                <Button variant="outline" size="sm" onClick={handleCopyEntity}>
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy JSON
                                </Button>
                            </div>
                        </CardHeader>
                    </Card>

                    {/* Content */}
                    {hasError ? (
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                                    <p className="font-medium text-destructive">Failed to load entity details</p>
                                    <p className="text-sm mt-2">The server might be unreachable or the entity might not exist.</p>
                                </div>
                            </CardContent>
                        </Card>
                    ) : hasTopicData ? (
                        // Single Topic View - use TopicDiagnosticsPanel
                        (() => {
                            const topic = selectedEntity.topicData!;
                            // Extract component ID from path /area/component/topic
                            const componentId = selectedPath.split('/')[2];

                            return (
                                <TopicDiagnosticsPanel
                                    key={topic.timestamp}
                                    topic={topic}
                                    componentId={componentId}
                                    client={client}
                                    isRefreshing={isRefreshing}
                                    onRefresh={refreshSelectedEntity}
                                />
                            );
                        })()
                    ) : hasTopicsArray ? (
                        // Component view with full topics array (type, QoS, publishers info)
                        <div className="space-y-6">
                            {/* Topics List - Rich View with Type and QoS info */}
                            <div className="grid gap-4 md:grid-cols-2">
                                {(selectedEntity.topics as ComponentTopic[]).map((topic) => {
                                    const cleanName = topic.topic.startsWith('/') ? topic.topic.slice(1) : topic.topic;
                                    const encodedName = encodeURIComponent(cleanName);
                                    const topicPath = `${selectedPath}/${encodedName}`;

                                    return (
                                        <Card
                                            key={topic.topic}
                                            className="hover:bg-accent/50 transition-colors cursor-pointer group"
                                            onClick={() => selectEntity(topicPath)}
                                        >
                                            <CardHeader className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <Radio className="w-4 h-4 text-muted-foreground" />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-medium truncate text-sm">{topic.topic}</div>
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {topic.type || 'Unknown Type'}
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                            </CardHeader>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    ) : hasTopicsInfo ? (
                        // Component view with publishes/subscribes arrays
                        (() => {
                            // Safe to access - hasTopicsInfo already verified this exists
                            const topicsInfo = selectedEntity.topicsInfo as NonNullable<typeof selectedEntity.topicsInfo>;
                            return (
                                <div className="space-y-6">
                                    {/* Publishes Section */}
                                    {topicsInfo.publishes.length > 0 && (
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <div className="flex items-center gap-2">
                                                    <ArrowUp className="w-4 h-4 text-green-500" />
                                                    <CardTitle className="text-base">Publishes</CardTitle>
                                                    <span className="text-xs text-muted-foreground">
                                                        ({topicsInfo.publishes.length} topics)
                                                    </span>
                                                </div>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="space-y-1">
                                                    {topicsInfo.publishes.map((topic: string) => {
                                                        const cleanName = topic.startsWith('/') ? topic.slice(1) : topic;
                                                        const encodedName = encodeURIComponent(cleanName);
                                                        const topicPath = `${selectedPath}/${encodedName}`;

                                                        return (
                                                            <div
                                                                key={topic}
                                                                className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 cursor-pointer group"
                                                                onClick={() => selectEntity(topicPath)}
                                                            >
                                                                <Radio className="w-3 h-3 text-green-500" />
                                                                <span className="text-sm font-mono truncate flex-1">{topic}</span>
                                                                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* Subscribes Section */}
                                    {topicsInfo.subscribes.length > 0 && (
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <div className="flex items-center gap-2">
                                                    <ArrowDown className="w-4 h-4 text-blue-500" />
                                                    <CardTitle className="text-base">Subscribes</CardTitle>
                                                    <span className="text-xs text-muted-foreground">
                                                        ({topicsInfo.subscribes.length} topics)
                                                    </span>
                                                </div>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="space-y-1">
                                                    {topicsInfo.subscribes.map((topic: string) => {
                                                        const cleanName = topic.startsWith('/') ? topic.slice(1) : topic;
                                                        const encodedName = encodeURIComponent(cleanName);
                                                        const topicPath = `${selectedPath}/${encodedName}`;

                                                        return (
                                                            <div
                                                                key={topic}
                                                                className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 cursor-pointer group"
                                                                onClick={() => selectEntity(topicPath)}
                                                            >
                                                                <Radio className="w-3 h-3 text-blue-500" />
                                                                <span className="text-sm font-mono truncate flex-1">{topic}</span>
                                                                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}
                                </div>
                            );
                        })()
                    ) : (
                        <Card>
                            <CardContent className="pt-6">
                                <div className="text-center text-muted-foreground">
                                    No detailed information available for this entity.
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </main>
        );
    }

    // Fallback - no data loaded yet
    return (
        <main className="flex-1 flex items-center justify-center bg-background">
            <EmptyState type="no-selection" />
        </main>
    );
}
