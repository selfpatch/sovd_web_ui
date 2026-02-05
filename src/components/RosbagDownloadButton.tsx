import { Download, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppStore } from '@/lib/store';
import { formatBytes, formatDuration } from '@/lib/sovd-api';
import type { RosbagSnapshot } from '@/lib/types';

interface RosbagDownloadButtonProps {
    snapshot: RosbagSnapshot;
    variant?: 'default' | 'outline' | 'ghost';
    size?: 'default' | 'sm' | 'icon';
}

export function RosbagDownloadButton({ snapshot, variant = 'outline', size = 'sm' }: RosbagDownloadButtonProps) {
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { client } = useAppStore(
        useShallow((state) => ({
            client: state.client,
        }))
    );

    const handleDownload = useCallback(async () => {
        if (!client || !snapshot.bulk_data_uri) return;

        setIsDownloading(true);
        setError(null);

        try {
            // Get full URL and trigger download
            const url = client.getBulkDataUrl(snapshot.bulk_data_uri);

            // Create temporary link and click it
            const link = document.createElement('a');
            link.href = url;
            // Use name field; extract filename from URI as fallback
            const filename = snapshot.name || snapshot.bulk_data_uri.split('/').pop() || 'recording.mcap';
            link.download = filename.endsWith('.mcap') ? filename : `${filename}.mcap`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Download failed');
        } finally {
            setIsDownloading(false);
        }
    }, [client, snapshot]);

    if (!snapshot.bulk_data_uri) {
        return null;
    }

    const label = snapshot.size_bytes ? `Download (${formatBytes(snapshot.size_bytes)})` : 'Download rosbag';

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant={variant}
                    size={size}
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className={error ? 'border-destructive' : ''}
                >
                    {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {size !== 'icon' && <span className="ml-2">{isDownloading ? 'Downloading...' : label}</span>}
                </Button>
            </TooltipTrigger>
            <TooltipContent>
                {error ? (
                    <p className="text-destructive">{error}</p>
                ) : (
                    <div className="space-y-1">
                        <p className="font-medium">{snapshot.name}</p>
                        {snapshot.duration_sec && <p>Duration: {formatDuration(snapshot.duration_sec)}</p>}
                        {snapshot.format && <p>Format: {snapshot.format}</p>}
                    </div>
                )}
            </TooltipContent>
        </Tooltip>
    );
}
