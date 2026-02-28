import type { Detection } from '../../types';
import { onnxInferenceService } from '../onnxInferenceService';
import { embeddingMatchService } from '../embeddingMatchService';
import { generateId } from '../../utils/generateId';
import logger from '../../utils/logger';
import type { ProcessPhotoParams, PipelineResult } from './types';

class WildlifePipeline {
  async processPhoto(params: ProcessPhotoParams): Promise<PipelineResult> {
    const { photoUri, speciesConfigs, miewidModelPath } = params;
    const observationId = generateId();
    const detections: Detection[] = [];
    let totalInferenceTimeMs = 0;

    for (const config of speciesConfigs) {
      // Load detector if not loaded
      if (!onnxInferenceService.isModelLoaded(config.detectorModelPath)) {
        await onnxInferenceService.loadModel(
          config.detectorModelPath,
          'detector',
        );
      }

      // Run detection
      const detectionOutput = await onnxInferenceService.runDetection(
        photoUri,
        config.detectorModelPath,
        config.detectorConfig,
      );
      totalInferenceTimeMs += detectionOutput.inferenceTimeMs;

      // Skip embedding if no detections
      if (detectionOutput.results.length === 0) {
        continue;
      }

      // Load MiewID if not loaded
      if (!onnxInferenceService.isModelLoaded(miewidModelPath)) {
        await onnxInferenceService.loadModel(miewidModelPath, 'embedding');
      }

      // Process each detection
      for (const result of detectionOutput.results) {
        const detectionId = generateId();
        const croppedImageUri = `file:///crops/${detectionId}.jpg`;

        // Extract embedding
        const embeddingOutput = await onnxInferenceService.extractEmbedding(
          croppedImageUri,
          miewidModelPath,
        );
        totalInferenceTimeMs += embeddingOutput.inferenceTimeMs;

        // Match against database
        const topCandidates = embeddingMatchService.matchEmbedding(
          embeddingOutput.embedding,
          config.embeddingDatabase,
          5,
        );

        const detection: Detection = {
          id: detectionId,
          observationId,
          boundingBox: result.boundingBox,
          species: result.species,
          speciesConfidence: result.confidence,
          croppedImageUri,
          embedding: embeddingOutput.embedding,
          matchResult: {
            topCandidates,
            approvedIndividual: null,
            reviewStatus: 'pending',
          },
          encounterFields: {
            locationId: null,
            sex: null,
            lifeStage: null,
            behavior: null,
            submitterId: null,
            projectId: null,
          },
        };

        detections.push(detection);
      }
    }

    logger.log(
      `[WildlifePipeline] Processed photo with ${detections.length} detection(s) in ${totalInferenceTimeMs}ms`,
    );

    return {
      observationId,
      photoUri,
      detections,
      totalInferenceTimeMs,
    };
  }
}

export const wildlifePipeline = new WildlifePipeline();
