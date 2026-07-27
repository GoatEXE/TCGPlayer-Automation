package com.tcgplayerautomation.scanner.domain

import com.tcgplayerautomation.scanner.data.BulkCollectionItemRequest
import com.tcgplayerautomation.scanner.data.ScannerCandidate
import com.tcgplayerautomation.scanner.data.ScannerMatch

const val FINISH_NORMAL = "Normal"
const val FINISH_FOIL = "Foil"

data class ScannedCard(
    val catalogCardId: String,
    val name: String,
    val setCode: String? = null,
    val number: String? = null,
    val finish: String = FINISH_NORMAL,
)

data class ScannedCardGroup(
    val card: ScannedCard,
    val quantity: Int,
)

data class ScanSessionState(
    val groups: List<ScannedCardGroup> = emptyList(),
    val history: List<ScannedCard> = emptyList(),
) {
    val totalQuantity: Int = groups.sumOf { it.quantity }
}

fun ScannerCandidate.stableKey(): String? = match?.catalogCardIdString?.takeIf { it.isNotBlank() }?.let { "catalog:$it" }

fun ScannerCandidate.requiresManualSelection(): Boolean = status == "ambiguous" && alternatives.isNotEmpty()

fun ScannerMatch.toScannedCard(
    fallbackSetCode: String? = null,
    fallbackNumber: String? = null,
): ScannedCard = ScannedCard(
    catalogCardId = catalogCardIdString,
    name = name,
    setCode = setCode ?: fallbackSetCode,
    number = number ?: fallbackNumber,
)

fun ScannerCandidate.toScannedCard(): ScannedCard? {
    val match = match ?: return null
    return match.toScannedCard(fallbackSetCode = setCode, fallbackNumber = number)
}

class SessionAccumulator(initialState: ScanSessionState = ScanSessionState()) {
    var state: ScanSessionState = initialState
        private set

    fun add(card: ScannedCard): ScanSessionState {
        val groups = state.groups.toMutableList()
        val index = groups.indexOfFirst { it.card.catalogCardId == card.catalogCardId && it.card.finish == card.finish }
        if (index >= 0) {
            val existing = groups[index]
            groups[index] = existing.copy(quantity = existing.quantity + 1)
        } else {
            groups.add(ScannedCardGroup(card = card, quantity = 1))
        }
        state = state.copy(groups = groups, history = state.history + card)
        return state
    }

    fun addLastCopy(): ScanSessionState {
        val last = state.history.lastOrNull() ?: return state
        return add(last)
    }

    fun moveOneToFinish(catalogCardId: String, fromFinish: String, toFinish: String): ScanSessionState {
        if (fromFinish == toFinish) return state

        val indexToMove = state.history.indexOfLast { card ->
            card.catalogCardId == catalogCardId && card.finish == fromFinish
        }
        return moveHistoryIndexToFinish(indexToMove, toFinish)
    }

    fun setLastFinish(toFinish: String): ScanSessionState {
        val lastIndex = state.history.lastIndex
        return moveHistoryIndexToFinish(lastIndex, toFinish)
    }

    private fun moveHistoryIndexToFinish(indexToMove: Int, toFinish: String): ScanSessionState {
        if (indexToMove < 0) return state
        if (state.history[indexToMove].finish == toFinish) return state

        val updatedHistory = state.history.mapIndexed { index, card ->
            if (index == indexToMove) card.copy(finish = toFinish) else card
        }
        state = ScanSessionState(history = updatedHistory).rebuildGroupsFromHistory()
        return state
    }

    fun undo(): ScanSessionState {
        val removed = state.history.lastOrNull() ?: return state
        val groups = state.groups.toMutableList()
        val index = groups.indexOfFirst { it.card.catalogCardId == removed.catalogCardId && it.card.finish == removed.finish }
        if (index >= 0) {
            val existing = groups[index]
            if (existing.quantity <= 1) {
                groups.removeAt(index)
            } else {
                groups[index] = existing.copy(quantity = existing.quantity - 1)
            }
        }
        state = state.copy(groups = groups, history = state.history.dropLast(1))
        return state
    }

    fun clear(): ScanSessionState {
        state = ScanSessionState()
        return state
    }

    fun asBulkItems(): List<BulkCollectionItemRequest> = state.groups.map {
        BulkCollectionItemRequest(
            catalogCardId = it.card.catalogCardId,
            quantity = it.quantity,
            finish = it.card.finish,
        )
    }

    private fun ScanSessionState.rebuildGroupsFromHistory(): ScanSessionState {
        val rebuilt = SessionAccumulator()
        history.forEach { rebuilt.add(it) }
        return rebuilt.state
    }
}
