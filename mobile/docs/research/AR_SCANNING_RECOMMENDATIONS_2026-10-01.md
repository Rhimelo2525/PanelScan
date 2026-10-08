# PanelScan AR scanning research — October 1, 2026

The customer reports failed or unreliable scans under school lighting and reflections. This review examined the current Kotlin pipeline and Google's ARCore documentation. It did not reproduce the school scene, change app code, or establish measurement accuracy on a device.

## Recommendation

Prioritize an instrumented geometry improvement pass, plus an optional reference-image-assisted mode if the demonstration permits a removable print on the wall. Keep tracked ARCore planes as the primary geometry source. A software-only guarantee for blank, glossy, transparent, or reflective surfaces is not supported by the evidence.

For a nearby demonstration, use the actual demonstration phone and room to validate the chosen workflow before spending time on another broad redesign. The phone model, demonstration date, and permission to attach a reference print are still needed to choose the order of work.

## Findings from external sources

- ARCore uses visual features together with inertial measurements to track the camera. Google's environment guidance specifically lists textureless surfaces, extreme brightness, glass/reflections, and moving surfaces as limitations. Its placement guidance says vertical surfaces can be especially difficult because they reflect light and are often painted a single color. [Environment](https://developers.google.com/ar/design/environment/definition), [Content placement](https://developers.google.com/ar/design/content/content-placement).
- Depth is primarily inferred from camera motion, with supported hardware sensors incorporated when available. Google's depth overview identifies roughly 0.5–5 m as the range with best accuracy and says featureless surfaces can have imprecise depth. ARCore support alone does not imply a hardware depth sensor. [Depth overview](https://developers.google.com/ar/develop/depth).
- Raw Depth provides sparse estimates and a per-pixel confidence map. Full Depth fills more pixels through smoothing/interpolation. Raw depth is appropriate to investigate for measurement, but blank walls commonly have zero confidence unless supported hardware supplies additional evidence. New raw observations must be distinguished from reprojected old depth using timestamps. [Raw Depth for Android](https://developers.google.com/ar/develop/java/depth/raw-depth).
- Augmented Images can estimate a registered physical image's pose using its supplied real width. Incorrect print dimensions are accepted as the specified size, so the actual print must be measured. Initial detection needs a flat, clearly visible image occupying at least 25% of the camera frame. Google recommends unique visual features and an arcoreimg score of at least 75; QR codes, repeated patterns, and simple logos are poor choices for this API. [Augmented Images](https://developers.google.com/ar/develop/augmented-images), [Android guide](https://developers.google.com/ar/develop/java/augmented-images/guide).
- Recording and Playback captures camera and sensor data for repeated development tests. Results can differ across playback runs; playback does not establish live demonstration reliability. A screen recording alone is not an ARCore replay dataset. [Overview](https://developers.google.com/ar/develop/recording-and-playback), [Android recording guide](https://developers.google.com/ar/develop/java/recording-and-playback/developer-guide).
- CPU starvation and device heat can also affect tracking. Google recommends checking frame consistency, thermal state, and the VIO frequency low log message. [Performance](https://developers.google.com/ar/develop/performance).
- SharedCamera would be a substantial camera integration change; the API explicitly prevents ARCore from using a hardware depth sensor in that mode. Do not start with a camera ownership rewrite simply to add exposure controls. [SharedCamera](https://developers.google.com/ar/reference/java/com/google/ar/core/SharedCamera).

## Findings from the current code

1. `CornerAssistant.kt` applies brightness/contrast to a private CV buffer after obtaining ARCore's camera image. It does not feed the enhanced image back into ARCore tracking. The preview is useful for comparing CV inputs, but improved appearance cannot repair failed camera tracking or recover already clipped detail.
2. `SurfaceConfidence.kt` already allows measurement on low-texture or bright surfaces when tracking and geometric evidence are valid. Lighting alone is not the placement gate. Loosening brightness thresholds is therefore unlikely to address the underlying failure.
3. `ArMeasureController.sampleDepthSurface()` fits a plane to at most five hit-test results. These can be `DepthPoint`, oriented `Point`, or tracked `Plane` hits. It does not read the Raw Depth confidence map. A small fit residual describes agreement between those points, not their independent accuracy.
4. `currentDepthSurface()` can reuse a depth fit for 250 ms. `sample()` labels the reused fit with the current time before passing it to `SurfaceLockTracker`, which counts every observation. Several calls can therefore count as several observations without several independently acquired depth fits. This is a confirmed code weakness, not proof that it caused the reported school failure.
5. Frame lighting statistics are global. A bright window elsewhere in the image may dominate the warning even when the reticle patch differs. Local reticle statistics and a broader tracking-view summary should be reported separately.
6. The code already enables autofocus and automatic depth where supported, prefers certain sensor configurations, uses anchors, and has a real ray/plane fallback for small tracked polygons. Recommending these as if absent would duplicate existing work.

## Proposed implementation order

1. **Capture the failure.** Add an opt-in local diagnostic recording for the actual school scene, including tracking failure reason, evidence source, fresh depth timestamp, valid/confident sample fraction, plane fit residual, lock state, frame rate, and thermal state. Record successful matte-wall scans as a comparison.
2. **Correct independent evidence counting.** Reused geometry can support a brief visual hold, but cannot increase the number of independent depth observations. Clear stale evidence after tracking loss. Track real acquisition timestamps or observation sequence IDs.
3. **Improve depth geometry.** Keep trusted tracked planes primary. Investigate a larger reticle patch of confidence-filtered raw depth, correctly reprojected to metric 3D, with robust outlier rejection and spatial coverage checks. Refit using consistent samples across fresh frames. Preserve the existing full-depth fallback only with explicit evidence type and strict validation. Tune thresholds against real captures rather than assuming one universal value.
4. **Add targeted guidance.** Distinguish glare, insufficient tracking features, sparse depth, wrong orientation, and an unstable surface. Display an action such as changing viewpoint, moving slowly sideways, or choosing the assisted mode. A local glare mask can help reject CV artifacts; it does not change ARCore's own feature tracking.
5. **Add an optional reference-image mode.** Use a matte, nonrepeating reference print mounted flat against the target wall. Register its measured physical width. Wait for full image and camera tracking, anchor its pose, derive the coplanar wall reference, and measure user-selected endpoints through real camera rays. Confirm endpoints belong to the same unobstructed wall. Label the mode as assisted and pause placement when evidence becomes unreliable. This is a proposed engineering approach, not a tested guarantee.

The assisted mode should supplement ordinary wall scanning. Corner detection remains optional, and reference dimensions must never be used as preset wall dimensions.

## Practical demonstration preparation

- Rehearse on the exact phone and in the actual room. Use a clean lens, steady diffuse lighting, a matte wall, and a viewpoint without a strong light reflection. Start around 1–2 m from the target as a practical trial within Google's documented depth range.
- If permitted, use a few removable matte textured prints to supply visual features. For the proposed registered-image mode, measure the actual printed width and ensure the print is flat and large enough in view for initial recognition.
- Move slowly sideways to provide multiple viewpoints. Avoid repeatedly rotating in place while aimed only at a featureless patch. Keep the torch off when it creates a bright reflection; compare both lighting conditions during rehearsal.
- Keep the Vision Enhancement preview disabled during routine timing tests so its optional bitmap work does not confound the performance comparison.
- Measure a real reference area with a tape measure. Record width and height error, repeatability, time to confirmation, scan failure rate, and false locks. Use at least five consecutive attempts on the demo setup as a rehearsal gate, then test additional matte, bright, glossy, and corner scenes before claiming broader reliability. Five attempts are a project rehearsal target, not a scientific accuracy certification.
- Agree on an acceptable measurement tolerance before evaluating results. Do not infer centimetre accuracy from a plane fit residual or a passing unit test.

## Deferred options

AI wall segmentation could help identify a region of interest but would still need validated metric geometry for dimensions. A monocular depth model would require its own accuracy, scale, latency, and device evaluation. Exposure manipulation through a shared-camera rewrite and a framework switch are poor first choices for a time-limited demo. These are engineering prioritization judgments; they are not claims that such approaches can never help.
