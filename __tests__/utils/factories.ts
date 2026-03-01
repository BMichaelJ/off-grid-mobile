/**
 * Test Data Factories
 *
 * Creates test data for WildMe entities.
 * Use these factories to create consistent test data across all test files.
 */

import { DeviceInfo } from '../../src/types';

// ============================================================================
// ID Generation
// ============================================================================

let idCounter = 0;

export const generateId = (prefix = 'test'): string => {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
};

export const resetIdCounter = (): void => {
  idCounter = 0;
};

// ============================================================================
// Device Info Factory
// ============================================================================

export interface DeviceInfoFactoryOptions {
  totalMemory?: number;
  usedMemory?: number;
  availableMemory?: number;
  deviceModel?: string;
  systemName?: string;
  systemVersion?: string;
  isEmulator?: boolean;
}

export const createDeviceInfo = (options: DeviceInfoFactoryOptions = {}): DeviceInfo => ({
  totalMemory: options.totalMemory ?? 8 * 1024 * 1024 * 1024, // 8GB
  usedMemory: options.usedMemory ?? 4 * 1024 * 1024 * 1024, // 4GB
  availableMemory: options.availableMemory ?? 4 * 1024 * 1024 * 1024, // 4GB
  deviceModel: options.deviceModel ?? 'Test Device',
  systemName: options.systemName ?? 'Android',
  systemVersion: options.systemVersion ?? '13',
  isEmulator: options.isEmulator ?? false,
});

export const createLowMemoryDevice = (): DeviceInfo =>
  createDeviceInfo({
    totalMemory: 4 * 1024 * 1024 * 1024, // 4GB
    usedMemory: 3 * 1024 * 1024 * 1024, // 3GB
    availableMemory: 1 * 1024 * 1024 * 1024, // 1GB
  });

export const createHighMemoryDevice = (): DeviceInfo =>
  createDeviceInfo({
    totalMemory: 16 * 1024 * 1024 * 1024, // 16GB
    usedMemory: 4 * 1024 * 1024 * 1024, // 4GB
    availableMemory: 12 * 1024 * 1024 * 1024, // 12GB
  });
