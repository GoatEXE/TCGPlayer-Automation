package com.tcgplayerautomation.scanner.domain

import com.tcgplayerautomation.scanner.data.ScannerCandidate
import com.tcgplayerautomation.scanner.data.ScannerMatch
import kotlinx.serialization.json.JsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

class SessionAccumulatorTest {
    @Test
    fun groupsDuplicateCatalogCardsAndSupportsUndo() {
        val accumulator = SessionAccumulator()
        val card = ScannedCard(catalogCardId = "42", name = "Test Card", setCode = "UNL", number = "209/219")
        val other = ScannedCard(catalogCardId = "43", name = "Other Card")

        accumulator.add(card)
        accumulator.add(card)
        accumulator.add(other)

        assertEquals(3, accumulator.state.totalQuantity)
        assertEquals(2, accumulator.state.groups.size)
        assertEquals(2, accumulator.state.groups.first { it.card.catalogCardId == "42" }.quantity)

        accumulator.undo()

        assertEquals(2, accumulator.state.totalQuantity)
        assertEquals(listOf("42" to 2), accumulator.asBulkItems().map { it.catalogCardId to it.quantity })
    }

    @Test
    fun groupsSameCardSeparatelyByFinishAndSendsFinishInBulkPayload() {
        val accumulator = SessionAccumulator()
        val normal = ScannedCard(catalogCardId = "42", name = "Test Card", finish = FINISH_NORMAL)
        val foil = normal.copy(finish = FINISH_FOIL)

        accumulator.add(normal)
        accumulator.add(foil)

        assertEquals(2, accumulator.state.groups.size)
        assertEquals(
            listOf("42" to FINISH_NORMAL, "42" to FINISH_FOIL),
            accumulator.asBulkItems().map { it.catalogCardId to it.finish },
        )
    }

    @Test
    fun movingOneFinishSplitsAndMergesGroupsAndUpdatesHistory() {
        val accumulator = SessionAccumulator()
        val normal = ScannedCard(catalogCardId = "42", name = "Test Card", finish = FINISH_NORMAL)
        val foil = normal.copy(finish = FINISH_FOIL)

        accumulator.add(normal)
        accumulator.add(normal)
        accumulator.add(foil)
        accumulator.moveOneToFinish(catalogCardId = "42", fromFinish = FINISH_NORMAL, toFinish = FINISH_FOIL)

        assertEquals(2, accumulator.state.groups.size)
        assertEquals(1, accumulator.state.groups.first { it.card.finish == FINISH_NORMAL }.quantity)
        assertEquals(2, accumulator.state.groups.first { it.card.finish == FINISH_FOIL }.quantity)
        assertEquals(listOf(FINISH_NORMAL, FINISH_FOIL, FINISH_FOIL), accumulator.state.history.map { it.finish })
    }

    @Test
    fun setLastFinishUpdatesOnlyLastScannedCardForScannerFoilToggle() {
        val accumulator = SessionAccumulator()
        accumulator.add(ScannedCard(catalogCardId = "42", name = "First", finish = FINISH_NORMAL))
        accumulator.add(ScannedCard(catalogCardId = "43", name = "Second", finish = FINISH_NORMAL))

        accumulator.setLastFinish(FINISH_FOIL)

        assertEquals(listOf(FINISH_NORMAL, FINISH_FOIL), accumulator.state.history.map { it.finish })
        assertEquals(FINISH_FOIL, accumulator.state.history.last().finish)
    }

    @Test
    fun addLastCopyUsesCurrentEditedFinish() {
        val accumulator = SessionAccumulator()
        val card = ScannedCard(catalogCardId = "42", name = "Test Card", finish = FINISH_NORMAL)

        accumulator.add(card)
        accumulator.moveOneToFinish(catalogCardId = "42", fromFinish = FINISH_NORMAL, toFinish = FINISH_FOIL)
        accumulator.addLastCopy()

        assertEquals(2, accumulator.state.totalQuantity)
        assertEquals(FINISH_FOIL, accumulator.state.groups.single().card.finish)
        assertEquals(2, accumulator.asBulkItems().single().quantity)
        assertEquals(FINISH_FOIL, accumulator.asBulkItems().single().finish)
    }

    @Test
    fun addLastCopyIncrementsMostRecentCard() {
        val accumulator = SessionAccumulator()
        val card = ScannedCard(catalogCardId = "42", name = "Test Card")

        accumulator.add(card)
        accumulator.addLastCopy()

        assertEquals(2, accumulator.state.totalQuantity)
        assertEquals(2, accumulator.state.groups.single().quantity)
    }

    @Test
    fun ambiguousCandidateRequiresSelectionBeforeSessionChanges() {
        val accumulator = SessionAccumulator()
        val ambiguous = ScannerCandidate(
            status = "ambiguous",
            setCode = "UNL",
            number = "T07",
            alternatives = listOf(
                ScannerMatch(JsonPrimitive(707), "Sprite // Buff", setCode = "UNL", number = "T07 // T04"),
                ScannerMatch(JsonPrimitive(708), "Sprite // Gold", setCode = "UNL", number = "T07 // T08"),
            ),
        )

        assertEquals(true, ambiguous.requiresManualSelection())
        assertEquals(0, accumulator.state.totalQuantity)

        accumulator.add(ambiguous.alternatives.first().toScannedCard())

        assertEquals(1, accumulator.state.totalQuantity)
        assertEquals("Sprite // Buff", accumulator.state.groups.single().card.name)
    }

    @Test
    fun clearResetsCommittedSession() {
        val accumulator = SessionAccumulator()
        accumulator.add(ScannedCard(catalogCardId = "42", name = "Test Card"))

        accumulator.clear()

        assertEquals(0, accumulator.state.totalQuantity)
        assertEquals(emptyList(), accumulator.asBulkItems())
    }
}
