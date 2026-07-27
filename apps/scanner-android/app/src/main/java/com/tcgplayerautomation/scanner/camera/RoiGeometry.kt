package com.tcgplayerautomation.scanner.camera

import kotlin.math.roundToInt
import kotlin.math.sqrt

data class RelativeRoi(
    val left: Float,
    val top: Float,
    val width: Float,
    val height: Float,
)

data class PixelRoi(
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
)

data class ScaledSize(
    val width: Int,
    val height: Int,
    val scale: Float,
)

fun RelativeRoi.toPixelRoi(imageWidth: Int, imageHeight: Int): PixelRoi {
    require(imageWidth > 0) { "imageWidth must be positive" }
    require(imageHeight > 0) { "imageHeight must be positive" }

    val x = (imageWidth * left).roundToInt().coerceIn(0, imageWidth - 1)
    val y = (imageHeight * top).roundToInt().coerceIn(0, imageHeight - 1)
    val cropWidth = (imageWidth * width).roundToInt().coerceAtLeast(1).coerceAtMost(imageWidth - x)
    val cropHeight = (imageHeight * height).roundToInt().coerceAtLeast(1).coerceAtMost(imageHeight - y)

    return PixelRoi(x = x, y = y, width = cropWidth, height = cropHeight)
}

fun calculateCappedScaledSize(
    sourceWidth: Int,
    sourceHeight: Int,
    requestedScale: Float,
    maxDimension: Int,
    maxPixels: Int,
): ScaledSize {
    require(sourceWidth > 0) { "sourceWidth must be positive" }
    require(sourceHeight > 0) { "sourceHeight must be positive" }
    require(requestedScale > 0f) { "requestedScale must be positive" }
    require(maxDimension > 0) { "maxDimension must be positive" }
    require(maxPixels > 0) { "maxPixels must be positive" }

    val dimensionScale = minOf(
        requestedScale,
        maxDimension.toFloat() / sourceWidth.toFloat(),
        maxDimension.toFloat() / sourceHeight.toFloat(),
    )
    val pixelScale = sqrt(maxPixels.toFloat() / (sourceWidth.toFloat() * sourceHeight.toFloat()))
    val finalScale = minOf(dimensionScale, pixelScale).coerceAtMost(requestedScale).coerceAtMost(1_000f)
    val width = (sourceWidth * finalScale).roundToInt().coerceAtLeast(1)
    val height = (sourceHeight * finalScale).roundToInt().coerceAtLeast(1)

    return ScaledSize(width = width, height = height, scale = finalScale)
}

val BottomLeftIdRoi = RelativeRoi(left = 0.00f, top = 0.76f, width = 0.82f, height = 0.24f)
val BottomRightVerticalIdRoi = RelativeRoi(left = 0.70f, top = 0.26f, width = 0.30f, height = 0.74f)
