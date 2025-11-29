import { useShallow } from 'zustand/shallow';
import { Copy, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { useAppStore } from '@/lib/store';

interface EntityDetailPanelProps {
    onConnectClick: () => void;
}

export function EntityDetailPanel({ onConnectClick }: EntityDetailPanelProps) {
    const {
        selectedPath,
        selectedEntity,
        isLoadingDetails,
        isConnected,
    } = useAppStore(
        useShallow((state) => ({
            selectedPath: state.selectedPath,
            selectedEntity: state.selectedEntity,
            isLoadingDetails: state.isLoadingDetails,
            isConnected: state.isConnected,
        }))
    );

    const handleCopy = async () => {
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

    // No entity data
    if (!selectedEntity) {
        return (
            <main className="flex-1 flex items-center justify-center bg-background">
                <EmptyState type="no-selection" />
            </main>
        );
    }

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
                        <Button variant="outline" size="sm" onClick={handleCopy}>
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
