package com.example.panelscan.core.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil.compose.SubcomposeAsyncImage
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.model.PVCPanel

/**
 * A product's photos for its detail screen: swipe between them, with dots
 * showing which one is open. Each photo is shown whole on white (never
 * cropped), as on the website. A panel without photos shows [PanelImage].
 */
@Composable
fun PanelGallery(
    panel: PVCPanel,
    modifier: Modifier = Modifier,
    shape: Shape = PanelScan.shapes.hero
) {
    val photos = panel.imageUrls.ifEmpty { listOfNotNull(panel.imageUrl) }
    if (photos.isEmpty()) {
        PanelImage(panel = panel, modifier = modifier, shape = shape)
        return
    }
    val pager = rememberPagerState(pageCount = { photos.size })
    Box(modifier = modifier.clip(shape).background(Color.White)) {
        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
            SubcomposeAsyncImage(
                model = photos[page],
                contentDescription = "${panel.name}, photo ${page + 1} of ${photos.size}",
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
                loading = { PanelTexture(panel.textureResource, Modifier.fillMaxSize(), shape) },
                error = { PanelTexture(panel.textureResource, Modifier.fillMaxSize(), shape) }
            )
        }
        if (photos.size > 1) {
            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 10.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.35f))
                    .padding(horizontal = 8.dp, vertical = 5.dp)
                    .semantics { contentDescription = "Photo ${pager.currentPage + 1} of ${photos.size}" },
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                photos.indices.forEach { index ->
                    Box(
                        modifier = Modifier
                            .size(if (index == pager.currentPage) 8.dp else 6.dp)
                            .clip(CircleShape)
                            .background(if (index == pager.currentPage) Color.White else Color.White.copy(alpha = 0.55f))
                    )
                }
            }
        }
    }
}
