import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SovdApiClient, formatBytes, formatDuration } from './sovd-api';

describe('SovdApiClient', () => {
    let client: SovdApiClient;

    beforeEach(() => {
        client = new SovdApiClient('http://localhost:8080', 'api/v1');
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('getFaultWithEnvironmentData', () => {
        it('returns FaultResponse with environment_data', async () => {
            const mockResponse = {
                item: {
                    code: 'TEST_FAULT',
                    fault_name: 'Test',
                    severity: 2,
                    status: { aggregatedStatus: 'active', testFailed: '1', confirmedDTC: '1', pendingDTC: '0' },
                },
                environment_data: {
                    extended_data_records: {
                        first_occurence: '2026-02-04T10:00:00Z',
                        last_occurence: '2026-02-04T10:05:00Z',
                    },
                    snapshots: [],
                },
            };

            vi.mocked(fetch).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            } as Response);

            const result = await client.getFaultWithEnvironmentData('apps', 'motor', 'TEST_FAULT');

            expect(fetch).toHaveBeenCalledWith(
                'http://localhost:8080/api/v1/apps/motor/faults/TEST_FAULT',
                expect.objectContaining({ method: 'GET' })
            );
            expect(result.item.code).toBe('TEST_FAULT');
            expect(result.environment_data).toBeDefined();
        });

        it('throws on failure', async () => {
            vi.mocked(fetch).mockResolvedValue({
                ok: false,
                status: 404,
                json: () => Promise.resolve({ message: 'Fault not found' }),
            } as Response);

            await expect(client.getFaultWithEnvironmentData('apps', 'motor', 'UNKNOWN')).rejects.toThrow(
                'Fault not found'
            );
        });
    });

    describe('listBulkDataCategories', () => {
        it('returns categories array', async () => {
            vi.mocked(fetch).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ items: ['rosbags'] }),
            } as Response);

            const result = await client.listBulkDataCategories('apps', 'motor');

            expect(fetch).toHaveBeenCalledWith(
                'http://localhost:8080/api/v1/apps/motor/bulk-data',
                expect.objectContaining({ method: 'GET' })
            );
            expect(result.items).toContain('rosbags');
        });

        it('returns empty array on 404', async () => {
            vi.mocked(fetch).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            const result = await client.listBulkDataCategories('apps', 'motor');
            expect(result.items).toHaveLength(0);
        });
    });

    describe('listBulkData', () => {
        it('returns BulkDataDescriptor array', async () => {
            const mockDescriptor = {
                id: 'uuid-123',
                name: 'FAULT recording',
                mimetype: 'application/x-mcap',
                size: 12345,
                creation_date: '2026-02-04T10:00:00Z',
            };

            vi.mocked(fetch).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ items: [mockDescriptor] }),
            } as Response);

            const result = await client.listBulkData('apps', 'motor', 'rosbags');

            expect(fetch).toHaveBeenCalledWith(
                'http://localhost:8080/api/v1/apps/motor/bulk-data/rosbags',
                expect.objectContaining({ method: 'GET' })
            );
            expect(result.items[0]?.id).toBe('uuid-123');
        });
    });

    describe('getBulkDataUrl', () => {
        it('builds correct URL from absolute bulk_data_uri', () => {
            const url = client.getBulkDataUrl('/apps/motor_controller/bulk-data/rosbags/550e8400-uuid');

            expect(url).toBe('http://localhost:8080/api/v1/apps/motor_controller/bulk-data/rosbags/550e8400-uuid');
        });

        it('handles nested entity paths', () => {
            const url = client.getBulkDataUrl('/areas/perception/subareas/lidar/bulk-data/rosbags/uuid');

            expect(url).toBe('http://localhost:8080/api/v1/areas/perception/subareas/lidar/bulk-data/rosbags/uuid');
        });
    });

    describe('downloadBulkData', () => {
        it('downloads blob and extracts filename', async () => {
            const mockBlob = new Blob(['test data'], { type: 'application/x-mcap' });

            vi.mocked(fetch).mockResolvedValue({
                ok: true,
                blob: () => Promise.resolve(mockBlob),
                headers: new Headers({
                    'Content-Disposition': 'attachment; filename="MOTOR_OVERHEAT.mcap"',
                }),
            } as Response);

            const result = await client.downloadBulkData('apps', 'motor', 'rosbags', 'uuid-123');

            expect(result.blob).toBe(mockBlob);
            expect(result.filename).toBe('MOTOR_OVERHEAT.mcap');
        });

        it('uses default filename if header missing', async () => {
            const mockBlob = new Blob(['test data']);

            vi.mocked(fetch).mockResolvedValue({
                ok: true,
                blob: () => Promise.resolve(mockBlob),
                headers: new Headers({}),
            } as Response);

            const result = await client.downloadBulkData('apps', 'motor', 'rosbags', 'my-uuid');

            expect(result.filename).toBe('my-uuid.mcap');
        });

        it('throws on failure', async () => {
            vi.mocked(fetch).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            await expect(client.downloadBulkData('apps', 'motor', 'rosbags', 'uuid')).rejects.toThrow('HTTP 404');
        });
    });
});

describe('Utility Functions', () => {
    describe('formatBytes', () => {
        it('formats bytes correctly', () => {
            expect(formatBytes(0)).toBe('0 B');
            expect(formatBytes(500)).toBe('500 B');
            expect(formatBytes(1024)).toBe('1 KB');
            expect(formatBytes(1536)).toBe('1.5 KB');
            expect(formatBytes(1048576)).toBe('1 MB');
            expect(formatBytes(1234567)).toBe('1.2 MB');
        });
    });

    describe('formatDuration', () => {
        it('formats seconds correctly', () => {
            expect(formatDuration(5)).toBe('5.0s');
            expect(formatDuration(30.5)).toBe('30.5s');
            expect(formatDuration(60)).toBe('1m 0s');
            expect(formatDuration(90)).toBe('1m 30s');
            expect(formatDuration(125)).toBe('2m 5s');
        });
    });
});
