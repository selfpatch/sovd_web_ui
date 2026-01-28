import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/shallow';
import { Database, Zap, Settings, AlertTriangle, Loader2, MessageSquare, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import { ConfigurationPanel } from '@/components/ConfigurationPanel';
import type { SovdResourceEntityType } from '@/lib/sovd-api';
import type { ComponentTopic, Operation, Parameter, Fault } from '@/lib/types';

type ResourceTab = 'data' | 'operations' | 'configurations' | 'faults';

interface TabConfig {
    id: ResourceTab;
    label: string;
    icon: typeof Database;
}

const RESOURCE_TABS: TabConfig[] = [
    { id: 'data', label: 'Data', icon: Database },
    { id: 'operations', label: 'Operations', icon: Zap },
    { id: 'configurations', label: 'Config', icon: Settings },
    { id: 'faults', label: 'Faults', icon: AlertTriangle },
];

interface EntityResourceTabsProps {
    entityId: string;
    entityType: SovdResourceEntityType;
    /** Tree path for navigation (e.g., /server/root for areas) */
    basePath?: string;
    onNavigate?: (path: string) => void;
}

/**
 * Reusable component for displaying entity resources (data, operations, configurations, faults)
 * Works with areas, components, apps, and functions
 */
export function EntityResourceTabs({ entityId, entityType, basePath, onNavigate }: EntityResourceTabsProps) {
    const [activeTab, setActiveTab] = useState<ResourceTab>('data');
    const [isLoading, setIsLoading] = useState(false);
    const [data, setData] = useState<ComponentTopic[]>([]);
    const [operations, setOperations] = useState<Operation[]>([]);
    const [configurations, setConfigurations] = useState<Parameter[]>([]);
    const [faults, setFaults] = useState<Fault[]>([]);

    const { client, selectEntity } = useAppStore(
        useShallow((state) => ({
            client: state.client,
            selectEntity: state.selectEntity,
        }))
    );

    useEffect(() => {
        const loadResources = async () => {
            if (!client) return;
            setIsLoading(true);

            try {
                const [dataRes, opsRes, configRes, faultsRes] = await Promise.all([
                    client.getEntityData(entityType, entityId).catch(() => [] as ComponentTopic[]),
                    client.listOperations(entityId, entityType).catch(() => [] as Operation[]),
                    client.listConfigurations(entityId, entityType).catch(() => ({ parameters: [] })),
                    client.listEntityFaults(entityType, entityId).catch(() => ({ items: [] })),
                ]);

                setData(dataRes);
                setOperations(opsRes);
                setConfigurations(configRes.parameters || []);
                setFaults(faultsRes.items || []);
            } catch (error) {
                console.error('Failed to load entity resources:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadResources();
    }, [client, entityId, entityType]);

    const handleNavigate = (path: string) => {
        if (onNavigate) {
            onNavigate(path);
        } else {
            selectEntity(path);
        }
    };

    // Count resources for badges
    const services = operations.filter((o) => o.kind === 'service');
    const actions = operations.filter((o) => o.kind === 'action');

    return (
        <div className="space-y-4">
            {/* Tab Navigation */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg overflow-x-auto">
                {RESOURCE_TABS.map((tab) => {
                    const TabIcon = tab.icon;
                    const isActive = activeTab === tab.id;
                    let count = 0;
                    if (tab.id === 'data') count = data.length;
                    if (tab.id === 'operations') count = operations.length;
                    if (tab.id === 'configurations') count = configurations.length;
                    if (tab.id === 'faults') count = faults.length;

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
                                <Badge
                                    variant={isActive ? 'default' : 'secondary'}
                                    className={`ml-1 h-5 px-1.5 ${tab.id === 'faults' && count > 0 ? 'bg-red-500 text-white' : ''}`}
                                >
                                    {count}
                                </Badge>
                            )}
                        </button>
                    );
                })}
            </div>

            {isLoading ? (
                <Card>
                    <CardContent className="py-8 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Data Tab */}
                    {activeTab === 'data' && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Database className="w-4 h-4 text-blue-500" />
                                    Data Items
                                </CardTitle>
                                <CardDescription>Aggregated data from child entities</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {data.length === 0 ? (
                                    <div className="text-center text-muted-foreground py-4">
                                        <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">No data items available.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-80 overflow-y-auto">
                                        {data.map((item, idx) => (
                                            <div
                                                key={`${item.topic}-${idx}`}
                                                className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-accent/30 cursor-pointer"
                                                onClick={() => {
                                                    // Use basePath for tree navigation, fallback to API path format
                                                    const navPath = basePath
                                                        ? `${basePath}/data/${encodeURIComponent(item.topic)}`
                                                        : `/${entityType}/${entityId}/data/${encodeURIComponent(item.topic)}`;
                                                    handleNavigate(navPath);
                                                }}
                                            >
                                                <MessageSquare className="w-4 h-4 text-blue-500 shrink-0" />
                                                <span className="font-mono text-xs truncate flex-1">{item.topic}</span>
                                                {item.type && (
                                                    <Badge variant="outline" className="text-xs shrink-0">
                                                        {item.type.split('/').pop()}
                                                    </Badge>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Operations Tab */}
                    {activeTab === 'operations' && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-amber-500" />
                                    Operations
                                </CardTitle>
                                <CardDescription>
                                    {services.length} services, {actions.length} actions
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {operations.length === 0 ? (
                                    <div className="text-center text-muted-foreground py-4">
                                        <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">No operations available.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-80 overflow-y-auto">
                                        {operations.map((op) => (
                                            <div
                                                key={op.name}
                                                className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-accent/30 cursor-pointer"
                                                onClick={() => {
                                                    const navPath = basePath
                                                        ? `${basePath}/operations/${encodeURIComponent(op.name)}`
                                                        : `/${entityType}/${entityId}/operations/${encodeURIComponent(op.name)}`;
                                                    handleNavigate(navPath);
                                                }}
                                            >
                                                {op.kind === 'service' ? (
                                                    <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                                                ) : (
                                                    <Clock className="w-4 h-4 text-orange-500 shrink-0" />
                                                )}
                                                <span className="font-mono text-xs truncate flex-1">{op.name}</span>
                                                <Badge variant="outline" className="text-xs shrink-0">
                                                    {op.kind}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Configurations Tab */}
                    {activeTab === 'configurations' && (
                        <ConfigurationPanel componentId={entityId} entityType={entityType} />
                    )}

                    {/* Faults Tab */}
                    {activeTab === 'faults' && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                    Faults
                                </CardTitle>
                                <CardDescription>Active faults from child entities</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {faults.length === 0 ? (
                                    <div className="text-center text-muted-foreground py-4">
                                        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">No active faults.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-80 overflow-y-auto">
                                        {faults.map((fault) => (
                                            <div
                                                key={fault.code}
                                                className="flex items-start gap-3 p-2.5 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900"
                                            >
                                                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-medium text-sm">{fault.code}</div>
                                                    <div className="text-xs text-muted-foreground truncate">
                                                        {fault.message}
                                                    </div>
                                                </div>
                                                <Badge
                                                    variant="outline"
                                                    className={`text-xs shrink-0 ${
                                                        fault.severity === 'critical'
                                                            ? 'border-red-500 text-red-600'
                                                            : fault.severity === 'error'
                                                              ? 'border-orange-500 text-orange-600'
                                                              : 'border-yellow-500 text-yellow-600'
                                                    }`}
                                                >
                                                    {fault.severity}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
