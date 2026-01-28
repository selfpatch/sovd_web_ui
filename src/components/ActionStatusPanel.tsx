import { useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import { Activity, RefreshCw, XCircle, CheckCircle, AlertCircle, Clock, Loader2, Navigation } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore, type AppState } from '@/lib/store';
import type { ExecutionStatus, SovdResourceEntityType } from '@/lib/types';

interface ActionStatusPanelProps {
    entityId: string;
    operationName: string;
    executionId: string;
    entityType?: SovdResourceEntityType;
}

/**
 * Get status badge variant and icon for Execution status
 */
function getStatusStyle(status: ExecutionStatus): {
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: typeof CheckCircle;
    color: string;
    bgColor: string;
} {
    switch (status) {
        case 'pending':
            return { variant: 'outline', icon: Clock, color: 'text-blue-500', bgColor: 'bg-blue-500/10' };
        case 'running':
            return {
                variant: 'default',
                icon: Activity,
                color: 'text-blue-500',
                bgColor: 'bg-blue-500/10',
            };
        case 'succeeded':
            return {
                variant: 'default',
                icon: CheckCircle,
                color: 'text-green-500',
                bgColor: 'bg-green-500/10',
            };
        case 'canceled':
            return {
                variant: 'secondary',
                icon: XCircle,
                color: 'text-gray-500',
                bgColor: 'bg-gray-500/10',
            };
        case 'failed':
            return {
                variant: 'destructive',
                icon: AlertCircle,
                color: 'text-red-500',
                bgColor: 'bg-red-500/10',
            };
        default:
            return {
                variant: 'outline',
                icon: Clock,
                color: 'text-muted-foreground',
                bgColor: 'bg-muted',
            };
    }
}

/**
 * Check if status is terminal (no more updates expected)
 */
function isTerminalStatus(status: ExecutionStatus): boolean {
    return ['succeeded', 'canceled', 'failed'].includes(status);
}

/**
 * Check if status is active (action is in progress)
 */
function isActiveStatus(status: ExecutionStatus): boolean {
    return ['pending', 'running'].includes(status);
}

export function ActionStatusPanel({
    entityId,
    operationName,
    executionId,
    entityType = 'components',
}: ActionStatusPanelProps) {
    const {
        activeExecutions,
        autoRefreshExecutions,
        refreshExecutionStatus,
        cancelExecution,
        setAutoRefreshExecutions,
    } = useAppStore(
        useShallow((state: AppState) => ({
            activeExecutions: state.activeExecutions,
            autoRefreshExecutions: state.autoRefreshExecutions,
            refreshExecutionStatus: state.refreshExecutionStatus,
            cancelExecution: state.cancelExecution,
            setAutoRefreshExecutions: state.setAutoRefreshExecutions,
        }))
    );

    const execution = activeExecutions.get(executionId);
    const statusStyle = execution ? getStatusStyle(execution.status) : null;
    const StatusIcon = statusStyle?.icon || Clock;
    const isTerminal = execution ? isTerminalStatus(execution.status) : false;
    const isActive = execution ? isActiveStatus(execution.status) : false;
    const canCancel = execution && ['pending', 'running'].includes(execution.status);

    // Manual refresh
    const handleRefresh = useCallback(() => {
        refreshExecutionStatus(entityId, operationName, executionId, entityType);
    }, [entityId, operationName, executionId, refreshExecutionStatus, entityType]);

    // Cancel action
    const handleCancel = useCallback(async () => {
        await cancelExecution(entityId, operationName, executionId, entityType);
    }, [entityId, operationName, executionId, cancelExecution, entityType]);

    // Auto-refresh effect
    useEffect(() => {
        if (!autoRefreshExecutions || isTerminal) return;

        const interval = setInterval(() => {
            refreshExecutionStatus(entityId, operationName, executionId, entityType);
        }, 1000); // Refresh every second

        return () => clearInterval(interval);
    }, [autoRefreshExecutions, isTerminal, entityId, operationName, executionId, refreshExecutionStatus, entityType]);

    // Initial fetch
    useEffect(() => {
        if (!execution) {
            refreshExecutionStatus(entityId, operationName, executionId, entityType);
        }
    }, [executionId, execution, entityId, operationName, refreshExecutionStatus, entityType]);

    if (!execution) {
        return (
            <div className="flex items-center justify-center p-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <Card className={`${statusStyle?.bgColor} border-${statusStyle?.color?.replace('text-', '')}/30`}>
            <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {isActive ? (
                            <div className="relative">
                                <StatusIcon
                                    className={`w-4 h-4 ${statusStyle?.color} ${execution.status === 'running' ? 'animate-pulse' : ''}`}
                                />
                                {execution.status === 'running' && (
                                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                                )}
                            </div>
                        ) : (
                            <StatusIcon className={`w-4 h-4 ${statusStyle?.color}`} />
                        )}
                        <CardTitle className="text-sm">Execution Status</CardTitle>
                        <Badge variant={statusStyle?.variant} className={isActive ? 'animate-pulse' : ''}>
                            {execution.status}
                        </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Auto-refresh checkbox */}
                        <label
                            htmlFor={`auto-refresh-${executionId}`}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"
                        >
                            <input
                                id={`auto-refresh-${executionId}`}
                                type="checkbox"
                                checked={autoRefreshExecutions}
                                onChange={(e) => setAutoRefreshExecutions(e.target.checked)}
                                className="rounded border-muted-foreground focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
                                disabled={isTerminal}
                                aria-label="Auto-refresh execution status"
                            />
                            Auto-refresh
                        </label>

                        {/* Manual refresh */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={isTerminal}
                            className="h-7 w-7 p-0"
                        >
                            <RefreshCw
                                className={`w-3.5 h-3.5 ${isActive && autoRefreshExecutions ? 'animate-spin' : ''}`}
                            />
                        </Button>

                        {/* Cancel button */}
                        {canCancel && (
                            <Button variant="destructive" size="sm" onClick={handleCancel} className="h-7">
                                <XCircle className="w-3.5 h-3.5 mr-1" />
                                Cancel
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="py-2 px-4 space-y-3">
                {/* Progress bar for active actions */}
                {isActive && (
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Navigation className="w-3.5 h-3.5 text-blue-500 animate-bounce" />
                            <span className="text-xs text-muted-foreground">
                                {execution.status === 'pending' && 'Waiting to start...'}
                                {execution.status === 'running' && 'Execution in progress...'}
                            </span>
                        </div>
                        {/* Animated progress bar */}
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full animate-progress-indeterminate" />
                        </div>
                    </div>
                )}

                {/* Execution ID */}
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Execution ID:</span>
                    <code className="bg-background/50 px-1.5 py-0.5 rounded font-mono text-xs">
                        {executionId.slice(0, 8)}...{executionId.slice(-8)}
                    </code>
                </div>

                {/* Result or feedback */}
                {execution.result !== undefined && execution.result !== null && (
                    <div>
                        <span className="text-xs text-muted-foreground block mb-1">
                            {isTerminal ? 'Result:' : 'Last Feedback:'}
                        </span>
                        <pre className="bg-background/50 p-2 rounded text-xs font-mono overflow-auto max-h-[150px]">
                            {JSON.stringify(execution.result, null, 2)}
                        </pre>
                    </div>
                )}

                {/* Error message for failed executions */}
                {execution.error && (
                    <div>
                        <span className="text-xs text-destructive block mb-1">Error:</span>
                        <pre className="bg-destructive/10 p-2 rounded text-xs font-mono text-destructive overflow-auto max-h-[100px]">
                            {execution.error}
                        </pre>
                    </div>
                )}

                {/* Terminal state message */}
                {isTerminal && (
                    <div className={`text-xs ${statusStyle?.color} flex items-center gap-1.5 font-medium`}>
                        <StatusIcon className="w-4 h-4" />
                        <span>
                            {execution.status === 'succeeded' && 'Execution completed successfully'}
                            {execution.status === 'canceled' && 'Execution was canceled'}
                            {execution.status === 'failed' && 'Execution failed'}
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
