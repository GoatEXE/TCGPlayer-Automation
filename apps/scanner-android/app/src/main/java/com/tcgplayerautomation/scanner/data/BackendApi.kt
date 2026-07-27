package com.tcgplayerautomation.scanner.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class BackendApi(
    baseUrl: String,
    private val client: OkHttpClient = defaultClient,
    private val json: Json = defaultJson,
) {
    private val baseUrl = baseUrl.trim().trimEnd('/')

    suspend fun testConnection(): Result<String> = withContext(Dispatchers.IO) {
        val health = getText("/health")
        if (health.isSuccess) {
            return@withContext Result.success("Connected to /health")
        }

        val scannerStatus = getText("/api/scanner/status")
        if (scannerStatus.isSuccess) {
            Result.success("Connected to /api/scanner/status")
        } else {
            Result.failure(
                scannerStatus.exceptionOrNull()
                    ?: health.exceptionOrNull()
                    ?: IOException("Connection failed"),
            )
        }
    }

    suspend fun resolveText(text: String, region: String = "native"): ScannerCandidate? = withContext(Dispatchers.IO) {
        resolveSingleText(ResolveTextAttempt(text, region))?.candidate
    }

    suspend fun resolveBestText(attempts: List<ResolveTextAttempt>): ScannerCandidate? = resolveBestTextDetailed(attempts).candidate

    suspend fun resolveBestTextDetailed(attempts: List<ResolveTextAttempt>): ResolveBestTextResult = withContext(Dispatchers.IO) {
        val reports = mutableListOf<ResolveAttemptReport>()
        var fallback: ScannerCandidate? = null

        for (attempt in prioritizeResolveTextAttempts(attempts)) {
            val report = resolveSingleText(attempt) ?: continue
            reports.add(report)
            val candidate = report.candidate
            if (candidate?.status == "resolved" && candidate.match != null) {
                return@withContext ResolveBestTextResult(candidate = candidate, reports = reports)
            }
            if (fallback == null && candidate != null) fallback = candidate
        }

        ResolveBestTextResult(candidate = fallback, reports = reports)
    }

    suspend fun getScannerStatus(): ScannerStatusResponse = withContext(Dispatchers.IO) {
        val response = getText("/api/scanner/status").getOrThrow()
        json.decodeFromString(response)
    }

    suspend fun syncAllCatalog(): CatalogSyncResponse = withContext(Dispatchers.IO) {
        val response = postJson("/api/catalog/sync", "{}")
        json.decodeFromString(response)
    }

    suspend fun getCollections(): List<CollectionSummary> = withContext(Dispatchers.IO) {
        val response = getText("/api/collections").getOrThrow()
        json.decodeFromString<CollectionsResponse>(response).collections
    }

    suspend fun bulkAddToCollection(
        collectionId: String,
        items: List<BulkCollectionItemRequest>,
    ): BulkCollectionItemsResponse = withContext(Dispatchers.IO) {
        require(items.isNotEmpty()) { "No collection items to commit" }
        val requestJson = json.encodeToString(BulkCollectionItemsRequest(items))
        val response = postJson("/api/collections/${collectionId}/items/bulk", requestJson)
        json.decodeFromString(response)
    }

    suspend fun previewScannedItems(items: List<BulkCollectionItemRequest>): ScanSellabilityPreviewResponse = withContext(Dispatchers.IO) {
        require(items.isNotEmpty()) { "No scanner items to preview" }
        val request = ScanSellabilityPreviewRequest(items.map { it.toScanItemRequest() })
        val response = postJson("/api/collections/scan-preview", json.encodeToString(request))
        json.decodeFromString(response)
    }

    suspend fun commitScannedAllocations(allocations: List<ScanAllocation>): ScanSplitCommitResponse = withContext(Dispatchers.IO) {
        require(allocations.isNotEmpty()) { "No scanner allocations to commit" }
        val response = postJson(
            "/api/collections/split-scan",
            json.encodeToString(ScanSplitCommitRequest(allocations = allocations)),
        )
        json.decodeFromString(response)
    }

    private fun resolveSingleText(attempt: ResolveTextAttempt): ResolveAttemptReport? {
        if (attempt.rawText.isBlank()) return null
        val request = createResolveTextRequest(attempt)
        val response = postJson("/api/scanner/resolve-text", json.encodeToString(request))
        val resolved = json.decodeFromString<ScannerResolveResponse>(response)
        return ResolveAttemptReport(
            attempt = attempt,
            request = request,
            response = resolved,
            candidate = selectBestCandidate(resolved.candidates),
        )
    }

    private fun getText(path: String): Result<String> = runCatching {
        val request = Request.Builder().url(url(path)).get().build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("GET $path failed: HTTP ${response.code}")
            }
            response.body?.string().orEmpty()
        }
    }

    private fun postJson(path: String, body: String): String {
        val request = Request.Builder()
            .url(url(path))
            .post(body.toRequestBody(JSON_MEDIA_TYPE))
            .build()

        client.newCall(request).execute().use { response ->
            val responseText = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val apiError = runCatching { json.decodeFromString<ApiError>(responseText) }.getOrNull()
                val message = apiError?.error ?: apiError?.message ?: responseText.ifBlank { "HTTP ${response.code}" }
                throw IOException("POST $path failed: $message")
            }
            return responseText
        }
    }

    private fun url(path: String): String = "$baseUrl$path"

    companion object {
        private const val MAX_RESOLVE_TEXT_LENGTH = 2000
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
        val defaultJson: Json = Json {
            ignoreUnknownKeys = true
        }
        val defaultClient: OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
    }
}

data class ResolveAttemptReport(
    val attempt: ResolveTextAttempt,
    val request: ResolveTextRequest,
    val response: ScannerResolveResponse,
    val candidate: ScannerCandidate?,
)

data class ResolveBestTextResult(
    val candidate: ScannerCandidate?,
    val reports: List<ResolveAttemptReport>,
)

fun createResolveTextRequest(attempt: ResolveTextAttempt): ResolveTextRequest = ResolveTextRequest(
    rawText = attempt.rawText.trim().take(2000),
    region = attempt.region.trim().ifBlank { "native" },
    setCodeHint = inferSetCodeHint(attempt),
)

fun isTrustedAutomaticCandidate(candidate: ScannerCandidate?): Boolean =
    candidate?.status == "resolved" &&
        candidate.match != null &&
        candidate.resolvedBy != "name"

fun requiredStabilityRepeats(candidate: ScannerCandidate?): Int =
    if (isTrustedAutomaticCandidate(candidate)) 2 else Int.MAX_VALUE

fun shouldBlockConsecutiveDuplicate(candidateKey: String?, lastAcceptedKey: String?): Boolean =
    candidateKey != null && candidateKey == lastAcceptedKey

fun summarizeResolveDiagnostics(result: ResolveBestTextResult): String {
    if (result.reports.isEmpty()) return "No OCR text sent to resolver."

    val resolved = result.candidate?.takeIf { it.status == "resolved" && it.match != null }
    if (resolved != null) {
        val method = resolved.resolvedBy?.let { " by $it" }.orEmpty()
        val nameAttempt = resolved.nameAttempt?.let { " from '$it'" }.orEmpty()
        return "Resolved$method$nameAttempt."
    }

    result.reports.firstOrNull { it.response.errors.isNotEmpty() }?.let { report ->
        return "${report.request.region} backend error: ${report.response.errors.joinToString("; ").take(160)}"
    }

    result.reports.firstOrNull { it.response.debug?.regions?.any { region -> region.errors.isNotEmpty() } == true }?.let { report ->
        val errors = report.response.debug?.regions.orEmpty().flatMap { it.errors }
        return "${report.request.region} debug error: ${errors.joinToString("; ").take(160)}"
    }

    result.reports.firstOrNull { report ->
        report.candidate?.status == "ambiguous" || report.response.candidates.any { it.status == "ambiguous" }
    }?.let { report ->
        val ambiguous = report.candidate?.takeIf { it.status == "ambiguous" }
            ?: report.response.candidates.firstOrNull { it.status == "ambiguous" }
        val alternatives = ambiguous?.alternatives?.size ?: 0
        val nameAttempt = ambiguous?.nameAttempt?.let { " '$it'" }.orEmpty()
        return "${report.request.region} ambiguous$nameAttempt${if (alternatives > 0) " ($alternatives matches)" else ""}."
    }

    result.reports.firstOrNull { it.request.region == "native" }?.let { report ->
        val snippet = report.request.rawText.lineSequence().take(3).joinToString(" / ").take(80)
        val status = report.candidate?.status ?: "no candidate"
        return "native sent '$snippet' with no set hint; backend returned $status."
    }

    val last = result.reports.last()
    val status = last.candidate?.status ?: "no candidate"
    return "${last.request.region} returned $status."
}

fun inferSetCodeHint(attempt: ResolveTextAttempt): String? {
    val normalizedExplicitHint = attempt.setCodeHint?.normalizeSetCodeHint()
    if (normalizedExplicitHint != null && containsCollectorNumber(attempt.rawText)) {
        return normalizedExplicitHint
    }

    return SET_CODE_WITH_COLLECTOR_NUMBER_PATTERN
        .find(attempt.rawText)
        ?.groupValues
        ?.getOrNull(1)
        ?.normalizeSetCodeHint()
}

private val SET_CODE_WITH_COLLECTOR_NUMBER_PATTERN = Regex(
    pattern = "\\b([A-Za-z]{2,5})\\b\\s*(?:[•·.\\-–—:|#/\\s]+)\\s*\\d{1,4}(?:\\s*/\\s*\\d{1,4})?\\b",
    options = setOf(RegexOption.IGNORE_CASE),
)

private val COLLECTOR_NUMBER_PATTERN = Regex("\\b\\d{1,4}(?:\\s*/\\s*\\d{1,4})?\\b")

private fun containsCollectorNumber(text: String): Boolean = COLLECTOR_NUMBER_PATTERN.containsMatchIn(text)

private fun String.normalizeSetCodeHint(): String? =
    trim()
        .uppercase()
        .takeIf { it.matches(Regex("[A-Z]{2,5}")) }

fun prioritizeResolveTextAttempts(attempts: List<ResolveTextAttempt>): List<ResolveTextAttempt> {
    val regionPriority = mapOf(
        "bottom-left" to 0,
        "bottom-left-strip" to 1,
        "bottom-right" to 2,
        "native" to 3,
    )

    return attempts
        .map {
            it.copy(
                rawText = it.rawText.trim().take(2000),
                region = it.region.trim().ifBlank { "native" },
                setCodeHint = it.setCodeHint?.normalizeSetCodeHint(),
            )
        }
        .filter { it.rawText.isNotBlank() }
        .distinctBy { "${it.region}\u0000${it.rawText}" }
        .sortedWith(
            compareBy<ResolveTextAttempt> { regionPriority[it.region] ?: 99 }
                .thenBy { it.rawText.length },
        )
}

fun selectBestCandidate(candidates: List<ScannerCandidate>): ScannerCandidate? {
    val resolved = candidates
        .filter { it.status == "resolved" && it.match != null }
        .maxByOrNull { it.confidence ?: 0.0 }
    if (resolved != null) return resolved

    return candidates.firstOrNull {
        (it.status == "ambiguous" || it.status == "unresolved") && it.setCode != null && it.number != null
    } ?: candidates.firstOrNull { it.status == "ambiguous" }
}
