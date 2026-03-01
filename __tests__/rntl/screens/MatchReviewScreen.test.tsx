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
 * - Approve for local individual accumulates embedding
 * - Approve for pack individual does not accumulate embedding
 * - No Match creates a new LocalIndividual and approves it
 * - No Match includes firstSeen timestamp
 * - No Match uses field ID from getNextFieldId
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
  embedding: [0.1, 0.2, 0.3],
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
const mockAddLocalIndividual = jest.fn();
const mockAddEmbeddingToLocalIndividual = jest.fn();
const mockGetNextFieldId = jest.fn(() => 'FIELD-001');
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

const mockGetState = () => ({
  observations: mockObservations,
  localIndividuals: mockLocalIndividuals,
  updateDetection: mockUpdateDetection,
  addLocalIndividual: mockAddLocalIndividual,
  addEmbeddingToLocalIndividual: mockAddEmbeddingToLocalIndividual,
  getNextFieldId: mockGetNextFieldId,
});

jest.mock('../../../src/stores/wildlifeStore', () => {
  const hook = (selector?: any) => {
    const state = mockGetState();
    return selector ? selector(state) : state;
  };
  hook.getState = () => mockGetState();
  return { useWildlifeStore: hook };
});

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

  it('approve for local individual accumulates embedding', () => {
    const { getByTestId } = render(<MatchReviewScreen />);
    // ind-2 is the local candidate in our test data
    fireEvent.press(getByTestId('approve-ind-2'));

    expect(mockAddEmbeddingToLocalIndividual).toHaveBeenCalledWith(
      'ind-2',
      [0.1, 0.2, 0.3],
      'file:///crops/det-1.jpg',
    );
    expect(mockUpdateDetection).toHaveBeenCalledWith('obs-1', 'det-1', {
      matchResult: expect.objectContaining({
        approvedIndividual: 'ind-2',
        reviewStatus: 'approved',
      }),
    });
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('approve for pack individual does not accumulate embedding', () => {
    const { getByTestId } = render(<MatchReviewScreen />);
    // ind-1 is the pack candidate in our test data
    fireEvent.press(getByTestId('approve-ind-1'));

    expect(mockAddEmbeddingToLocalIndividual).not.toHaveBeenCalled();
    expect(mockUpdateDetection).toHaveBeenCalledWith('obs-1', 'det-1', {
      matchResult: expect.objectContaining({
        approvedIndividual: 'ind-1',
        reviewStatus: 'approved',
      }),
    });
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('No Match creates a new local individual and approves it', () => {
    const { getByTestId } = render(<MatchReviewScreen />);
    fireEvent.press(getByTestId('no-match-button'));

    // Should have called getNextFieldId to generate an ID
    expect(mockGetNextFieldId).toHaveBeenCalled();

    // Should create a new local individual with the detection's data
    expect(mockAddLocalIndividual).toHaveBeenCalledWith(
      expect.objectContaining({
        localId: 'FIELD-001',
        userLabel: null,
        species: 'zebra_plains',
        embeddings: [[0.1, 0.2, 0.3]],
        referencePhotos: ['file:///crops/det-1.jpg'],
        encounterCount: 1,
        syncStatus: 'pending',
        wildbookId: null,
      }),
    );

    // Should update detection with new individual ID and approved status
    expect(mockUpdateDetection).toHaveBeenCalledWith('obs-1', 'det-1', {
      matchResult: expect.objectContaining({
        approvedIndividual: 'FIELD-001',
        reviewStatus: 'approved',
      }),
    });
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('No Match includes firstSeen timestamp in new individual', () => {
    const fixedDate = '2026-02-28T12:00:00.000Z';
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(fixedDate);

    const { getByTestId } = render(<MatchReviewScreen />);
    fireEvent.press(getByTestId('no-match-button'));

    expect(mockAddLocalIndividual).toHaveBeenCalledWith(
      expect.objectContaining({
        firstSeen: fixedDate,
      }),
    );

    jest.restoreAllMocks();
  });

  it('No Match uses field ID from getNextFieldId in detection update', () => {
    mockGetNextFieldId.mockReturnValueOnce('FIELD-042');

    const { getByTestId } = render(<MatchReviewScreen />);
    fireEvent.press(getByTestId('no-match-button'));

    expect(mockAddLocalIndividual).toHaveBeenCalledWith(
      expect.objectContaining({
        localId: 'FIELD-042',
      }),
    );
    expect(mockUpdateDetection).toHaveBeenCalledWith('obs-1', 'det-1', {
      matchResult: expect.objectContaining({
        approvedIndividual: 'FIELD-042',
      }),
    });
  });

  it('Skip navigates back without updating store', () => {
    const { getByTestId } = render(<MatchReviewScreen />);
    fireEvent.press(getByTestId('skip-button'));

    expect(mockUpdateDetection).not.toHaveBeenCalled();
    expect(mockAddLocalIndividual).not.toHaveBeenCalled();
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
