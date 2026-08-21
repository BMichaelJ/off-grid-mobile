/**
 * CaptureScreen Tests
 *
 * Tests for the wildlife capture screen including:
 * - Renders capture screen with testID
 * - Shows "Take Photo" button
 * - Shows "Choose from Gallery" button
 * - Calls image picker when "Take Photo" pressed
 * - Calls image picker when "Choose from Gallery" pressed
 * - Shows loading state while pipeline is processing
 * - Navigates to DetectionResults after successful pipeline run
 * - Shows error alert when pipeline fails
 * - Shows cancel state when user cancels photo selection
 * - Saves observation with device info from Platform API
 * - Passes GPS as null (stub) to pipeline and observation
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { wildlifePipeline } from '../../../src/services/wildlifePipeline';
import { useWildlifeStore } from '../../../src/stores/wildlifeStore';

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

// Mock wildlifePipeline
jest.mock('../../../src/services/wildlifePipeline', () => ({
  wildlifePipeline: {
    processPhoto: jest.fn(),
  },
}));

// Mock packManager (used by loadDetectorConfig in useCaptureFlow)
jest.mock('../../../src/services/packManager', () => ({
  packManager: {
    loadManifest: jest.fn().mockRejectedValue(new Error('no manifest')),
  },
}));

// Mock embeddingDatabaseBuilder (used by useCaptureFlow)
jest.mock('../../../src/services/embeddingDatabaseBuilder', () => ({
  buildEmbeddingDatabase: jest.fn().mockResolvedValue([]),
}));

// Spy on Alert.alert
jest.spyOn(Alert, 'alert');

import { CaptureScreen } from '../../../src/screens/CaptureScreen';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockProcessPhoto = wildlifePipeline.processPhoto as jest.Mock;
const mockLaunchCamera = launchCamera as jest.Mock;
const mockLaunchImageLibrary = launchImageLibrary as jest.Mock;

const makeTestPack = (overrides: Record<string, unknown> = {}) => ({
  id: 'pack-1',
  species: 'horse_wild',
  featureClass: 'face',
  displayName: 'Wild Horse - Face',
  wildbookInstanceUrl: 'https://horses.wildbook.org',
  exportDate: '2026-04-25T00:00:00Z',
  individualCount: 5,
  embeddingDim: 2152,
  embeddingModelVersion: '4.1.0',
  detectorModelFile: '/packs/horse/detector.onnx',
  embeddingsFile: '/packs/horse/embeddings.bin',
  indexFile: '/packs/horse/index.json',
  referencePhotosDir: '/packs/horse/photos',
  packDir: '/packs/horse',
  downloadedAt: '2026-04-25T12:00:00Z',
  sizeBytes: 9_000_000,
  ...overrides,
});

const MOCK_PIPELINE_RESULT = {
  observationId: 'obs-123',
  photoUri: 'file:///mock/camera.jpg',
  detections: [],
  totalInferenceTimeMs: 150,
};

describe('CaptureScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWildlifeStore.setState({
      packs: [],
      observations: [],
      miewidModel: {
        path: '/mock/miewid.onnx',
        name: 'miewid',
        version: '4.1.0',
        sha256: 'abc123',
        sizeBytes: 1000,
        status: 'ready',
        verifiedAt: '2026-08-01T00:00:00.000Z',
      },
    });
    mockProcessPhoto.mockResolvedValue(MOCK_PIPELINE_RESULT);
    mockLaunchCamera.mockResolvedValue({
      assets: [{ uri: 'file:///mock/camera.jpg' }],
    });
    mockLaunchImageLibrary.mockResolvedValue({
      assets: [{ uri: 'file:///mock/gallery.jpg' }],
    });
  });

  // ==========================================================================
  // Rendering
  // ==========================================================================

  it('renders capture screen with testID', () => {
    const { getByTestId } = render(<CaptureScreen />);
    expect(getByTestId('capture-screen')).toBeTruthy();
  });

  it('shows "Take Photo" button', () => {
    const { getByText } = render(<CaptureScreen />);
    expect(getByText('Take Photo')).toBeTruthy();
  });

  it('shows "Choose from Gallery" button', () => {
    const { getByText } = render(<CaptureScreen />);
    expect(getByText('Choose from Gallery')).toBeTruthy();
  });

  // ==========================================================================
  // Image Picker Interactions
  // ==========================================================================

  it('calls image picker when "Take Photo" pressed', async () => {
    const { getByTestId } = render(<CaptureScreen />);
    fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() => {
      expect(mockLaunchCamera).toHaveBeenCalledWith({
        mediaType: 'photo',
        quality: 1,
      });
    });
  });

  it('calls image picker when "Choose from Gallery" pressed', async () => {
    const { getByTestId } = render(<CaptureScreen />);
    fireEvent.press(getByTestId('choose-gallery-button'));

    await waitFor(() => {
      expect(mockLaunchImageLibrary).toHaveBeenCalledWith({
        mediaType: 'photo',
        quality: 1,
      });
    });
  });

  // ==========================================================================
  // Processing State
  // ==========================================================================

  it('shows loading state while pipeline is processing', async () => {
    // Make processPhoto hang until we resolve it
    let resolveProcessPhoto!: (value: any) => void;
    mockProcessPhoto.mockReturnValue(
      new Promise((resolve) => {
        resolveProcessPhoto = resolve;
      }),
    );

    const { getByTestId, getByText } = render(<CaptureScreen />);
    fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() => {
      expect(getByText('Processing...')).toBeTruthy();
    });

    // Resolve to clean up and wait for state update to settle
    await act(async () => {
      resolveProcessPhoto(MOCK_PIPELINE_RESULT);
    });
  });

  // ==========================================================================
  // Navigation After Success
  // ==========================================================================

  it('navigates to DetectionResults after successful pipeline run', async () => {
    const { getByTestId } = render(<CaptureScreen />);
    fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        'DetectionResults',
        { observationId: 'obs-123' },
      );
    });
  });

  // ==========================================================================
  // Device Info & GPS
  // ==========================================================================

  it('saves observation with device info from Platform API', async () => {
    const { getByTestId } = render(<CaptureScreen />);
    fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });

    const observations = useWildlifeStore.getState().observations;
    expect(observations).toHaveLength(1);
    expect(observations[0].deviceInfo).toEqual({
      model: Platform.OS,
      os: `${Platform.OS} ${Platform.Version}`,
    });
  });

  it('saves GPS as null (stub) in observation', async () => {
    const { getByTestId } = render(<CaptureScreen />);
    fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });

    // GPS saved in observation (pipeline no longer receives GPS)
    const observations = useWildlifeStore.getState().observations;
    expect(observations[0].gps).toBeNull();
  });

  // ==========================================================================
  // MiewID model gate
  // ==========================================================================

  it('blocks capture when no MiewID model record exists', async () => {
    useWildlifeStore.setState({ miewidModel: null });

    const { getByTestId } = render(<CaptureScreen />);
    fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'MiewID model not ready',
        expect.any(String),
      );
    });
    expect(wildlifePipeline.processPhoto).not.toHaveBeenCalled();
  });

  it('blocks capture when the MiewID model is corrupt', async () => {
    useWildlifeStore.setState({
      miewidModel: {
        path: '/mock/miewid.onnx',
        name: 'miewid',
        version: '4.1.0',
        sha256: 'abc123',
        sizeBytes: 1000,
        status: 'corrupt',
        verifiedAt: null,
      },
    });

    const { getByTestId } = render(<CaptureScreen />);
    fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'MiewID model not ready',
        expect.stringContaining('corrupt'),
      );
    });
    expect(wildlifePipeline.processPhoto).not.toHaveBeenCalled();
  });

  it('excludes quarantined packs from capture', async () => {
    useWildlifeStore.setState({
      packs: [
        makeTestPack({ id: 'pack-healthy', status: 'ready' }),
        makeTestPack({ id: 'pack-broken', status: 'quarantined' }),
      ],
    });

    const { getByTestId } = render(<CaptureScreen />);
    fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() => {
      expect(wildlifePipeline.processPhoto).toHaveBeenCalled();
    });
    const call = (wildlifePipeline.processPhoto as jest.Mock).mock.calls[0][0];
    expect(call.speciesConfigs).toHaveLength(1);
    expect(call.speciesConfigs[0].packId).toBe('pack-healthy');
  });

  it('excludes packs with an incompatible embedding model version', async () => {
    useWildlifeStore.setState({
      packs: [
        makeTestPack({ id: 'pack-compatible', embeddingModelVersion: '4.1.0' }),
        makeTestPack({ id: 'pack-incompatible', embeddingModelVersion: '1.0.0' }),
      ],
    });

    const { getByTestId } = render(<CaptureScreen />);
    fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() => {
      expect(wildlifePipeline.processPhoto).toHaveBeenCalled();
    });
    const call = (wildlifePipeline.processPhoto as jest.Mock).mock.calls[0][0];
    expect(call.speciesConfigs).toHaveLength(1);
    expect(call.speciesConfigs[0].packId).toBe('pack-compatible');
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  it('shows error alert when pipeline fails', async () => {
    mockProcessPhoto.mockRejectedValue(new Error('Detection model failed'));

    const { getByTestId } = render(<CaptureScreen />);
    fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Detection Failed',
        'Detection model failed',
      );
    });
  });

  // ==========================================================================
  // Cancel State
  // ==========================================================================

  it('does not process when user cancels photo selection', async () => {
    mockLaunchCamera.mockResolvedValue({ didCancel: true });

    const { getByTestId } = render(<CaptureScreen />);
    fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() => {
      expect(mockLaunchCamera).toHaveBeenCalled();
    });

    expect(mockProcessPhoto).not.toHaveBeenCalled();
  });
});
