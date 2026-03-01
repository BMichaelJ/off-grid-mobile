import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { wildlifePipeline } from '../../services/wildlifePipeline';
import { useWildlifeStore } from '../../stores/wildlifeStore';
import type { SpeciesConfig } from '../../services/wildlifePipeline/types';
import type { RootStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function useCaptureFlow() {
  const [isProcessing, setIsProcessing] = useState(false);
  const navigation = useNavigation<NavigationProp>();
  const packs = useWildlifeStore((s) => s.packs);
  const miewidModelPath = useWildlifeStore((s) => s.miewidModelPath);

  const processPhoto = useCallback(
    async (photoUri: string) => {
      if (!miewidModelPath) {
        Alert.alert('Error', 'MiewID model not loaded');
        return;
      }

      setIsProcessing(true);
      try {
        // Build species configs from loaded packs
        const speciesConfigs: SpeciesConfig[] = packs.map((pack) => ({
          packId: pack.id,
          species: pack.species,
          detectorModelPath: pack.detectorModelFile,
          detectorConfig: {} as SpeciesConfig['detectorConfig'],
          embeddingDatabase: [],
        }));

        const result = await wildlifePipeline.processPhoto({
          photoUri,
          gps: null,
          speciesConfigs,
          miewidModelPath,
        });

        // Save observation to store
        useWildlifeStore.getState().addObservation({
          id: result.observationId,
          photoUri: result.photoUri,
          gps: null,
          timestamp: new Date().toISOString(),
          deviceInfo: { model: 'unknown', os: 'unknown' },
          fieldNotes: null,
          detections: result.detections,
          createdAt: new Date().toISOString(),
        });

        navigation.navigate('DetectionResults', {
          observationId: result.observationId,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        Alert.alert('Detection Failed', message);
      } finally {
        setIsProcessing(false);
      }
    },
    [miewidModelPath, packs, navigation],
  );

  const takePhoto = useCallback(async () => {
    const result = await launchCamera({ mediaType: 'photo', quality: 1 });
    if (result.assets?.[0]?.uri) {
      await processPhoto(result.assets[0].uri);
    }
  }, [processPhoto]);

  const chooseFromGallery = useCallback(async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 1,
    });
    if (result.assets?.[0]?.uri) {
      await processPhoto(result.assets[0].uri);
    }
  }, [processPhoto]);

  return { isProcessing, takePhoto, chooseFromGallery };
}
