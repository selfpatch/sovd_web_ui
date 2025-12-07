import { useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { Copy, Loader2, Radio, ChevronRight, ArrowUp, ArrowDown, Database, Zap, Settings, RefreshCw, Box } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { TopicDiagnosticsPanel } from '@/components/TopicDiagnosticsPanel';
import { ConfigurationPanel } from '@/components/ConfigurationPanel';
import { OperationsPanel } from '@/components/OperationsPanel';
import { DataFolderPanel } from '@/components/DataFolderPanel';
import { useAppStore, type AppState } from '@/lib/store';
import type { ComponentTopic, Parameter } from '@/lib/types';

type ComponentTab = 'data' | 'operations' | 'configurations';

interface TabConfig {
    id: ComponentTab;
    label: string;
    icon: typeof Database;
    description: string;
}

const COMPONENT_TABS: TabConfig[] = [
    { id: 'data', label: 'Data', icon: Database, description: 'Topics & messages' },
    { id: 'operations', label: 'Operations', icon: Zap, description: 'Services & actions' },
    { id: 'configurations', label: 'Configurations', icon: Settings, description: 'Parameters' },
];

/**
 * Component tab content - renders based on active tab
 */
interface ComponentTabContentProps {
    activeTab: ComponentTab;
    componentId: string;
    selectedPath: string;
    selectedEntity: NonNullable<AppState['selectedEntity']>;
    hasTopicsArray: boolean;
    hasTopicsInfo: boolean;
    selectEntity: (path: string) => void;
}

function ComponentTabContent({
    activeTab,
    componentId,
    selectedPath,
    selectedEntity,
    hasTopicsArray,
    hasTopicsInfo,
    selectEntity,
}: ComponentTabContentProps) {
    switch (activeTab) {
        case 'data':
            return (
                <DataTabContent
                    selectedPath={selectedPath}
                    selectedEntity={selectedEntity}
                    hasTopicsArray={hasTopicsArray}
                    hasTopicsInfo={hasTopicsInfo}
                    selectEntity={selectEntity}
                />
            );
        case 'operations':
            return <OperationsPanel componentId={componentId} />;
        case 'configurations':
            return <ConfigurationPanel componentId={componentId} />;
        default:
            return null;
    }
}

/**
 * Data tab content - shows topics
 */
interface DataTabContentProps {
    selectedPath: string;
    selectedEntity: NonNullable<AppState['selectedEntity']>;
    hasTopicsArray: boolean;
    hasTopicsInfo: boolean;
    selectEntity: (path: string) => void;
}

function DataTabContent({
    selectedPath,
    selectedEntity,
    hasTopicsArray,
    hasTopicsInfo,
    selectEntity,
}: DataTabContentProps) {
    if (hasTopicsArray) {
        return (
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-base">Topics</CardTitle>
                        <span className="text-xs text-muted-foreground">
                            ({(selectedEntity.topics as ComponentTopic[]).length} topics)
                        </span>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 md:grid-cols-2">
                        {(selectedEntity.topics as ComponentTopic[]).map((topic) => {
                            const cleanName = topic.topic.startsWith('/') ? topic.topic.slice(1) : topic.topic;
                            const encodedName = encodeURIComponent(cleanName);
                            const topicPath = `${selectedPath}/data/${encodedName}`;

                            return (
                                <div
                                    key={topic.topic}
                                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 cursor-pointer group transition-colors"
                                    onClick={() => selectEntity(topicPath)}
                                >
                                    <Radio className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium truncate text-sm">{topic.topic}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {topic.type || 'Unknown Type'}
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (hasTopicsInfo) {
        const topicsInfo = selectedEntity.topicsInfo as NonNullable<typeof selectedEntity.topicsInfo>;
        return (
            <div className="space-y-4">
                {/* Publishes Section */}
                {topicsInfo.publishes.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <ArrowUp className="w-4 h-4 text-green-500" />
                                <CardTitle className="text-base">Publishes</CardTitle>
                                <Badge variant="secondary">{topicsInfo.publishes.length}</Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-1">
                                {topicsInfo.publishes.map((topic: string) => {
                                    const cleanName = topic.startsWith('/') ? topic.slice(1) : topic;
                                    const encodedName = encodeURIComponent(cleanName);
                                    const topicPath = `${selectedPath}/data/${encodedName}`;

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
                                <Badge variant="secondary">{topicsInfo.subscribes.length}</Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-1">
                                {topicsInfo.subscribes.map((topic: string) => {
                                    const cleanName = topic.startsWith('/') ? topic.slice(1) : topic;
                                    const encodedName = encodeURIComponent(cleanName);
                                    const topicPath = `${selectedPath}/data/${encodedName}`;

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
    }

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="text-center text-muted-foreground py-4">
                    No topics available for this component.
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * Operation (Service/Action) detail card
 * Shows the full OperationsPanel with the selected operation highlighted
 */
interface OperationDetailCardProps {
    entity: NonNullable<AppState['selectedEntity']>;
    componentId: string;
}

function OperationDetailCard({ entity, componentId }: OperationDetailCardProps) {
    // Render full OperationsPanel with the specific operation highlighted
    return <OperationsPanel componentId={componentId} highlightOperation={entity.name} />;
}

/**
 * Parameter detail card
 */
interface ParameterDetailCardProps {
    entity: NonNullable<AppState['selectedEntity']>;
    componentId: string;
}

function ParameterDetailCard({ entity, componentId }: ParameterDetailCardProps) {
    const parameterData = entity.data as Parameter | undefined;

    if (!parameterData) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <p className="text-muted-foreground text-sm text-center">
                        Parameter data not available. Select from the Configurations tab.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900">
                        <Settings className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                        <CardTitle className="text-lg">{entity.name}</CardTitle>
                        <CardDescription className="flex items-center gap-2">
                            <Badge variant="outline">{parameterData.type}</Badge>
                            {parameterData.read_only && <Badge variant="secondary">Read-only</Badge>}
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <ConfigurationPanel componentId={componentId} highlightParam={entity.name} />
            </CardContent>
        </Card>
    );
}

/**
 * Virtual folder content - redirect to appropriate panel
 */
interface VirtualFolderContentProps {
    folderType: 'data' | 'operations' | 'configurations';
    componentId: string;
    basePath: string;
}

function VirtualFolderContent({ folderType, componentId, basePath }: VirtualFolderContentProps) {
    switch (folderType) {
        case 'data':
            return <DataFolderPanel basePath={basePath} />;
        case 'operations':
            return <OperationsPanel componentId={componentId} />;
        case 'configurations':
            return <ConfigurationPanel componentId={componentId} />;
        default:
            return null;
    }
}


interface EntityDetailPanelProps {
    onConnectClick: () => void;
}

export function EntityDetailPanel({ onConnectClick }: EntityDetailPanelProps) {
    const [activeTab, setActiveTab] = useState<ComponentTab>('data');

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

        // Extract component ID from path for component views
        const pathParts = selectedPath.split('/').filter(Boolean);
        const componentId = pathParts.length >= 2 ? pathParts[1] : pathParts[0];

        return (
            <main className="flex-1 overflow-y-auto p-6 bg-background">
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* Component Header with Dashboard style */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10">
                                        <Box className="w-6 h-6 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl">{selectedEntity.name}</CardTitle>
                                        <CardDescription className="flex items-center gap-2">
                                            <Badge variant="outline">{selectedEntity.type}</Badge>
                                            <span className="text-muted-foreground">•</span>
                                            <span className="font-mono text-xs">{selectedPath}</span>
                                        </CardDescription>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={refreshSelectedEntity}
                                        disabled={isRefreshing}
                                    >
                                        <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                                        Refresh
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={handleCopyEntity}>
                                        <Copy className="w-4 h-4 mr-2" />
                                        Copy JSON
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        {/* Tab Navigation for Components */}
                        {isComponent && (
                            <div className="px-6 pb-4">
                                <div className="flex gap-1 p-1 bg-muted rounded-lg">
                                    {COMPONENT_TABS.map((tab) => {
                                        const TabIcon = tab.icon;
                                        const isActive = activeTab === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                onClick={() => setActiveTab(tab.id)}
                                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive
                                                        ? 'bg-background text-foreground shadow-sm'
                                                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                                                    }`}
                                            >
                                                <TabIcon className="w-4 h-4" />
                                                {tab.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* Content based on entity type and active tab */}
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
                    ) : isComponent ? (
                        // Component Dashboard with Tabs
                        <ComponentTabContent
                            activeTab={activeTab}
                            componentId={componentId}
                            selectedPath={selectedPath}
                            selectedEntity={selectedEntity}
                            hasTopicsArray={hasTopicsArray ?? false}
                            hasTopicsInfo={hasTopicsInfo ?? false}
                            selectEntity={selectEntity}
                        />
                    ) : selectedEntity.type === 'service' || selectedEntity.type === 'action' ? (
                        // Service/Action detail view
                        <OperationDetailCard entity={selectedEntity} componentId={componentId} />
                    ) : selectedEntity.type === 'parameter' ? (
                        // Parameter detail view
                        <ParameterDetailCard entity={selectedEntity} componentId={componentId} />
                    ) : selectedEntity.folderType ? (
                        // Virtual folder selected - show appropriate panel
                        (() => {
                            // Extract base path (component path) from folder path
                            // e.g., /root/route_server/data -> /root/route_server
                            const folderPathParts = selectedPath.split('/');
                            folderPathParts.pop(); // Remove folder name (data/operations/configurations)
                            const basePath = folderPathParts.join('/');
                            return (
                                <VirtualFolderContent
                                    folderType={selectedEntity.folderType as 'data' | 'operations' | 'configurations'}
                                    componentId={selectedEntity.componentId as string}
                                    basePath={basePath}
                                />
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
