package com.tcgplayerautomation.scanner.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

data class ResolveTextAttempt(
    val rawText: String,
    val region: String,
    val setCodeHint: String? = null,
)

@Serializable
data class ResolveTextRequest(
    val rawText: String,
    val region: String,
    val confidence: Double? = null,
    val setCodeHint: String? = null,
)

@Serializable
data class ScannerResolveResponse(
    val candidates: List<ScannerCandidate> = emptyList(),
    val errors: List<String> = emptyList(),
    val debug: ScannerResolveDebug? = null,
)

@Serializable
data class ScannerResolveDebug(
    val regions: List<ScannerResolveDebugRegion> = emptyList(),
)

@Serializable
data class ScannerResolveDebugRegion(
    val index: Int? = null,
    val region: String? = null,
    val rawText: String? = null,
    val confidence: Double? = null,
    val errors: List<String> = emptyList(),
)

@Serializable
data class ScannerCandidate(
    val rawText: String? = null,
    val region: String? = null,
    val setCode: String? = null,
    val number: String? = null,
    val correctedFromSetCode: String? = null,
    val correctedFromNumber: String? = null,
    val key: String? = null,
    val status: String,
    val match: ScannerMatch? = null,
    val alternatives: List<ScannerMatch> = emptyList(),
    val confidence: Double? = null,
    val resolvedBy: String? = null,
    val nameAttempt: String? = null,
)

@Serializable
data class ScannerMatch(
    val catalogCardId: JsonElement,
    val name: String,
    val setCode: String? = null,
    val number: String? = null,
    val imageUrl: String? = null,
) {
    val catalogCardIdString: String
        get() = catalogCardId.jsonScalar()
}

@Serializable
data class ScannerStatusResponse(
    val catalog: ScannerCatalogStatus = ScannerCatalogStatus(),
)

@Serializable
data class ScannerCatalogStatus(
    val sets: Int = 0,
    val cards: Int = 0,
    val lastSyncedAt: String? = null,
    val ready: Boolean = false,
)

@Serializable
data class CatalogSyncResponse(
    val syncedSets: Int = 0,
    val syncedCards: Int = 0,
    val errors: List<String> = emptyList(),
)

@Serializable
data class CollectionsResponse(
    val collections: List<CollectionSummary> = emptyList(),
)

@Serializable
data class CollectionSummary(
    val id: JsonElement,
    val name: String,
    val isDefault: Boolean = false,
) {
    val idString: String
        get() = id.jsonScalar()
}

@Serializable
data class BulkCollectionItemsRequest(
    val items: List<BulkCollectionItemRequest>,
)

@Serializable
data class BulkCollectionItemRequest(
    val catalogCardId: String,
    val quantity: Int,
    val condition: String = "Near Mint",
    val finish: String = "Normal",
    val language: String = "EN",
    val source: String = "android-scanner",
)

@Serializable
data class BulkCollectionItemsResponse(
    val inserted: Int = 0,
    val updated: Int = 0,
    val added: Int? = null,
    val errors: List<String> = emptyList(),
)

@Serializable
data class ScanItemRequest(
    val catalogCardId: String,
    val quantity: Int,
    val finish: String,
    val condition: String,
    val language: String,
)

fun BulkCollectionItemRequest.toScanItemRequest(): ScanItemRequest = ScanItemRequest(
    catalogCardId = catalogCardId,
    quantity = quantity,
    finish = finish,
    condition = condition,
    language = language,
)

@Serializable
data class ScanSellabilityPreviewRequest(
    val items: List<ScanItemRequest>,
)

@Serializable
data class ScanSellabilityPreviewResponse(
    val items: List<ScanSellabilityPreviewItem> = emptyList(),
    val summary: JsonObject? = null,
    val groups: JsonObject? = null,
    val behavior: JsonObject? = null,
    val errors: List<String> = emptyList(),
)

@Serializable
data class ScanSellabilityPreviewItem(
    val catalogCardId: JsonElement,
    val quantity: Int = 1,
    val finish: String = "Normal",
    val condition: String = "Near Mint",
    val language: String = "EN",
    val action: String = "keep",
    val name: String? = null,
    val cardName: String? = null,
    val productName: String? = null,
    val setCode: String? = null,
    val number: String? = null,
    val collectorNumber: String? = null,
    val kind: String? = null,
    val reasons: List<String> = emptyList(),
    val reason: String? = null,
    val primaryReasonCode: String? = null,
    val opportunityType: String? = null,
    val keepTargetSatisfiedByNormal: Boolean = false,
    val opportunity: String? = null,
    val opportunityCode: String? = null,
    val opportunityCodes: List<String> = emptyList(),
    val flags: List<String> = emptyList(),
    val isFoilSwap: Boolean = false,
    val targetCollectionId: String? = null,
    val targetCollectionName: String? = null,
) {
    val catalogCardIdString: String
        get() = catalogCardId.jsonScalar()

    val displayName: String
        get() = name ?: cardName ?: productName ?: "Catalog $catalogCardIdString"

    val displayNumber: String?
        get() = number ?: collectorNumber

    val displayReason: String
        get() = (reasons.takeIf { it.isNotEmpty() }?.joinToString("; ") ?: reason).orEmpty()

    val foilSwapOpportunity: Boolean
        get() = isFoilSwap ||
            keepTargetSatisfiedByNormal ||
            listOfNotNull(primaryReasonCode, opportunityType, opportunity, opportunityCode)
                .any { it.isFoilSwapCode() || it.equals("foil_preference", ignoreCase = true) } ||
            opportunityCodes.any { it.isFoilSwapCode() } ||
            flags.any { it.isFoilSwapCode() }
}

private fun String.isFoilSwapCode(): Boolean =
    equals("foil_swap", ignoreCase = true) || equals("foil-swap", ignoreCase = true)

@Serializable
data class ScanAllocation(
    val catalogCardId: String,
    val quantity: Int,
    val finish: String,
    val condition: String,
    val language: String,
    val action: String,
)

@Serializable
data class ScanSplitCommitRequest(
    val allocations: List<ScanAllocation>,
)

@Serializable
data class ScanSplitCommitResponse(
    val sell: BulkCollectionItemsResponse = BulkCollectionItemsResponse(),
    val keep: BulkCollectionItemsResponse = BulkCollectionItemsResponse(),
    val toBeSold: BulkCollectionItemsResponse = BulkCollectionItemsResponse(),
    val collection: BulkCollectionItemsResponse = BulkCollectionItemsResponse(),
    val collections: JsonObject? = null,
    val summary: JsonObject? = null,
    val errors: List<String> = emptyList(),
) {
    val sellResult: BulkCollectionItemsResponse
        get() = if (sell.inserted != 0 || sell.updated != 0 || sell.added != null || sell.errors.isNotEmpty()) sell else toBeSold

    val keepResult: BulkCollectionItemsResponse
        get() = if (keep.inserted != 0 || keep.updated != 0 || keep.added != null || keep.errors.isNotEmpty()) keep else collection
}

@Serializable
data class ApiError(
    val error: String? = null,
    val message: String? = null,
)

fun JsonElement.jsonScalar(): String = when (this) {
    is JsonPrimitive -> contentOrNull ?: toString()
    else -> toString()
}.trim('"')
