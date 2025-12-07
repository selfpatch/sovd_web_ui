import { useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import { Activity, RefreshCw, XCircle, CheckCircle, AlertCircle, Clock, Loader2, Navigation } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore, type AppState } from '@/lib/store';
import type { ActionGoalStatusValue } from '@/lib/types';

interface ActionStatusPanelProps {
    componentId: string;
    operationName: string;
    goalId: string;
}

/**
 * Get status badge variant and icon
 */
function getStatusStyle(status: ActionGoalStatusValue): {
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: typeof CheckCircle;
    color: string;
    bgColor: string;
} {
    switch (status) {
        case 'accepted':
            return { variant: 'outline', icon: Clock, color: 'text-blue-500', bgColor: 'bg-blue-500/10' };
        case 'executing':
            return { variant: 'default', icon: Activity, color: 'text-blue-500', bgColor: 'bg-blue-500/10' };
        case 'canceling':
            return { variant: 'secondary', icon: XCircle, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' };
        case 'succeeded':
            return { variant: 'default', icon: CheckCircle, color: 'text-green-500', bgColor: 'bg-green-500/10' };
        case 'canceled':
            return { variant: 'secondary', icon: XCircle, color: 'text-gray-500', bgColor: 'bg-gray-500/10' };
        case 'aborted':
            return { variant: 'destructive', icon: AlertCircle, color: 'text-red-500', bgColor: 'bg-red-500/10' };
        default:
            return { variant: 'outline', icon: Clock, color: 'text-muted-foreground', bgColor: 'bg-muted' };
    }
}

/**
 * Check if status is terminal (no more updates expected)
 */
function isTerminalStatus(status: ActionGoalStatusValue): boolean {
    return ['succeeded', 'canceled', 'aborted'].includes(status);
}

/**
 * Check if status is active (action is in progress)
 */
function isActiveStatus(status: ActionGoalStatusValue): boolean {
    return ['accepted', 'executing', 'canceling'].includes(status);
}

export function ActionStatusPanel({ componentId, operationName, goalId }: ActionStatusPanelProps) {
    const {
        activeGoals,
        autoRefreshGoals,
        refreshActionStatus,
        cancelActionGoal,
        setAutoRefreshGoals,
    } = useAppStore(
        useShallow((state: AppState) => ({
            activeGoals: state.activeGoals,
            autoRefreshGoals: state.autoRefreshGoals,
            refreshActionStatus: state.refreshActionStatus,
            cancelActionGoal: state.cancelActionGoal,
            setAutoRefreshGoals: state.setAutoRefreshGoals,
        }))
    );

    const goalStatus = activeGoals.get(goalId);
    const statusStyle = goalStatus ? getStatusStyle(goalStatus.status) : null;
    const StatusIcon = statusStyle?.icon || Clock;
    const isTerminal = goalStatus ? isTerminalStatus(goalStatus.status) : false;
    const isActive = goalStatus ? isActiveStatus(goalStatus.status) : false;
    const canCancel = goalStatus && ['accepted', 'executing'].includes(goalStatus.status);

    // Manual refresh
    const handleRefresh = useCallback(() => {
        refreshActionStatus(componentId, operationName, goalId);
    }, [componentId, operationName, goalId, refreshActionStatus]);

    // Cancel action
    const handleCancel = useCallback(async () => {
        await cancelActionGoal(componentId, operationName, goalId);
    }, [componentId, operationName, goalId, cancelActionGoal]);

    // Auto-refresh effect
    useEffect(() => {
        if (!autoRefreshGoals || isTerminal) return;

        const interval = setInterval(() => {
            refreshActionStatus(componentId, operationName, goalId);
        }, 1000); // Refresh every second

        return () => clearInterval(interval);
    }, [autoRefreshGoals, isTerminal, componentId, operationName, goalId, refreshActionStatus]);

    // Initial fetch
    useEffect(() => {
        if (!goalStatus) {
            refreshActionStatus(componentId, operationName, goalId);
        }
    }, [goalId, goalStatus, componentId, operationName, refreshActionStatus]);

    if (!goalStatus) {
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
                                <StatusIcon className={`w-4 h-4 ${statusStyle?.color} ${goalStatus.status === 'executing' ? 'animate-pulse' : ''}`} />
                                {goalStatus.status === 'executing' && (
                                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                                )}
                            </div>
                        ) : (
                            <StatusIcon className={`w-4 h-4 ${statusStyle?.color}`} />
                        )}
                        <CardTitle className="text-sm">Action Status</CardTitle>
                        <Badge variant={statusStyle?.variant} className={isActive ? 'animate-pulse' : ''}>
                            {goalStatus.status}
                        </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Auto-refresh checkbox */}
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                            <input
                                type="checkbox"
                                checked={autoRefreshGoals}
                                onChange={(e) => setAutoRefreshGoals(e.target.checked)}
                                className="rounded border-muted-foreground"
                                disabled={isTerminal}
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
                            <RefreshCw className={`w-3.5 h-3.5 ${isActive && autoRefreshGoals ? 'animate-spin' : ''}`} />
                        </Button>

                        {/* Cancel button */}
                        {canCancel && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleCancel}
                                className="h-7"
                            >
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
                                {goalStatus.status === 'accepted' && 'Waiting to start...'}
                                {goalStatus.status === 'executing' && 'Action in progress...'}
                                {goalStatus.status === 'canceling' && 'Canceling...'}
                            </span>
                        </div>
                        {/* Animated progress bar */}
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full animate-progress-indeterminate" />
                        </div>
                    </div>
                )}

                {/* Goal ID */}
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Goal ID:</span>
                    <code className="bg-background/50 px-1.5 py-0.5 rounded font-mono text-xs">
                        {goalId.slice(0, 8)}...{goalId.slice(-8)}
                    </code>
                </div>

                {/* Feedback */}
                {goalStatus.last_feedback !== undefined && goalStatus.last_feedback !== null && (
                    <div>
                        <span className="text-xs text-muted-foreground block mb-1">
                            {isTerminal ? 'Result:' : 'Last Feedback:'}
                        </span>
                        <pre className="bg-background/50 p-2 rounded text-xs font-mono overflow-auto max-h-[150px]">
                            {JSON.stringify(goalStatus.last_feedback, null, 2)}
                        </pre>
                    </div>
                )}

                {/* Terminal state message */}
                {isTerminal && (
                    <div className={`text-xs ${statusStyle?.color} flex items-center gap-1.5 font-medium`}>
                        <StatusIcon className="w-4 h-4" />
                        <span>
                            {goalStatus.status === 'succeeded' && 'Action completed successfully'}
                            {goalStatus.status === 'canceled' && 'Action was canceled'}
                            {goalStatus.status === 'aborted' && 'Action was aborted due to an error'}
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
