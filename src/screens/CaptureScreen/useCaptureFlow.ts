import { useState, useCallback } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Geolocation from '@react-native-community/geolocation';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { wildlifePipeline } from '../../services/wildlifePipeline';
import { buildEmbeddingDatabase } from '../../services/embeddingDatabaseBuilder';
import {
  persistObservationFiles,
  deleteObservationFiles,
} from '../../services/observationStorage';
import { useWildlifeStore } from '../../stores/wildlifeStore';
import { packManager } from '../../services/packManager';
import { checkEmbeddingModelCompatibility } from '../../services/miewidModelManager';
import type { SpeciesConfig } from '../../services/wildlifePipeline/types';
import type {
  DetectorConfig,
  EmbeddingPackManifest,
  MiewIDModelStatus,
} from '../../types';
import type { RootStackParamList } from '../../navigation/types';
import logger from '../../utils/logger';

/**
 * Load the detector config JSON from the pack directory.
 * Falls back to a safe default if loading fails.
 *
 * TODO(P0): Once packs include real detector_config.json files,
 * remove the fallback and require the config to exist.
 */
async function loadDetectorConfig(
  packDir: string,
  manifest: EmbeddingPackManifest | null,
): Promise<DetectorConfig> {
  try {
    if (!manifest) {
      return DEFAULT_DETECTOR_CONFIG;
    }
    const configPath = `${packDir}/${manifest.detectorModel.configFile}`;
    const RNFS = require('react-native-fs');
    const content = await RNFS.readFile(configPath, 'utf8');
    return JSON.parse(content);
  } catch {
    // Fallback until packs ship real detector configs
    return DEFAULT_DETECTOR_CONFIG;
  }
}

/** Load a pack's manifest, or null when unreadable (fallbacks apply). */
async function loadManifestSafe(
  packDir: string,
): Promise<EmbeddingPackManifest | null> {
  try {
    return await packManager.loadManifest(`${packDir}/manifest.json`);
  } catch {
    return null;
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
 */
async function getDeviceLocation(): Promise<{
  lat: number;
  lon: number;
  accuracy: number;
} | null> {
  try {
    if (Platform.OS === 'android') {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location permission',
          message:
            'Allow Off Grid Mobile to capture GPS coordinates for this observation.',
          buttonPositive: 'Allow',
          buttonNegative: 'Skip',
        },
      );

      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        return null;
      }
    }

    return await new Promise(resolve => {
      Geolocation.getCurrentPosition(
        position => {
          resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        error => {
          logger.warn(
            `[CaptureFlow] Unable to get device location: ${error.message}`,
          );
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
      );
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[CaptureFlow] Unable to get device location: ${message}`);
    return null;
  }
}

/** Build device info from React Native Platform API. */
function getDeviceInfo(): { model: string; os: string } {
  return {
    model: Platform.OS,
    os: `${Platform.OS} ${Platform.Version}`,
  };
}

/** Human-readable explanation for each non-ready model status. */
const MODEL_STATUS_MESSAGES: Record<
  Exclude<MiewIDModelStatus, 'ready'>,
  string
> = {
  missing:
    'The MiewID embedding model is not installed on this device. Download it from the Packs screen before capturing.',
  downloading:
    'The MiewID embedding model is still downloading. Try again once the download completes.',
  corrupt:
    'The installed MiewID embedding model file is corrupt. Re-download it from the Packs screen.',
  incompatible:
    'The installed MiewID embedding model is incompatible with the loaded packs. Update the model or packs.',
};

export function useCaptureFlow() {
  const [isProcessing, setIsProcessing] = useState(false);
  const navigation = useNavigation<NavigationProp>();
  const packs = useWildlifeStore(s => s.packs);
  const miewidModel = useWildlifeStore(s => s.miewidModel);

  const processPhoto = useCallback(
    async (photoUri: string) => {
      if (!miewidModel || miewidModel.status !== 'ready') {
        const message = miewidModel
          ? MODEL_STATUS_MESSAGES[
              miewidModel.status as Exclude<MiewIDModelStatus, 'ready'>
            ]
          : MODEL_STATUS_MESSAGES.missing;
        Alert.alert('MiewID model not ready', message);
        return;
      }

      setIsProcessing(true);
      try {
        // Quarantined packs failed integrity validation — their embeddings
        // or index cannot be trusted until re-validated.
        const healthyPacks = packs.filter(
          pack => pack.status !== 'quarantined',
        );

        // Exclude packs whose embeddings live in a different model space —
        // matching across major MiewID versions produces meaningless scores.
        const compatiblePacks = healthyPacks.filter(pack => {
          const compatibility = checkEmbeddingModelCompatibility(
            miewidModel.version,
            pack.embeddingModelVersion,
          );
          if (compatibility === 'incompatible') {
            logger.warn(
              `[CaptureFlow] Excluding pack ${pack.id}: embedding model ${pack.embeddingModelVersion} incompatible with installed ${miewidModel.version}`,
            );
            return false;
          }
          if (compatibility === 'minor-mismatch') {
            logger.warn(
              `[CaptureFlow] Pack ${pack.id} embedding model ${pack.embeddingModelVersion} minor-mismatches installed ${miewidModel.version}; proceeding`,
            );
          }
          return true;
        });

        // Group packs by compatibility identity: packs sharing a detector
        // and embedding space run ONE detector pass and match against ONE
        // merged database. Distinct groups (different feature class or
        // detector) each get their own pass — never a mixed database.
        const groups = new Map<string, typeof compatiblePacks>();
        for (const pack of compatiblePacks) {
          const key = [
            pack.species,
            pack.featureClass,
            pack.detectorModelFile,
            pack.embeddingModelVersion,
          ].join('|');
          groups.set(key, [...(groups.get(key) ?? []), pack]);
        }

        const { localIndividuals } = useWildlifeStore.getState();
        const speciesConfigs: SpeciesConfig[] = await Promise.all(
          Array.from(groups.values()).map(async groupPacks => {
            const primary = groupPacks[0];
            const manifest = await loadManifestSafe(primary.packDir);
            return {
              packId: primary.id,
              species: primary.species,
              detectorModelPath: primary.detectorModelFile,
              detectorConfig: await loadDetectorConfig(
                primary.packDir,
                manifest,
              ),
              embeddingDatabase: await buildEmbeddingDatabase(
                primary.species,
                groupPacks,
                localIndividuals,
              ),
              embeddingInputSize: manifest?.embeddingModel.inputSize,
              embeddingNormalize: manifest?.embeddingModel.normalize,
            };
          }),
        );

        const gps = await getDeviceLocation();
        const deviceInfo = getDeviceInfo();

        const result = await wildlifePipeline.processPhoto({
          photoUri,
          speciesConfigs,
          miewidModelPath: miewidModel.path,
        });

        // Total failure: nothing completed, nothing worth saving.
        if (result.detections.length === 0 && result.errors.length > 0) {
          Alert.alert(
            'Detection Failed',
            result.errors
              .map(e => (e.species ? `${e.species}: ${e.message}` : e.message))
              .join('\n'),
          );
          return;
        }

        // Move the photo and its crops out of ephemeral cache storage into a
        // durable, app-private location before the observation is saved --
        // a file left in the cache directory can be evicted at any time.
        const persisted = await persistObservationFiles(
          result.observationId,
          result.photoUri,
          result.detections,
        );

        // Save observation to store -- awaited so the durable SQLite write
        // actually commits before we tell the user it's saved. If the DB
        // write fails after the files were already moved, clean them up
        // rather than leaving an orphaned, unreferenced directory behind.
        try {
          await useWildlifeStore.getState().addObservation({
            id: result.observationId,
            photoUri: persisted.photoUri,
            gps,
            timestamp: new Date().toISOString(),
            deviceInfo,
            fieldNotes: null,
            detections: persisted.detections,
            createdAt: new Date().toISOString(),
          });
        } catch (saveError) {
          await deleteObservationFiles(result.observationId);
          throw saveError;
        }

        navigation.navigate('DetectionResults', {
          observationId: result.observationId,
        });

        // Partial failure: the observation is saved with what completed;
        // tell the user what was lost.
        if (result.errors.length > 0) {
          Alert.alert(
            'Some detections failed',
            result.errors
              .map(e => (e.species ? `${e.species}: ${e.message}` : e.message))
              .join('\n'),
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        Alert.alert('Detection Failed', message);
      } finally {
        setIsProcessing(false);
      }
    },
    [miewidModel, packs, navigation],
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
