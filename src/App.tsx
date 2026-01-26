import { useState, useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { EntityTreeSidebar } from '@/components/EntityTreeSidebar';
import { EntityDetailPanel } from '@/components/EntityDetailPanel';
import { ServerConnectionDialog } from '@/components/ServerConnectionDialog';
import { SearchCommand } from '@/components/SearchCommand';
import { useSearchShortcut } from '@/hooks/useSearchShortcut';
import { useAppStore } from '@/lib/store';

function App() {
    const { isConnected, serverUrl, baseEndpoint, connect } = useAppStore(
        useShallow((state) => ({
            isConnected: state.isConnected,
            serverUrl: state.serverUrl,
            baseEndpoint: state.baseEndpoint,
            connect: state.connect,
        }))
    );

    const [showConnectionDialog, setShowConnectionDialog] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const autoConnectAttempted = useRef(false);

    // Keyboard shortcut: Ctrl+K / Cmd+K to open search
    const openSearch = useCallback(() => setShowSearch(true), []);
    useSearchShortcut(openSearch);

    // Auto-connect on mount if we have a stored URL
    useEffect(() => {
        if (serverUrl && !isConnected && !autoConnectAttempted.current) {
            autoConnectAttempted.current = true;
            connect(serverUrl, baseEndpoint).then((success) => {
                if (!success) {
                    toast.error('Auto-connect failed. Please check your server settings.');
                    setShowConnectionDialog(true);
                }
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex h-screen bg-background">
            <EntityTreeSidebar onSettingsClick={() => setShowConnectionDialog(true)} />
            <EntityDetailPanel onConnectClick={() => setShowConnectionDialog(true)} />
            <ServerConnectionDialog open={showConnectionDialog} onOpenChange={setShowConnectionDialog} />
            <SearchCommand open={showSearch} onOpenChange={setShowSearch} />
            <ToastContainer
                position="bottom-right"
                autoClose={5000}
                hideProgressBar={false}
                newestOnTop
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme="dark"
            />
        </div>
    );
}

export default App;
