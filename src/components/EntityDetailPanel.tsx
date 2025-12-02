import { useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { Copy, Loader2, Send, Radio, AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/EmptyState';
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
    } = useAppStore(
        useShallow((state: AppState) => ({
            selectedPath: state.selectedPath,
            selectedEntity: state.selectedEntity,
            isLoadingDetails: state.isLoadingDetails,
            isConnected: state.isConnected,
            client: state.client,
        }))
    );

    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const [publishingTopics, setPublishingTopics] = useState<Set<string>>(new Set());
    const [topicInputs, setTopicInputs] = useState<Record<string, string>>({});
    const [publishErrors, setPublishErrors] = useState<Record<string, string>>({});
    const [publishSuccess, setPublishSuccess] = useState<Record<string, boolean>>({});

    const toggleTopicExpanded = (topicPath: string) => {
        setExpandedTopics(prev => {
            const next = new Set(prev);
            if (next.has(topicPath)) {
                next.delete(topicPath);
            } else {
                next.add(topicPath);
            }
            return next;
        });
    };

    const handlePublishToTopic = async (topic: ComponentTopic, topicName: string) => {
        if (!client || !selectedEntity) return;

        const inputData = topicInputs[topic.topic] || '';
        if (!inputData.trim()) return;

        setPublishingTopics(prev => new Set(prev).add(topic.topic));
        setPublishErrors(prev => ({ ...prev, [topic.topic]: '' }));
        setPublishSuccess(prev => ({ ...prev, [topic.topic]: false }));

        try {
            const data = JSON.parse(inputData);
            // Infer message type from topic data structure or use a default
            // For now, we'll need the user to provide it or we extract from component metadata
            // Simplified: assume we can detect common types
            const messageType = inferMessageType(topic.data);

            await client.publishToComponentTopic(selectedEntity.id, topicName, {
                type: messageType,
                data,
            });

            setPublishSuccess(prev => ({ ...prev, [topic.topic]: true }));
            setTimeout(() => {
                setPublishSuccess(prev => ({ ...prev, [topic.topic]: false }));
            }, 3000);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to publish';
            setPublishErrors(prev => ({ ...prev, [topic.topic]: message }));
        } finally {
            setPublishingTopics(prev => {
                const next = new Set(prev);
                next.delete(topic.topic);
                return next;
            });
        }
    };

    // Helper to infer message type from data structure
    const inferMessageType = (data: unknown): string => {
        // This is a simplified heuristic - in production you'd want to query type info
        if (data && typeof data === 'object') {
            const keys = Object.keys(data as object);
            if (keys.includes('linear') && keys.includes('angular')) {
                return 'geometry_msgs/msg/Twist';
            }
            if (keys.includes('data') && keys.length === 1) {
                return 'std_msgs/msg/String';
            }
        }
        return 'std_msgs/msg/String'; // Default fallback
    };

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
        // Component with topics
        if (selectedEntity.type === 'component' && selectedEntity.topics && selectedEntity.topics.length > 0) {
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

                        {/* Topics List */}
                        {selectedEntity.topics.map((topic: ComponentTopic) => {
                            const topicName = topic.topic.split('/').pop() || topic.topic;
                            const isExpanded = expandedTopics.has(topic.topic);
                            const isPublishing = publishingTopics.has(topic.topic);
                            const hasError = publishErrors[topic.topic];
                            const isSuccess = publishSuccess[topic.topic];
                            const hasNoData = topic.data === null || topic.data === undefined;

                            return (
                                <Card key={topic.topic} className={hasNoData ? 'opacity-60' : ''}>
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3 flex-1">
                                                <Radio className={`w-5 h-5 shrink-0 ${hasNoData ? 'text-muted-foreground' : 'text-primary'}`} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <CardTitle className="text-base truncate">{topic.topic}</CardTitle>
                                                        {hasNoData && (
                                                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
                                                                No Data
                                                            </span>
                                                        )}
                                                    </div>
                                                    <CardDescription className="text-xs">
                                                        {hasNoData
                                                            ? 'No messages received (topic may be inactive)'
                                                            : `Last update: ${new Date(topic.timestamp / 1000000).toLocaleString()}`
                                                        }
                                                    </CardDescription>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => toggleTopicExpanded(topic.topic)}
                                            >
                                                {isExpanded ? (
                                                    <ChevronDown className="w-4 h-4" />
                                                ) : (
                                                    <ChevronRight className="w-4 h-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    {isExpanded && (
                                        <CardContent className="space-y-4">
                                            {/* Latest Data */}
                                            <div>
                                                <div className="text-sm font-medium mb-2">Latest Message</div>
                                                {hasNoData ? (
                                                    <div className="p-3 rounded-md bg-muted text-muted-foreground text-sm">
                                                        No data available - topic exists but is not publishing messages
                                                    </div>
                                                ) : (
                                                    <pre className="p-3 rounded-md bg-muted text-xs overflow-x-auto">
                                                        <code>{JSON.stringify(topic.data, null, 2)}</code>
                                                    </pre>
                                                )}
                                            </div>

                                            {/* Publish Form - only show if we have data to infer type */}
                                            {!hasNoData && (
                                                <div className="border-t pt-4">
                                                    <div className="text-sm font-medium mb-2">Publish Message</div>
                                                    <Textarea
                                                        value={topicInputs[topic.topic] || JSON.stringify(topic.data, null, 2)}
                                                        onChange={(e) => setTopicInputs(prev => ({
                                                            ...prev,
                                                            [topic.topic]: e.target.value
                                                        }))}
                                                        placeholder="Enter JSON message data..."
                                                        className="font-mono text-xs min-h-[120px] mb-3"
                                                    />

                                                    {hasError && (
                                                        <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs mb-2">
                                                            <AlertCircle className="w-3 h-3 shrink-0" />
                                                            <span>{hasError}</span>
                                                        </div>
                                                    )}
                                                    {isSuccess && (
                                                        <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/10 text-green-600 text-xs mb-2">
                                                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                                                            <span>Published successfully!</span>
                                                        </div>
                                                    )}

                                                    <Button
                                                        onClick={() => handlePublishToTopic(topic, topicName)}
                                                        disabled={isPublishing}
                                                        size="sm"
                                                        className="w-full"
                                                    >
                                                        {isPublishing ? (
                                                            <>
                                                                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                                                Publishing...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Send className="w-3 h-3 mr-2" />
                                                                Publish
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                            )}
                                        </CardContent>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                </main>
            );
        }

        // Entity without topics - show raw JSON
        return (
            <main className="flex-1 overflow-y-auto p-6 bg-background">
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
                    <CardContent>
                        <pre className="p-4 rounded-lg bg-muted text-sm overflow-x-auto">
                            <code>{JSON.stringify(selectedEntity, null, 2)}</code>
                        </pre>
                    </CardContent>
                </Card>
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
