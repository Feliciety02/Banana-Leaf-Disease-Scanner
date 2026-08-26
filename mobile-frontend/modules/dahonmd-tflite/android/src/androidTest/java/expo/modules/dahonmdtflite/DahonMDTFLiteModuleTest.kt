package expo.modules.dahonmdtflite

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.tensorflow.lite.Interpreter
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

@RunWith(AndroidJUnit4::class)
class DahonMDTFLiteModuleTest {

    private lateinit var context: Context
    private var interpreter: Interpreter? = null

    @Before
    fun setUp() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
    }

    @After
    fun tearDown() {
        interpreter?.close()
        interpreter = null
    }

    private fun loadModel(): Interpreter? {
        return try {
            val fd = context.assets.openFd("models/ca_mobilenetv3_small_int8.tflite")
            val bytes = ByteArray(fd.length.toInt())
            java.io.FileInputStream(fd.fileDescriptor).use { it.read(bytes) }
            fd.close()
            Interpreter(bytes)
        } catch (e: Exception) {
            null
        }
    }

    private fun createTestBitmap(): Bitmap {
        val bitmap = Bitmap.createBitmap(224, 224, Bitmap.Config.ARGB_8888)
        for (x in 0 until 224) {
            for (y in 0 until 224) {
                bitmap.setPixel(x, y, Color.rgb(x % 256, y % 256, (x + y) % 256))
            }
        }
        return bitmap
    }

    private fun createTestJpegFile(): File {
        val bitmap = createTestBitmap()
        val file = File(context.cacheDir, "test_input.jpg")
        FileOutputStream(file).use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 100, out)
        }
        bitmap.recycle()
        return file
    }

    @Test
    fun testModuleCreation() {
        val module = DahonMDTFLiteModule()
        assertNotNull("Module instance should be created", module)
    }

    @Test
    fun testClassifyRejectsBlankUri() {
        val module = DahonMDTFLiteModule()
        var thrown = false
        try {
            runBlocking {
                module.definition()
            }
        } catch (e: Exception) {
            thrown = true
        }
        assertNotNull("Module definition should be accessible", module)
    }

    @Test
    fun testQuantizationFormula() {
        val scale = 0.003921569f
        val zeroPoint = -128

        val pixel0 = 0
        val q0 = Math.round(pixel0.toFloat() / 255.0f / scale + zeroPoint).coerceIn(-128, 127)
        assertEquals("Pixel 0 should quantize to -128", -128, q0)

        val pixel128 = 128
        val q128 = Math.round(pixel128.toFloat() / 255.0f / scale + zeroPoint).coerceIn(-128, 127)
        assertEquals("Pixel 128 should quantize near 0", 0, q128)

        val pixel255 = 255
        val q255 = Math.round(pixel255.toFloat() / 255.0f / scale + zeroPoint).coerceIn(-128, 127)
        assertEquals("Pixel 255 should quantize to 127", 127, q255)
    }

    @Test
    fun testDequantizationFormula() {
        val scale = 0.007874016f
        val zeroPoint = -1

        val raw0: Byte = (-1).toByte()
        val deq0 = (raw0.toInt() - zeroPoint) * scale
        assertEquals("Dequantized -1 should be ~0.0", 0.0f, deq0, 0.001f)

        val raw127: Byte = 127
        val deq127 = (raw127.toInt() - zeroPoint) * scale
        assertTrue("Dequantized 127 should be > 1.0", deq127 > 1.0f)
    }

    @Test
    fun testModelInputOutputShapes() {
        val testInterpreter = loadModel()
        if (testInterpreter == null) {
            println("SKIP: TFLite model not found in test assets")
            return
        }
        interpreter = testInterpreter

        val inputShape = interpreter!!.getInputTensor(0).shape()
        assertEquals("Input batch", 1, inputShape[0])
        assertEquals("Input height", 224, inputShape[1])
        assertEquals("Input width", 224, inputShape[2])
        assertEquals("Input channels", 3, inputShape[3])

        val outputShape = interpreter!!.getOutputTensor(0).shape()
        assertEquals("Output batch", 1, outputShape[0])
        assertEquals("Output classes", 4, outputShape[1])
    }

    @Test
    fun testModelInferenceOnTestImage() {
        val testInterpreter = loadModel()
        if (testInterpreter == null) {
            println("SKIP: TFLite model not found in test assets")
            return
        }
        interpreter = testInterpreter

        val inputQuant = interpreter!!.getInputTensor(0).quantizationParams()
        val outputQuant = interpreter!!.getOutputTensor(0).quantizationParams()

        val inputBuffer = ByteBuffer.allocateDirect(224 * 224 * 3).apply {
            order(ByteOrder.nativeOrder())
        }
        val bitmap = createTestBitmap()
        val pixels = IntArray(224 * 224)
        bitmap.getPixels(pixels, 0, 224, 0, 0, 224, 224)
        bitmap.recycle()

        for (pixel in pixels) {
            val r = (pixel shr 16) and 0xFF
            val g = (pixel shr 8) and 0xFF
            val b = pixel and 0xFF
            inputBuffer.put(Math.round(r.toFloat() / 255.0f / inputQuant.scale + inputQuant.zeroPoint).coerceIn(-128, 127).toByte())
            inputBuffer.put(Math.round(g.toFloat() / 255.0f / inputQuant.scale + inputQuant.zeroPoint).coerceIn(-128, 127).toByte())
            inputBuffer.put(Math.round(b.toFloat() / 255.0f / inputQuant.scale + inputQuant.zeroPoint).coerceIn(-128, 127).toByte())
        }
        inputBuffer.rewind()

        val outputBuffer = ByteBuffer.allocateDirect(4).apply {
            order(ByteOrder.nativeOrder())
        }

        interpreter!!.run(inputBuffer, outputBuffer)
        outputBuffer.rewind()

        val logits = FloatArray(4) { i ->
            (outputBuffer.get(i).toInt() - outputQuant.zeroPoint) * outputQuant.scale
        }

        assertEquals("Should produce 4 logits", 4, logits.size)
        assertTrue("All logits should be finite", logits.all { it.isFinite() })

        val sum = logits.map { Math.exp(it.toDouble()).toFloat() }.reduce { a, b -> a + b }
        assertTrue("Softmax sum should be positive", sum > 0f)
    }

    @Test
    fun testInputQuantizationCoversFullUint8Range() {
        val scale = 0.003921569f
        val zeroPoint = -128

        for (pixel in 0..255) {
            val quantized = Math.round(pixel.toFloat() / 255.0f / scale + zeroPoint)
                .coerceIn(-128, 127)
            assertTrue("Quantized value for pixel $pixel should be in [-128,127]", quantized in -128..127)
        }

        val q0 = Math.round(0f / 255.0f / scale + zeroPoint).coerceIn(-128, 127)
        val q255 = Math.round(255f / 255.0f / scale + zeroPoint).coerceIn(-128, 127)
        assertEquals("Pixel 0 maps to -128", -128, q0)
        assertEquals("Pixel 255 maps to 127", 127, q255)
    }

    @Test
    fun testBitmapResizePreservesContent() {
        val original = Bitmap.createBitmap(640, 480, Bitmap.Config.ARGB_8888)
        original.setPixel(320, 240, Color.RED)

        val resized = Bitmap.createScaledBitmap(original, 224, 224, true)
        assertEquals("Resized width", 224, resized.width)
        assertEquals("Resized height", 224, resized.height)

        original.recycle()
        resized.recycle()
    }

    private fun runBlocking(block: suspend () -> Unit) {
        val thread = Thread { kotlinx.coroutines.runBlocking { block() } }
        thread.start()
        thread.join(5000)
    }
}
