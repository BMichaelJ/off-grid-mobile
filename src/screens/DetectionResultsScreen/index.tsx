import React, { useCallback } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useThemedStyles, useTheme } from '../../theme';
import { useWildlifeStore } from '../../stores';
import type { RootStackParamList } from '../../navigation/types';
import { toDisplayUri } from '../../utils/imageUri';
import { BoundingBoxOverlay } from './BoundingBoxOverlay';
import { createStyles } from './styles';

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'DetectionResults'
>;
type DetectionResultsRouteProp = RouteProp<
  RootStackParamList,
  'DetectionResults'
>;

const getHeaderText = (count: number): string => {
  if (count === 0) {
    return 'No Detections Found';
  }
  if (count === 1) {
    return '1 Detection Found';
  }
  return `${count} Detections Found`;
};

export const DetectionResultsScreen: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<DetectionResultsRouteProp>();
  const { observationId } = route.params;

  const observation = useWildlifeStore(s =>
    s.observations.find(o => o.id === observationId),
  );

  const detections = observation?.detections ?? [];

  const handleBoxPress = useCallback(
    (detectionId: string) => {
      navigation.navigate('MatchReview', { observationId, detectionId });
    },
    [navigation, observationId],
  );

  const handleSaveAll = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <SafeAreaView
      style={styles.container}
      testID="detection-results-screen"
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
        <Text style={styles.headerTitle}>
          {getHeaderText(detections.length)}
        </Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.photoContainer}>
        {observation?.photoUri ? (
          <Image
            source={{ uri: toDisplayUri(observation.photoUri) }}
            style={styles.photo}
            resizeMode="contain"
            testID="observation-photo"
          />
        ) : null}
        <View style={styles.overlayContainer}>
          {detections.map(detection => (
            <BoundingBoxOverlay
              key={detection.id}
              detection={detection}
              onPress={() => handleBoxPress(detection.id)}
            />
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.saveAllButton}
          onPress={handleSaveAll}
          testID="save-all-button"
        >
          <Icon name="check-circle" size={20} color={colors.background} />
          <Text style={styles.saveAllText}>Save All</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
