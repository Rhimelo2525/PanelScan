package com.example.panelscan.feature.measurement

import androidx.lifecycle.ViewModel
import com.example.panelscan.core.model.MeasurementResult
import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.feature.measurement.ar.quality.ScanEnhancementSettings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** Where the numbers on the result screen came from. Shown to the user for trust. */
enum class MeasurementSource {
    AR_SCAN, ADJUSTED, MANUAL_ENTRY;

    val label: String
        get() = when (this) {
            AR_SCAN -> "AR scan"
            ADJUSTED -> "AR scan, adjusted"
            MANUAL_ENTRY -> "Entered manually"
        }
}

data class MeasurementUiState(
    val surfaceType: SurfaceType = SurfaceType.WALL,
    /**
     * How many AR points produced the current figures. Deliberately a count, not the
     * anchors themselves: ARCore anchors are handles into a native session, and this
     * ViewModel outlives the AR screen that owns that session.
     */
    val capturedPointCount: Int = 0,
    val widthMeters: Double = 0.0,
    val heightMeters: Double = 0.0,
    val areaSquareMeters: Double = 0.0,
    val isConfirmed: Boolean = false,
    val source: MeasurementSource = MeasurementSource.AR_SCAN,
    /** Panel chosen from the catalogue before measuring, if the user came that way. */
    val preselectedPanelId: String? = null,
    /** Advanced scanning settings; kept for the session so they survive re-entering AR. */
    val scanEnhancement: ScanEnhancementSettings = ScanEnhancementSettings.Default,
    /** Waste allowance chosen on the estimation result, carried into the saved project. */
    val wastePercent: Int = 10
) {
    val hasUsableMeasurement: Boolean get() = widthMeters > 0.0 && heightMeters > 0.0
}

class MeasurementViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(MeasurementUiState())
    val uiState: StateFlow<MeasurementUiState> = _uiState.asStateFlow()

    fun setSurfaceType(type: SurfaceType) {
        _uiState.update { it.copy(surfaceType = type, capturedPointCount = 0) }
    }

    fun setScanEnhancement(settings: ScanEnhancementSettings) {
        _uiState.update { it.copy(scanEnhancement = settings.normalised()) }
    }

    fun setWastePercent(percent: Int) {
        _uiState.update { it.copy(wastePercent = percent.coerceIn(0, 30)) }
    }

    fun setPreselectedPanel(panelId: String?) {
        _uiState.update { it.copy(preselectedPanelId = panelId) }
    }

    /** Clears the previous scan so re-entering Measure never resumes a stale session. */
    fun beginNewMeasurement() {
        _uiState.update {
            it.copy(
                capturedPointCount = 0,
                widthMeters = 0.0,
                heightMeters = 0.0,
                areaSquareMeters = 0.0,
                isConfirmed = false,
                source = MeasurementSource.AR_SCAN
            )
        }
    }

    /** Applies a hand-corrected width/height from the result screen. */
    fun applyManualDimensions(width: Double, height: Double) {
        _uiState.update {
            val adjusted = it.capturedPointCount > 0
            it.copy(
                widthMeters = width,
                heightMeters = height,
                areaSquareMeters = width * height,
                source = if (adjusted) MeasurementSource.ADJUSTED else MeasurementSource.MANUAL_ENTRY
            )
        }
    }

    /**
     * Receives a finished AR measurement as plain numbers. The AR screen owns the anchors
     * and computes width/height from live poses; nothing session-bound crosses this line.
     */
    fun applyArMeasurement(width: Double, height: Double, pointCount: Int) {
        _uiState.update {
            it.copy(
                widthMeters = width,
                heightMeters = height,
                areaSquareMeters = width * height,
                capturedPointCount = pointCount,
                source = MeasurementSource.AR_SCAN
            )
        }
    }

    fun reset() {
        _uiState.update {
            it.copy(
                capturedPointCount = 0,
                widthMeters = 0.0,
                heightMeters = 0.0,
                areaSquareMeters = 0.0,
                source = MeasurementSource.AR_SCAN
            )
        }
    }

    fun confirm() {
        _uiState.update { it.copy(isConfirmed = true) }
    }

    fun clearConfirmation() {
        _uiState.update { it.copy(isConfirmed = false) }
    }

    fun getResult(): MeasurementResult {
        val state = _uiState.value
        return MeasurementResult(
            widthMeters = state.widthMeters,
            heightMeters = state.heightMeters,
            areaSquareMeters = state.areaSquareMeters,
            surfaceType = state.surfaceType
        )
    }
}
