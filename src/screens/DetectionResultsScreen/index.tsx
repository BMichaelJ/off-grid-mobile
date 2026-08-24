import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
  const [isSaving, setIsSaving] = useState(false);

  const observation = useWildlifeStore(s =>
    s.observations.find(o => o.id === observationId),
  );
  const updateObservationNotes = useWildlifeStore(
    s => s.updateObservationNotes,
  );
  const [notes, setNotes] = useState(observation?.fieldNotes ?? '');

  const detections = observation?.detections ?? [];

  const persistNotes = useCallback(async () => {
    await updateObservationNotes(observationId, notes.trim() || null);
  }, [notes, observationId, updateObservationNotes]);

  const handleBoxPress = useCallback(
    async (detectionId: string) => {
      try {
        await persistNotes();
      } catch (error) {
        Alert.alert(
          'Could not save observation',
          error instanceof Error ? error.message : String(error),
        );
        return;
      }
      navigation.navigate('MatchReview', { observationId, detectionId });
    },
    [navigation, observationId, persistNotes],
  );

  const handleSaveAll = useCallback(async () => {
    setIsSaving(true);
    try {
      await persistNotes();
      navigation.goBack();
    } catch (error) {
      Alert.alert(
        'Could not save observation',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsSaving(false);
    }
  }, [navigation, persistNotes]);

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
        <Text style={styles.notesLabel}>Observation notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional field notes"
          placeholderTextColor={colors.textMuted}
          style={styles.notesInput}
          multiline
          maxLength={2000}
          editable={!isSaving}
          testID="observation-notes-input"
        />
        <TouchableOpacity
          style={[
            styles.saveAllButton,
            isSaving && styles.saveAllButtonDisabled,
          ]}
          onPress={handleSaveAll}
          disabled={isSaving}
          testID="save-all-button"
        >
          {isSaving ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Icon name="check-circle" size={20} color={colors.background} />
              <Text style={styles.saveAllText}>Save All</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
