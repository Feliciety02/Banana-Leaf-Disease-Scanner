package expo.modules.dahonmdtflite

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

@RunWith(AndroidJUnit4::class)
class BenchmarkDeviceProfileTest {

    private lateinit var context: Context

    @org.junit.Before
    fun setUp() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
    }

    @Test
    fun testDeviceModelIsPopulated() {
        val model = Build.MODEL
        assertNotNull("Build.MODEL must not be null", model)
        assertTrue("Build.MODEL must not be blank", model.isNotBlank())
        println("DEVICE_MODEL=$model")
    }

    @Test
    fun testDeviceManufacturerIsPopulated() {
        val manufacturer = Build.MANUFACTURER
        assertNotNull("Build.MANUFACTURER must not be null", manufacturer)
        assertTrue("Build.MANUFACTURER must not be blank", manufacturer.isNotBlank())
        println("DEVICE_MANUFACTURER=$manufacturer")
    }

    @Test
    fun testAndroidVersionIsAccessible() {
        val version = Build.VERSION.RELEASE
        val sdk = Build.VERSION.SDK_INT
        assertNotNull("Build.VERSION.RELEASE must not be null", version)
        assertTrue("SDK_INT must be positive", sdk > 0)
        println("ANDROID_VERSION=$version (SDK $sdk)")
    }

    @Test
    fun testCpuAbiIsAccessible() {
        val abi = Build.SUPPORTED_ABIS.firstOrNull()
        assertNotNull("First supported ABI must not be null", abi)
        assertTrue("ABI must not be blank", abi!!.isNotBlank())
        println("CPU_ABI=$abi")
        println("ALL_ABIS=${Build.SUPPORTED_ABIS.joinToString(", ")}")
    }

    @Test
    fun testRamIsReadable() {
        val activityManager = context.getSystemService(ActivityManager::class.java)
        val memInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)
        val totalRam = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            memInfo.totalMem
        } else {
            Runtime.getRuntime().maxMemory()
        }
        assertTrue("Total RAM must be positive", totalRam > 0)
        println("TOTAL_RAM_BYTES=$totalRam")
        println("TOTAL_RAM_MB=${totalRam / (1024 * 1024)}")
    }

    @Test
    fun testCpuCoreCountIsReadable() {
        val cores = Runtime.getRuntime().availableProcessors()
        assertTrue("CPU cores must be positive", cores > 0)
        println("CPU_CORES=$cores")
    }

    @Test
    fun testTfliteVersionIsAccessible() {
        val version = Interpreter.getCurrentOpResolver().toString()
        assertNotNull("TFLite op resolver must be accessible", version)
        println("TFLITE_RESOLVER=$version")
    }

    @Test
    fun testInt8ModelLoadsAndInfers() {
        val assetPath = "ca_mobilenetv3_small_int8.tflite"
        val fd = context.assets.openFd(assetPath)

        val modelBytes = ByteArray(fd.length.toInt())
        FileInputStream(fd.fileDescriptor).use { it.read(modelBytes) }
        fd.close()

        val interpreter = Interpreter(modelBytes, Interpreter.Options().apply { setNumThreads(1) })

        val inputDetails = interpreter.getInputTensor(0)
        val outputDetails = interpreter.getOutputTensor(0)
        assertEquals("INT8 input dtype", DataType.INT8, inputDetails.dataType())
        assertEquals("INT8 output dtype", DataType.INT8, outputDetails.dataType())
        assertTrue(
            "INT8 input shape must be [1,224,224,3]",
            inputDetails.shape().contentEquals(intArrayOf(1, 224, 224, 3)),
        )
        assertTrue(
            "INT8 output shape must be [1,4]",
            outputDetails.shape().contentEquals(intArrayOf(1, 4)),
        )
        val inputQuant = inputDetails.quantizationParams()
        val outputQuant = outputDetails.quantizationParams()

        println("INT8_INPUT_SHAPE=${inputDetails.shape().joinToString(",")}")
        println("INT8_INPUT_DTYPE=${inputDetails.dataType()}")
        println("INT8_INPUT_SCALE=${inputQuant.scale}")
        println("INT8_INPUT_ZERO_POINT=${inputQuant.zeroPoint}")
        println("INT8_OUTPUT_SHAPE=${outputDetails.shape().joinToString(",")}")
        println("INT8_OUTPUT_DTYPE=${outputDetails.dataType()}")
        println("INT8_OUTPUT_SCALE=${outputQuant.scale}")
        println("INT8_OUTPUT_ZERO_POINT=${outputQuant.zeroPoint}")

        val inputBuf = ByteBuffer.allocateDirect(224 * 224 * 3).apply { order(ByteOrder.nativeOrder()) }
        for (i in 0 until 224 * 224 * 3) {
            inputBuf.put(127.toByte())
        }
        inputBuf.rewind()

        val outputBuf = ByteBuffer.allocateDirect(4).apply { order(ByteOrder.nativeOrder()) }

        val warmup = 5
        for (i in 0 until warmup) {
            outputBuf.clear()
            interpreter.run(inputBuf, outputBuf)
        }

        val runs = 20
        val timings = mutableListOf<Long>()
        for (i in 0 until runs) {
            outputBuf.clear()
            val start = System.nanoTime()
            interpreter.run(inputBuf, outputBuf)
            timings.add(System.nanoTime() - start)
        }

        val timingsMs = timings.map { it / 1_000_000.0 }
        val meanMs = timingsMs.average()
        val minMs = timingsMs.min()
        val maxMs = timingsMs.max()
        val stdDev = kotlin.math.sqrt(timingsMs.map { (it - meanMs) * (it - meanMs) }.average())

        println("INT8_WARMUP=$warmup")
        println("INT8_MEASURED=$runs")
        println("INT8_MEAN_MS=${String.format("%.3f", meanMs)}")
        println("INT8_STDDEV_MS=${String.format("%.3f", stdDev)}")
        println("INT8_MIN_MS=${String.format("%.3f", minMs)}")
        println("INT8_MAX_MS=${String.format("%.3f", maxMs)}")
        println("INT8_THROUGHPUT=${String.format("%.1f", 1000.0 / meanMs)}")

        val runtime = Runtime.getRuntime()
        val usedMem = runtime.totalMemory() - runtime.freeMemory()
        println("INT8_HEAP_USED_BYTES=$usedMem")
        println("INT8_HEAP_USED_MB=${usedMem / (1024 * 1024)}")
        println("INT8_HEAP_MAX=${runtime.maxMemory()}")

        assertEquals("Output must have 4 classes", 4, outputBuf.capacity())

        outputBuf.rewind()
        val logits = FloatArray(4) { i ->
            (outputBuf.get(i).toInt() - outputQuant.zeroPoint) * outputQuant.scale
        }
        println("INT8_OUTPUT_LOGITS=${logits.joinToString(",") { String.format("%.4f", it) }}")

        interpreter.close()

        assertTrue("Mean latency must be positive", meanMs > 0)
        assertTrue("Mean latency must be reasonable (< 5000ms)", meanMs < 5000)
    }

    @Test
    fun testFp32ModelLoadsAndInfers() {
        val assetPath = "ca_mobilenetv3_small_fp32.tflite"
        val fd = try {
            context.assets.openFd(assetPath)
        } catch (e: Exception) {
            println("SKIP: $assetPath not found in test assets")
            return
        }

        val modelBytes = ByteArray(fd.length.toInt())
        FileInputStream(fd.fileDescriptor).use { it.read(modelBytes) }
        fd.close()

        val interpreter = Interpreter(modelBytes, Interpreter.Options().apply { setNumThreads(1) })

        val inputDetails = interpreter.getInputTensor(0)
        val outputDetails = interpreter.getOutputTensor(0)

        println("FP32_INPUT_SHAPE=${inputDetails.shape().joinToString(",")}")
        println("FP32_INPUT_DTYPE=${inputDetails.dataType()}")
        println("FP32_OUTPUT_SHAPE=${outputDetails.shape().joinToString(",")}")
        println("FP32_OUTPUT_DTYPE=${outputDetails.dataType()}")

        val inputBuf = ByteBuffer.allocateDirect(224 * 224 * 3 * 4).apply { order(ByteOrder.nativeOrder()) }
        for (i in 0 until 224 * 224 * 3) {
            inputBuf.putFloat(0.5f)
        }
        inputBuf.rewind()

        val outputBuf = ByteBuffer.allocateDirect(4 * 4).apply { order(ByteOrder.nativeOrder()) }

        val warmup = 5
        for (i in 0 until warmup) {
            outputBuf.clear()
            interpreter.run(inputBuf, outputBuf)
        }

        val runs = 20
        val timings = mutableListOf<Long>()
        for (i in 0 until runs) {
            outputBuf.clear()
            val start = System.nanoTime()
            interpreter.run(inputBuf, outputBuf)
            timings.add(System.nanoTime() - start)
        }

        val timingsMs = timings.map { it / 1_000_000.0 }
        val meanMs = timingsMs.average()
        val minMs = timingsMs.min()
        val maxMs = timingsMs.max()
        val stdDev = kotlin.math.sqrt(timingsMs.map { (it - meanMs) * (it - meanMs) }.average())

        println("FP32_WARMUP=$warmup")
        println("FP32_MEASURED=$runs")
        println("FP32_MEAN_MS=${String.format("%.3f", meanMs)}")
        println("FP32_STDDEV_MS=${String.format("%.3f", stdDev)}")
        println("FP32_MIN_MS=${String.format("%.3f", minMs)}")
        println("FP32_MAX_MS=${String.format("%.3f", maxMs)}")
        println("FP32_THROUGHPUT=${String.format("%.1f", 1000.0 / meanMs)}")

        val runtime = Runtime.getRuntime()
        val usedMem = runtime.totalMemory() - runtime.freeMemory()
        println("FP32_HEAP_USED_BYTES=$usedMem")
        println("FP32_HEAP_USED_MB=${usedMem / (1024 * 1024)}")

        assertEquals("Output must have 4 classes", 4, outputBuf.capacity() / 4)

        interpreter.close()

        assertTrue("Mean latency must be positive", meanMs > 0)
        assertTrue("Mean latency must be reasonable (< 5000ms)", meanMs < 5000)
    }

    @Test
    fun testModelSizeComparison() {
        val int8Path = "ca_mobilenetv3_small_int8.tflite"
        val fp32Path = "ca_mobilenetv3_small_fp32.tflite"

        val int8Size = context.assets.openFd(int8Path).use { it.length }

        val fp32Size = try {
            context.assets.openFd(fp32Path).use { it.length }
        } catch (e: Exception) {
            println("SKIP: $fp32Path not found; cannot compare sizes")
            println("INT8_MODEL_SIZE_BYTES=$int8Size")
            return
        }

        val reduction = 1.0 - int8Size.toDouble() / fp32Size.toDouble()

        println("INT8_MODEL_SIZE_BYTES=$int8Size")
        println("FP32_MODEL_SIZE_BYTES=$fp32Size")
        println("SIZE_REDUCTION_RATIO=${String.format("%.4f", reduction)}")
        println("SIZE_REDUCTION_PERCENT=${String.format("%.1f", reduction * 100)}")

        assertTrue("INT8 model must be smaller than FP32", int8Size < fp32Size)
        assertTrue("Size reduction must be at least 40%", reduction >= 0.40)
    }
}
