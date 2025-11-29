import { Server, FolderTree } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
    type: 'no-connection' | 'no-entities' | 'no-selection';
    onAction?: () => void;
}

export function EmptyState({ type, onAction }: EmptyStateProps) {
    const content = {
        'no-connection': {
            icon: Server,
            title: 'No Server Connected',
            description: 'Connect to a SOVD server to browse entities.',
            actionLabel: 'Connect to Server',
        },
        'no-entities': {
            icon: FolderTree,
            title: 'No Entities Found',
            description: 'The server returned no entities. Check if the server is configured correctly.',
            actionLabel: null,
        },
        'no-selection': {
            icon: FolderTree,
            title: 'Select an Entity',
            description: 'Click on an entity in the tree to view its details.',
            actionLabel: null,
        },
    };

    const { icon: Icon, title, description, actionLabel } = content[type];

    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <Icon className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
            {actionLabel && onAction && (
                <Button className="mt-4" onClick={onAction}>
                    {actionLabel}
                </Button>
            )}
        </div>
    );
}
