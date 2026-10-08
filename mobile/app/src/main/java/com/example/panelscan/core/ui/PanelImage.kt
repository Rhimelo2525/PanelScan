package com.example.panelscan.core.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import coil.compose.SubcomposeAsyncImage
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.model.PVCPanel

/**
 * A panel's picture: its product photo from the backend, a bundled image, or
 * (no photo, still loading, or it failed to load) the drawn finish texture.
 */
@Composable
fun PanelImage(
    panel: PVCPanel,
    modifier: Modifier = Modifier,
    shape: Shape = PanelScan.shapes.thumbnail
) {
    when {
        panel.imageResId != null -> Image(
            painter = painterResource(id = panel.imageResId),
            contentDescription = panel.name,
            contentScale = ContentScale.Crop,
            modifier = modifier.clip(shape)
        )
        panel.imageUrl != null -> SubcomposeAsyncImage(
            model = panel.imageUrl,
            contentDescription = panel.name,
            contentScale = ContentScale.Crop,
            modifier = modifier.clip(shape),
            loading = { PanelTexture(panel.textureResource, Modifier.fillMaxSize(), shape) },
            error = { PanelTexture(panel.textureResource, Modifier.fillMaxSize(), shape) }
        )
        else -> PanelTexture(panel.textureResource, modifier, shape)
    }
}
