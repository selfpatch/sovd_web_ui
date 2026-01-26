import { useEffect, useState, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import { AlertTriangle, Loader2, RefreshCw, Trash2, AlertCircle, AlertOctagon, Info, CheckCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore, type AppState } from '@/lib/store';
import type { Fault, FaultSeverity, FaultStatus } from '@/lib/types';

interface FaultsPanelProps {
    componentId: string;
    /** Type of entity: 'components' or 'apps' */
    entityType?: 'components' | 'apps';
}

/**
 * Get badge variant for fault severity
 */
function getSeverityBadgeVariant(severity: FaultSeverity): 'default' | 'secondary' | 'destructive' | 'outline' {
    switch (severity) {
        case 'critical':
        case 'error':
            return 'destructive';
        case 'warning':
            return 'default';
        case 'info':
            return 'secondary';
        default:
            return 'outline';
    }
}

/**
 * Get icon for fault severity
 */
function getSeverityIcon(severity: FaultSeverity) {
    switch (severity) {
        case 'critical':
        case 'error':
            return <AlertOctagon className="w-4 h-4" />;
        case 'warning':
            return <AlertTriangle className="w-4 h-4" />;
        case 'info':
            return <Info className="w-4 h-4" />;
        default:
            return <AlertCircle className="w-4 h-4" />;
    }
}

/**
 * Get badge variant for fault status
 */
function getStatusBadgeVariant(status: FaultStatus): 'default' | 'secondary' | 'outline' {
    switch (status) {
        case 'active':
            return 'default';
        case 'pending':
            return 'secondary';
        case 'cleared':
            return 'outline';
        default:
            return 'outline';
    }
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
    try {
        const date = new Date(timestamp);
        return date.toLocaleString();
    } catch {
        return timestamp;
    }
}

/**
 * Single fault row component
 */
function FaultRow({
    fault,
    onClear,
    isClearing,
}: {
    fault: Fault;
    onClear: (code: string) => void;
    isClearing: boolean;
}) {
    const canClear = fault.status === 'active' || fault.status === 'pending';

    return (
        <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
            {/* Severity Icon */}
            <div
                className={`shrink-0 mt-0.5 ${
                    fault.severity === 'critical' || fault.severity === 'error'
                        ? 'text-destructive'
                        : fault.severity === 'warning'
                          ? 'text-yellow-500'
                          : 'text-muted-foreground'
                }`}
            >
                {getSeverityIcon(fault.severity)}
            </div>

            {/* Fault details */}
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium">{fault.code}</span>
                    <Badge variant={getSeverityBadgeVariant(fault.severity)} className="text-xs">
                        {fault.severity}
                    </Badge>
                    <Badge variant={getStatusBadgeVariant(fault.status)} className="text-xs">
                        {fault.status}
                    </Badge>
                </div>
                <p className="text-sm text-foreground">{fault.message}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{formatTimestamp(fault.timestamp)}</span>
                    <span className="font-mono">
                        {fault.entity_type}: {fault.entity_id}
                    </span>
                </div>
            </div>

            {/* Clear button */}
            {canClear && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onClear(fault.code)}
                    disabled={isClearing}
                    className="shrink-0"
                >
                    {isClearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>
            )}
        </div>
    );
}

/**
 * Panel displaying faults for a component or app
 */
export function FaultsPanel({ componentId, entityType = 'components' }: FaultsPanelProps) {
    const [faults, setFaults] = useState<Fault[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [clearingCodes, setClearingCodes] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    const { client } = useAppStore(
        useShallow((state: AppState) => ({
            client: state.client,
        }))
    );

    const loadFaults = useCallback(async () => {
        if (!client) return;

        setIsLoading(true);
        setError(null);

        try {
            const response = await client.listEntityFaults(entityType, componentId);
            setFaults(response.items || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load faults');
            setFaults([]);
        } finally {
            setIsLoading(false);
        }
    }, [client, componentId, entityType]);

    useEffect(() => {
        loadFaults();
    }, [loadFaults]);

    const handleClear = useCallback(
        async (code: string) => {
            if (!client) return;

            setClearingCodes((prev) => new Set([...prev, code]));

            try {
                await client.clearFault(entityType, componentId, code);
                // Reload faults after clearing
                await loadFaults();
            } catch {
                // Error is handled by toast in the store
            } finally {
                setClearingCodes((prev) => {
                    const next = new Set(prev);
                    next.delete(code);
                    return next;
                });
            }
        },
        [client, componentId, entityType, loadFaults]
    );

    // Count faults by severity
    const errorCount = faults.filter((f) => f.severity === 'error' || f.severity === 'critical').length;
    const warningCount = faults.filter((f) => f.severity === 'warning').length;

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
                        <AlertTriangle className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-base">Faults</CardTitle>
                        {faults.length > 0 && (
                            <div className="flex items-center gap-1">
                                {errorCount > 0 && (
                                    <Badge variant="destructive" className="text-xs">
                                        {errorCount} error{errorCount !== 1 ? 's' : ''}
                                    </Badge>
                                )}
                                {warningCount > 0 && (
                                    <Badge variant="default" className="text-xs">
                                        {warningCount} warning{warningCount !== 1 ? 's' : ''}
                                    </Badge>
                                )}
                            </div>
                        )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={loadFaults}>
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {error ? (
                    <div className="text-center text-destructive py-4">{error}</div>
                ) : faults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-muted-foreground py-8">
                        <CheckCircle className="w-12 h-12 mb-2 text-green-500" />
                        <p>No faults detected</p>
                        <p className="text-xs">Component is operating normally</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {faults.map((fault) => (
                            <FaultRow
                                key={fault.code}
                                fault={fault}
                                onClear={handleClear}
                                isClearing={clearingCodes.has(fault.code)}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
