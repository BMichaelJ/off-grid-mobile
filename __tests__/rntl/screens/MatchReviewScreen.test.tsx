/**
 * MatchReviewScreen Tests
 *
 * Tests for the match review screen including:
 * - Renders match review screen with testID
 * - Shows cropped detection image
 * - Shows candidates list
 * - Shows approve buttons on each candidate
 * - Shows "No Match" and "Skip" buttons
 * - Approve updates store and navigates back
 * - No Match updates store and navigates back
 * - Skip navigates back without updating store
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Navigation mocks (must be before component import)
// ---------------------------------------------------------------------------
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: mockGoBack,
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    }),
    useRoute: () => ({
      params: { observationId: 'obs-1', detectionId: 'det-1' },
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
// Test data factories
// ---------------------------------------------------------------------------
const makeCandidate = (overrides: Record<string, any> = {}) => ({
  individualId: 'ind-1',
  score: 0.92,
  source: 'pack' as const,
  refPhotoIndex: 0,
  ...overrides,
});

const makeDetection = (overrides: Record<string, any> = {}) => ({
  id: 'det-1',
  observationId: 'obs-1',
  boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  species: 'zebra_plains',
  speciesConfidence: 0.95,
  croppedImageUri: 'file:///crops/det-1.jpg',
  embedding: [],
  matchResult: {
    topCandidates: [
      makeCandidate({ individualId: 'ind-1', score: 0.92, source: 'pack' }),
      makeCandidate({ individualId: 'ind-2', score: 0.85, source: 'local' }),
    ],
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

// ---------------------------------------------------------------------------
// Wildlife store mock
// ---------------------------------------------------------------------------
const mockUpdateDetection = jest.fn();
let mockObservations = [makeObservation()];
const mockLocalIndividuals = [
  {
    localId: 'ind-2',
    userLabel: 'Stripe Boy',
    species: 'zebra_plains',
    embeddings: [],
    referencePhotos: ['file:///refs/ind-2.jpg'],
    firstSeen: '2025-01-01T00:00:00Z',
    encounterCount: 3,
    syncStatus: 'pending' as const,
    wildbookId: null,
  },
];

jest.mock('../../../src/stores/wildlifeStore', () => ({
  useWildlifeStore: jest.fn((selector?: any) => {
    const state = {
      observations: mockObservations,
      localIndividuals: mockLocalIndividuals,
      updateDetection: mockUpdateDetection,
    };
    return selector ? selector(state) : state;
  }),
}));

// ---------------------------------------------------------------------------
// Import component under test
// ---------------------------------------------------------------------------
import { MatchReviewScreen } from '../../../src/screens/MatchReviewScreen';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('MatchReviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockObservations = [makeObservation()];
  });

  // ==========================================================================
  // Rendering
  // ==========================================================================

  it('renders screen with testID "match-review-screen"', () => {
    const { getByTestId } = render(<MatchReviewScreen />);
    expect(getByTestId('match-review-screen')).toBeTruthy();
  });

  it('shows cropped detection image', () => {
    const { getByTestId } = render(<MatchReviewScreen />);
    expect(getByTestId('cropped-detection-image')).toBeTruthy();
  });

  it('shows detection species and confidence', () => {
    const { getByText } = render(<MatchReviewScreen />);
    expect(getByText('zebra_plains')).toBeTruthy();
    expect(getByText('95%')).toBeTruthy();
  });

  it('shows candidates list', () => {
    const { getByTestId } = render(<MatchReviewScreen />);
    expect(getByTestId('candidates-list')).toBeTruthy();
  });

  it('shows candidate cards for each candidate', () => {
    const { getByTestId } = render(<MatchReviewScreen />);
    expect(getByTestId('candidate-ind-1')).toBeTruthy();
    expect(getByTestId('candidate-ind-2')).toBeTruthy();
  });

  it('shows candidate scores as percentages', () => {
    const { getByText } = render(<MatchReviewScreen />);
    expect(getByText('92%')).toBeTruthy();
    expect(getByText('85%')).toBeTruthy();
  });

  it('shows source badges on candidates', () => {
    const { getAllByText } = render(<MatchReviewScreen />);
    expect(getAllByText('pack').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('local').length).toBeGreaterThanOrEqual(1);
  });

  it('resolves local individual name from store', () => {
    const { getByText } = render(<MatchReviewScreen />);
    expect(getByText('Stripe Boy')).toBeTruthy();
  });

  // ==========================================================================
  // Approve buttons
  // ==========================================================================

  it('shows approve buttons on each candidate', () => {
    const { getByTestId } = render(<MatchReviewScreen />);
    expect(getByTestId('approve-ind-1')).toBeTruthy();
    expect(getByTestId('approve-ind-2')).toBeTruthy();
  });

  // ==========================================================================
  // Actions
  // ==========================================================================

  it('shows "No Match" and "Skip" buttons', () => {
    const { getByTestId, getByText } = render(<MatchReviewScreen />);
    expect(getByTestId('no-match-button')).toBeTruthy();
    expect(getByText(/No Match/)).toBeTruthy();
    expect(getByTestId('skip-button')).toBeTruthy();
    expect(getByText('Skip')).toBeTruthy();
  });

  it('approve updates store and navigates back', () => {
    const { getByTestId } = render(<MatchReviewScreen />);
    fireEvent.press(getByTestId('approve-ind-1'));

    expect(mockUpdateDetection).toHaveBeenCalledWith('obs-1', 'det-1', {
      matchResult: expect.objectContaining({
        approvedIndividual: 'ind-1',
        reviewStatus: 'approved',
      }),
    });
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('No Match updates store with rejected status and navigates back', () => {
    const { getByTestId } = render(<MatchReviewScreen />);
    fireEvent.press(getByTestId('no-match-button'));

    expect(mockUpdateDetection).toHaveBeenCalledWith('obs-1', 'det-1', {
      matchResult: expect.objectContaining({
        approvedIndividual: null,
        reviewStatus: 'rejected',
      }),
    });
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('Skip navigates back without updating store', () => {
    const { getByTestId } = render(<MatchReviewScreen />);
    fireEvent.press(getByTestId('skip-button'));

    expect(mockUpdateDetection).not.toHaveBeenCalled();
    expect(mockGoBack).toHaveBeenCalled();
  });

  // ==========================================================================
  // Edge cases
  // ==========================================================================

  it('shows empty state when no candidates', () => {
    mockObservations = [
      makeObservation([
        makeDetection({
          matchResult: {
            topCandidates: [],
            approvedIndividual: null,
            reviewStatus: 'pending' as const,
          },
        }),
      ]),
    ];

    const { getByText } = render(<MatchReviewScreen />);
    expect(getByText('No candidates found.')).toBeTruthy();
  });

  it('shows header when detection not found', () => {
    mockObservations = [makeObservation([])];

    const { getByText } = render(<MatchReviewScreen />);
    expect(getByText('Detection not found.')).toBeTruthy();
  });

  it('navigates back when back button pressed', () => {
    const { getByTestId } = render(<MatchReviewScreen />);
    fireEvent.press(getByTestId('back-button'));

    expect(mockGoBack).toHaveBeenCalled();
  });
});
