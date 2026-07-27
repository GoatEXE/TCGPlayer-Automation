package com.tcgplayerautomation.scanner.camera

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import android.os.Handler
import android.os.Looper
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.roundToInt

private const val REGION_BOTTOM_LEFT = "bottom-left"
private const val REGION_BOTTOM_RIGHT = "bottom-right"
private const val REGION_NATIVE = "native"
private const val ID_ROI_SCALE = 3.0f
private const val ID_ROI_MAX_DIMENSION = 1600
private const val ID_ROI_MAX_PIXELS = 1_200_000
private const val FULL_FRAME_MAX_DIMENSION = 900
private const val DEBUG_THUMBNAIL_MAX_DIMENSION = 320

data class OcrRegionText(
    val region: String,
    val text: String,
    val variant: String = "natural",
    val debugImageJpeg: ByteArray? = null,
    val metadata: String? = null,
)

private data class OcrRegionSpec(
    val region: String,
    val variant: String,
    val roi: PixelRoi? = null,
    val rotationDegrees: Float = 0f,
    val processing: RoiProcessing = RoiProcessing.Natural,
    val metadata: String,
)

private enum class RoiProcessing { Natural, Grayscale, Contrast, Inverted, FullFrame }

class MlKitTextAnalyzer(
    private val throttleMs: Long = 900,
    private val onTextRecognized: (List<OcrRegionText>) -> Unit,
    private val onError: (Throwable) -> Unit,
) : ImageAnalysis.Analyzer, AutoCloseable {
    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val inFlight = AtomicBoolean(false)
    @Volatile private var closed = false
    private var lastStartedAt = 0L
    private var backoffUntilMs = 0L

    @SuppressLint("UnsafeOptInUsageError")
    @OptIn(ExperimentalGetImage::class)
    override fun analyze(imageProxy: ImageProxy) {
        val now = System.currentTimeMillis()
        val mediaImage = imageProxy.image
        if (closed || mediaImage == null || inFlight.get() || now < backoffUntilMs || now - lastStartedAt < throttleMs) {
            imageProxy.close()
            return
        }

        inFlight.set(true)
        lastStartedAt = now

        val upright = try {
            imageProxy.toUprightBitmap()
        } catch (error: Throwable) {
            inFlight.set(false)
            imageProxy.close()
            handleProcessingError(error)
            return
        }

        imageProxy.close()
        val specs = createRegionSpecs(upright.width, upright.height)
        recognizeNext(upright, specs, mutableListOf(), 0)
    }

    private fun recognizeNext(
        upright: Bitmap,
        specs: List<OcrRegionSpec>,
        results: MutableList<OcrRegionText>,
        index: Int,
    ) {
        if (closed || index >= specs.size) {
            inFlight.set(false)
            if (!upright.isRecycled) upright.recycle()
            if (!closed) postText(results)
            return
        }

        val spec = specs[index]
        val bitmap = try {
            upright.createBitmapForSpec(spec)
        } catch (error: Throwable) {
            results.add(OcrRegionText(region = spec.region, text = "", variant = spec.variant, metadata = spec.metadata))
            handleProcessingError(error)
            recognizeNext(upright, specs, results, index + 1)
            return
        }
        val debugJpeg = try {
            bitmap.toDebugJpeg()
        } catch (error: Throwable) {
            handleProcessingError(error)
            null
        }

        try {
            recognizer.process(InputImage.fromBitmap(bitmap, 0))
                .addOnSuccessListener { result ->
                    results.add(
                        OcrRegionText(
                            region = spec.region,
                            text = result.text.trim(),
                            variant = spec.variant,
                            debugImageJpeg = debugJpeg,
                            metadata = spec.metadata,
                        ),
                    )
                }
                .addOnFailureListener { error ->
                    results.add(
                        OcrRegionText(
                            region = spec.region,
                            text = "",
                            variant = spec.variant,
                            debugImageJpeg = debugJpeg,
                            metadata = spec.metadata,
                        ),
                    )
                    postError(error)
                }
                .addOnCompleteListener {
                    if (!bitmap.isRecycled) bitmap.recycle()
                    recognizeNext(upright, specs, results, index + 1)
                }
        } catch (error: Throwable) {
            if (!bitmap.isRecycled) bitmap.recycle()
            results.add(
                OcrRegionText(
                    region = spec.region,
                    text = "",
                    variant = spec.variant,
                    debugImageJpeg = debugJpeg,
                    metadata = spec.metadata,
                ),
            )
            handleProcessingError(error)
            recognizeNext(upright, specs, results, index + 1)
        }
    }

    override fun close() {
        closed = true
        mainHandler.removeCallbacksAndMessages(null)
        recognizer.close()
    }

    private fun handleProcessingError(error: Throwable) {
        if (error is OutOfMemoryError) {
            backoffUntilMs = System.currentTimeMillis() + 3_000
        }
        postError(error)
    }

    private fun postText(results: List<OcrRegionText>) {
        mainHandler.post {
            if (!closed) onTextRecognized(results)
        }
    }

    private fun postError(error: Throwable) {
        mainHandler.post {
            if (!closed) onError(error)
        }
    }
}

private fun createRegionSpecs(frameWidth: Int, frameHeight: Int): List<OcrRegionSpec> {
    val bottomLeftRoi = BottomLeftIdRoi.toPixelRoi(frameWidth, frameHeight)
    val bottomRightRoi = BottomRightVerticalIdRoi.toPixelRoi(frameWidth, frameHeight)
    val blMetadata = "frame=${frameWidth}x$frameHeight roi=$bottomLeftRoi cap=${ID_ROI_MAX_DIMENSION}px/${ID_ROI_MAX_PIXELS}px"
    val brMetadata = "frame=${frameWidth}x$frameHeight roi=$bottomRightRoi cap=${ID_ROI_MAX_DIMENSION}px/${ID_ROI_MAX_PIXELS}px"

    return buildList {
        addIdSpecs(REGION_BOTTOM_LEFT, "bl", bottomLeftRoi, rotationDegrees = 0f, metadata = blMetadata)
        addIdSpecs(REGION_BOTTOM_RIGHT, "br-cw", bottomRightRoi, rotationDegrees = 90f, metadata = "$brMetadata rotate=90")
        addIdSpecs(REGION_BOTTOM_RIGHT, "br-ccw", bottomRightRoi, rotationDegrees = -90f, metadata = "$brMetadata rotate=-90")
        add(OcrRegionSpec(REGION_NATIVE, "full", processing = RoiProcessing.FullFrame, metadata = "frame=${frameWidth}x$frameHeight downscaleMax=$FULL_FRAME_MAX_DIMENSION"))
    }
}

private fun MutableList<OcrRegionSpec>.addIdSpecs(
    region: String,
    prefix: String,
    roi: PixelRoi,
    rotationDegrees: Float,
    metadata: String,
) {
    add(OcrRegionSpec(region, "$prefix-natural", roi, rotationDegrees, RoiProcessing.Natural, metadata))
    add(OcrRegionSpec(region, "$prefix-gray", roi, rotationDegrees, RoiProcessing.Grayscale, metadata))
    add(OcrRegionSpec(region, "$prefix-contrast", roi, rotationDegrees, RoiProcessing.Contrast, metadata))
    add(OcrRegionSpec(region, "$prefix-inverted", roi, rotationDegrees, RoiProcessing.Inverted, metadata))
}

private fun Bitmap.createBitmapForSpec(spec: OcrRegionSpec): Bitmap {
    if (spec.processing == RoiProcessing.FullFrame) {
        return scaleToMaxDimension(FULL_FRAME_MAX_DIMENSION)
    }

    val roi = spec.roi ?: error("ROI is required for ${spec.variant}")
    val cropped = Bitmap.createBitmap(this, roi.x, roi.y, roi.width, roi.height)
    val rotated = if (spec.rotationDegrees == 0f) cropped else cropped.rotate(spec.rotationDegrees).also { cropped.recycle() }
    val scaled = rotated.scaleCapped(ID_ROI_SCALE, ID_ROI_MAX_DIMENSION, ID_ROI_MAX_PIXELS).also {
        if (it !== rotated && !rotated.isRecycled) rotated.recycle()
    }

    return when (spec.processing) {
        RoiProcessing.Natural -> scaled
        RoiProcessing.Grayscale -> scaled.grayscale().also { scaled.recycle() }
        RoiProcessing.Contrast -> scaled.highContrast(invert = false).also { scaled.recycle() }
        RoiProcessing.Inverted -> scaled.highContrast(invert = true).also { scaled.recycle() }
        RoiProcessing.FullFrame -> scaled
    }
}

private fun ImageProxy.toUprightBitmap(): Bitmap {
    val image = image ?: error("ImageProxy had no backing image")
    val nv21 = image.toNv21()
    val jpeg = ByteArrayOutputStream().use { output ->
        YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
            .compressToJpeg(Rect(0, 0, image.width, image.height), 90, output)
        output.toByteArray()
    }
    val bitmap = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)
        ?: error("Failed to decode camera frame")
    val rotation = imageInfo.rotationDegrees.toFloat()
    return if (rotation == 0f) bitmap else bitmap.rotate(rotation).also { bitmap.recycle() }
}

private fun Image.toNv21(): ByteArray {
    val width = width
    val height = height
    val ySize = width * height
    val chromaWidth = width / 2
    val chromaHeight = height / 2
    val output = ByteArray(ySize + 2 * chromaWidth * chromaHeight)

    planes[0].copyTo(output, width, height, offset = 0, outputPixelStride = 1)
    planes[2].copyTo(output, chromaWidth, chromaHeight, offset = ySize, outputPixelStride = 2)
    planes[1].copyTo(output, chromaWidth, chromaHeight, offset = ySize + 1, outputPixelStride = 2)

    return output
}

private fun Image.Plane.copyTo(
    output: ByteArray,
    width: Int,
    height: Int,
    offset: Int,
    outputPixelStride: Int,
) {
    val input = buffer.duplicate()
    val rowStride = rowStride
    val pixelStride = pixelStride
    val rowData = ByteArray(rowStride)
    var outputOffset = offset

    for (row in 0 until height) {
        val bytesToRead = if (pixelStride == 1 && outputPixelStride == 1) {
            width
        } else {
            (width - 1) * pixelStride + 1
        }

        if (pixelStride == 1 && outputPixelStride == 1) {
            input.get(output, outputOffset, width)
            outputOffset += width
        } else {
            input.get(rowData, 0, bytesToRead)
            for (column in 0 until width) {
                output[outputOffset] = rowData[column * pixelStride]
                outputOffset += outputPixelStride
            }
        }

        if (row < height - 1) {
            input.position(input.position() + rowStride - bytesToRead)
        }
    }
}

private fun Bitmap.scaleCapped(requestedScale: Float, maxDimension: Int, maxPixels: Int): Bitmap {
    val size = calculateCappedScaledSize(width, height, requestedScale, maxDimension, maxPixels)
    if (size.width == width && size.height == height) return this.copy(config ?: Bitmap.Config.ARGB_8888, false)
    return Bitmap.createScaledBitmap(this, size.width, size.height, true)
}

private fun Bitmap.grayscale(): Bitmap {
    val pixels = IntArray(width * height)
    getPixels(pixels, 0, width, 0, 0, width, height)

    for (index in pixels.indices) {
        val color = pixels[index]
        val luminance = (Color.red(color) * 0.299 + Color.green(color) * 0.587 + Color.blue(color) * 0.114).roundToInt()
        pixels[index] = Color.argb(255, luminance, luminance, luminance)
    }

    return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
}

private fun Bitmap.highContrast(invert: Boolean): Bitmap {
    val pixels = IntArray(width * height)
    getPixels(pixels, 0, width, 0, 0, width, height)

    for (index in pixels.indices) {
        val color = pixels[index]
        val luminance = (Color.red(color) * 0.299 + Color.green(color) * 0.587 + Color.blue(color) * 0.114).roundToInt()
        val bright = luminance >= 150
        val value = if (invert) {
            if (bright) 0 else 255
        } else {
            if (bright) 255 else 0
        }
        pixels[index] = Color.argb(255, value, value, value)
    }

    return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
}

private fun Bitmap.rotate(degrees: Float): Bitmap {
    val matrix = Matrix().apply { postRotate(degrees) }
    return Bitmap.createBitmap(this, 0, 0, width, height, matrix, true)
}

private fun Bitmap.scaleToMaxDimension(maxDimension: Int): Bitmap {
    val largest = maxOf(width, height)
    if (largest <= maxDimension) return copy(config ?: Bitmap.Config.ARGB_8888, false)

    val scale = maxDimension.toFloat() / largest.toFloat()
    return Bitmap.createScaledBitmap(
        this,
        (width * scale).roundToInt().coerceAtLeast(1),
        (height * scale).roundToInt().coerceAtLeast(1),
        true,
    )
}

private fun Bitmap.toDebugJpeg(): ByteArray = scaleToMaxDimension(DEBUG_THUMBNAIL_MAX_DIMENSION).let { thumbnail ->
    ByteArrayOutputStream().use { output ->
        thumbnail.compress(Bitmap.CompressFormat.JPEG, 75, output)
        if (!thumbnail.isRecycled) thumbnail.recycle()
        output.toByteArray()
    }
}
