import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { RosbagDownloadButton } from './RosbagDownloadButton';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { RosbagSnapshot } from '@/lib/types';

// Mock the store
vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector) =>
        selector({
            client: {
                getBulkDataUrl: vi.fn((uri: string) => `http://localhost:8080/api/v1${uri}`),
            },
        })
    ),
}));

const mockSnapshot: RosbagSnapshot = {
    type: 'rosbag',
    name: 'MOTOR_OVERHEAT',
    bulk_data_uri: '/apps/motor/bulk-data/rosbags/uuid-123',
    size_bytes: 1048576,
    duration_sec: 30.5,
    format: 'mcap',
    'x-medkit': {
        captured_at: '2026-02-04T10:00:00Z',
        fault_code: 'MOTOR_OVERHEAT',
    },
};

const renderWithTooltip = (ui: React.ReactElement) => {
    return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe('RosbagDownloadButton', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('renders download button with size label', () => {
        renderWithTooltip(<RosbagDownloadButton snapshot={mockSnapshot} />);

        expect(screen.getByRole('button')).toBeInTheDocument();
        expect(screen.getByText(/Download.*1 MB/)).toBeInTheDocument();
    });

    it('renders nothing when bulk_data_uri is missing', () => {
        const snapshotWithoutUri = { ...mockSnapshot, bulk_data_uri: '' };
        const { container } = renderWithTooltip(<RosbagDownloadButton snapshot={snapshotWithoutUri} />);

        expect(container.firstChild).toBeNull();
    });

    it('triggers download on click', async () => {
        // Render first, then setup mocks for the actual click
        const { getByRole } = renderWithTooltip(<RosbagDownloadButton snapshot={mockSnapshot} />);
        const button = getByRole('button');

        // Setup link mock
        const mockClick = vi.fn();
        let createdLink: Partial<HTMLAnchorElement> = {};

        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            if (tagName === 'a') {
                const link = originalCreateElement('a') as HTMLAnchorElement;
                createdLink = link;
                link.click = mockClick;
                return link;
            }
            return originalCreateElement(tagName);
        });

        fireEvent.click(button);

        await waitFor(() => {
            expect(mockClick).toHaveBeenCalled();
            expect(createdLink.href).toContain('/bulk-data/rosbags/uuid-123');
            expect(createdLink.download).toBe('MOTOR_OVERHEAT.mcap');
        });
    });

    it('renders as icon button when size="icon"', () => {
        renderWithTooltip(<RosbagDownloadButton snapshot={mockSnapshot} size="icon" />);

        // Should have icon but no text
        expect(screen.queryByText(/Download/)).not.toBeInTheDocument();
        expect(screen.getByRole('button').querySelector('svg')).toBeInTheDocument();
    });
});
