package org.ganesha.elebook.embedding

import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.CompatibilityList
import org.tensorflow.lite.gpu.GpuDelegate
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Which runtime actually served a loadModel()/embed() call. */
enum class LiteRtRuntime { GPU, CPU }

/** The model file itself could not be loaded -- fatal for both runtimes, not a GPU-only failure. */
class LiteRtModelLoadException(message: String, cause: Throwable? = null) : Exception(message, cause)

/** An embed() output didn't match the caller's expected dimensionality. */
class LiteRtEmbeddingDimensionException(expected: Int, actual: Int) :
    Exception("Expected $expected-dim embedding, got $actual")

/**
 * Lifecycle-safe LiteRT (TensorFlow Lite) engine for the MiewID embedding
 * model, extracted from the proven MiewIdLiteRtBenchmarkTest.kt logic (see
 * docs/ELEBOOK_FIELD_READINESS_PLAN.md WS7 step 5 -- the numbers behind this
 * are the ~76ms GPU vs ~1080ms ONNX-CPU benchmark on a Pixel 9a, cosine
 * 0.987 against the Python reference).
 *
 * Tries the GPU delegate when requested and supported; a GPU init failure
 * is NOT fatal -- it falls back to CPU (XNNPACK-backed by default in modern
 * TFLite) and the caller finds out which runtime actually ran via
 * [LoadResult.runtime]. Only a failure to load the model file itself is
 * fatal (see WS7 acceptance criteria: a GPU failure must never lose the
 * observation or return a partial embedding).
 *
 * Holds at most one loaded interpreter at a time -- this engine only ever
 * serves the single MiewID embedding model, unlike OnnxInferenceService
 * (JS side) which also serves per-species YOLO detectors. All public
 * methods are synchronized: unlike the JS side, the JVM gives no free
 * serialization across calls from different threads.
 */
class LiteRtEmbeddingEngine {

    data class LoadResult(val runtime: LiteRtRuntime)

    private var interpreter: Interpreter? = null
    private var gpuDelegate: GpuDelegate? = null
    private var loadedModelPath: String? = null
    private var loadedRuntime: LiteRtRuntime? = null

    @Synchronized
    fun isModelLoaded(modelPath: String): Boolean = loadedModelPath == modelPath

    /**
     * Load [modelPath], preferring the GPU delegate when [preferGpu] is true
     * and the device supports it. Replaces any previously loaded model.
     * Returns immediately if [modelPath] is already loaded (matches
     * OnnxInferenceService.loadModel's no-op-if-already-loaded behavior).
     *
     * @throws LiteRtModelLoadException if the model file itself cannot be
     *   read or parsed by the interpreter.
     */
    @Synchronized
    fun loadModel(modelPath: String, preferGpu: Boolean): LoadResult {
        if (loadedModelPath == modelPath) {
            return LoadResult(loadedRuntime ?: LiteRtRuntime.CPU)
        }
        unloadLocked()

        val modelBuffer = readModelFileToDirectBuffer(modelPath)
        val options = Interpreter.Options()
        var delegate: GpuDelegate? = null
        var runtime = LiteRtRuntime.CPU
        if (preferGpu && isGpuSupported()) {
            try {
                val compatList = CompatibilityList()
                val delegateOptions = compatList.bestOptionsForThisDevice
                compatList.close()
                delegate = GpuDelegate(delegateOptions)
                options.addDelegate(delegate)
                runtime = LiteRtRuntime.GPU
            } catch (e: Exception) {
                delegate?.close()
                delegate = null
                runtime = LiteRtRuntime.CPU
            }
        }

        val newInterpreter = try {
            Interpreter(modelBuffer, options)
        } catch (e: Exception) {
            delegate?.close()
            throw LiteRtModelLoadException("Failed to load LiteRT model at $modelPath: ${e.message}", e)
        }

        interpreter = newInterpreter
        gpuDelegate = delegate
        loadedModelPath = modelPath
        loadedRuntime = runtime
        return LoadResult(runtime)
    }

    /**
     * Run inference for one preprocessed NCHW tensor (ImageTensorModule.bitmapToNchw's
     * output layout) and return the embedding, validated against [expectedDim].
     * Transposes to NHWC internally -- onnx2tf's default TFLite export expects
     * NHWC (see ml/export_litert.py's run_tflite()), so callers never need to
     * know this model's on-disk input layout.
     *
     * @throws IllegalStateException if no model is loaded.
     * @throws LiteRtEmbeddingDimensionException if the output length doesn't
     *   match [expectedDim].
     */
    @Synchronized
    fun embed(inputNchw: DoubleArray, height: Int, width: Int, expectedDim: Int): FloatArray {
        val activeInterpreter = interpreter
            ?: throw IllegalStateException("embed() called with no LiteRT model loaded")

        // Check the model's declared output shape before running -- a pack/model
        // mismatch should fail clearly here, not as a corrupted or truncated
        // embedding from a mis-sized output buffer.
        val outputShape = activeInterpreter.getOutputTensor(0).shape()
        val actualDim = outputShape.fold(1) { acc, dim -> acc * dim }
        if (actualDim != expectedDim) {
            throw LiteRtEmbeddingDimensionException(expectedDim, actualDim)
        }

        val inputNhwc = nchwToNhwc(inputNchw, height, width)
        val inputBuffer = ByteBuffer.allocateDirect(inputNhwc.size * 4).order(ByteOrder.nativeOrder())
        inputBuffer.asFloatBuffer().put(inputNhwc)
        inputBuffer.rewind()

        val outputBuffer = ByteBuffer.allocateDirect(expectedDim * 4).order(ByteOrder.nativeOrder())
        activeInterpreter.run(inputBuffer, outputBuffer)
        outputBuffer.rewind()

        val outFloats = outputBuffer.asFloatBuffer()
        return FloatArray(expectedDim) { outFloats.get(it) }
    }

    @Synchronized
    fun unload() = unloadLocked()

    private fun unloadLocked() {
        interpreter?.close()
        gpuDelegate?.close()
        interpreter = null
        gpuDelegate = null
        loadedModelPath = null
        loadedRuntime = null
    }

    companion object {
        /** Cheap capability query -- safe to call before ever loading a model. */
        fun isGpuSupported(): Boolean {
            val compatList = CompatibilityList()
            val supported = compatList.isDelegateSupportedOnThisDevice
            compatList.close()
            return supported
        }

        private fun readModelFileToDirectBuffer(path: String): ByteBuffer {
            val bytes = File(path).readBytes()
            val buffer = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder())
            buffer.put(bytes)
            buffer.rewind()
            return buffer
        }

        /** Exposed for unit testing -- pure array math, no native dependency. */
        fun nchwToNhwc(nchw: DoubleArray, height: Int, width: Int): FloatArray {
            val nhwc = FloatArray(nchw.size)
            val plane = height * width
            for (row in 0 until height) {
                for (col in 0 until width) {
                    val pixelIndex = row * width + col
                    val nhwcBase = pixelIndex * 3
                    nhwc[nhwcBase] = nchw[pixelIndex].toFloat()
                    nhwc[nhwcBase + 1] = nchw[plane + pixelIndex].toFloat()
                    nhwc[nhwcBase + 2] = nchw[2 * plane + pixelIndex].toFloat()
                }
            }
            return nhwc
        }
    }
}
