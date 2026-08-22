import React, { useCallback, useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useThemedStyles, useTheme } from '../../theme';
import { useWildlifeStore } from '../../stores';
import type { RootStackParamList } from '../../navigation/types';
import type { MatchCandidate } from '../../types';
import { toDisplayUri } from '../../utils/imageUri';
import { CandidateCard } from './CandidateCard';
import { createStyles } from './styles';

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'MatchReview'
>;
type MatchReviewRouteProp = RouteProp<RootStackParamList, 'MatchReview'>;

interface ResolvedCandidate {
  candidate: MatchCandidate;
  name: string;
  displayId: string;
  refPhotoUri: string | null;
}

export const MatchReviewScreen: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<MatchReviewRouteProp>();
  const { observationId, detectionId } = route.params;

  const observation = useWildlifeStore(s =>
    s.observations.find(o => o.id === observationId),
  );
  const localIndividuals = useWildlifeStore(s => s.localIndividuals);
  const updateDetection = useWildlifeStore(s => s.updateDetection);
  const addLocalIndividual = useWildlifeStore(s => s.addLocalIndividual);
  const addEmbeddingToLocalIndividual = useWildlifeStore(
    s => s.addEmbeddingToLocalIndividual,
  );

  const detection = useMemo(
    () => observation?.detections.find(d => d.id === detectionId) ?? null,
    [observation, detectionId],
  );

  const candidates = detection?.matchResult.topCandidates ?? [];

  const resolvedCandidates: ResolvedCandidate[] = useMemo(() => {
    return candidates.map(candidate => {
      if (candidate.source === 'local') {
        const local = localIndividuals.find(
          ind => ind.localId === candidate.individualId,
        );
        return {
          candidate,
          name: local?.userLabel ?? 'Unnamed Individual',
          displayId: candidate.individualId,
          refPhotoUri:
            local?.referencePhotos?.[candidate.refPhotoIndex] ?? null,
        };
      }

      // Pack individual -- name resolution requires async file reads,
      // so we display the ID for now. Task 5.2 will wire full resolution.
      return {
        candidate,
        name: candidate.individualId,
        displayId: candidate.individualId,
        refPhotoUri: null,
      };
    });
  }, [candidates, localIndividuals]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleApprove = useCallback(
    (individualId: string) => {
      const approvedCandidate = candidates.find(
        c => c.individualId === individualId,
      );
      if (approvedCandidate?.source === 'local' && detection) {
        addEmbeddingToLocalIndividual(
          individualId,
          detection.embedding,
          detection.croppedImageUri,
        );
      }

      updateDetection(observationId, detectionId, {
        matchResult: {
          topCandidates: candidates,
          approvedIndividual: individualId,
          reviewStatus: 'approved',
        },
      });
      navigation.goBack();
    },
    [
      navigation,
      updateDetection,
      addEmbeddingToLocalIndividual,
      observationId,
      detectionId,
      candidates,
      detection,
    ],
  );

  const handleNoMatch = useCallback(() => {
    if (!detection) return;

    // Create a new local individual from this detection
    const newId = useWildlifeStore.getState().getNextFieldId();
    addLocalIndividual({
      localId: newId,
      userLabel: null,
      species: detection.species,
      embeddings: [detection.embedding],
      referencePhotos: [detection.croppedImageUri],
      firstSeen: new Date().toISOString(),
      encounterCount: 1,
      syncStatus: 'pending',
      wildbookId: null,
    });

    // Update detection to reference the new individual
    updateDetection(observationId, detectionId, {
      matchResult: {
        topCandidates: candidates,
        approvedIndividual: newId,
        reviewStatus: 'approved',
      },
    });
    navigation.goBack();
  }, [
    navigation,
    detection,
    addLocalIndividual,
    updateDetection,
    observationId,
    detectionId,
    candidates,
  ]);

  const handleSkip = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const renderCandidate = useCallback(
    ({ item }: { item: ResolvedCandidate }) => (
      <CandidateCard
        candidate={item.candidate}
        name={item.name}
        displayId={item.displayId}
        refPhotoUri={item.refPhotoUri}
        onApprove={handleApprove}
        styles={styles}
      />
    ),
    [handleApprove, styles],
  );

  const keyExtractor = useCallback(
    (item: ResolvedCandidate) => item.candidate.individualId,
    [],
  );

  if (!detection) {
    return (
      <SafeAreaView
        style={styles.container}
        testID="match-review-screen"
        edges={['top']}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backButton}
            testID="back-button"
          >
            <Icon name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Match Review</Text>
          <View style={styles.backButton} />
        </View>
        <Text style={styles.emptyText}>Detection not found.</Text>
      </SafeAreaView>
    );
  }

  const confidencePercent = `${Math.round(detection.speciesConfidence * 100)}%`;

  return (
    <SafeAreaView
      style={styles.container}
      testID="match-review-screen"
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          testID="back-button"
        >
          <Icon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Match Review</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.detectionSection}>
        <Image
          source={{ uri: toDisplayUri(detection.croppedImageUri) }}
          style={styles.croppedImage}
          resizeMode="cover"
          testID="cropped-detection-image"
        />
        <View style={styles.speciesRow}>
          <Text style={styles.speciesText}>{detection.species}</Text>
          <Text style={styles.confidenceText}>{confidencePercent}</Text>
        </View>
      </View>

      <Text style={styles.candidatesHeader}>
        Top Candidates ({candidates.length})
      </Text>

      <FlatList
        style={styles.candidatesList}
        contentContainerStyle={styles.candidatesContent}
        data={resolvedCandidates}
        renderItem={renderCandidate}
        keyExtractor={keyExtractor}
        testID="candidates-list"
        ListEmptyComponent={
          <Text style={styles.emptyText}>No candidates found.</Text>
        }
      />

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.newIndividualButton}
          onPress={handleNoMatch}
          testID="no-match-button"
        >
          <Icon name="user-plus" size={18} color={colors.text} />
          <Text style={styles.newIndividualText}>
            No Match — New Individual
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          testID="skip-button"
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
