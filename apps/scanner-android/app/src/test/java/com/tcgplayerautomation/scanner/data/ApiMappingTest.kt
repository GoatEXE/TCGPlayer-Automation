package com.tcgplayerautomation.scanner.data

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ApiMappingTest {
    @Test
    fun resolveTextRequestUsesBackendContract() {
        val json = BackendApi.defaultJson.encodeToString(
            ResolveTextRequest(rawText = "UNL • 209/219", region = "bottom-right", confidence = 0.91),
        )

        assertEquals(
            "{\"rawText\":\"UNL • 209/219\",\"region\":\"bottom-right\",\"confidence\":0.91}",
            json,
        )
    }

    @Test
    fun decodesSellabilityPreviewItemsWithSellFirstFields() {
        val preview = BackendApi.defaultJson.decodeFromString<ScanSellabilityPreviewResponse>(
            "{\"items\":[{\"catalogCardId\":42,\"quantity\":1,\"finish\":\"Foil\",\"action\":\"sell\",\"name\":\"Arena Kingpin\",\"setCode\":\"UNL\",\"number\":\"002/219\",\"reasons\":[\"duplicate sellable\"]}],\"summary\":{\"sell\":1}}",
        )

        val item = preview.items.single()
        assertEquals("42", item.catalogCardIdString)
        assertEquals("sell", item.action)
        assertEquals("Foil", item.finish)
        assertEquals("Arena Kingpin", item.displayName)
        assertEquals("002/219", item.displayNumber)
        assertEquals("duplicate sellable", item.displayReason)
    }

    @Test
    fun detectsFoilSwapPreviewOpportunityFromFinalBackendFields() {
        val preview = BackendApi.defaultJson.decodeFromString<ScanSellabilityPreviewResponse>(
            "{\"items\":[{\"catalogCardId\":42,\"quantity\":1,\"finish\":\"Foil\",\"action\":\"sell\",\"name\":\"Arena Kingpin\",\"primaryReasonCode\":\"foil_preference\",\"opportunityType\":\"foil_swap\",\"keepTargetSatisfiedByNormal\":true,\"reasons\":[\"Normal copies satisfy keep target\"]}]}",
        )

        val item = preview.items.single()
        assertEquals(true, item.foilSwapOpportunity)
        assertEquals("Normal copies satisfy keep target", item.displayReason)
    }

    @Test
    fun detectsFoilSwapPreviewOpportunityDefensively() {
        val preview = BackendApi.defaultJson.decodeFromString<ScanSellabilityPreviewResponse>(
            "{\"items\":[{\"catalogCardId\":42,\"quantity\":1,\"finish\":\"Foil\",\"action\":\"sell\",\"name\":\"Arena Kingpin\",\"opportunityCode\":\"foil_swap\",\"reasons\":[\"Normal copies satisfy keep target\"]}]}",
        )

        val item = preview.items.single()
        assertEquals(true, item.foilSwapOpportunity)
        assertEquals("Normal copies satisfy keep target", item.displayReason)
    }

    @Test
    fun previewRequestOmitsBulkSourceField() {
        val json = BackendApi.defaultJson.encodeToString(
            ScanSellabilityPreviewRequest(
                items = listOf(
                    BulkCollectionItemRequest(
                        catalogCardId = "42",
                        quantity = 2,
                        finish = "Foil",
                    ).toScanItemRequest(),
                ),
            ),
        )

        assertEquals(
            "{\"items\":[{\"catalogCardId\":\"42\",\"quantity\":2,\"finish\":\"Foil\",\"condition\":\"Near Mint\",\"language\":\"EN\"}]}",
            json,
        )
    }

    @Test
    fun splitCommitRequestPreservesFinishAndActionAllocations() {
        val json = BackendApi.defaultJson.encodeToString(
            ScanSplitCommitRequest(
                allocations = listOf(
                    ScanAllocation(
                        catalogCardId = "42",
                        quantity = 2,
                        finish = "Foil",
                        condition = "Near Mint",
                        language = "EN",
                        action = "sell",
                    ),
                ),
            ),
        )

        assertEquals(
            "{\"allocations\":[{\"catalogCardId\":\"42\",\"quantity\":2,\"finish\":\"Foil\",\"condition\":\"Near Mint\",\"language\":\"EN\",\"action\":\"sell\"}]}",
            json,
        )
    }

    @Test
    fun decodesFinalSplitCommitResponseSellAndKeepCounts() {
        val response = BackendApi.defaultJson.decodeFromString<ScanSplitCommitResponse>(
            "{\"summary\":{\"sellQuantity\":2,\"keepQuantity\":1},\"sell\":{\"inserted\":1,\"updated\":1},\"keep\":{\"inserted\":1,\"updated\":0}}",
        )

        assertEquals(2, response.sellResult.inserted + response.sellResult.updated)
        assertEquals(1, response.keepResult.inserted + response.keepResult.updated)
    }

    @Test
    fun decodesScannerStatusCatalogReadiness() {
        val status = BackendApi.defaultJson.decodeFromString<ScannerStatusResponse>(
            "{\"catalog\":{\"sets\":3,\"cards\":418,\"lastSyncedAt\":\"2026-07-26T00:00:00.000Z\",\"ready\":true}}",
        )

        assertEquals(true, status.catalog.ready)
        assertEquals(3, status.catalog.sets)
        assertEquals(418, status.catalog.cards)
        assertEquals("2026-07-26T00:00:00.000Z", status.catalog.lastSyncedAt)
    }

    @Test
    fun decodesCatalogSyncSummary() {
        val sync = BackendApi.defaultJson.decodeFromString<CatalogSyncResponse>(
            "{\"syncedSets\":3,\"syncedCards\":418}",
        )

        assertEquals(3, sync.syncedSets)
        assertEquals(418, sync.syncedCards)
    }

    @Test
    fun decodesNumericAndStringIds() {
        val numeric = ScannerMatch(catalogCardId = JsonPrimitive(123), name = "Numeric")
        val string = CollectionSummary(id = JsonPrimitive("abc"), name = "Default")

        assertEquals("123", numeric.catalogCardIdString)
        assertEquals("abc", string.idString)
    }

    @Test
    fun resolveTextRequestCanSendSetCodeHintForNameFallback() {
        val json = BackendApi.defaultJson.encodeToString(
            ResolveTextRequest(rawText = "Inferna", region = "native", setCodeHint = "UNL"),
        )

        assertEquals(
            "{\"rawText\":\"Inferna\",\"region\":\"native\",\"setCodeHint\":\"UNL\"}",
            json,
        )
    }

    @Test
    fun prioritizeResolveTextAttemptsPrefersIdRegionsBeforeFullFrame() {
        val prioritized = prioritizeResolveTextAttempts(
            listOf(
                ResolveTextAttempt(rawText = "Inferna\nAMSSN", region = "native"),
                ResolveTextAttempt(rawText = "UNL • 002/219", region = "bottom-left"),
                ResolveTextAttempt(rawText = "  ", region = "bottom-right"),
                ResolveTextAttempt(rawText = "UNL • 002/219", region = "bottom-left"),
            ),
        )

        assertEquals(
            listOf(
                ResolveTextAttempt(rawText = "UNL • 002/219", region = "bottom-left"),
                ResolveTextAttempt(rawText = "Inferna\nAMSSN", region = "native"),
            ),
            prioritized,
        )
    }

    @Test
    fun fullFrameNameFallbackRequestKeepsNativeTextWithoutSetHint() {
        val request = createResolveTextRequest(
            ResolveTextAttempt(rawText = "2\nInferna", region = "native"),
        )

        assertEquals("2\nInferna", request.rawText)
        assertEquals("native", request.region)
        assertNull(request.setCodeHint)
    }

    @Test
    fun summarizeResolveDiagnosticsShowsNameResolution() {
        val candidate = ScannerCandidate(
            status = "resolved",
            match = ScannerMatch(JsonPrimitive(2), "Inferna"),
            resolvedBy = "name",
            nameAttempt = "Inferna",
        )
        val result = ResolveBestTextResult(
            candidate = candidate,
            reports = listOf(
                ResolveAttemptReport(
                    attempt = ResolveTextAttempt(rawText = "2\nInferna", region = "native"),
                    request = ResolveTextRequest(rawText = "2\nInferna", region = "native"),
                    response = ScannerResolveResponse(candidates = listOf(candidate)),
                    candidate = candidate,
                ),
            ),
        )

        assertEquals("Resolved by name from 'Inferna'.", summarizeResolveDiagnostics(result))
    }

    @Test
    fun summarizeResolveDiagnosticsShowsNativeAttemptFailure() {
        val result = ResolveBestTextResult(
            candidate = null,
            reports = listOf(
                ResolveAttemptReport(
                    attempt = ResolveTextAttempt(rawText = "2\nInferna", region = "native"),
                    request = ResolveTextRequest(rawText = "2\nInferna", region = "native"),
                    response = ScannerResolveResponse(),
                    candidate = null,
                ),
            ),
        )

        assertEquals("native sent '2 / Inferna' with no set hint; backend returned no candidate.", summarizeResolveDiagnostics(result))
    }

    @Test
    fun summarizeResolveDiagnosticsShowsAmbiguousNameFallback() {
        val ambiguous = ScannerCandidate(
            status = "ambiguous",
            nameAttempt = "Inferna",
            alternatives = listOf(
                ScannerMatch(JsonPrimitive(2), "Inferna"),
                ScannerMatch(JsonPrimitive(20), "Inferna"),
            ),
        )
        val result = ResolveBestTextResult(
            candidate = ambiguous,
            reports = listOf(
                ResolveAttemptReport(
                    attempt = ResolveTextAttempt(rawText = "2\nInferna", region = "native"),
                    request = ResolveTextRequest(rawText = "2\nInferna", region = "native"),
                    response = ScannerResolveResponse(candidates = listOf(ambiguous)),
                    candidate = ambiguous,
                ),
            ),
        )

        assertEquals("native ambiguous 'Inferna' (2 matches).", summarizeResolveDiagnostics(result))
    }

    @Test
    fun inferSetCodeHintUsesOnlyTextWithSetCodeAndCollectorNumber() {
        assertEquals(
            "UNL",
            inferSetCodeHint(ResolveTextAttempt(rawText = "UNL • 002/219", region = "bottom-left")),
        )
    }

    @Test
    fun inferSetCodeHintIgnoresArbitraryRoiWordsAndNativeNames() {
        assertNull(inferSetCodeHint(ResolveTextAttempt(rawText = "Inferna", region = "bottom-left")))
        assertNull(inferSetCodeHint(ResolveTextAttempt(rawText = "2\nInferna\nAMSSN", region = "native")))
    }

    @Test
    fun inferSetCodeHintDoesNotApplyRoiHintToNativeNameFallback() {
        val nativeAttempt = ResolveTextAttempt(rawText = "Inferna", region = "native", setCodeHint = "UNL")

        assertNull(inferSetCodeHint(nativeAttempt))
    }

    @Test
    fun trustedAutomaticCandidateRequiresResolvedNonNameMatch() {
        val idResolved = ScannerCandidate(
            status = "resolved",
            match = ScannerMatch(JsonPrimitive(2), "Inferna"),
            resolvedBy = "catalog-code",
        )
        val nameResolved = ScannerCandidate(
            status = "resolved",
            match = ScannerMatch(JsonPrimitive(2), "Inferna"),
            resolvedBy = "name",
            nameAttempt = "Inferna",
        )

        assertEquals(true, isTrustedAutomaticCandidate(idResolved))
        assertEquals(false, isTrustedAutomaticCandidate(nameResolved))
        assertEquals(false, isTrustedAutomaticCandidate(null))
    }

    @Test
    fun requiredStabilityRepeatsUsesTwoSamplesForAllTrustedCandidates() {
        val clean = ScannerCandidate(
            status = "resolved",
            match = ScannerMatch(JsonPrimitive(2), "Arena Kingpin"),
            confidence = 0.98,
            resolvedBy = "catalog-code",
        )
        val lowConfidence = clean.copy(confidence = 0.6)
        val corrected = clean.copy(correctedFromSetCode = "UNI")
        val withAlternatives = clean.copy(alternatives = listOf(ScannerMatch(JsonPrimitive(3), "Mischievous Marai")))

        assertEquals(2, requiredStabilityRepeats(clean))
        assertEquals(2, requiredStabilityRepeats(lowConfidence))
        assertEquals(2, requiredStabilityRepeats(corrected))
        assertEquals(2, requiredStabilityRepeats(withAlternatives))
    }

    @Test
    fun consecutiveDuplicateHelperBlocksOnlySameLastKey() {
        assertEquals(true, shouldBlockConsecutiveDuplicate("catalog:1", "catalog:1"))
        assertEquals(false, shouldBlockConsecutiveDuplicate("catalog:2", "catalog:1"))
        assertEquals(false, shouldBlockConsecutiveDuplicate("catalog:1", null))
    }

    @Test
    fun trustedAutomaticCandidateAllowsResolvedTokenCatalogCodeMatch() {
        val tokenResolved = ScannerCandidate(
            status = "resolved",
            match = ScannerMatch(JsonPrimitive(707), "Minion Token", setCode = "UNL", number = "T07 // T04"),
            setCode = "UNL",
            number = "T07 // T04",
            resolvedBy = "catalog-code",
        )

        assertEquals(true, isTrustedAutomaticCandidate(tokenResolved))
    }

    @Test
    fun trustedAutomaticCandidateRejectsAmbiguousBareTokenCandidate() {
        val ambiguousToken = ScannerCandidate(
            status = "ambiguous",
            setCode = "UNL",
            number = "T07",
            alternatives = listOf(
                ScannerMatch(JsonPrimitive(707), "Minion Token A", setCode = "UNL", number = "T07 // T04"),
                ScannerMatch(JsonPrimitive(708), "Minion Token B", setCode = "UNL", number = "T07 // T08"),
            ),
        )

        assertEquals(false, isTrustedAutomaticCandidate(ambiguousToken))
    }

    @Test
    fun selectBestCandidatePrefersHighestConfidenceResolvedMatch() {
        val low = ScannerCandidate(
            status = "resolved",
            confidence = 0.25,
            match = ScannerMatch(JsonPrimitive(1), "Low"),
        )
        val high = ScannerCandidate(
            status = "resolved",
            confidence = 0.95,
            match = ScannerMatch(JsonPrimitive(2), "High"),
        )

        assertEquals(high, selectBestCandidate(listOf(low, high)))
    }

    @Test
    fun selectBestCandidateReturnsNullWithoutUsefulCandidate() {
        assertNull(selectBestCandidate(listOf(ScannerCandidate(status = "no_card"))))
    }
}
