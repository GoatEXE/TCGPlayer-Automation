package com.tcgplayerautomation.scanner.camera

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class RoiGeometryTest {
    @Test
    fun bottomLeftIdRoiIncludesBottomEdgeOfUprightFrame() {
        val roi = BottomLeftIdRoi.toPixelRoi(imageWidth = 4000, imageHeight = 3000)

        assertEquals(0, roi.x)
        assertEquals(2280, roi.y)
        assertEquals(3280, roi.width)
        assertEquals(720, roi.height)
        assertEquals(3000, roi.y + roi.height)
    }

    @Test
    fun bottomRightVerticalRoiIncludesRightAndBottomEdges() {
        val roi = BottomRightVerticalIdRoi.toPixelRoi(imageWidth = 4000, imageHeight = 3000)

        assertEquals(2800, roi.x)
        assertEquals(780, roi.y)
        assertEquals(1200, roi.width)
        assertEquals(2220, roi.height)
        assertEquals(4000, roi.x + roi.width)
        assertEquals(3000, roi.y + roi.height)
    }

    @Test
    fun cappedScalePreventsHugeRoiBitmaps() {
        val size = calculateCappedScaledSize(
            sourceWidth = 3280,
            sourceHeight = 720,
            requestedScale = 6.0f,
            maxDimension = 1600,
            maxPixels = 1_200_000,
        )

        assertTrue(size.width <= 1600)
        assertTrue(size.height <= 1600)
        assertTrue(size.width * size.height <= 1_200_000)
        assertTrue(size.scale < 6.0f)
    }

    @Test
    fun smallRoiCanUseRequestedScaleWhenUnderCaps() {
        val size = calculateCappedScaledSize(
            sourceWidth = 100,
            sourceHeight = 50,
            requestedScale = 3.0f,
            maxDimension = 1600,
            maxPixels = 1_200_000,
        )

        assertEquals(300, size.width)
        assertEquals(150, size.height)
        assertEquals(3.0f, size.scale)
    }

    @Test
    fun relativeRoiClampsToImageBounds() {
        val roi = RelativeRoi(left = 0.9f, top = 0.9f, width = 0.5f, height = 0.5f)
            .toPixelRoi(imageWidth = 100, imageHeight = 200)

        assertTrue(roi.x + roi.width <= 100)
        assertTrue(roi.y + roi.height <= 200)
    }
}
