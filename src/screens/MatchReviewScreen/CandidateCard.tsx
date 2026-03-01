import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import type { MatchCandidate } from '../../types';

interface CandidateCardProps {
  candidate: MatchCandidate;
  name: string;
  displayId: string;
  refPhotoUri: string | null;
  onApprove: (individualId: string) => void;
  styles: Record<string, any>;
}

export const CandidateCard: React.FC<CandidateCardProps> = ({
  candidate,
  name,
  displayId,
  refPhotoUri,
  onApprove,
  styles,
}) => {
  const scorePercent = `${Math.round(candidate.score * 100)}%`;

  return (
    <View style={styles.candidateCard} testID={`candidate-${candidate.individualId}`}>
      {refPhotoUri ? (
        <Image
          source={{ uri: refPhotoUri }}
          style={styles.candidatePhoto}
          testID={`candidate-photo-${candidate.individualId}`}
        />
      ) : (
        <View style={styles.candidatePhotoPlaceholder}>
          <Icon name="image" size={24} color="#8A8A8A" />
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
          <Text style={styles.candidateScore}>{scorePercent}</Text>
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>{candidate.source}</Text>
          </View>
        </View>
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
