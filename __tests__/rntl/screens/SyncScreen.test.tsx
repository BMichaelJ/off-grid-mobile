/**
 * SyncScreen Tests
 *
 * Tests for the sync queue stub screen including:
 * - Screen renders with correct testID
 * - Header title "Sync Queue"
 * - Sync All button with "not yet implemented" alert
 * - Sync queue item rendering with status indicators
 * - Retry button for failed items
 * - Error message display
 * - Empty state
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { useWildlifeStore } from '../../../src/stores/wildlifeStore';
import { initDatabase } from '../../../src/services/database';
import type { SyncQueueItem } from '../../../src/types/wildlife';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    }),
    useRoute: () => ({ params: {} }),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaView: ({ children, testID, style }: any) => (
      <View testID={testID} style={style}>
        {children}
      </View>
    ),
    useSafeAreaInsets: jest.fn(() => ({ top: 0, right: 0, bottom: 0, left: 0 })),
  };
});

jest.mock('react-native-vector-icons/Feather', () => {
  const { Text } = require('react-native');
  return (props: Record<string, unknown>) => <Text>{String(props.name)}</Text>;
});

import { SyncScreen } from '../../../src/screens/SyncScreen';

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

const createSyncItem = (
  overrides: Partial<SyncQueueItem> = {},
): SyncQueueItem => ({
  observationId: 'obs-abc123def456',
  status: 'pending',
  wildbookInstanceUrl: 'https://flukebook.org',
  retryCount: 0,
  lastError: null,
  lastAttempt: null,
  syncedAt: null,
  wildbookEncounterIds: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SyncScreen', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useWildlifeStore.setState({ syncQueue: [] });
  });

  // ==========================================================================
  // Screen structure
  // ==========================================================================

  it('renders screen with testID "sync-screen"', () => {
    const { getByTestId } = render(<SyncScreen />);
    expect(getByTestId('sync-screen')).toBeTruthy();
  });

  it('shows "Sync Queue" title', () => {
    const { getByText } = render(<SyncScreen />);
    expect(getByText('Sync Queue')).toBeTruthy();
  });

  // ==========================================================================
  // Sync All button
  // ==========================================================================

  it('shows "Sync All" button', () => {
    const { getByTestId, getByText } = render(<SyncScreen />);
    expect(getByTestId('sync-all-button')).toBeTruthy();
    expect(getByText('Sync All')).toBeTruthy();
  });

  it('Sync All shows alert with "not yet implemented" message', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId } = render(<SyncScreen />);

    fireEvent.press(getByTestId('sync-all-button'));

    expect(alertSpy).toHaveBeenCalledWith('Sync', 'Sync not yet implemented');
  });

  // ==========================================================================
  // Sync queue items
  // ==========================================================================

  it('shows sync queue items with status', () => {
    const items = [
      createSyncItem({ observationId: 'obs-111', status: 'pending' }),
      createSyncItem({ observationId: 'obs-222', status: 'synced' }),
    ];
    useWildlifeStore.setState({ syncQueue: items });

    const { getByTestId } = render(<SyncScreen />);
    expect(getByTestId('sync-item-0')).toBeTruthy();
    expect(getByTestId('sync-item-1')).toBeTruthy();
  });

  it('shows pending status indicator', () => {
    useWildlifeStore.setState({
      syncQueue: [createSyncItem({ status: 'pending' })],
    });

    const { getByTestId, getByText } = render(<SyncScreen />);
    expect(getByTestId('sync-status-pending')).toBeTruthy();
    expect(getByText('Pending')).toBeTruthy();
  });

  it('shows synced status indicator', () => {
    useWildlifeStore.setState({
      syncQueue: [createSyncItem({ status: 'synced' })],
    });

    const { getByTestId, getByText } = render(<SyncScreen />);
    expect(getByTestId('sync-status-synced')).toBeTruthy();
    expect(getByText('Synced')).toBeTruthy();
  });

  it('shows failed status indicator', () => {
    useWildlifeStore.setState({
      syncQueue: [createSyncItem({ status: 'failed' })],
    });

    const { getByTestId, getByText } = render(<SyncScreen />);
    expect(getByTestId('sync-status-failed')).toBeTruthy();
    expect(getByText('Failed')).toBeTruthy();
  });

  // ==========================================================================
  // Retry button
  // ==========================================================================

  it('shows retry button for failed items', () => {
    useWildlifeStore.setState({
      syncQueue: [createSyncItem({ status: 'failed' })],
    });

    const { getByTestId } = render(<SyncScreen />);
    expect(getByTestId('sync-retry-0')).toBeTruthy();
  });

  it('does not show retry button for pending items', () => {
    useWildlifeStore.setState({
      syncQueue: [createSyncItem({ status: 'pending' })],
    });

    const { queryByTestId } = render(<SyncScreen />);
    expect(queryByTestId('sync-retry-0')).toBeNull();
  });

  it('does not show retry button for synced items', () => {
    useWildlifeStore.setState({
      syncQueue: [createSyncItem({ status: 'synced' })],
    });

    const { queryByTestId } = render(<SyncScreen />);
    expect(queryByTestId('sync-retry-0')).toBeNull();
  });

  it('retry button updates status to pending and increments retryCount', () => {
    const item = createSyncItem({
      observationId: 'obs-fail',
      status: 'failed',
      retryCount: 2,
    });
    useWildlifeStore.setState({ syncQueue: [item] });

    const { getByTestId } = render(<SyncScreen />);
    fireEvent.press(getByTestId('sync-retry-0'));

    const updated = useWildlifeStore.getState().syncQueue[0];
    expect(updated.status).toBe('pending');
    expect(updated.retryCount).toBe(3);
  });

  // ==========================================================================
  // Error messages
  // ==========================================================================

  it('shows error message for failed items', () => {
    useWildlifeStore.setState({
      syncQueue: [
        createSyncItem({
          status: 'failed',
          lastError: 'Network timeout',
        }),
      ],
    });

    const { getByText } = render(<SyncScreen />);
    expect(getByText('Network timeout')).toBeTruthy();
  });

  it('does not show error text when lastError is null', () => {
    useWildlifeStore.setState({
      syncQueue: [createSyncItem({ status: 'pending', lastError: null })],
    });

    const { queryByTestId } = render(<SyncScreen />);
    expect(queryByTestId('sync-error-0')).toBeNull();
  });

  // ==========================================================================
  // Empty state
  // ==========================================================================

  it('shows empty state when no queue items', () => {
    useWildlifeStore.setState({ syncQueue: [] });

    const { getByText } = render(<SyncScreen />);
    expect(getByText('No items in sync queue')).toBeTruthy();
  });

  it('does not show empty state when queue has items', () => {
    useWildlifeStore.setState({
      syncQueue: [createSyncItem()],
    });

    const { queryByText } = render(<SyncScreen />);
    expect(queryByText('No items in sync queue')).toBeNull();
  });

  // ==========================================================================
  // Observation ID truncation
  // ==========================================================================

  it('truncates long observation IDs', () => {
    useWildlifeStore.setState({
      syncQueue: [
        createSyncItem({ observationId: 'obs-abc123def456' }),
      ],
    });

    const { getByText } = render(<SyncScreen />);
    expect(getByText('obs-abc123de...')).toBeTruthy();
  });

  it('shows full ID when short enough', () => {
    useWildlifeStore.setState({
      syncQueue: [createSyncItem({ observationId: 'obs-short' })],
    });

    const { getByText } = render(<SyncScreen />);
    expect(getByText('obs-short')).toBeTruthy();
  });
});
