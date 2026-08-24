import { useState, useCallback } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Geolocation from '@react-native-community/geolocation';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { wildlifePipeline } from '../../services/wildlifePipeline';
import { buildActiveSpeciesConfigs } from '../../services/speciesConfigBuilder';
import {
  persistObservationFiles,
  deleteObservationFiles,
} from '../../services/observationStorage';
import { useWildlifeStore } from '../../stores/wildlifeStore';
import type { MiewIDModelStatus } from '../../types';
import type { RootStackParamList } from '../../navigation/types';
import logger from '../../utils/logger';

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
        const { localIndividuals } = useWildlifeStore.getState();
        const { speciesConfigs, excludedPacks } =
          await buildActiveSpeciesConfigs(packs, miewidModel, localIndividuals);

        // Mirror the original guard: healthy (non-quarantined) packs existed,
        // but every one of them was excluded for embedding-model
        // incompatibility — nothing left to match against.
        const quarantinedIds = new Set(
          excludedPacks
            .filter(excluded => excluded.reason === 'quarantined')
            .map(excluded => excluded.packId),
        );
        const healthyPackCount = packs.length - quarantinedIds.size;
        const incompatiblePackCount = excludedPacks.length - quarantinedIds.size;
        if (healthyPackCount > 0 && incompatiblePackCount === healthyPackCount) {
          Alert.alert(
            'Model and pack versions do not match',
            `The installed MiewID model (${miewidModel.version}) cannot be used with the downloaded pack. Download the latest model and pack before identifying an elephant.`,
          );
          return;
        }

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
