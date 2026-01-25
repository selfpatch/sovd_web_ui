import { CheckCircle, XCircle, Clock, Zap, Hash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { OperationResponse } from '@/lib/types';

interface OperationResponseProps {
    response: OperationResponse;
}

/**
 * Renders a value with appropriate styling based on type
 */
function ValueDisplay({ value, depth = 0 }: { value: unknown; depth?: number }) {
    if (value === null || value === undefined) {
        return <span className="text-muted-foreground italic">null</span>;
    }

    if (typeof value === 'boolean') {
        return (
            <Badge variant={value ? 'default' : 'secondary'} className="text-xs">
                {value ? 'true' : 'false'}
            </Badge>
        );
    }

    if (typeof value === 'number') {
        return <span className="text-blue-500 font-mono">{value}</span>;
    }

    if (typeof value === 'string') {
        if (value === '') {
            return <span className="text-muted-foreground italic">(empty)</span>;
        }
        // Check if it's a UUID-like string (standard format with hyphens)
        if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) {
            return (
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                    {value.slice(0, 8)}...{value.slice(-12)}
                </code>
            );
        }
        return <span className="text-green-600 dark:text-green-400">"{value}"</span>;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            return <span className="text-muted-foreground italic">[]</span>;
        }
        return (
            <div className="pl-3 border-l-2 border-muted">
                {value.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 py-0.5">
                        <span className="text-muted-foreground text-xs">[{idx}]</span>
                        <ValueDisplay value={item} depth={depth + 1} />
                    </div>
                ))}
            </div>
        );
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) {
            return <span className="text-muted-foreground italic">{'{}'}</span>;
        }
        return (
            <div className={depth > 0 ? 'pl-3 border-l-2 border-muted' : ''}>
                {entries.map(([key, val]) => (
                    <div key={key} className="flex items-start gap-2 py-0.5">
                        <span className="text-purple-600 dark:text-purple-400 font-medium text-sm shrink-0">
                            {key}:
                        </span>
                        <ValueDisplay value={val} depth={depth + 1} />
                    </div>
                ))}
            </div>
        );
    }

    return <span>{String(value)}</span>;
}

export function OperationResponseDisplay({ response }: OperationResponseProps) {
    const isSuccess = response.status === 'success';
    const isAction = response.kind === 'action';
    const StatusIcon = isSuccess ? CheckCircle : XCircle;
    const KindIcon = isAction ? Clock : Zap;

    return (
        <div
            className={`rounded-lg border ${isSuccess ? 'border-green-500/30 bg-green-500/5' : 'border-destructive/30 bg-destructive/5'}`}
        >
            {/* Header */}
            <div className="flex items-center gap-3 px-3 py-2 border-b border-inherit">
                <StatusIcon className={`w-4 h-4 ${isSuccess ? 'text-green-500' : 'text-destructive'}`} />
                <div className="flex items-center gap-2 flex-1">
                    <Badge variant={isSuccess ? 'default' : 'destructive'}>{response.status}</Badge>
                    <Badge variant="outline" className="gap-1">
                        <KindIcon className="w-3 h-3" />
                        {response.kind}
                    </Badge>
                </div>
                <span className="text-xs text-muted-foreground">{response.operation}</span>
            </div>

            {/* Body */}
            <div className="p-3 space-y-2 text-sm">
                {/* Action-specific: Execution ID */}
                {isAction && 'execution_id' in response && response.execution_id && (
                    <div className="flex items-center gap-2">
                        <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground text-xs">Execution ID:</span>
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                            {response.execution_id}
                        </code>
                    </div>
                )}

                {/* Action-specific: Initial status */}
                {isAction && 'execution_status' in response && response.execution_status && (
                    <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground text-xs">Initial Status:</span>
                        <Badge variant="secondary">{response.execution_status}</Badge>
                    </div>
                )}

                {/* Service response data */}
                {'response' in response && response.response !== undefined && (
                    <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Response Data:</div>
                        <div className="bg-background/50 p-2 rounded">
                            <ValueDisplay value={response.response} />
                        </div>
                    </div>
                )}

                {/* Error message */}
                {'error' in response && response.error && (
                    <div className="flex items-start gap-2 text-destructive">
                        <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="text-sm">{response.error}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
