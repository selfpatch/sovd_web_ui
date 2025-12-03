import { useShallow } from 'zustand/shallow';
import { Copy, Loader2, Radio, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { TopicPublishForm } from '@/components/TopicPublishForm';
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
        isConnected,
        client,
        selectTopicDirect,
    } = useAppStore(
        useShallow((state: AppState) => ({
            selectedPath: state.selectedPath,
            selectedEntity: state.selectedEntity,
            isLoadingDetails: state.isLoadingDetails,
            isConnected: state.isConnected,
            client: state.client,
            selectTopicDirect: state.selectTopicDirect,
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
        const hasTopics = selectedEntity.type === 'component' && selectedEntity.topics && selectedEntity.topics.length > 0;
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
                    ) : isTopic && selectedEntity.topics?.[0] ? (
                        // Single Topic View
                        (() => {
                            const topic = selectedEntity.topics[0] as ComponentTopic;
                            const isMetadataOnly = topic.status === 'metadata_only';
                            const hasNoData = isMetadataOnly || topic.data === null || topic.data === undefined;
                            const canPublish = !!(topic.type || topic.type_info || topic.data);

                            // Extract component ID from path /area/component/topic
                            const componentId = selectedPath.split('/')[2];

                            return (
                                <Card>
                                    <CardHeader>
                                        <div className="flex items-center gap-3">
                                            <Radio className={`w-5 h-5 shrink-0 ${hasNoData ? 'text-muted-foreground' : 'text-primary'}`} />
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <CardTitle className="text-base">{topic.topic}</CardTitle>
                                                    {isMetadataOnly && (
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                                            Metadata Only
                                                        </span>
                                                    )}
                                                    {!isMetadataOnly && hasNoData && (
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
                                                            No Data
                                                        </span>
                                                    )}
                                                    {topic.type && (
                                                        <span className="text-xs text-muted-foreground font-mono">
                                                            {topic.type}
                                                        </span>
                                                    )}
                                                </div>
                                                <CardDescription className="text-xs mt-1">
                                                    {isMetadataOnly
                                                        ? `Schema available • ${topic.publisher_count ?? 0} pub / ${topic.subscriber_count ?? 0} sub`
                                                        : hasNoData
                                                            ? 'No messages received (topic may be inactive)'
                                                            : `Last update: ${new Date(topic.timestamp / 1000000).toLocaleString()}`
                                                    }
                                                </CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {/* Latest Data or Schema Info */}
                                        <div>
                                            <div className="text-sm font-medium mb-2">
                                                {isMetadataOnly ? 'Message Schema' : 'Latest Message'}
                                            </div>
                                            {isMetadataOnly ? (
                                                <div className="space-y-2">
                                                    {!!topic.type_info?.default_value && (
                                                        <div className="text-xs text-muted-foreground">
                                                            Default values available for form editing
                                                        </div>
                                                    )}
                                                </div>
                                            ) : hasNoData ? (
                                                <div className="p-3 rounded-md bg-muted text-muted-foreground text-sm">
                                                    No data available - topic exists but is not publishing messages
                                                </div>
                                            ) : (
                                                <div className="text-xs text-muted-foreground">
                                                    Data available in form view
                                                </div>
                                            )}
                                        </div>

                                        {/* Publish Form */}
                                        {canPublish && client && (
                                            <div className="border-t pt-4">
                                                <div className="text-sm font-medium mb-2">Publish Message</div>
                                                <TopicPublishForm
                                                    topic={topic}
                                                    componentId={componentId}
                                                    client={client}
                                                />
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })()
                    ) : hasTopics ? (
                        <div className="space-y-6">
                            {/* Topics List - Summary View for Component */}
                            <div className="grid gap-4 md:grid-cols-2">
                                {(selectedEntity.topics as ComponentTopic[]).map((topic) => {
                                    // Topic path in tree is: componentPath + "/" + topic.topic (full topic name)
                                    const topicPath = `${selectedPath}/${topic.topic}`;

                                    return (
                                        <Card
                                            key={topic.topic}
                                            className="hover:bg-accent/50 transition-colors cursor-pointer group"
                                            onClick={() => selectTopicDirect(topicPath, topic)}
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
