import { describe, it, expect } from 'vitest';
import {
    isFreezeFrameSnapshot,
    isRosbagSnapshot,
    type Snapshot,
    type FreezeFrameSnapshot,
    type RosbagSnapshot,
    type FaultResponse,
    type BulkDataDescriptor,
} from './types';

describe('Snapshot Type Guards', () => {
    it('identifies freeze_frame snapshot', () => {
        const snapshot: Snapshot = {
            type: 'freeze_frame',
            name: 'temperature',
            data: 42.5,
        };

        expect(isFreezeFrameSnapshot(snapshot)).toBe(true);
        expect(isRosbagSnapshot(snapshot)).toBe(false);
    });

    it('identifies rosbag snapshot', () => {
        const snapshot: Snapshot = {
            type: 'rosbag',
            name: 'fault_recording',
            bulk_data_uri: '/apps/motor/bulk-data/rosbags/123',
            size_bytes: 12345,
            duration_sec: 6.0,
            format: 'mcap',
        };

        expect(isRosbagSnapshot(snapshot)).toBe(true);
        expect(isFreezeFrameSnapshot(snapshot)).toBe(false);
    });

    it('freeze_frame has x-medkit extensions', () => {
        const snapshot: FreezeFrameSnapshot = {
            type: 'freeze_frame',
            name: 'temperature',
            data: 42.5,
            'x-medkit': {
                topic: '/motor/temp',
                message_type: 'sensor_msgs/msg/Temperature',
                full_data: { temperature: 42.5, variance: 0.1 },
                captured_at: '2026-02-04T10:00:00Z',
            },
        };

        expect(snapshot['x-medkit']?.topic).toBe('/motor/temp');
    });

    it('rosbag has required fields', () => {
        const snapshot: RosbagSnapshot = {
            type: 'rosbag',
            name: 'recording',
            bulk_data_uri: '/apps/motor/bulk-data/rosbags/uuid',
            size_bytes: 1000,
            duration_sec: 5,
            format: 'mcap',
        };

        expect(snapshot.bulk_data_uri).toContain('/bulk-data/rosbags/');
        expect(snapshot.format).toBe('mcap');
    });
});

describe('FaultResponse Types', () => {
    it('has required structure', () => {
        const response: FaultResponse = {
            item: {
                code: 'TEST',
                fault_name: 'Test fault',
                severity: 2,
                status: {
                    aggregatedStatus: 'active',
                    testFailed: '1',
                    confirmedDTC: '1',
                    pendingDTC: '0',
                },
            },
            environment_data: {
                extended_data_records: {
                    first_occurrence: '2026-02-04T10:00:00Z',
                    last_occurrence: '2026-02-04T10:05:00Z',
                },
                snapshots: [],
            },
        };

        expect(response.item.code).toBe('TEST');
        expect(response.item.status.aggregatedStatus).toBe('active');
    });

    it('includes optional x-medkit extensions', () => {
        const response: FaultResponse = {
            item: {
                code: 'TEST',
                fault_name: 'Test fault',
                severity: 2,
                status: {
                    aggregatedStatus: 'active',
                    testFailed: '1',
                    confirmedDTC: '1',
                    pendingDTC: '0',
                },
            },
            environment_data: {
                extended_data_records: {
                    first_occurrence: '2026-02-04T10:00:00Z',
                    last_occurrence: '2026-02-04T10:05:00Z',
                },
                snapshots: [],
            },
            'x-medkit': {
                occurrence_count: 3,
                reporting_sources: ['/powertrain/motor'],
                severity_label: 'ERROR',
            },
        };

        expect(response['x-medkit']?.occurrence_count).toBe(3);
        expect(response['x-medkit']?.reporting_sources).toContain('/powertrain/motor');
    });
});

describe('BulkData Types', () => {
    it('BulkDataDescriptor has required fields', () => {
        const descriptor: BulkDataDescriptor = {
            id: 'uuid-123',
            name: 'FAULT recording',
            mimetype: 'application/x-mcap',
            size: 12345,
            creation_date: '2026-02-04T10:00:00Z',
        };

        expect(descriptor.id).toBeTruthy();
        expect(descriptor.mimetype).toBe('application/x-mcap');
    });

    it('BulkDataDescriptor has optional x-medkit', () => {
        const descriptor: BulkDataDescriptor = {
            id: 'uuid-123',
            name: 'FAULT recording',
            mimetype: 'application/x-mcap',
            size: 12345,
            creation_date: '2026-02-04T10:00:00Z',
            'x-medkit': {
                fault_code: 'MOTOR_OVERHEAT',
                duration_sec: 6.0,
                format: 'mcap',
            },
        };

        expect(descriptor['x-medkit']?.fault_code).toBe('MOTOR_OVERHEAT');
    });
});
