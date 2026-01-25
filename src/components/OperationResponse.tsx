import { CheckCircle, XCircle, Clock, Loader2, Hash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { CreateExecutionResponse, ExecutionStatus } from '@/lib/types';

interface OperationResponseProps {
    response: CreateExecutionResponse;
}

function getStatusConfig(status: ExecutionStatus): {
    icon: typeof CheckCircle;
    color: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
} {
    switch (status) {
        case 'succeeded':
            return { icon: CheckCircle, color: 'text-green-500', variant: 'default' };
        case 'running':
        case 'pending':
            return { icon: Loader2, color: 'text-blue-500', variant: 'secondary' };
        case 'failed':
            return { icon: XCircle, color: 'text-destructive', variant: 'destructive' };
        case 'canceled':
            return { icon: Clock, color: 'text-yellow-500', variant: 'outline' };
        default:
            return { icon: Clock, color: 'text-muted-foreground', variant: 'secondary' };
    }
}

export function OperationResponseDisplay({ response }: OperationResponseProps) {
    const isSuccess = response.status === 'succeeded';
    const statusConfig = getStatusConfig(response.status);
    const StatusIcon = statusConfig.icon;

    return (
        <div
            className={`rounded-lg border ${isSuccess ? 'border-green-500/30 bg-green-500/5' : 'border-muted bg-muted/5'}`}
        >
            {/* Header */}
            <div className="flex items-center gap-3 px-3 py-2 border-b border-inherit">
                <StatusIcon
                    className={`w-4 h-4 ${statusConfig.color} ${response.status === 'running' ? 'animate-spin' : ''}`}
                />
                <div className="flex items-center gap-2 flex-1">
                    <Badge variant={statusConfig.variant}>{response.status}</Badge>
                </div>
            </div>

            {/* Body */}
            <div className="p-3 space-y-2 text-sm">
                {/* Execution ID */}
                <div className="flex items-center gap-2">
                    <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground text-xs">Execution ID:</span>
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{response.id}</code>
                </div>
            </div>
        </div>
    );
}
