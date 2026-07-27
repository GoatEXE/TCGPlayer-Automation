package com.tcgplayerautomation.scanner.domain

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.assertEquals

class DetectionStabilizerTest {
    @Test
    fun addsOnlyAfterRequiredRepeatsAndDedupesWhileLatched() {
        val stabilizer = DetectionStabilizer(requiredRepeats = 2, absenceSamplesToReset = 2)
        var state = StabilizerState()

        val first = stabilizer.update(state, "catalog:1")
        assertFalse(first.shouldAdd)
        state = first.state

        val second = stabilizer.update(state, "catalog:1")
        assertTrue(second.shouldAdd)
        assertEquals("catalog:1", second.state.latchedKey)
        state = second.state

        val third = stabilizer.update(state, "catalog:1")
        assertFalse(third.shouldAdd)
    }

    @Test
    fun differentStableCandidateCanHandoffWithoutBlankButSingleFlipDoesNotAdd() {
        val stabilizer = DetectionStabilizer(requiredRepeats = 2, absenceSamplesToReset = 2)
        var state = StabilizerState()

        state = stabilizer.update(state, "catalog:1").state
        val accepted = stabilizer.update(state, "catalog:1")
        assertTrue(accepted.shouldAdd)
        state = accepted.state

        val switchedOnce = stabilizer.update(state, "catalog:2")
        assertFalse(switchedOnce.shouldAdd)
        assertTrue(switchedOnce.blockedByLatchedCard)
        state = switchedOnce.state

        val oldCardAgain = stabilizer.update(state, "catalog:1")
        assertFalse(oldCardAgain.shouldAdd)
        state = oldCardAgain.state

        val newCardOnce = stabilizer.update(state, "catalog:2")
        assertFalse(newCardOnce.shouldAdd)
        assertTrue(newCardOnce.blockedByLatchedCard)

        val newCardStable = stabilizer.update(newCardOnce.state, "catalog:2")
        assertTrue(newCardStable.shouldAdd)
        assertFalse(newCardStable.blockedByLatchedCard)
        assertEquals("catalog:2", newCardStable.state.latchedKey)
    }

    @Test
    fun allowsAThenBThenAWhenEachNewCandidateIsStable() {
        val stabilizer = DetectionStabilizer(requiredRepeats = 2, absenceSamplesToReset = 2)
        var state = StabilizerState()

        state = stabilizer.update(state, "catalog:1").state
        state = stabilizer.update(state, "catalog:1").state

        state = stabilizer.update(state, "catalog:2").state
        val bAccepted = stabilizer.update(state, "catalog:2")
        assertTrue(bAccepted.shouldAdd)
        state = bAccepted.state

        state = stabilizer.update(state, "catalog:1").state
        val aAcceptedAgain = stabilizer.update(state, "catalog:1")
        assertTrue(aAcceptedAgain.shouldAdd)
    }

    @Test
    fun lowConfidenceOrNoisyCandidateCanRequireExtraRepeats() {
        val stabilizer = DetectionStabilizer(requiredRepeats = 2, absenceSamplesToReset = 2)
        var state = StabilizerState()

        state = stabilizer.update(state, "catalog:1", requiredRepeatsOverride = 3).state
        val second = stabilizer.update(state, "catalog:1", requiredRepeatsOverride = 3)
        assertFalse(second.shouldAdd)

        val third = stabilizer.update(second.state, "catalog:1", requiredRepeatsOverride = 3)
        assertTrue(third.shouldAdd)
    }

    @Test
    fun clearsLatchAfterAbsentSamples() {
        val stabilizer = DetectionStabilizer(requiredRepeats = 1, absenceSamplesToReset = 2)
        var state = stabilizer.update(StabilizerState(), "catalog:1").state

        state = stabilizer.update(state, null).state
        assertEquals("catalog:1", state.latchedKey)

        state = stabilizer.update(state, null).state
        assertNull(state.latchedKey)

        val next = stabilizer.update(state, "catalog:1")
        assertTrue(next.shouldAdd)
    }
}
