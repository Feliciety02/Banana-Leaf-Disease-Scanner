package expo.modules.dahonmdtflite

import android.app.ActivityManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

class DahonMDTFLiteModule : Module() {

    private var interpreter: Interpreter? = null
    private var inputScale: Float = 1.0f
    private var inputZeroPoint: Int = 0
    private var outputScale: Float = 1.0f
    private var outputZeroPoint: Int = 0
    private var modelFileName: String = ""
    private var inputBuffer: ByteBuffer? = null
    private var outputBuffer: ByteBuffer? = null
    private val initMutex = Mutex()
    private val inferenceMutex = Mutex()

    private val context
        get() = requireNotNull(appContext.reactContext) { "Android context is unavailable" }

    override fun definition() = ModuleDefinition {
        Name("DahonMDTFLite")

        AsyncFunction("classifyImage") { uri: String ->
            withContext(Dispatchers.Default) {
                ensureModelLoaded()
                classifyImage(uri)
            }
        }

        AsyncFunction("getDeviceInfo") {
            getDeviceInfo()
        }

        AsyncFunction("preprocessImage") { uri: String ->
            withContext(Dispatchers.IO) {
                preprocessImage(uri)
            }
        }

        AsyncFunction("benchmarkModel") { uri: String, modelVariant: String, warmupRuns: Int, measuredRuns: Int, numThreads: Int ->
            withContext(Dispatchers.Default) {
                benchmarkModel(uri, modelVariant, warmupRuns, measuredRuns, numThreads)
            }
        }

        OnDestroy {
            interpreter?.close()
            interpreter = null
            inputBuffer = null
            outputBuffer = null
        }
    }

    // ── Production inference ──────────────────────────────────────────────

    private suspend fun ensureModelLoaded() {
        if (interpreter != null) return
        initMutex.withLock {
            if (interpreter != null) return
            loadModel("models/ca_mobilenetv3_small_int8.tflite", 1)
        }
    }

    private fun loadModel(assetPath: String, numThreads: Int) {
        val assetManager = context.assets

        val fileDescriptor: android.content.res.AssetFileDescriptor
        try {
            fileDescriptor = assetManager.openFd(assetPath)
        } catch (e: java.io.IOException) {
            throw IllegalStateException(
                "TFLite model not found in assets/$assetPath. "
                    + "Copy the trained model to mobile-frontend/assets/models/ and rebuild.",
                e,
            )
        }

        val modelBytes = ByteArray(fileDescriptor.length.toInt())
        FileInputStream(fileDescriptor.fileDescriptor).use { stream ->
            stream.channel.map(
                java.nio.channels.FileChannel.MapMode.READ_ONLY,
                fileDescriptor.startOffset,
                fileDescriptor.length,
            ).get(modelBytes)
        }
        fileDescriptor.close()

        val options = Interpreter.Options().apply {
            setNumThreads(numThreads)
        }
        interpreter = Interpreter(modelBytes, options)

        val inputDetails = interpreter!!.getInputTensor(0)
        val inputQuant = inputDetails.quantizationParams()
        inputScale = inputQuant.scale
        inputZeroPoint = inputQuant.zeroPoint

        val outputDetails = interpreter!!.getOutputTensor(0)
        val outputQuant = outputDetails.quantizationParams()
        outputScale = outputQuant.scale
        outputZeroPoint = outputQuant.zeroPoint

        modelFileName = assetPath.substringAfterLast('/').removeSuffix(".tflite")
        inputBuffer = ByteBuffer.allocateDirect(INPUT_SIZE).apply { order(ByteOrder.nativeOrder()) }
        outputBuffer = ByteBuffer.allocateDirect(OUTPUT_SIZE).apply { order(ByteOrder.nativeOrder()) }
    }

    private fun loadModelFresh(assetPath: String, numThreads: Int): Interpreter {
        val assetManager = context.assets
        val fileDescriptor: android.content.res.AssetFileDescriptor
        try {
            fileDescriptor = assetManager.openFd(assetPath)
        } catch (e: java.io.IOException) {
            throw IllegalStateException("TFLite model not found in assets/$assetPath", e)
        }

        val modelBytes = ByteArray(fileDescriptor.length.toInt())
        FileInputStream(fileDescriptor.fileDescriptor).use { stream ->
            stream.channel.map(
                java.nio.channels.FileChannel.MapMode.READ_ONLY,
                fileDescriptor.startOffset,
                fileDescriptor.length,
            ).get(modelBytes)
        }
        fileDescriptor.close()

        val options = Interpreter.Options().apply { setNumThreads(numThreads) }
        return Interpreter(modelBytes, options)
    }

    private suspend fun classifyImage(uri: String): Map<String, Any> {
        val currentInterpreter = interpreter
            ?: throw IllegalStateException("TFLite model is not loaded")
        val inputBuf = inputBuffer
            ?: throw IllegalStateException("Input buffer is not allocated")
        val outputBuf = outputBuffer
            ?: throw IllegalStateException("Output buffer is not allocated")

        if (uri.isBlank()) {
            throw IllegalArgumentException("Image URI must not be blank")
        }

        val bitmap = withContext(Dispatchers.IO) {
            readBitmapFromUri(uri)
        }
        if (bitmap == null) {
            throw IllegalArgumentException("Could not decode image from URI: $uri")
        }

        val width = bitmap.width
        val height = bitmap.height
        if (width <= 0 || height <= 0) {
            bitmap.recycle()
            throw IllegalArgumentException("Image has invalid dimensions: ${width}x${height}")
        }

        val resized = if (width != MODEL_WIDTH || height != MODEL_HEIGHT) {
            Bitmap.createScaledBitmap(bitmap, MODEL_WIDTH, MODEL_HEIGHT, true).also {
                if (it !== bitmap) bitmap.recycle()
            }
        } else {
            bitmap
        }

        inputBuf.clear()
        val pixels = IntArray(MODEL_WIDTH * MODEL_HEIGHT)
        resized.getPixels(pixels, 0, MODEL_WIDTH, 0, 0, MODEL_WIDTH, MODEL_HEIGHT)
        resized.recycle()

        for (pixel in pixels) {
            val r = (pixel shr 16) and 0xFF
            val g = (pixel shr 8) and 0xFF
            val b = pixel and 0xFF
            inputBuf.put(quantize(r))
            inputBuf.put(quantize(g))
            inputBuf.put(quantize(b))
        }
        inputBuf.rewind()

        outputBuf.clear()

        val startTime = System.nanoTime()
        inferenceMutex.withLock {
            currentInterpreter.run(inputBuf, outputBuf)
        }
        val elapsedMs = (System.nanoTime() - startTime) / 1_000_000.0

        outputBuf.rewind()
        val logits = FloatArray(NUM_CLASSES) { i ->
            (outputBuf.get(i).toInt() - outputZeroPoint) * outputScale
        }

        return mapOf(
            "scores" to logits.toList(),
            "latencyMs" to elapsedMs,
            "modelVersion" to modelFileName,
            "inputShape" to listOf(1, MODEL_WIDTH, MODEL_HEIGHT, CHANNELS),
            "inputDtype" to "int8",
            "outputDtype" to "int8",
            "labels" to LABELS.toList(),
        )
    }

    // ── Benchmark methods ─────────────────────────────────────────────────

    private fun getDeviceInfo(): Map<String, Any> {
        val activityManager = context.getSystemService(ActivityManager::class.java)
        val memInfo = ActivityManager.MemoryMemInfo()
        activityManager.getMemoryInfo(memInfo)

        val totalMemBytes = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            memInfo.totalMem
        } else {
            Runtime.getRuntime().maxMemory()
        }

        val runtime = Runtime.getRuntime()

        return mapOf(
            "device" to mapOf(
                "manufacturer" to Build.MANUFACTURER,
                "model" to Build.MODEL,
                "brand" to Build.BRAND,
                "hardware" to Build.HARDWARE,
                "board" to Build.BOARD,
                "device" to Build.DEVICE,
                "product" to Build.PRODUCT,
            ),
            "android" to mapOf(
                "version" to Build.VERSION.RELEASE,
                "sdk_int" to Build.VERSION.SDK_INT,
                "security_patch" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Build.VERSION.SECURITY_PATCH else "unknown",
            ),
            "cpu" to mapOf(
                "abi" to Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown",
                "all_abis" to Build.SUPPORTED_ABIS.toList(),
                "available_processors" to runtime.availableProcessors(),
            ),
            "memory" to mapOf(
                "total_ram_bytes" to totalMemBytes,
                "total_ram_mb" to totalMemBytes / (1024 * 1024),
                "max_heap_bytes" to runtime.maxMemory(),
                "available_heap_bytes" to runtime.freeMemory(),
            ),
            "java" to mapOf(
                "version" to System.getProperty("java.version") ?: "unknown",
                "vm_name" to System.getProperty("java.vm.name") ?: "unknown",
            ),
        )
    }

    private fun preprocessImage(uri: String): Map<String, Any> {
        if (uri.isBlank()) {
            throw IllegalArgumentException("Image URI must not be blank")
        }

        val startTime = System.nanoTime()

        val bitmap = readBitmapFromUri(uri)
            ?: throw IllegalArgumentException("Could not decode image from URI: $uri")

        val decodeMs = (System.nanoTime() - startTime) / 1_000_000.0

        val width = bitmap.width
        val height = bitmap.height
        if (width <= 0 || height <= 0) {
            bitmap.recycle()
            throw IllegalArgumentException("Image has invalid dimensions: ${width}x${height}")
        }

        val resizeStart = System.nanoTime()
        val resized = if (width != MODEL_WIDTH || height != MODEL_HEIGHT) {
            Bitmap.createScaledBitmap(bitmap, MODEL_WIDTH, MODEL_HEIGHT, true).also {
                if (it !== bitmap) bitmap.recycle()
            }
        } else {
            bitmap
        }
        val resizeMs = (System.nanoTime() - resizeStart) / 1_000_000.0

        val pixels = IntArray(MODEL_WIDTH * MODEL_HEIGHT)
        resized.getPixels(pixels, 0, MODEL_WIDTH, 0, 0, MODEL_WIDTH, MODEL_HEIGHT)
        resized.recycle()

        val totalMs = (System.nanoTime() - startTime) / 1_000_000.0

        return mapOf(
            "decodeMs" to decodeMs,
            "resizeMs" to resizeMs,
            "totalMs" to totalMs,
            "pixelCount" to MODEL_WIDTH * MODEL_HEIGHT * CHANNELS,
        )
    }

    private fun benchmarkModel(
        uri: String,
        modelVariant: String,
        warmupRuns: Int,
        measuredRuns: Int,
        numThreads: Int,
    ): Map<String, Any> {
        val assetPath = when (modelVariant) {
            "int8" -> "models/ca_mobilenetv3_small_int8.tflite"
            "fp32" -> "models/ca_mobilenetv3_small_fp32.tflite"
            else -> throw IllegalArgumentException("Unknown model variant: $modelVariant. Use 'int8' or 'fp32'.")
        }

        val benchmarkInterpreter = loadModelFresh(assetPath, numThreads)
        val benchInputQuant = benchmarkInterpreter.getInputTensor(0).quantizationParams()
        val benchOutputQuant = benchmarkInterpreter.getOutputTensor(0).quantizationParams()

        val inputBuf = ByteBuffer.allocateDirect(INPUT_SIZE).apply { order(ByteOrder.nativeOrder()) }
        val outputBuf = ByteBuffer.allocateDirect(OUTPUT_SIZE).apply { order(ByteOrder.nativeOrder()) }

        val bitmap = withContext(Dispatchers.IO) {
            readBitmapFromUri(uri)
        } ?: throw IllegalArgumentException("Could not decode benchmark image from URI: $uri")

        val resized = if (bitmap.width != MODEL_WIDTH || bitmap.height != MODEL_HEIGHT) {
            Bitmap.createScaledBitmap(bitmap, MODEL_WIDTH, MODEL_HEIGHT, true).also {
                if (it !== bitmap) bitmap.recycle()
            }
        } else {
            bitmap
        }

        val pixels = IntArray(MODEL_WIDTH * MODEL_HEIGHT)
        resized.getPixels(pixels, 0, MODEL_WIDTH, 0, 0, MODEL_WIDTH, MODEL_HEIGHT)
        resized.recycle()

        inputBuf.clear()
        for (pixel in pixels) {
            val r = (pixel shr 16) and 0xFF
            val g = (pixel shr 8) and 0xFF
            val b = pixel and 0xFF
            inputBuf.put(quantizeWith(r, benchInputQuant.scale, benchInputQuant.zeroPoint))
            inputBuf.put(quantizeWith(g, benchInputQuant.scale, benchInputQuant.zeroPoint))
            inputBuf.put(quantizeWith(b, benchInputQuant.scale, benchInputQuant.zeroPoint))
        }
        inputBuf.rewind()

        for (i in 0 until warmupRuns) {
            outputBuf.clear()
            benchmarkInterpreter.run(inputBuf, outputBuf)
        }

        val inferenceTimings = mutableListOf<Double>()
        for (i in 0 until measuredRuns) {
            outputBuf.clear()
            val start = System.nanoTime()
            benchmarkInterpreter.run(inputBuf, outputBuf)
            val elapsedMs = (System.nanoTime() - start) / 1_000_000.0
            inferenceTimings.add(elapsedMs)
        }

        outputBuf.rewind()
        val logits = FloatArray(NUM_CLASSES) { i ->
            (outputBuf.get(i).toInt() - benchOutputQuant.zeroPoint) * benchOutputQuant.scale
        }

        benchmarkInterpreter.close()

        val timingsArray = inferenceTimings.toDoubleArray()
        val sortedTimings = timingsArray.sorted()
        val sum = timingsArray.sum()
        val mean = sum / timingsArray.size
        val variance = timingsArray.map { (it - mean) * (it - mean) }.sum() / timingsArray.size
        val stdDev = kotlin.math.sqrt(variance)

        val modelFileSize = try {
            context.assets.openFd(assetPath).use { it.length }
        } catch (e: Exception) {
            0L
        }

        val runtime = Runtime.getRuntime()
        val usedMemory = runtime.totalMemory() - runtime.freeMemory()

        return mapOf(
            "modelVariant" to modelVariant,
            "modelFileSizeBytes" to modelFileSize,
            "warmupRuns" to warmupRuns,
            "measuredRuns" to measuredRuns,
            "numThreads" to numThreads,
            "inferenceTimingsMs" to timingsArray.toList(),
            "latency" to mapOf(
                "meanMs" to mean,
                "stdDevMs" to stdDev,
                "medianMs" to percentile(sortedTimings, 50.0),
                "p5Ms" to percentile(sortedTimings, 5.0),
                "p25Ms" to percentile(sortedTimings, 25.0),
                "p75Ms" to percentile(sortedTimings, 75.0),
                "p95Ms" to percentile(sortedTimings, 95.0),
                "p99Ms" to percentile(sortedTimings, 99.0),
                "minMs" to sortedTimings.first(),
                "maxMs" to sortedTimings.last(),
                "throughputImagesPerSecond" to if (mean > 0) 1000.0 / mean else 0.0,
            ),
            "memory" to mapOf(
                "usedHeapBytes" to usedMemory,
                "usedHeapMB" to usedMemory / (1024 * 1024),
                "maxHeapBytes" to runtime.maxMemory(),
                "totalHeapBytes" to runtime.totalMemory(),
            ),
            "output" to mapOf(
                "scores" to logits.toList(),
                "predictedClass" to LABELS[logits.indices.maxByOrNull { logits[it] } ?: 0],
                "inputShape" to listOf(1, MODEL_WIDTH, MODEL_HEIGHT, CHANNELS),
                "inputDtype" to if (modelVariant == "int8") "int8" else "float32",
                "outputDtype" to if (modelVariant == "int8") "int8" else "float32",
            ),
            "inputQuantization" to mapOf(
                "scale" to benchInputQuant.scale,
                "zeroPoint" to benchInputQuant.zeroPoint,
            ),
            "outputQuantization" to mapOf(
                "scale" to benchOutputQuant.scale,
                "zeroPoint" to benchOutputQuant.zeroPoint,
            ),
        )
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private fun percentile(sorted: List<Double>, p: Double): Double {
        if (sorted.isEmpty()) return 0.0
        val index = (p / 100.0 * (sorted.size - 1)).toInt().coerceIn(0, sorted.size - 1)
        return sorted[index]
    }

    private fun quantize(uint8: Int): Byte {
        val normalized = uint8.toFloat() / 255.0f
        val quantized = Math.round(normalized / inputScale + inputZeroPoint)
        return quantized.coerceIn(Byte.MIN_VALUE.toInt(), Byte.MAX_VALUE.toInt()).toByte()
    }

    private fun quantizeWith(uint8: Int, scale: Float, zeroPoint: Int): Byte {
        val normalized = uint8.toFloat() / 255.0f
        val quantized = Math.round(normalized / scale + zeroPoint)
        return quantized.coerceIn(Byte.MIN_VALUE.toInt(), Byte.MAX_VALUE.toInt()).toByte()
    }

    private fun readBitmapFromUri(uriString: String): Bitmap? {
        return try {
            val uri = Uri.parse(uriString)
            if (uri.scheme == "content" || uri.scheme == "file") {
                context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { fd ->
                    BitmapFactory.decodeFileDescriptor(fd.fileDescriptor)
                }
            } else {
                BitmapFactory.decodeFile(uriString)
            }
        } catch (e: Exception) {
            null
        }
    }

    companion object {
        private const val MODEL_WIDTH = 224
        private const val MODEL_HEIGHT = 224
        private const val CHANNELS = 3
        private const val NUM_CLASSES = 4
        private const val INPUT_SIZE = MODEL_WIDTH * MODEL_HEIGHT * CHANNELS
        private const val OUTPUT_SIZE = NUM_CLASSES
        private val LABELS = arrayOf(
            "healthy",
            "sigatoka",
            "panama-disease",
            "cordana-leaf-spot",
        )
    }
}
