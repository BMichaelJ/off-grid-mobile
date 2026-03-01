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
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
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

// Spy on Alert.alert
jest.spyOn(Alert, 'alert');

import { CaptureScreen } from '../../../src/screens/CaptureScreen';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockProcessPhoto = wildlifePipeline.processPhoto as jest.Mock;
const mockLaunchCamera = launchCamera as jest.Mock;
const mockLaunchImageLibrary = launchImageLibrary as jest.Mock;

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
      miewidModelPath: '/mock/miewid.onnx',
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
