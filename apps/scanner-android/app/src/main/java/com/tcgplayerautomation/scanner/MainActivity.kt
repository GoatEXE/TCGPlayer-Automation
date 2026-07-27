package com.tcgplayerautomation.scanner

import android.Manifest
import android.app.Activity
import android.graphics.BitmapFactory
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Bundle
import android.util.Size
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.tcgplayerautomation.scanner.camera.MlKitTextAnalyzer
import com.tcgplayerautomation.scanner.camera.OcrRegionText
import com.tcgplayerautomation.scanner.data.BackendApi
import com.tcgplayerautomation.scanner.data.CatalogSyncResponse
import com.tcgplayerautomation.scanner.data.ResolveBestTextResult
import com.tcgplayerautomation.scanner.data.ResolveTextAttempt
import com.tcgplayerautomation.scanner.data.ScanAllocation
import com.tcgplayerautomation.scanner.data.ScanSellabilityPreviewItem
import com.tcgplayerautomation.scanner.data.ScanSellabilityPreviewResponse
import com.tcgplayerautomation.scanner.data.ScannerCandidate
import com.tcgplayerautomation.scanner.data.ScannerStatusResponse
import com.tcgplayerautomation.scanner.data.SettingsRepository
import com.tcgplayerautomation.scanner.data.isTrustedAutomaticCandidate
import com.tcgplayerautomation.scanner.data.requiredStabilityRepeats
import com.tcgplayerautomation.scanner.data.shouldBlockConsecutiveDuplicate
import com.tcgplayerautomation.scanner.data.summarizeResolveDiagnostics
import com.tcgplayerautomation.scanner.domain.DetectionStabilizer
import com.tcgplayerautomation.scanner.domain.FINISH_FOIL
import com.tcgplayerautomation.scanner.domain.FINISH_NORMAL
import com.tcgplayerautomation.scanner.domain.ScannedCard
import com.tcgplayerautomation.scanner.domain.ScanSessionState
import com.tcgplayerautomation.scanner.domain.SessionAccumulator
import com.tcgplayerautomation.scanner.domain.requiresManualSelection
import com.tcgplayerautomation.scanner.domain.stableKey
import com.tcgplayerautomation.scanner.domain.toScannedCard
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    ScannerApp()
                }
            }
        }
    }
}

private enum class AppScreen { Settings, Scanner, Review, Success }

@Composable
private fun ScannerApp() {
    val context = LocalContext.current
    val settings = remember { SettingsRepository(context) }
    var baseUrl by remember { mutableStateOf(settings.getBaseUrl()) }
    var api by remember(baseUrl) { mutableStateOf(BackendApi(baseUrl)) }
    val accumulator = remember { SessionAccumulator() }
    var session by remember { mutableStateOf(accumulator.state) }
    var screen by remember { mutableStateOf(AppScreen.Settings) }
    var successMessage by remember { mutableStateOf("") }

    DisposableEffect(context) {
        val activity = context as? Activity
        val window = activity?.window
        val decorView = window?.decorView
        val previousSystemUiVisibility = decorView?.systemUiVisibility
        val previousSystemBarsBehavior = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window?.insetsController?.systemBarsBehavior
        } else {
            null
        }

        hideSystemBarsForScanner(activity)
        onDispose {
            restoreSystemBarsAfterScanner(activity, previousSystemUiVisibility, previousSystemBarsBehavior)
        }
    }

    when (screen) {
        AppScreen.Settings -> SettingsScreen(
            baseUrl = baseUrl,
            onBaseUrlChange = { baseUrl = it },
            onSave = {
                settings.setBaseUrl(baseUrl)
                api = BackendApi(baseUrl)
                screen = AppScreen.Scanner
            },
        )

        AppScreen.Scanner -> ScannerScreen(
            api = api,
            session = session,
            onAdd = { card -> session = accumulator.add(card) },
            onUndo = { session = accumulator.undo() },
            onAddLast = { session = accumulator.addLastCopy() },
            onSetLastFinish = { finish -> session = accumulator.setLastFinish(finish) },
            onDone = { screen = AppScreen.Review },
            onSettings = { screen = AppScreen.Settings },
        )

        AppScreen.Review -> ReviewScreen(
            api = api,
            session = session,
            bulkItems = accumulator.asBulkItems(),
            onBack = { screen = AppScreen.Scanner },
            onMoveOneToFinish = { catalogCardId, fromFinish, toFinish ->
                session = accumulator.moveOneToFinish(catalogCardId, fromFinish, toFinish)
            },
            onCommitted = { message ->
                session = accumulator.clear()
                successMessage = message
                screen = AppScreen.Success
            },
        )

        AppScreen.Success -> CommitSuccessScreen(
            message = successMessage,
            onStartNew = { screen = AppScreen.Scanner },
            onSettings = { screen = AppScreen.Settings },
        )
    }
}

@Composable
private fun SettingsScreen(
    baseUrl: String,
    onBaseUrlChange: (String) -> Unit,
    onSave: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf("Enter the LAN backend URL, then test or start scanning.") }
    var testing by remember { mutableStateOf(false) }
    var loadingCatalogStatus by remember { mutableStateOf(false) }
    var syncingCatalog by remember { mutableStateOf(false) }
    var scannerStatus by remember { mutableStateOf<ScannerStatusResponse?>(null) }
    var syncSummary by remember { mutableStateOf<CatalogSyncResponse?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("TCG Scanner", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("Native Android scanner client for the existing TCGPlayer Automation backend.")
        OutlinedTextField(
            value = baseUrl,
            onValueChange = onBaseUrlChange,
            label = { Text("Backend base URL") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(status, style = MaterialTheme.typography.bodyMedium)
        CatalogStatusCard(scannerStatus = scannerStatus, syncSummary = syncSummary)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(
                enabled = !testing,
                onClick = {
                    testing = true
                    status = "Testing connection..."
                    scope.launch {
                        val api = BackendApi(baseUrl)
                        val result = api.testConnection()
                        status = result.fold(
                            onSuccess = { it },
                            onFailure = { "Connection failed: ${it.message}" },
                        )
                        if (result.isSuccess) {
                            scannerStatus = runCatching { api.getScannerStatus() }.getOrNull()
                        }
                        testing = false
                    }
                },
            ) { Text("Test") }
            OutlinedButton(
                enabled = !loadingCatalogStatus,
                onClick = {
                    loadingCatalogStatus = true
                    status = "Refreshing scanner status..."
                    scope.launch {
                        runCatching { BackendApi(baseUrl).getScannerStatus() }
                            .onSuccess {
                                scannerStatus = it
                                status = "Scanner status refreshed."
                            }
                            .onFailure { status = "Status failed: ${it.message}" }
                        loadingCatalogStatus = false
                    }
                },
            ) { Text(if (loadingCatalogStatus) "Refreshing..." else "Refresh status") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(
                enabled = !syncingCatalog,
                onClick = {
                    syncingCatalog = true
                    status = "Syncing catalog sets/cards..."
                    scope.launch {
                        val api = BackendApi(baseUrl)
                        runCatching { api.syncAllCatalog() }
                            .onSuccess { sync ->
                                syncSummary = sync
                                scannerStatus = runCatching { api.getScannerStatus() }.getOrNull() ?: scannerStatus
                                status = "Catalog sync complete: ${sync.syncedSets} sets, ${sync.syncedCards} cards."
                            }
                            .onFailure { status = "Sync failed: ${it.message}" }
                        syncingCatalog = false
                    }
                },
            ) { Text(if (syncingCatalog) "Syncing..." else "Sync all sets") }
            Button(onClick = onSave) { Text("Start scanner") }
        }
        Text(
            "Use the Docker host port from `docker compose ps`: emulator example http://10.0.2.2:3000 or :3001; phone example http://192.168.1.50:3001 when APP_HOST_PORT=3001. For HTTP testing, disable HTTPS and clear cert/key paths in .env.",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun CatalogStatusCard(
    scannerStatus: ScannerStatusResponse?,
    syncSummary: CatalogSyncResponse?,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Catalog status", fontWeight = FontWeight.Bold)
            if (scannerStatus == null) {
                Text("Unknown. Tap Test or Refresh status.")
            } else {
                val catalog = scannerStatus.catalog
                Text(if (catalog.ready) "Ready for scanning" else "Not ready: sync catalog before scanning")
                Text("Sets: ${catalog.sets} • Cards: ${catalog.cards}")
                Text("Last sync: ${catalog.lastSyncedAt ?: "-"}")
            }
            if (syncSummary != null) {
                Text("Last sync action: ${syncSummary.syncedSets} sets, ${syncSummary.syncedCards} cards${if (syncSummary.errors.isNotEmpty()) ", ${syncSummary.errors.size} errors" else ""}")
            }
        }
    }
}

@Composable
private fun ScannerScreen(
    api: BackendApi,
    session: ScanSessionState,
    onAdd: (com.tcgplayerautomation.scanner.domain.ScannedCard) -> Unit,
    onUndo: () -> Unit,
    onAddLast: () -> Unit,
    onSetLastFinish: (String) -> Unit,
    onDone: () -> Unit,
    onSettings: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED,
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        hasCameraPermission = it
    }
    val stabilizer = remember { DetectionStabilizer(requiredRepeats = 2, absenceSamplesToReset = 2) }
    var stabilizerState by remember { mutableStateOf(com.tcgplayerautomation.scanner.domain.StabilizerState()) }
    var resolving by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("Point the camera at one Riftbound card. OCR runs on-device; targeted ID crops resolve on the backend.") }
    var bottomLeftText by remember { mutableStateOf("") }
    var bottomRightText by remember { mutableStateOf("") }
    var fullFrameText by remember { mutableStateOf("") }
    var resolveDebugText by remember { mutableStateOf("") }
    var lastAcceptedDebugText by remember { mutableStateOf("") }
    var lastAcceptedKey by remember { mutableStateOf<String?>(null) }
    var roiMetadataText by remember { mutableStateOf("") }
    var latestRoiDebugImages by remember { mutableStateOf<List<OcrRegionText>>(emptyList()) }
    var showDebug by remember { mutableStateOf(false) }
    var pendingAmbiguousCandidate by remember { mutableStateOf<ScannerCandidate?>(null) }
    val successTone = remember { ToneGenerator(AudioManager.STREAM_MUSIC, 45) }

    DisposableEffect(Unit) {
        onDispose { successTone.release() }
    }

    DisposableEffect(context) {
        val activity = context as? Activity
        val window = activity?.window
        window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    val analyzer = remember(api) {
        MlKitTextAnalyzer(
            throttleMs = 1000,
            onTextRecognized = { regionTexts ->
                if (!resolving && pendingAmbiguousCandidate == null) {
                    resolving = true
                    bottomLeftText = regionTexts.regionSnippet("bottom-left")
                    bottomRightText = regionTexts.regionSnippet("bottom-right")
                    fullFrameText = regionTexts.regionSnippet("native")
                    val roiDebugImages = regionTexts.filter { it.region != "native" && it.debugImageJpeg != null }
                    latestRoiDebugImages = roiDebugImages
                    roiMetadataText = roiDebugImages.mapNotNull { it.metadata }.distinct().take(2).joinToString(" | ")
                    scope.launch {
                        try {
                            val attempts = regionTexts.map { ResolveTextAttempt(rawText = it.text, region = it.region) }
                            val resolveResult = api.resolveBestTextDetailed(attempts)
                            resolveDebugText = summarizeResolveDiagnostics(resolveResult)
                            val candidate = resolveResult.candidate
                            val trustedAutomaticCandidate = isTrustedAutomaticCandidate(candidate)
                            val key = if (trustedAutomaticCandidate) candidate?.stableKey() else null
                            val duplicateOfLast = shouldBlockConsecutiveDuplicate(key, lastAcceptedKey)
                            val requiredRepeats = requiredStabilityRepeats(candidate)
                            val decision = stabilizer.update(stabilizerState, if (duplicateOfLast) null else key, requiredRepeats)
                            stabilizerState = decision.state
                            val card = candidate?.toScannedCard()
                            val resolvedByName = candidate?.resolvedBy == "name"
                            val nameNote = if (resolvedByName) " by name '${candidate?.nameAttempt ?: card?.name}'" else ""
                            when {
                                candidate?.requiresManualSelection() == true -> {
                                    pendingAmbiguousCandidate = candidate
                                    status = "Ambiguous ID: select one of ${candidate.alternatives.size} possible matches."
                                }
                                duplicateOfLast && card != null -> {
                                    status = "Same as last card: use +1 last for another copy."
                                }
                                decision.shouldAdd && card != null && trustedAutomaticCandidate -> {
                                    onAdd(card)
                                    lastAcceptedKey = key
                                    lastAcceptedDebugText = summarizeAcceptedCandidate(candidate, resolveResult)
                                    successTone.startTone(ToneGenerator.TONE_PROP_ACK, 120)
                                    status = "Added ${card.name}${card.setCode?.let { " ($it ${card.number.orEmpty()})" }.orEmpty()}"
                                }
                                card != null && !trustedAutomaticCandidate -> status = "Possible match ${card.name}$nameNote; not auto-added because it is not ID-based."
                                card != null && decision.blockedByLatchedCard -> status = "Hold steady on ${card.name} (${decision.state.pendingCount}/$requiredRepeats) to switch cards."
                                card != null -> status = "Recognizing ${card.name} (${decision.state.pendingCount}/$requiredRepeats)..."
                                attempts.none { it.rawText.isNotBlank() } -> status = "No ID text found yet. Move closer and keep the bottom card edge sharp."
                                else -> status = "ID/name OCR did not resolve. $resolveDebugText"
                            }
                        } catch (error: Throwable) {
                            val decision = stabilizer.update(stabilizerState, null)
                            stabilizerState = decision.state
                            resolveDebugText = error.message.orEmpty()
                            status = "Resolve failed: ${error.message}"
                        } finally {
                            resolving = false
                        }
                    }
                }
            },
            onError = {
                status = if (it is OutOfMemoryError) {
                    "OCR memory pressure; backing off briefly and trying smaller capped crops."
                } else {
                    "OCR failed: ${it.message}"
                }
            },
        )
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        if (hasCameraPermission) {
            CameraPreview(analyzer = analyzer, modifier = Modifier.fillMaxSize())
        } else {
            Column(
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Camera permission is required.", color = Color.White)
                Button(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }) { Text("Grant camera") }
            }
        }

        pendingAmbiguousCandidate?.let { candidate ->
            AmbiguousCandidateDialog(
                candidate = candidate,
                onSelect = { card ->
                    onAdd(card)
                    lastAcceptedKey = "catalog:${card.catalogCardId}"
                    successTone.startTone(ToneGenerator.TONE_PROP_ACK, 120)
                    status = "Added ${card.name}${card.setCode?.let { " ($it ${card.number.orEmpty()})" }.orEmpty()} from selected ambiguous match."
                    pendingAmbiguousCandidate = null
                },
                onDismiss = {
                    status = "Skipped ambiguous match; session unchanged."
                    pendingAmbiguousCandidate = null
                },
            )
        }

        IconButton(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(8.dp)
                .size(44.dp)
                .background(Color(0x99000000)),
            onClick = onSettings,
        ) { Text("⚙", color = Color.White) }

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .navigationBarsPadding()
                .background(Color(0x99000000))
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(if (resolving) "Recognizing..." else status, color = Color.White, style = MaterialTheme.typography.bodySmall)
            LastScannedCardPanel(
                session = session,
                onSetLastFinish = onSetLastFinish,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                OutlinedButton(
                    modifier = Modifier.weight(1f),
                    enabled = session.totalQuantity > 0,
                    onClick = onUndo,
                ) { Text("Undo") }
                OutlinedButton(
                    modifier = Modifier.weight(1f),
                    enabled = session.totalQuantity > 0,
                    onClick = onAddLast,
                ) { Text("+1") }
                Button(
                    modifier = Modifier.weight(1f),
                    enabled = session.totalQuantity > 0,
                    onClick = onDone,
                ) { Text("Done") }
                TextButton(
                    modifier = Modifier.weight(1f),
                    onClick = { showDebug = !showDebug },
                ) { Text(if (showDebug) "Hide" else "Debug") }
            }
            if (showDebug) {
                OcrDebugLine(label = "Session", text = session.totalQuantity.toString())
                OcrDebugLine(label = "BL ID", text = bottomLeftText)
                OcrDebugLine(label = "BR ID", text = bottomRightText)
                OcrDebugLine(label = "Full", text = fullFrameText)
                OcrDebugLine(label = "Resolve", text = resolveDebugText)
                OcrDebugLine(label = "Accepted", text = lastAcceptedDebugText)
                OcrDebugLine(label = "ROI meta", text = roiMetadataText)
                RoiDebugThumbnails(latestRoiDebugImages)
            }
        }
    }
}

private fun hideSystemBarsForScanner(activity: Activity?) {
    val window = activity?.window ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        window.setDecorFitsSystemWindows(false)
        window.insetsController?.let { controller ->
            controller.hide(WindowInsets.Type.systemBars())
            controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    } else {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }
}

private fun restoreSystemBarsAfterScanner(
    activity: Activity?,
    previousSystemUiVisibility: Int?,
    previousSystemBarsBehavior: Int?,
) {
    val window = activity?.window ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        window.setDecorFitsSystemWindows(true)
        window.insetsController?.let { controller ->
            controller.show(WindowInsets.Type.systemBars())
            if (previousSystemBarsBehavior != null) {
                controller.systemBarsBehavior = previousSystemBarsBehavior
            }
        }
    }

    if (previousSystemUiVisibility != null) {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = previousSystemUiVisibility
    }
}

@Composable
private fun AmbiguousCandidateDialog(
    candidate: ScannerCandidate,
    onSelect: (ScannedCard) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Select matching card") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val attempted = candidate.nameAttempt
                    ?: listOfNotNull(candidate.setCode, candidate.number).joinToString(" ").ifBlank { "ambiguous ID" }
                Text("Backend found multiple matches for $attempted. Choose one to add; dismiss leaves the session unchanged.")
                candidate.alternatives.take(6).forEach { match ->
                    OutlinedButton(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            val card = match.toScannedCard(
                                fallbackSetCode = candidate.setCode,
                                fallbackNumber = candidate.number,
                            )
                            onSelect(card)
                        },
                    ) {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            Text(match.name, fontWeight = FontWeight.Bold)
                            Text(
                                listOfNotNull(match.setCode ?: candidate.setCode, match.number ?: candidate.number)
                                    .joinToString(" ")
                                    .ifBlank { "Catalog ${match.catalogCardIdString}" },
                            )
                            if (!match.imageUrl.isNullOrBlank()) {
                                Text("Image available", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
                if (candidate.alternatives.size > 6) {
                    Text("Showing first 6 of ${candidate.alternatives.size} matches.")
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            OutlinedButton(onClick = onDismiss) { Text("Skip") }
        },
    )
}

@Composable
private fun OcrDebugLine(label: String, text: String) {
    Text(
        "$label: ${text.ifBlank { "-" }}",
        color = Color.LightGray,
        style = MaterialTheme.typography.bodySmall,
    )
}

@Composable
private fun LastScannedCardPanel(
    session: ScanSessionState,
    onSetLastFinish: (String) -> Unit,
) {
    val last = session.history.lastOrNull()
    if (last == null) {
        Text("No card scanned yet.", color = Color.LightGray, style = MaterialTheme.typography.bodySmall)
        return
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            "Last: ${last.name}${last.setCode?.let { " ($it ${last.number.orEmpty()})" }.orEmpty()}${finishLabelSuffix(last.finish)}",
            modifier = Modifier.weight(1f),
            color = Color.White,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.bodySmall,
        )
        TextButton(
            enabled = last.finish != FINISH_NORMAL,
            onClick = { onSetLastFinish(FINISH_NORMAL) },
        ) { Text("Normal") }
        TextButton(
            enabled = last.finish != FINISH_FOIL,
            onClick = { onSetLastFinish(FINISH_FOIL) },
        ) { Text("Shiny") }
    }
}

@Composable
private fun RoiDebugThumbnails(regionTexts: List<OcrRegionText>) {
    val images = regionTexts.take(6)
    if (images.isEmpty()) return

    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        images.forEach { item ->
            val bytes = item.debugImageJpeg ?: return@forEach
            val bitmap = remember(bytes) {
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            }
            if (bitmap != null) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = "${item.region} ${item.variant} ROI",
                        modifier = Modifier
                            .size(width = 72.dp, height = 44.dp)
                            .background(Color.DarkGray),
                    )
                    Text(
                        item.variant,
                        color = Color.LightGray,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

private fun finishDisplayName(finish: String): String = if (finish == FINISH_FOIL) "Shiny" else "Normal"

private fun finishLabelSuffix(finish: String): String = if (finish == FINISH_FOIL) " • Shiny" else ""

private fun summarizeAcceptedCandidate(
    candidate: ScannerCandidate?,
    result: ResolveBestTextResult,
): String {
    val matchId = candidate?.match?.catalogCardIdString
    val report = result.reports.firstOrNull { it.candidate?.match?.catalogCardIdString == matchId }
    val rawSnippet = report?.request?.rawText
        ?.lineSequence()
        ?.take(2)
        ?.joinToString(" / ")
        ?.take(80)
        .orEmpty()
    val corrected = listOfNotNull(
        candidate?.correctedFromSetCode?.let { "set<$it" },
        candidate?.correctedFromNumber?.let { "num<$it" },
    ).joinToString(" ")

    return listOfNotNull(
        candidate?.match?.name,
        report?.request?.region?.let { "region=$it" },
        candidate?.confidence?.let { "conf=${"%.2f".format(it)}" },
        candidate?.resolvedBy?.let { "by=$it" },
        corrected.ifBlank { null },
        rawSnippet.ifBlank { null }?.let { "raw='$it'" },
    ).joinToString(" • ")
}

private fun List<OcrRegionText>.regionSnippet(region: String): String =
    filter { it.region == region && it.text.isNotBlank() }
        .joinToString(" | ") { text ->
            val variant = if (text.region == "native") "" else "${text.variant}: "
            variant + text.text.lineSequence().take(2).joinToString(" / ")
        }
        .trim()
        .take(160)

private data class ReviewAllocation(
    val catalogCardId: String,
    val quantity: Int,
    val finish: String,
    val condition: String,
    val language: String,
    val action: String,
    val name: String,
    val setCode: String? = null,
    val number: String? = null,
    val reason: String = "",
    val foilSwapOpportunity: Boolean = false,
)

private fun ScanSellabilityPreviewItem.toReviewAllocation(): ReviewAllocation = ReviewAllocation(
    catalogCardId = catalogCardIdString,
    quantity = quantity,
    finish = finish,
    condition = condition,
    language = language,
    action = action,
    name = displayName,
    setCode = setCode,
    number = displayNumber,
    reason = displayReason,
    foilSwapOpportunity = foilSwapOpportunity,
)

private fun ReviewAllocation.toScanAllocation(): ScanAllocation = ScanAllocation(
    catalogCardId = catalogCardId,
    quantity = quantity,
    finish = finish,
    condition = condition,
    language = language,
    action = action,
)

@Composable
private fun ReviewScreen(
    api: BackendApi,
    session: ScanSessionState,
    bulkItems: List<com.tcgplayerautomation.scanner.data.BulkCollectionItemRequest>,
    onBack: () -> Unit,
    onMoveOneToFinish: (catalogCardId: String, fromFinish: String, toFinish: String) -> Unit,
    onCommitted: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf("Previewing sellable cards...") }
    var committing by remember { mutableStateOf(false) }
    var loadingPreview by remember { mutableStateOf(true) }
    var preview by remember { mutableStateOf<ScanSellabilityPreviewResponse?>(null) }
    var allocations by remember { mutableStateOf<List<ReviewAllocation>>(emptyList()) }

    LaunchedEffect(bulkItems) {
        loadingPreview = true
        status = "Previewing sellable cards..."
        runCatching { api.previewScannedItems(bulkItems) }
            .onSuccess { response ->
                preview = response
                allocations = response.items.map { it.toReviewAllocation() }
                status = if (response.errors.isEmpty()) {
                    "Review set-aside recommendations before committing."
                } else {
                    "Preview returned ${response.errors.size} warnings."
                }
            }
            .onFailure { error ->
                status = "Preview failed: ${error.message}"
                allocations = session.groups.map { group ->
                    ReviewAllocation(
                        catalogCardId = group.card.catalogCardId,
                        quantity = group.quantity,
                        finish = group.card.finish,
                        condition = "Near Mint",
                        language = "EN",
                        action = "keep",
                        name = group.card.name,
                        setCode = group.card.setCode,
                        number = group.card.number,
                        reason = "Preview unavailable; defaulting to keep.",
                    )
                }
            }
        loadingPreview = false
    }

    val orderedAllocations = allocations.sortedWith(compareBy<ReviewAllocation> { if (it.action == "sell") 0 else 1 }.thenBy { it.name })

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Review scanned cards", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text("Set aside to sell first; everything else goes to owned collection.")
        Text("${session.totalQuantity} cards across ${session.groups.size} scanned groups")
        Spacer(modifier = Modifier.height(12.dp))
        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(orderedAllocations) { allocation ->
                ScanAllocationCard(
                    allocation = allocation,
                    onActionChange = { action ->
                        allocations = allocations.map {
                            if (it.catalogCardId == allocation.catalogCardId && it.finish == allocation.finish && it.action == allocation.action) {
                                it.copy(action = action)
                            } else {
                                it
                            }
                        }
                    },
                    onMoveOneToFinish = onMoveOneToFinish,
                )
            }
        }
        Text(status, modifier = Modifier.padding(vertical = 8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(enabled = !committing, onClick = onBack) { Text("Back") }
            Button(
                enabled = !committing && !loadingPreview && allocations.isNotEmpty(),
                onClick = {
                    committing = true
                    status = "Committing split scan..."
                    scope.launch {
                        try {
                            val result = api.commitScannedAllocations(allocations.map { it.toScanAllocation() })
                            val sellResult = result.sellResult
                            val keepResult = result.keepResult
                            val sellChanged = sellResult.added ?: (sellResult.inserted + sellResult.updated)
                            val keepChanged = keepResult.added ?: (keepResult.inserted + keepResult.updated)
                            val allErrors = result.errors + sellResult.errors + keepResult.errors
                            val message = if (allErrors.isEmpty()) {
                                "Committed $sellChanged rows to To Be Sold and $keepChanged rows to owned collection."
                            } else {
                                "Committed with ${allErrors.size} errors: $sellChanged To Be Sold, $keepChanged owned."
                            }
                            onCommitted(message)
                        } catch (error: Throwable) {
                            status = "Commit failed: ${error.message}"
                        } finally {
                            committing = false
                        }
                    }
                },
            ) { Text(if (committing) "Adding..." else "Add split collections") }
        }
    }
}

@Composable
private fun ScanAllocationCard(
    allocation: ReviewAllocation,
    onActionChange: (String) -> Unit,
    onMoveOneToFinish: (catalogCardId: String, fromFinish: String, toFinish: String) -> Unit,
) {
    val isSell = allocation.action == "sell"
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(if (isSell) "Set aside to sell" else "Add to collection / keep", fontWeight = FontWeight.Bold)
            Text(allocation.name, fontWeight = FontWeight.Bold)
            Text(
                listOfNotNull(allocation.setCode, allocation.number).joinToString(" ").ifBlank { "Catalog ${allocation.catalogCardId}" },
            )
            Text("Qty ${allocation.quantity} • Finish: ${finishDisplayName(allocation.finish)}")
            if (allocation.foilSwapOpportunity) {
                Text(
                    "Foil swap: Normal copies satisfy keep target; set aside shiny/foil to sell.",
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (allocation.reason.isNotBlank()) {
                Text("Reason: ${allocation.reason}", style = MaterialTheme.typography.bodySmall)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    enabled = !isSell,
                    onClick = { onActionChange("sell") },
                ) { Text("Move to sell") }
                OutlinedButton(
                    enabled = isSell,
                    onClick = { onActionChange("keep") },
                ) { Text("Keep") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    enabled = allocation.finish != FINISH_NORMAL,
                    onClick = { onMoveOneToFinish(allocation.catalogCardId, allocation.finish, FINISH_NORMAL) },
                ) { Text("Mark one Normal") }
                OutlinedButton(
                    enabled = allocation.finish != FINISH_FOIL,
                    onClick = { onMoveOneToFinish(allocation.catalogCardId, allocation.finish, FINISH_FOIL) },
                ) { Text("Mark one Shiny") }
            }
        }
    }
}

@Composable
private fun CommitSuccessScreen(
    message: String,
    onStartNew: () -> Unit,
    onSettings: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Collection updated", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(message)
        Text("The committed scanner session has been cleared, so tapping back into scanning will start a fresh session.")
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = onStartNew) { Text("Start new session") }
            OutlinedButton(onClick = onSettings) { Text("Settings") }
        }
    }
}

@Composable
private fun CameraPreview(
    analyzer: MlKitTextAnalyzer,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val previewView = remember {
        PreviewView(context).apply {
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
    }
    val executor = remember(analyzer) { Executors.newSingleThreadExecutor() }
    val disposed = remember { AtomicBoolean(false) }
    var cameraProvider by remember { mutableStateOf<ProcessCameraProvider?>(null) }
    val currentCameraProvider by rememberUpdatedState(cameraProvider)

    DisposableEffect(analyzer) {
        disposed.set(false)
        onDispose {
            disposed.set(true)
            currentCameraProvider?.unbindAll()
            analyzer.close()
            executor.shutdown()
        }
    }

    LaunchedEffect(analyzer, lifecycleOwner) {
        cameraProvider = bindCameraUseCases(
            context = context,
            lifecycleOwner = lifecycleOwner,
            previewView = previewView,
            analyzer = analyzer,
            executor = executor,
            shouldBind = { !disposed.get() && !executor.isShutdown },
        )
    }

    AndroidView(factory = { previewView }, modifier = modifier)
}

private suspend fun bindCameraUseCases(
    context: android.content.Context,
    lifecycleOwner: LifecycleOwner,
    previewView: PreviewView,
    analyzer: ImageAnalysis.Analyzer,
    executor: ExecutorService,
    shouldBind: () -> Boolean,
): ProcessCameraProvider {
    val cameraProvider = context.awaitCameraProvider()
    if (!shouldBind()) {
        cameraProvider.unbindAll()
        return cameraProvider
    }

    val preview = Preview.Builder().build().also {
        it.setSurfaceProvider(previewView.surfaceProvider)
    }
    val analysis = ImageAnalysis.Builder()
        .setTargetResolution(Size(1280, 720))
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .build()

    if (!shouldBind()) {
        cameraProvider.unbindAll()
        return cameraProvider
    }

    analysis.setAnalyzer(executor, analyzer)
    cameraProvider.unbindAll()

    if (!shouldBind()) {
        analysis.clearAnalyzer()
        cameraProvider.unbindAll()
        return cameraProvider
    }

    cameraProvider.bindToLifecycle(
        lifecycleOwner,
        CameraSelector.DEFAULT_BACK_CAMERA,
        preview,
        analysis,
    )
    return cameraProvider
}

private suspend fun android.content.Context.awaitCameraProvider(): ProcessCameraProvider = suspendCancellableCoroutine { cont ->
    val future = ProcessCameraProvider.getInstance(this)
    future.addListener(
        {
            if (cont.isActive) {
                runCatching { future.get() }
                    .onSuccess { provider -> if (cont.isActive) cont.resume(provider) }
                    .onFailure { error -> if (cont.isActive) cont.resumeWithException(error) }
            }
        },
        ContextCompat.getMainExecutor(this),
    )
    cont.invokeOnCancellation { future.cancel(false) }
}
