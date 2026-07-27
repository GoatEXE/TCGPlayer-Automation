package com.tcgplayerautomation.scanner.domain

data class StabilizerState(
    val pendingKey: String? = null,
    val pendingCount: Int = 0,
    val latchedKey: String? = null,
    val absenceCount: Int = 0,
)

data class StabilizerDecision(
    val state: StabilizerState,
    val shouldAdd: Boolean,
    val blockedByLatchedCard: Boolean = false,
)

class DetectionStabilizer(
    private val requiredRepeats: Int = 2,
    private val absenceSamplesToReset: Int = 2,
) {
    fun update(
        state: StabilizerState,
        detectedKey: String?,
        requiredRepeatsOverride: Int = requiredRepeats,
    ): StabilizerDecision {
        if (detectedKey == null) {
            val absenceCount = state.absenceCount + 1
            return StabilizerDecision(
                shouldAdd = false,
                state = StabilizerState(
                    pendingKey = null,
                    pendingCount = 0,
                    latchedKey = if (absenceCount >= absenceSamplesToReset) null else state.latchedKey,
                    absenceCount = absenceCount,
                ),
            )
        }

        val pendingCount = if (detectedKey == state.pendingKey) state.pendingCount + 1 else 1

        val requiredRepeatsForSample = requiredRepeatsOverride.coerceAtLeast(requiredRepeats)

        if (state.latchedKey != null && detectedKey != state.latchedKey) {
            val hasSwitchStabilized = pendingCount >= requiredRepeatsForSample
            return StabilizerDecision(
                shouldAdd = hasSwitchStabilized,
                blockedByLatchedCard = !hasSwitchStabilized,
                state = StabilizerState(
                    pendingKey = detectedKey,
                    pendingCount = pendingCount,
                    latchedKey = if (hasSwitchStabilized) detectedKey else state.latchedKey,
                    absenceCount = 0,
                ),
            )
        }

        val hasStabilized = pendingCount >= requiredRepeatsForSample
        val shouldAdd = hasStabilized && detectedKey != state.latchedKey

        return StabilizerDecision(
            shouldAdd = shouldAdd,
            state = StabilizerState(
                pendingKey = detectedKey,
                pendingCount = pendingCount,
                latchedKey = if (shouldAdd || hasStabilized) detectedKey else state.latchedKey,
                absenceCount = 0,
            ),
        )
    }
}
