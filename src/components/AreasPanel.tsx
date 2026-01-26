import { useShallow } from 'zustand/shallow';
import { Layers, Box, ChevronRight, MapPin } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';

interface AreasPanelProps {
    areaId: string;
    areaName?: string;
    path: string;
}

/**
 * Areas Panel - displays area entity details with related components
 *
 * Areas are namespace groupings in SOVD. They can have:
 * - Subareas (child areas)
 * - Related components (components in this area)
 */
export function AreasPanel({ areaId, areaName, path }: AreasPanelProps) {
    const { rootEntities, selectEntity, expandedPaths, toggleExpanded } = useAppStore(
        useShallow((state) => ({
            rootEntities: state.rootEntities,
            selectEntity: state.selectEntity,
            expandedPaths: state.expandedPaths,
            toggleExpanded: state.toggleExpanded,
        }))
    );

    // Find the area node in the tree to get its children (components)
    const areaNode = rootEntities.find((n) => n.id === areaId || n.path === path);
    const components = areaNode?.children?.filter((c) => c.type === 'component') || [];

    const handleComponentClick = (componentPath: string) => {
        selectEntity(componentPath);
        // Auto-expand the component
        if (!expandedPaths.includes(componentPath)) {
            toggleExpanded(componentPath);
        }
    };

    return (
        <div className="space-y-6">
            {/* Area Overview */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900">
                            <Layers className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">{areaName || areaId}</CardTitle>
                            <CardDescription className="flex items-center gap-2">
                                <Badge variant="outline" className="text-cyan-600 border-cyan-300">
                                    area
                                </Badge>
                                <span className="text-muted-foreground">•</span>
                                <span className="font-mono text-xs">{path}</span>
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <MapPin className="w-4 h-4" />
                                <span>Namespace</span>
                            </div>
                            <p className="font-mono text-sm mt-1">/{areaId}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Box className="w-4 h-4" />
                                <span>Components</span>
                            </div>
                            <p className="text-lg font-semibold mt-1">{components.length}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Related Components */}
            {components.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Box className="w-5 h-5 text-indigo-500" />
                            <CardTitle className="text-base">Components in this Area</CardTitle>
                            <Badge variant="secondary">{components.length}</Badge>
                        </div>
                        <CardDescription>
                            Components are logical groupings of ROS 2 nodes (apps) within this namespace.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-3 md:grid-cols-2">
                            {components.map((component) => (
                                <div
                                    key={component.path}
                                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 cursor-pointer group transition-colors"
                                    onClick={() => handleComponentClick(component.path)}
                                >
                                    <div className="p-1.5 rounded bg-indigo-100 dark:bg-indigo-900">
                                        <Box className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium truncate text-sm">{component.name}</div>
                                        <div className="text-xs text-muted-foreground font-mono truncate">
                                            {component.id}
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Empty state when no components */}
            {components.length === 0 && (
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-center text-muted-foreground py-4">
                            <Box className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No components found in this area.</p>
                            <p className="text-xs mt-1">Components will appear here when ROS 2 nodes are discovered.</p>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
