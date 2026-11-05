package com.example.panelscan.core.design

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Light or dark, as the customer picked it in Account → Appearance. */
enum class Appearance { LIGHT, DARK }

/**
 * The app's light/dark choice, kept on the phone. Until the customer picks one
 * the app starts in the phone's own setting; once picked it no longer follows it.
 */
object AppearancePreference {
    private const val PREFS = "panelscan.appearance"
    private const val KEY = "appearance"

    private var prefs: SharedPreferences? = null
    private val _appearance = MutableStateFlow<Appearance?>(null)

    /** null until the customer has picked one. */
    val appearance: StateFlow<Appearance?> = _appearance.asStateFlow()

    fun init(context: Context) {
        if (prefs != null) return
        prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        _appearance.value = prefs?.getString(KEY, null)?.let { saved -> Appearance.entries.firstOrNull { it.name == saved } }
    }

    fun set(appearance: Appearance) {
        _appearance.value = appearance
        prefs?.edit()?.putString(KEY, appearance.name)?.apply()
    }
}
