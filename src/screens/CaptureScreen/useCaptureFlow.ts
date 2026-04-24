import { useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { wildlifePipeline } from '../../services/wildlifePipeline';
import { buildEmbeddingDatabase } from '../../services/embeddingDatabaseBuilder';
import { useWildlifeStore } from '../../stores/wildlifeStore';
import { packManager } from '../../services/packManager';
import type { SpeciesConfig } from '../../services/wildlifePipeline/types';
import type { DetectorConfig } from '../../types';
import type { RootStackParamList } from '../../navigation/types';

/**
 * Load the detector config JSON from the pack directory.
 * Falls back to a safe default if loading fails.
 *
 * TODO(P0): Once packs include real detector_config.json files,
 * remove the fallback and require the config to exist.
 */
async function loadDetectorConfig(packDir: string): Promise<DetectorConfig> {
  try {
    const manifest = await packManager.loadManifest(`${packDir}/manifest.json`);
    const configPath = `${packDir}/${manifest.detectorModel.configFile}`;
    const RNFS = require('react-native-fs');
    const content = await RNFS.readFile(configPath, 'utf8');
    return JSON.parse(content);
  } catch {
    // Fallback until packs ship real detector configs
    return DEFAULT_DETECTOR_CONFIG;
  }
}

const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  modelFile: '',
  architecture: 'yolov5',
  inputSize: [640, 640],
  inputChannels: 3,
  channelOrder: 'RGB',
  normalize: { mean: [0, 0, 0], std: [1, 1, 1], scale: 1 / 255 },
  confidenceThreshold: 0.25,
  nmsThreshold: 0.45,
  maxDetections: 100,
  outputFormat: 'yolov5',
  classLabels: ['animal'],
  outputSpec: {
    boxFormat: 'cxcywh',
    coordinateType: 'normalized',
    layout: '[1, num_detections, 5+num_classes]',
  },
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * Attempt to get the device's current GPS coordinates.
 * Returns null if unavailable — GPS is best-effort since the app
 * may be used offline or without location permissions.
 *
 * TODO: Integrate @react-native-community/geolocation or
 * expo-location once native setup is in place.
 */
async function getDeviceLocation(): Promise<{
  lat: number;
  lon: number;
  accuracy: number;
} | null> {
  // GPS integration requires native module setup that is out of scope
  // for this wiring task. Return null for now; Task 5.x will add
  // actual Geolocation calls.
  return null;
}

/** Build device info from React Native Platform API. */
function getDeviceInfo(): { model: string; os: string } {
  return {
    model: Platform.OS,
    os: `${Platform.OS} ${Platform.Version}`,
  };
}

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
        // Build species configs from loaded packs with merged embedding databases
        const { localIndividuals } = useWildlifeStore.getState();
        const speciesConfigs: SpeciesConfig[] = await Promise.all(
          packs.map(async (pack) => ({
            packId: pack.id,
            species: pack.species,
            detectorModelPath: pack.detectorModelFile,
            detectorConfig: await loadDetectorConfig(pack.packDir),
            embeddingDatabase: await buildEmbeddingDatabase(
              pack.species,
              packs,
              localIndividuals,
            ),
          })),
        );

        const gps = await getDeviceLocation();
        const deviceInfo = getDeviceInfo();

        const result = await wildlifePipeline.processPhoto({
          photoUri,
          speciesConfigs,
          miewidModelPath,
        });

        // Save observation to store
        useWildlifeStore.getState().addObservation({
          id: result.observationId,
          photoUri: result.photoUri,
          gps,
          timestamp: new Date().toISOString(),
          deviceInfo,
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
