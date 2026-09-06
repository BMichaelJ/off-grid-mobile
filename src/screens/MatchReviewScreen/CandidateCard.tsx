import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import type { MatchCandidate } from '../../types';
import { toDisplayUri } from '../../utils/imageUri';
import type { createStyles } from './styles';

interface CandidateCardProps {
  candidate: MatchCandidate;
  rank: number;
  name: string;
  displayId: string;
  refPhotoUri: string | null;
  onApprove: (individualId: string) => void;
  styles: ReturnType<typeof createStyles>;
}

export const CandidateCard: React.FC<CandidateCardProps> = ({
  candidate,
  rank,
  name,
  displayId,
  refPhotoUri,
  onApprove,
  styles,
}) => {
  const { colors } = useTheme();

  return (
    <View
      style={styles.candidateCard}
      testID={`candidate-${candidate.individualId}`}
    >
      {refPhotoUri ? (
        <Image
          source={{ uri: toDisplayUri(refPhotoUri) }}
          style={styles.candidatePhoto}
          testID={`candidate-photo-${candidate.individualId}`}
        />
      ) : (
        <View style={styles.candidatePhotoPlaceholder}>
          <Icon name="image" size={24} color={colors.textMuted} />
        </View>
      )}

      <View style={styles.candidateInfo}>
        <Text style={styles.candidateName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.candidateId} numberOfLines={1}>
          {displayId}
        </Text>
        <View style={styles.candidateScoreRow}>
          <Text style={styles.candidateRank}>{`Candidate ${rank}`}</Text>
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>{candidate.source}</Text>
          </View>
        </View>
        <Text style={styles.confirmationNotice}>Researcher confirmation required</Text>
      </View>

      <TouchableOpacity
        style={styles.approveButton}
        onPress={() => onApprove(candidate.individualId)}
        testID={`approve-${candidate.individualId}`}
      >
        <Text style={styles.approveButtonText}>Approve</Text>
      </TouchableOpacity>
    </View>
  );
};
