package com.tcgplayerautomation.scanner.data

import android.content.Context
import com.tcgplayerautomation.scanner.BuildConfig

class SettingsRepository(context: Context) {
    private val prefs = context.getSharedPreferences("scanner-settings", Context.MODE_PRIVATE)

    fun getBaseUrl(): String = prefs.getString(KEY_BASE_URL, null)
        ?.takeIf { it.isNotBlank() }
        ?: BuildConfig.DEFAULT_BACKEND_URL

    fun setBaseUrl(baseUrl: String) {
        prefs.edit().putString(KEY_BASE_URL, baseUrl.trim()).apply()
    }

    companion object {
        private const val KEY_BASE_URL = "base-url"
    }
}
