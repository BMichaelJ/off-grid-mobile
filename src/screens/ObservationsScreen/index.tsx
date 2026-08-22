import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Feather';
import { AnimatedListItem } from '../../components';
import { Card } from '../../components';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useWildlifeStore } from '../../stores/wildlifeStore';
import type { RootStackParamList } from '../../navigation/types';
import type { Observation, SyncQueueItem } from '../../types/wildlife';
import { toDisplayUri } from '../../utils/imageUri';
import { createStyles } from './styles';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type FilterKey = 'all' | 'pending' | 'reviewed' | 'synced';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'synced', label: 'Synced' },
];

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getDetectionCountText(count: number): string {
  if (count === 1) {
    return '1 detection';
  }
  return `${count} detections`;
}

function getReviewStatusText(observation: Observation): string {
  const total = observation.detections.length;
  if (total === 0) {
    return 'No detections';
  }
  const reviewed = observation.detections.filter(
    d => d.matchResult.reviewStatus !== 'pending',
  ).length;
  if (reviewed === total) {
    return 'All reviewed';
  }
  return `${reviewed}/${total} reviewed`;
}

function isPendingReview(observation: Observation): boolean {
  return observation.detections.some(
    d => d.matchResult.reviewStatus === 'pending',
  );
}

function isAllReviewed(observation: Observation): boolean {
  return (
    observation.detections.length > 0 &&
    observation.detections.every(d => d.matchResult.reviewStatus !== 'pending')
  );
}

function isSynced(
  observation: Observation,
  syncQueue: SyncQueueItem[],
): boolean {
  const item = syncQueue.find(s => s.observationId === observation.id);
  return item?.status === 'synced';
}

function filterObservations(
  observations: Observation[],
  syncQueue: SyncQueueItem[],
  filter: FilterKey,
): Observation[] {
  switch (filter) {
    case 'pending':
      return observations.filter(isPendingReview);
    case 'reviewed':
      return observations.filter(isAllReviewed);
    case 'synced':
      return observations.filter(obs => isSynced(obs, syncQueue));
    default:
      return observations;
  }
}

export const ObservationsScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<NavigationProp>();
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const observations = useWildlifeStore(s => s.observations);
  const syncQueue = useWildlifeStore(s => s.syncQueue);

  const filtered = useMemo(
    () => filterObservations(observations, syncQueue, activeFilter),
    [observations, syncQueue, activeFilter],
  );

  const handleObservationPress = useCallback(
    (observationId: string) => {
      navigation.navigate('ObservationDetail', { observationId });
    },
    [navigation],
  );

  const renderObservation = useCallback(
    ({ item, index }: { item: Observation; index: number }) => (
      <AnimatedListItem
        index={index}
        onPress={() => handleObservationPress(item.id)}
        testID={`observation-card-${index}`}
      >
        <Card>
          <View style={styles.row}>
            <Image
              source={{ uri: toDisplayUri(item.photoUri) }}
              style={styles.thumbnail}
              testID={`observation-thumbnail-${index}`}
            />
            <View style={styles.rowContent}>
              <Text style={styles.timestamp}>
                {formatTimestamp(item.timestamp)}
              </Text>
              <Text style={styles.detectionCount}>
                {getDetectionCountText(item.detections.length)}
              </Text>
              <Text style={styles.reviewStatus}>
                {getReviewStatusText(item)}
              </Text>
            </View>
            <Icon
              name="chevron-right"
              size={18}
              color={styles.reviewStatus.color}
            />
          </View>
        </Card>
      </AnimatedListItem>
    ),
    [handleObservationPress, styles],
  );

  const keyExtractor = useCallback((item: Observation) => item.id, []);

  return (
    <SafeAreaView
      style={styles.container}
      testID="observations-screen"
      edges={['top']}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Observations</Text>
      </View>

      <View style={styles.filterBar} testID="filter-bar">
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.filterChip,
              activeFilter === f.key && styles.filterChipActive,
            ]}
            onPress={() => setActiveFilter(f.key)}
            testID={`filter-${f.key}`}
          >
            <Text
              style={[
                styles.filterChipText,
                activeFilter === f.key && styles.filterChipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyState} testID="empty-state">
          <Text style={styles.emptyTitle}>No Observations</Text>
          <Text style={styles.emptyText}>
            Capture a photo to start recording wildlife observations.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderObservation}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          testID="observations-list"
        />
      )}
    </SafeAreaView>
  );
};
