import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/shallow';
import { EntityTreeSidebar } from '@/components/EntityTreeSidebar';
import { EntityDetailPanel } from '@/components/EntityDetailPanel';
import { ServerConnectionDialog } from '@/components/ServerConnectionDialog';
import { useAppStore } from '@/lib/store';

function App() {
    const { isConnected, serverUrl, connect } = useAppStore(
        useShallow((state) => ({
            isConnected: state.isConnected,
            serverUrl: state.serverUrl,
            connect: state.connect,
        }))
    );

    const [showConnectionDialog, setShowConnectionDialog] = useState(false);

    // Auto-connect on mount if we have a stored URL
    useEffect(() => {
        if (serverUrl && !isConnected) {
            connect(serverUrl);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex h-screen bg-background">
            <EntityTreeSidebar onSettingsClick={() => setShowConnectionDialog(true)} />
            <EntityDetailPanel onConnectClick={() => setShowConnectionDialog(true)} />
            <ServerConnectionDialog
                open={showConnectionDialog}
                onOpenChange={setShowConnectionDialog}
            />
        </div>
    );
}

export default App;
