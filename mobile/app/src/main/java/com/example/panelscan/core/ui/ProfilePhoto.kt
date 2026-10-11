package com.example.panelscan.core.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import com.example.panelscan.core.design.PanelScan
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The customer's profile picture from their account (the same one as on the
 * website), or a person icon when there is none or it can't be loaded.
 * [path] is the backend's own picture address; [load] fetches it signed in.
 */
@Composable
fun ProfilePhoto(
    path: String?,
    load: suspend (String) -> ByteArray?,
    iconSize: Dp,
    modifier: Modifier = Modifier
) {
    val photo by produceState<ImageBitmap?>(initialValue = null, path) {
        value = path?.let { load(it) }?.let { bytes ->
            withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() }
        }
    }
    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        val current = photo
        if (current != null) {
            Image(bitmap = current, contentDescription = "Profile picture", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Icon(imageVector = Icons.Rounded.Person, contentDescription = null, tint = PanelScan.colors.accent, modifier = Modifier.size(iconSize))
        }
    }
}
