import { useEffect } from 'react';

/**
 * Hook for keyboard shortcut (Ctrl+K / Cmd+K) to open search
 */
export function useSearchShortcut(onOpen: () => void) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                onOpen();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onOpen]);
}
