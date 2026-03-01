/**
 * Test Helpers
 *
 * Utility functions for testing WildMe components and services.
 */

import { act } from '@testing-library/react-native';
import { useAppStore } from '../../src/stores/appStore';
import { useAuthStore } from '../../src/stores/authStore';
import {
  createDeviceInfo,
  resetIdCounter,
} from './factories';

// ============================================================================
// Store Reset Utilities
// ============================================================================

/**
 * Resets all Zustand stores to their initial state.
 * Call this in beforeEach() to ensure clean state between tests.
 */
export const resetStores = (): void => {
  // Reset the ID counter for consistent test data
  resetIdCounter();

  // Reset app store
  useAppStore.setState({
    hasCompletedOnboarding: false,
    deviceInfo: null,
    themeMode: 'system',
  });

  // Reset auth store
  useAuthStore.setState({
    isEnabled: false,
    isLocked: true,
    failedAttempts: 0,
    lockoutUntil: null,
    lastBackgroundTime: null,
  });
};

// ============================================================================
// Store Setup Utilities
// ============================================================================

/**
 * Sets up the app store with device info and onboarding complete.
 */
export const setupWithDeviceInfo = (): void => {
  useAppStore.setState({
    hasCompletedOnboarding: true,
    deviceInfo: createDeviceInfo(),
  });
};

// ============================================================================
// Async Utilities
// ============================================================================

/**
 * Waits for all pending promises and state updates to complete.
 * Use this after triggering async operations in tests.
 */
export const flushPromises = async (): Promise<void> => {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
  });
};

/**
 * Waits for a specified amount of time.
 * Use sparingly - prefer flushPromises when possible.
 */
export const wait = async (ms: number): Promise<void> => {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(() => resolve(), ms));
  });
};

/**
 * Waits for a condition to be true, with timeout.
 */
export const waitFor = async (
  condition: () => boolean,
  { timeout = 1000, interval = 50 } = {}
): Promise<void> => {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('waitFor timeout exceeded');
    }
    await wait(interval);
  }
};

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Gets the current state of the app store.
 */
export const getAppState = () => useAppStore.getState();

/**
 * Gets the current state of the auth store.
 */
export const getAuthState = () => useAuthStore.getState();

// ============================================================================
// Mock Utilities
// ============================================================================

/**
 * Creates a mock function that resolves after a delay.
 */
export const createDelayedMock = <T>(value: T, delayMs = 100) =>
  jest.fn(() => new Promise<T>(resolve => setTimeout(() => resolve(value), delayMs)));

/**
 * Creates a mock function that rejects after a delay.
 */
export const createDelayedRejectMock = (error: Error, delayMs = 100) =>
  jest.fn(() => new Promise((_, reject) => setTimeout(() => reject(error), delayMs)));

// ============================================================================
// Subscription Testing
// ============================================================================

/**
 * Collects all values emitted by a subscription during a test.
 */
export const collectSubscriptionValues = <T>(
  subscribe: (listener: (value: T) => void) => () => void
): { values: T[]; unsubscribe: () => void } => {
  const values: T[] = [];
  const unsubscribe = subscribe(value => values.push(value));
  return { values, unsubscribe };
};
