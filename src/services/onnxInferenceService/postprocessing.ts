import type { DetectorConfig, DetectionResult, BoundingBox } from '../../types';

/**
 * Compute Intersection-over-Union (IoU) between two bounding boxes.
 * Boxes are in normalized [x, y, width, height] format.
 */
function computeIoU(a: BoundingBox, b: BoundingBox): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  const interX1 = Math.max(a.x, b.x);
  const interY1 = Math.max(a.y, b.y);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);

  const interWidth = Math.max(0, interX2 - interX1);
  const interHeight = Math.max(0, interY2 - interY1);
  const interArea = interWidth * interHeight;

  const aArea = a.width * a.height;
  const bArea = b.width * b.height;
  const unionArea = aArea + bArea - interArea;

  if (unionArea <= 0) {
    return 0;
  }
  return interArea / unionArea;
}

/**
 * Apply Non-Maximum Suppression to a list of detections.
 * Detections must be sorted by confidence in descending order.
 */
function nms(
  detections: DetectionResult[],
  nmsThreshold: number,
): DetectionResult[] {
  const kept: DetectionResult[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < detections.length; i++) {
    if (suppressed.has(i)) {
      continue;
    }
    kept.push(detections[i]);

    for (let j = i + 1; j < detections.length; j++) {
      if (suppressed.has(j)) {
        continue;
      }
      const iou = computeIoU(detections[i].boundingBox, detections[j].boundingBox);
      if (iou > nmsThreshold) {
        suppressed.add(j);
      }
    }
  }

  return kept;
}

interface ConvertBoxOptions {
  boxFormat: 'xyxy' | 'xywh' | 'cxcywh';
  coordinateType: 'normalized' | 'absolute';
  inputSize: [number, number]; // [height, width]
}

/**
 * Convert raw box coordinates to normalized [x, y, width, height] format.
 */
function convertBox(
  values: [number, number, number, number],
  options: ConvertBoxOptions,
): BoundingBox {
  const { boxFormat, coordinateType: coordType } = options;
  const [, inputWidth] = options.inputSize;
  const [inputHeight] = options.inputSize;
  let x: number;
  let y: number;
  let w: number;
  let h: number;

  switch (boxFormat) {
    case 'cxcywh': {
      const [cx, cy, bw, bh] = values;
      w = bw;
      h = bh;
      x = cx - w / 2;
      y = cy - h / 2;
      break;
    }
    case 'xyxy': {
      const [x1, y1, x2, y2] = values;
      x = x1;
      y = y1;
      w = x2 - x1;
      h = y2 - y1;
      break;
    }
    case 'xywh': {
      [x, y, w, h] = values;
      break;
    }
  }

  // Normalize absolute coordinates to 0..1 range
  if (coordType === 'absolute') {
    x /= inputWidth;
    y /= inputHeight;
    w /= inputWidth;
    h /= inputHeight;
  }

  return { x, y, width: w, height: h };
}

interface OriginalImageSize {
  width: number;
  height: number;
}

/**
 * Clamp a normalized box to the unit square by clamping its corners.
 *
 * Corners are clamped independently and width/height reconstructed, so a box
 * overhanging an edge keeps only its visible extent (clamping x and width
 * independently would instead widen the clipped box).
 *
 * Returns null for boxes with non-finite coordinates or no positive visible
 * area — callers must drop those detections.
 */
function clampBoxToUnitSquare(box: BoundingBox): BoundingBox | null {
  if (
    !Number.isFinite(box.x) ||
    !Number.isFinite(box.y) ||
    !Number.isFinite(box.width) ||
    !Number.isFinite(box.height)
  ) {
    return null;
  }

  const x1 = Math.min(Math.max(box.x, 0), 1);
  const y1 = Math.min(Math.max(box.y, 0), 1);
  const x2 = Math.min(Math.max(box.x + box.width, 0), 1);
  const y2 = Math.min(Math.max(box.y + box.height, 0), 1);

  const width = x2 - x1;
  const height = y2 - y1;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x: x1, y: y1, width, height };
}

/**
 * Parse YOLO model output tensor into DetectionResult[].
 *
 * Supports YOLOv8/YOLO11 output layout where the tensor is shaped as
 * [1, (4 + numClasses), N] and stored row-major, so the Float32Array
 * is laid out as N values for row 0, then N values for row 1, etc.
 *
 * Coordinate contract: returned boxes are normalized [0..1] fractions of the
 * ORIGINAL image. This holds because native preprocessing stretch-resizes the
 * full image to the model input (no letterbox/pad), so normalized model space
 * and normalized original space coincide. If preprocessing ever switches to
 * letterboxing, this function must un-map boxes using `originalSize` — the
 * parameter is kept for that purpose.
 *
 * @param outputData       Raw Float32Array from inference
 * @param config           Detector configuration
 * @param originalSize     Original image dimensions (anchor for a future
 *                         letterbox un-mapping; unused under stretch-resize)
 */
export function parseYoloOutput(
  outputData: Float32Array,
  config: DetectorConfig,
  originalSize: OriginalImageSize,
): DetectionResult[] {
  // Unused under the stretch-resize contract documented above.
  void originalSize;

  const numClasses = config.classLabels.length;
  const numRows = 4 + numClasses; // 4 box values + class confidences
  const [inputHeight, inputWidth] = config.inputSize;

  if (outputData.length === 0) {
    return [];
  }

  // N = total elements / number of rows
  const numDetections = Math.floor(outputData.length / numRows);

  if (numDetections === 0) {
    return [];
  }

  // Parse all detections
  const candidates: DetectionResult[] = [];

  for (let i = 0; i < numDetections; i++) {
    // Read box coordinates (rows 0-3, column i)
    const boxValues: [number, number, number, number] = [
      outputData[0 * numDetections + i],
      outputData[1 * numDetections + i],
      outputData[2 * numDetections + i],
      outputData[3 * numDetections + i],
    ];

    // Find best class
    let bestClassIdx = 0;
    let bestConfidence = -Infinity;
    for (let c = 0; c < numClasses; c++) {
      const conf = outputData[(4 + c) * numDetections + i];
      if (conf > bestConfidence) {
        bestConfidence = conf;
        bestClassIdx = c;
      }
    }

    // Filter by confidence threshold
    if (bestConfidence < config.confidenceThreshold) {
      continue;
    }

    const rawBox = convertBox(boxValues, {
      boxFormat: config.outputSpec.boxFormat,
      coordinateType: config.outputSpec.coordinateType,
      inputSize: [inputHeight, inputWidth],
    });

    // Clamp before NMS so IoU is computed on visible extents, and so no
    // out-of-range box reaches native cropping, persistence, or the UI.
    const boundingBox = clampBoxToUnitSquare(rawBox);
    if (!boundingBox || !Number.isFinite(bestConfidence)) {
      continue;
    }

    candidates.push({
      boundingBox,
      species: config.classLabels[bestClassIdx],
      confidence: bestConfidence,
    });
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Apply NMS
  const afterNms = nms(candidates, config.nmsThreshold);

  // Limit to maxDetections
  return afterNms.slice(0, config.maxDetections);
}
