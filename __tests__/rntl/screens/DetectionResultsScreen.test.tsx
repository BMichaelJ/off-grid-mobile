/**
 * DetectionResultsScreen Tests
 *
 * Tests for the detection results screen including:
 * - Renders screen with testID "detection-results-screen"
 * - Shows detection count header (e.g., "2 Detections Found")
 * - Shows "1 Detection Found" for singular
 * - Shows "No Detections Found" for empty
 * - Renders bounding box overlays for each detection
 * - Shows species label on bounding box
 * - Navigates to MatchReview when bounding box tapped
 * - Shows Save All button
 * - Navigates back when Save All is pressed
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

// ---------------------------------------------------------------------------
// Navigation mocks (must be before component import)
// ---------------------------------------------------------------------------
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    }),
    useRoute: () => ({
      params: { observationId: 'obs-1' },
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
    useSafeAreaInsets: jest.fn(() => ({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    })),
  };
});

// ---------------------------------------------------------------------------
// Wildlife store mock
// ---------------------------------------------------------------------------
const makeDetection = (overrides: Record<string, any> = {}) => ({
  id: 'det-1',
  observationId: 'obs-1',
  boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  species: 'zebra_plains',
  speciesConfidence: 0.95,
  croppedImageUri: 'file:///crops/det-1.jpg',
  embedding: [],
  matchResult: {
    topCandidates: [],
    approvedIndividual: null,
    reviewStatus: 'pending' as const,
  },
  encounterFields: {
    locationId: null,
    sex: null,
    lifeStage: null,
    behavior: null,
    submitterId: null,
    projectId: null,
  },
  ganeshaSubmissionId: null,
  ...overrides,
});

const makeObservation = (
  detections: ReturnType<typeof makeDetection>[] = [makeDetection()],
) => ({
  id: 'obs-1',
  photoUri: 'file:///test/photo.jpg',
  gps: null,
  timestamp: '2025-01-01T00:00:00Z',
  deviceInfo: { model: 'test', os: 'test' },
  fieldNotes: null,
  detections,
  createdAt: '2025-01-01T00:00:00Z',
});

let mockObservations = [makeObservation()];
const mockUpdateObservationNotes = jest.fn(() => Promise.resolve());

jest.mock('../../../src/stores/wildlifeStore', () => ({
  useWildlifeStore: jest.fn((selector?: any) => {
    const state = {
      observations: mockObservations,
      updateObservationNotes: mockUpdateObservationNotes,
    };
    return selector ? selector(state) : state;
  }),
}));

// ---------------------------------------------------------------------------
// Import component under test
// ---------------------------------------------------------------------------
import { DetectionResultsScreen } from '../../../src/screens/DetectionResultsScreen';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('DetectionResultsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateObservationNotes.mockResolvedValue(undefined);
    mockObservations = [makeObservation()];
  });

  // ==========================================================================
  // Rendering
  // ==========================================================================

  it('renders screen with testID "detection-results-screen"', () => {
    const { getByTestId } = render(<DetectionResultsScreen />);
    expect(getByTestId('detection-results-screen')).toBeTruthy();
  });

  it('shows detection count header for multiple detections', () => {
    const twoDetections = [
      makeDetection({ id: 'det-1' }),
      makeDetection({ id: 'det-2', species: 'giraffe' }),
    ];
    mockObservations = [makeObservation(twoDetections)];

    const { getByText } = render(<DetectionResultsScreen />);
    expect(getByText('2 Detections Found')).toBeTruthy();
  });

  it('shows "1 Detection Found" for singular', () => {
    mockObservations = [makeObservation([makeDetection()])];

    const { getByText } = render(<DetectionResultsScreen />);
    expect(getByText('1 Detection Found')).toBeTruthy();
  });

  it('shows "No Detections Found" for empty', () => {
    mockObservations = [makeObservation([])];

    const { getByText } = render(<DetectionResultsScreen />);
    expect(getByText('No Detections Found')).toBeTruthy();
  });

  // ==========================================================================
  // Bounding Box Overlays
  // ==========================================================================

  it('renders bounding box overlays for each detection', () => {
    const twoDetections = [
      makeDetection({ id: 'det-1' }),
      makeDetection({ id: 'det-2' }),
    ];
    mockObservations = [makeObservation(twoDetections)];

    const { getByTestId } = render(<DetectionResultsScreen />);
    expect(getByTestId('bounding-box-det-1')).toBeTruthy();
    expect(getByTestId('bounding-box-det-2')).toBeTruthy();
  });

  it('shows species label on bounding box', () => {
    mockObservations = [
      makeObservation([makeDetection({ species: 'zebra_plains' })]),
    ];

    const { getByText } = render(<DetectionResultsScreen />);
    expect(getByText('zebra_plains')).toBeTruthy();
  });

  // ==========================================================================
  // Navigation
  // ==========================================================================

  it('persists notes before navigating to MatchReview', async () => {
    mockObservations = [makeObservation([makeDetection({ id: 'det-1' })])];

    const { getByTestId } = render(<DetectionResultsScreen />);
    fireEvent.changeText(
      getByTestId('observation-notes-input'),
      '  Herd moving north  ',
    );
    fireEvent.press(getByTestId('bounding-box-det-1'));

    await waitFor(() => {
      expect(mockUpdateObservationNotes).toHaveBeenCalledWith(
        'obs-1',
        'Herd moving north',
      );
      expect(mockNavigate).toHaveBeenCalledWith('MatchReview', {
        observationId: 'obs-1',
        detectionId: 'det-1',
      });
    });
  });

  it('does not open MatchReview when notes fail to persist', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUpdateObservationNotes.mockRejectedValueOnce(new Error('disk full'));
    const { getByTestId } = render(<DetectionResultsScreen />);

    fireEvent.press(getByTestId('bounding-box-det-1'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Could not save observation',
        'disk full',
      );
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // Save All Button
  // ==========================================================================

  it('shows Save All button', () => {
    const { getByText } = render(<DetectionResultsScreen />);
    expect(getByText('Save All')).toBeTruthy();
  });

  it('shows an optional observation notes field', () => {
    const { getByTestId, getByText } = render(<DetectionResultsScreen />);

    expect(getByText('Observation notes')).toBeTruthy();
    expect(getByTestId('observation-notes-input')).toBeTruthy();
  });

  it('persists trimmed notes before navigating back', async () => {
    const { getByTestId } = render(<DetectionResultsScreen />);
    fireEvent.changeText(
      getByTestId('observation-notes-input'),
      '  Herd moving north  ',
    );
    fireEvent.press(getByTestId('save-all-button'));

    await waitFor(() => {
      expect(mockUpdateObservationNotes).toHaveBeenCalledWith(
        'obs-1',
        'Herd moving north',
      );
    });
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('persists blank notes as null', async () => {
    const { getByTestId } = render(<DetectionResultsScreen />);
    fireEvent.changeText(getByTestId('observation-notes-input'), '   ');
    fireEvent.press(getByTestId('save-all-button'));

    await waitFor(() => {
      expect(mockUpdateObservationNotes).toHaveBeenCalledWith('obs-1', null);
    });
  });

  it('does not navigate back when notes fail to persist', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUpdateObservationNotes.mockRejectedValueOnce(new Error('disk full'));
    const { getByTestId } = render(<DetectionResultsScreen />);
    fireEvent.press(getByTestId('save-all-button'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Could not save observation',
        'disk full',
      );
    });
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // Bottom inset (Android gesture/navigation bar regression)
  // ==========================================================================

  it('pushes the footer above the device bottom inset instead of a fixed padding', () => {
    const { useSafeAreaInsets } = require('react-native-safe-area-context');
    (useSafeAreaInsets as jest.Mock).mockReturnValue({
      top: 0,
      right: 0,
      bottom: 48,
      left: 0,
    });

    const { getByTestId } = render(<DetectionResultsScreen />);
    const footer = getByTestId('detection-results-footer');
    const flattened = Object.assign(
      {},
      ...(Array.isArray(footer.props.style)
        ? footer.props.style
        : [footer.props.style]),
    );
    expect(flattened.paddingBottom).toBeGreaterThanOrEqual(48);
  });
});
