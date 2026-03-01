/**
 * PacksScreen Tests
 *
 * Tests for the embedding packs list screen including:
 * - Empty state when no packs downloaded
 * - Pack card rendering with species name, individual count, export date, size
 * - Multiple packs rendering
 * - Navigation to PackDetails on pack tap
 * - Correct testIDs
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { useWildlifeStore } from '../../../src/stores/wildlifeStore';
import type { EmbeddingPack } from '../../../src/types/wildlife';

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    }),
    useIsFocused: () => true,
    useFocusEffect: jest.fn(),
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

jest.mock('../../../src/components/AnimatedEntry', () => ({
  AnimatedEntry: ({ children }: any) => children,
}));

jest.mock('../../../src/components/AnimatedListItem', () => ({
  AnimatedListItem: ({ children, onPress, style, testID }: any) => {
    const { TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity style={style} onPress={onPress} testID={testID}>
        {children}
      </TouchableOpacity>
    );
  },
}));

import { PacksScreen } from '../../../src/screens/PacksScreen';

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

const createPack = (overrides: Partial<EmbeddingPack> = {}): EmbeddingPack => ({
  id: 'pack-1',
  species: 'Megaptera novaeangliae',
  featureClass: 'fluke',
  displayName: 'Humpback Whale — Fluke',
  wildbookInstanceUrl: 'https://flukebook.org',
  exportDate: '2025-06-15T00:00:00Z',
  individualCount: 342,
  embeddingDim: 256,
  embeddingModelVersion: '1.0.0',
  detectorModelFile: 'detector.onnx',
  embeddingsFile: 'embeddings.bin',
  indexFile: 'index.bin',
  referencePhotosDir: '/packs/pack-1/photos',
  packDir: '/packs/pack-1',
  downloadedAt: '2025-07-01T12:00:00Z',
  sizeBytes: 52_428_800, // 50 MB
  ...overrides,
});

describe('PacksScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWildlifeStore.setState({ packs: [] });
  });

  // ==========================================================================
  // Empty State
  // ==========================================================================
  describe('empty state', () => {
    it('renders the screen container with correct testID', () => {
      const { getByTestId } = render(<PacksScreen />);
      expect(getByTestId('packs-screen')).toBeTruthy();
    });

    it('shows "Packs" title', () => {
      const { getByText } = render(<PacksScreen />);
      expect(getByText('Packs')).toBeTruthy();
    });

    it('shows "No Packs Downloaded" when there are no packs', () => {
      const { getByText } = render(<PacksScreen />);
      expect(getByText('No Packs Downloaded')).toBeTruthy();
    });

    it('shows empty state description', () => {
      const { getByText } = render(<PacksScreen />);
      expect(
        getByText(/Download an embedding pack to start identifying individuals/),
      ).toBeTruthy();
    });

    it('does not render any pack cards in empty state', () => {
      const { queryByTestId } = render(<PacksScreen />);
      expect(queryByTestId('pack-card-0')).toBeNull();
    });
  });

  // ==========================================================================
  // Pack Card Rendering
  // ==========================================================================
  describe('pack card rendering', () => {
    it('renders species display name', () => {
      const pack = createPack({ displayName: 'Humpback Whale — Fluke' });
      useWildlifeStore.setState({ packs: [pack] });

      const { getByText } = render(<PacksScreen />);
      expect(getByText('Humpback Whale — Fluke')).toBeTruthy();
    });

    it('renders individual count', () => {
      const pack = createPack({ individualCount: 342 });
      useWildlifeStore.setState({ packs: [pack] });

      const { getByText } = render(<PacksScreen />);
      expect(getByText('342 individuals')).toBeTruthy();
    });

    it('renders formatted export date', () => {
      const pack = createPack({ exportDate: '2025-06-15T00:00:00Z' });
      useWildlifeStore.setState({ packs: [pack] });

      const { getByText } = render(<PacksScreen />);
      // toLocaleDateString() format varies by locale, just check it contains "Exported:"
      expect(getByText(/Exported:/)).toBeTruthy();
    });

    it('renders formatted size in MB', () => {
      const pack = createPack({ sizeBytes: 52_428_800 }); // 50 MB
      useWildlifeStore.setState({ packs: [pack] });

      const { getByText } = render(<PacksScreen />);
      expect(getByText(/50\.0 MB/)).toBeTruthy();
    });

    it('renders formatted size in GB', () => {
      const pack = createPack({ sizeBytes: 2_147_483_648 }); // 2 GB
      useWildlifeStore.setState({ packs: [pack] });

      const { getByText } = render(<PacksScreen />);
      expect(getByText(/2\.0 GB/)).toBeTruthy();
    });

    it('renders formatted size in KB', () => {
      const pack = createPack({ sizeBytes: 512_000 }); // ~500 KB
      useWildlifeStore.setState({ packs: [pack] });

      const { getByText } = render(<PacksScreen />);
      expect(getByText(/500\.0 KB/)).toBeTruthy();
    });

    it('does not show empty state when packs exist', () => {
      const pack = createPack();
      useWildlifeStore.setState({ packs: [pack] });

      const { queryByText } = render(<PacksScreen />);
      expect(queryByText('No Packs Downloaded')).toBeNull();
    });
  });

  // ==========================================================================
  // Multiple Packs
  // ==========================================================================
  describe('multiple packs', () => {
    it('renders all packs in the list', () => {
      const packs = [
        createPack({
          id: 'pack-1',
          displayName: 'Humpback Whale — Fluke',
          individualCount: 342,
        }),
        createPack({
          id: 'pack-2',
          displayName: 'Wild Dog — Coat Pattern',
          individualCount: 89,
          sizeBytes: 1_073_741_824, // 1 GB
        }),
      ];
      useWildlifeStore.setState({ packs });

      const { getByText } = render(<PacksScreen />);
      expect(getByText('Humpback Whale — Fluke')).toBeTruthy();
      expect(getByText('Wild Dog — Coat Pattern')).toBeTruthy();
      expect(getByText('342 individuals')).toBeTruthy();
      expect(getByText('89 individuals')).toBeTruthy();
    });
  });

  // ==========================================================================
  // Navigation
  // ==========================================================================
  describe('navigation', () => {
    it('navigates to PackDetails when a pack is tapped', () => {
      const pack = createPack({ id: 'pack-abc' });
      useWildlifeStore.setState({ packs: [pack] });

      const { getByTestId } = render(<PacksScreen />);
      fireEvent.press(getByTestId('pack-card-0'));

      expect(mockNavigate).toHaveBeenCalledWith('PackDetails', {
        packId: 'pack-abc',
      });
    });

    it('navigates with correct packId for second pack', () => {
      const packs = [
        createPack({ id: 'pack-1', displayName: 'Pack A' }),
        createPack({ id: 'pack-2', displayName: 'Pack B' }),
      ];
      useWildlifeStore.setState({ packs });

      const { getByTestId } = render(<PacksScreen />);
      fireEvent.press(getByTestId('pack-card-1'));

      expect(mockNavigate).toHaveBeenCalledWith('PackDetails', {
        packId: 'pack-2',
      });
    });
  });

  // ==========================================================================
  // Test IDs
  // ==========================================================================
  describe('testIDs', () => {
    it('has packs-screen testID on root container', () => {
      const { getByTestId } = render(<PacksScreen />);
      expect(getByTestId('packs-screen')).toBeTruthy();
    });

    it('has pack-card-{index} testID on each pack card', () => {
      const packs = [
        createPack({ id: 'pack-1', displayName: 'Pack A' }),
        createPack({ id: 'pack-2', displayName: 'Pack B' }),
        createPack({ id: 'pack-3', displayName: 'Pack C' }),
      ];
      useWildlifeStore.setState({ packs });

      const { getByTestId } = render(<PacksScreen />);
      expect(getByTestId('pack-card-0')).toBeTruthy();
      expect(getByTestId('pack-card-1')).toBeTruthy();
      expect(getByTestId('pack-card-2')).toBeTruthy();
    });
  });
});
