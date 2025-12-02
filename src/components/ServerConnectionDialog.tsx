import { useState, useEffect } from 'react';
import { Server, Loader2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';

interface ServerConnectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ServerConnectionDialog({ open, onOpenChange }: ServerConnectionDialogProps) {
    const { serverUrl, baseEndpoint, isConnecting, connectionError, connect } = useAppStore();
    const [url, setUrl] = useState(serverUrl || 'localhost:8080');
    const [endpoint, setEndpoint] = useState(baseEndpoint || 'api/v1');

    // Update local state when serverUrl/baseEndpoint changes (e.g., from localStorage)
    // Only update if the dialog is just opened or if the store values change externally
    useEffect(() => {
        if (open) {
            setUrl(serverUrl || '');
            setEndpoint(baseEndpoint || '');
        }
    }, [open, serverUrl, baseEndpoint]);

    const handleConnect = async () => {
        if (!url.trim()) return;

        const success = await connect(url.trim(), endpoint.trim());
        if (success) {
            onOpenChange(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isConnecting) {
            handleConnect();
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent showCloseButton={false}>
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Server className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <DialogTitle>Connect to SOVD Server</DialogTitle>
                            <DialogDescription>
                                Enter the URL and base endpoint of your SOVD server
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <label htmlFor="server-url" className="text-sm font-medium">
                            Server URL
                        </label>
                        <Input
                            id="server-url"
                            placeholder="192.168.1.100:8080 or http://localhost:3000"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isConnecting}
                            aria-invalid={!!connectionError}
                        />
                        <p className="text-xs text-muted-foreground">
                            You can enter just IP:port or a full URL with protocol
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="base-endpoint" className="text-sm font-medium">
                            Base Endpoint
                        </label>
                        <Input
                            id="base-endpoint"
                            placeholder="e.g. api/v1 (optional)"
                            value={endpoint}
                            onChange={(e) => setEndpoint(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isConnecting}
                        />
                        <p className="text-xs text-muted-foreground">
                            The path prefix for SOVD entities (leave empty for root)
                        </p>
                    </div>

                    {connectionError && (
                        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                            {connectionError}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        onClick={handleConnect}
                        disabled={isConnecting || !url.trim()}
                    >
                        {isConnecting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Connecting...
                            </>
                        ) : (
                            'Connect'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
