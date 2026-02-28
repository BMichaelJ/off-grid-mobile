import type { DetectorConfig } from '../../types';

/**
 * Miew-ID model input dimensions.
 */
const MIEWID_INPUT_SIZE = 440;
const MIEWID_CHANNELS = 3;

/**
 * Preprocess an image for detection inference.
 *
 * For MVP this returns a zeroed Float32Array tensor. Actual pixel extraction
 * requires native modules (e.g. react-native-image-manipulator) and will be
 * wired up in a later task.
 *
 * @param _imageUri  URI of the source image (unused in stub)
 * @param config     Detector configuration describing input dimensions
 * @returns Float32Array of size channels * height * width
 */
export async function preprocessImageForDetection(
  _imageUri: string,
  config: DetectorConfig,
): Promise<Float32Array> {
  const [height, width] = config.inputSize;
  const channels = config.inputChannels;
  return new Float32Array(channels * height * width);
}

/**
 * Preprocess an image for MiewID embedding extraction.
 *
 * For MVP this returns a zeroed Float32Array tensor. Actual pixel extraction
 * requires native modules and will be wired up in a later task.
 *
 * @param _imageUri  URI of the cropped image (unused in stub)
 * @returns Float32Array of size 3 * 440 * 440
 */
export async function preprocessImageForEmbedding(
  _imageUri: string,
): Promise<Float32Array> {
  return new Float32Array(MIEWID_CHANNELS * MIEWID_INPUT_SIZE * MIEWID_INPUT_SIZE);
}
