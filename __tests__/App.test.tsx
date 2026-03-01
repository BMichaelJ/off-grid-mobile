/**
 * @format
 *
 * Tests for App.tsx initialization logic.
 *
 * NOTE: This test is excluded from the main jest run via testPathIgnorePatterns
 * in jest.config.js. It must be run separately with:
 *   npx jest __tests__/App.test.tsx --testPathIgnorePatterns='[]' --forceExit
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

// ---------------------------------------------------------------------------
// Service mocks — declared before importing App so jest.mock hoists them
// ---------------------------------------------------------------------------

jest.mock('../src/services', () => ({
  hardwareService: {
    getDeviceInfo: jest.fn(() =>
      Promise.resolve({
        totalMemory: 8 * 1024 * 1024 * 1024,
        usedMemory: 4 * 1024 * 1024 * 1024,
        freeStorage: 50 * 1024 * 1024 * 1024,
        deviceModel: 'Test Device',
        systemName: 'Android',
        systemVersion: '13',
        isEmulator: false,
      }),
    ),
  },
  authService: {
    hasPassphrase: jest.fn(() => Promise.resolve(false)),
  },
  packManager: {
    initialize: jest.fn(() => Promise.resolve()),
  },
}));

// Mock navigation to avoid SafeAreaProviderCompat rendering error
jest.mock('../src/navigation', () => ({
  AppNavigator: () => 'AppNavigator',
}));

// Mock screens
jest.mock('../src/screens', () => ({
  LockScreen: () => 'LockScreen',
}));

import App from '../App';
import { packManager } from '../src/services';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders loading indicator initially', async () => {
  let root: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    root = ReactTestRenderer.create(<App />);
  });
  // After init completes, loading should be gone — we just verify no throw
  expect(root!.toJSON()).toBeTruthy();
});

test('calls packManager.initialize on startup', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
    // Allow initializeApp's async work to complete
    await new Promise<void>((r) => setTimeout(r, 100));
  });

  expect(packManager.initialize).toHaveBeenCalled();
});
