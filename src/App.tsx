import { useState, useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { EntityTreeSidebar } from '@/components/EntityTreeSidebar';
import { EntityDetailPanel } from '@/components/EntityDetailPanel';
import { ServerConnectionDialog } from '@/components/ServerConnectionDialog';
import { SearchCommand } from '@/components/SearchCommand';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useSearchShortcut } from '@/hooks/useSearchShortcut';
import { useAppStore } from '@/lib/store';

type ViewMode = 'entity' | 'faults-dashboard';

function App() {
    const { isConnected, serverUrl, baseEndpoint, connect, clearSelection } = useAppStore(
        useShallow((state) => ({
            isConnected: state.isConnected,
            serverUrl: state.serverUrl,
            baseEndpoint: state.baseEndpoint,
            connect: state.connect,
            clearSelection: state.clearSelection,
        }))
    );

    const [showConnectionDialog, setShowConnectionDialog] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('entity');
    const autoConnectAttempted = useRef(false);

    // Keyboard shortcut: Ctrl+K / Cmd+K to open search
    const openSearch = useCallback(() => setShowSearch(true), []);
    useSearchShortcut(openSearch);

    // Handle faults dashboard navigation
    const handleFaultsDashboardClick = useCallback(() => {
        clearSelection();
        setViewMode('faults-dashboard');
    }, [clearSelection]);

    // When entity is selected, switch back to entity view
    const handleEntitySelect = useCallback(() => {
        setViewMode('entity');
    }, []);

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
        <ErrorBoundary
            onError={(error) => {
                toast.error(`Application error: ${error.message}`);
            }}
        >
            <div className="flex h-screen bg-background">
                <EntityTreeSidebar
                    onSettingsClick={() => setShowConnectionDialog(true)}
                    onFaultsDashboardClick={handleFaultsDashboardClick}
                />
                <ErrorBoundary>
                    <EntityDetailPanel
                        onConnectClick={() => setShowConnectionDialog(true)}
                        viewMode={viewMode}
                        onEntitySelect={handleEntitySelect}
                    />
                </ErrorBoundary>
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
        </ErrorBoundary>
    );
}

export default App;
