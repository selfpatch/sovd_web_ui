import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/shallow';
import { GitBranch, Cpu, Database, Zap, ChevronRight, Users, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import type { ComponentTopic, Operation } from '@/lib/types';

type FunctionTab = 'overview' | 'hosts' | 'data' | 'operations';

interface TabConfig {
    id: FunctionTab;
    label: string;
    icon: typeof Database;
}

const FUNCTION_TABS: TabConfig[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'hosts', label: 'Hosts', icon: Cpu },
    { id: 'data', label: 'Data', icon: Database },
    { id: 'operations', label: 'Operations', icon: Zap },
];

interface FunctionsPanelProps {
    functionId: string;
    functionName?: string;
    description?: string;
    path: string;
    onNavigate?: (path: string) => void;
}

/**
 * Functions Panel - displays function (capability grouping) entity details
 *
 * Functions are capability groupings in SOVD. They can have:
 * - Hosts (apps that implement this function)
 * - Data (aggregated from all hosts)
 * - Operations (aggregated from all hosts)
 */
export function FunctionsPanel({ functionId, functionName, description, path, onNavigate }: FunctionsPanelProps) {
    const [activeTab, setActiveTab] = useState<FunctionTab>('overview');
    const [hosts, setHosts] = useState<string[]>([]);
    const [topics, setTopics] = useState<ComponentTopic[]>([]);
    const [operations, setOperations] = useState<Operation[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const { client, selectEntity } = useAppStore(
        useShallow((state) => ({
            client: state.client,
            selectEntity: state.selectEntity,
        }))
    );

    // Load function resources on mount
    useEffect(() => {
        const loadFunctionData = async () => {
            if (!client) return;
            setIsLoading(true);

            try {
                // Load hosts, data, and operations in parallel
                // Use optional chaining to handle missing API methods gracefully
                const [hostsData, topicsData, opsData] = await Promise.all([
                    client.getFunctionHosts
                        ? client.getFunctionHosts(functionId).catch(() => [] as string[])
                        : Promise.resolve<string[]>([]),
                    client.getFunctionData
                        ? client.getFunctionData(functionId).catch(() => [] as ComponentTopic[])
                        : Promise.resolve<ComponentTopic[]>([]),
                    client.getFunctionOperations
                        ? client.getFunctionOperations(functionId).catch(() => [] as Operation[])
                        : Promise.resolve<Operation[]>([]),
                ]);

                setHosts(hostsData);
                setTopics(topicsData);
                setOperations(opsData);
            } catch (error) {
                console.error('Failed to load function data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadFunctionData();
    }, [client, functionId]);

    const handleResourceClick = (resourcePath: string) => {
        if (onNavigate) {
            onNavigate(resourcePath);
        } else {
            selectEntity(resourcePath);
        }
    };

    // Count resources for badges
    const services = operations.filter((o) => o.kind === 'service');
    const actions = operations.filter((o) => o.kind === 'action');

    return (
        <div className="space-y-6">
            {/* Function Header */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900">
                            <GitBranch className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <CardTitle className="text-lg truncate">{functionName || functionId}</CardTitle>
                            <CardDescription className="flex items-center gap-2">
                                <Badge variant="outline" className="text-violet-600 border-violet-300">
                                    function
                                </Badge>
                                <span className="text-muted-foreground">•</span>
                                <span className="font-mono text-xs">{path}</span>
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>

                {/* Tab Navigation */}
                <div className="px-6 pb-4">
                    <div className="flex gap-1 p-1 bg-muted rounded-lg overflow-x-auto">
                        {FUNCTION_TABS.map((tab) => {
                            const TabIcon = tab.icon;
                            const isActive = activeTab === tab.id;
                            let count = 0;
                            if (tab.id === 'hosts') count = hosts.length;
                            if (tab.id === 'data') count = topics.length;
                            if (tab.id === 'operations') count = operations.length;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                                        isActive
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                                    }`}
                                >
                                    <TabIcon className="w-4 h-4" />
                                    {tab.label}
                                    {count > 0 && (
                                        <Badge variant={isActive ? 'default' : 'secondary'} className="ml-1 h-5 px-1.5">
                                            {count}
                                        </Badge>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </Card>

            {/* Tab Content */}
            {activeTab === 'overview' && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Function Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {description && (
                            <div className="p-3 rounded-lg bg-muted/50 mb-4">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                    <Info className="w-4 h-4" />
                                    <span>Description</span>
                                </div>
                                <p className="text-sm">{description}</p>
                            </div>
                        )}

                        {/* Resource Summary */}
                        <div className="grid grid-cols-3 gap-3">
                            <button
                                onClick={() => setActiveTab('hosts')}
                                className="p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left"
                            >
                                <Users className="w-4 h-4 text-emerald-500 mb-1" />
                                <div className="text-2xl font-semibold">{hosts.length}</div>
                                <div className="text-xs text-muted-foreground">Host Apps</div>
                            </button>
                            <button
                                onClick={() => setActiveTab('data')}
                                className="p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left"
                            >
                                <Database className="w-4 h-4 text-blue-500 mb-1" />
                                <div className="text-2xl font-semibold">{topics.length}</div>
                                <div className="text-xs text-muted-foreground">Data Items</div>
                            </button>
                            <button
                                onClick={() => setActiveTab('operations')}
                                className="p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left"
                            >
                                <Zap className="w-4 h-4 text-amber-500 mb-1" />
                                <div className="text-2xl font-semibold">{operations.length}</div>
                                <div className="text-xs text-muted-foreground">Operations</div>
                            </button>
                        </div>

                        {hosts.length === 0 && !isLoading && (
                            <div className="mt-4 text-center text-muted-foreground text-sm">
                                <GitBranch className="w-6 h-6 mx-auto mb-2 opacity-30" />
                                <p>No host apps are implementing this function yet.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'hosts' && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-emerald-500" />
                            Host Apps
                        </CardTitle>
                        <CardDescription>Apps implementing this function</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {hosts.length === 0 ? (
                            <div className="text-center text-muted-foreground py-4">
                                <Cpu className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">No host apps found for this function.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {hosts.map((hostId) => (
                                    <div
                                        key={hostId}
                                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/30 cursor-pointer group"
                                        onClick={() => handleResourceClick(`/apps/${hostId}`)}
                                    >
                                        <div className="p-1.5 rounded bg-emerald-100 dark:bg-emerald-900">
                                            <Cpu className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                        <span className="font-mono text-sm truncate flex-1">{hostId}</span>
                                        <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                                            app
                                        </Badge>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'data' && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Database className="w-4 h-4 text-blue-500" />
                            Aggregated Data
                        </CardTitle>
                        <CardDescription>Data items from all host apps</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {topics.length === 0 ? (
                            <div className="text-center text-muted-foreground py-4">
                                <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">No data items available.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {topics.map((topic, idx) => (
                                    <div
                                        key={`${topic.topic}-${idx}`}
                                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50"
                                    >
                                        <Badge variant="outline" className="text-blue-600 border-blue-300">
                                            topic
                                        </Badge>
                                        <span className="font-mono text-sm truncate flex-1">{topic.topic}</span>
                                        {topic.type && (
                                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                                {topic.type}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'operations' && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-500" />
                            Aggregated Operations
                        </CardTitle>
                        <CardDescription>
                            {services.length} services, {actions.length} actions from all hosts
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {operations.length === 0 ? (
                            <div className="text-center text-muted-foreground py-4">
                                <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">No operations available.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {operations.map((op) => (
                                    <div
                                        key={op.name}
                                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50"
                                    >
                                        <Badge
                                            variant="outline"
                                            className={
                                                op.kind === 'service'
                                                    ? 'text-amber-600 border-amber-300'
                                                    : 'text-orange-600 border-orange-300'
                                            }
                                        >
                                            {op.kind}
                                        </Badge>
                                        <span className="font-mono text-sm truncate flex-1">{op.name}</span>
                                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                            {op.type}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {isLoading && <div className="text-center text-muted-foreground py-4">Loading function resources...</div>}
        </div>
    );
}
