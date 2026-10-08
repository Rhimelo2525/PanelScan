# PanelScan AR implementation — October 1, 2026

## Implemented

- AR tools: Start/Stop recording, elapsed timer, room-light label, saved captures, explicit ZIP share, and replay. Recordings stop on pause or after two minutes. Original datasets stay in private app storage, excluded from backup; exports use a non-exported FileProvider limited to prepared ZIPs. Recording is opt-in and no upload is automatic.
- Diagnostic CSV: independent camera FPS, tracking/failure reason, wall/ceiling, flashlight state and changes, surface/lock source, point count and dimensions, raw acquisition timestamp, confident sample fraction, inlier fraction, quadrant coverage, RMS residual, global and local luma/clipping, camera movement, frame work time, and thermal status. Initial device/light/mode metadata and end reason accompany each dataset. Buffered writes run on an ordered worker.
- Independent geometry evidence: cached or reprojected depth cannot add repeated stability votes. Raw and interpolated versions of the same acquisition share a freshness identity. Tracking loss clears accumulated samples. An earlier depth lock can promote to a tracked-plane lock before measurement begins; compatible live tracked evidence can maintain the same plane during measurement.
- Depth: 9 × 9 reticle patch, full unsigned 16-bit depth, confidence filtering for raw data, VIEW to TEXTURE_NORMALIZED mapping, scaled camera texture intrinsics, metric unprojection, bounded consensus fitting, outlier rejection, and spatial coverage checks. Tracked planes remain primary. Full depth is a separately labeled, stricter fallback and does not claim raw per-pixel confidence. Depth-led placement pauses when its evidence becomes stale unless a compatible live tracked plane supports it.
- Local exposure: reticle statistics are computed using the live display transform; tracking-wide and local statistics remain distinct. Clipped highlight boundaries are excluded from optional CV edge votes. The raw tracking camera is not modified.
- Optional reference image: register the customer's exact source image and measured physical print width, require camera plus FULL_TRACKING image evidence, validate wall/ceiling orientation and ceiling height, settle the reference plane, then use anchored metric ray intersections and existing obstruction/same-plane checks. The print must be flat and visible; placement pauses when full reference tracking is unavailable or the reference disagrees with the measured plane. The interface labels reference assistance and warns about incorrect scale, tilt, and different surfaces. Disabling assistance disables the image database in the session. Registered databases and print width metadata accompany assisted recordings for replay.
- Replay starts in a new session before its first resume. Saved captures recover their surface mode and reference database. A replay can be restarted and cannot apply dimensions to the customer's measurement/order workflow. Imported standalone MP4s do not restore an external reference database.
- Flashlight availability is queried from FLASH_INFO_AVAILABLE for the actual ARCore-selected camera. Removed the deprecated Session.isSupported check that always returns true. Torch changes continue through the single ARCore session and turn off on pause.
- Customer guide: eight separate wall/ceiling and room-light/flashlight combinations, corners and boundaries in the video, original ZIP sharing, optional UI screen recording, measured-print comparison, and tape-measure/rehearsal instructions.

## Verification

- Version: 1.1-ar-demo, version code 2, application ID com.example.panelscan.
- testDebugUnitTest, lint, and assembleDebug succeeded. 166 tests, zero failures/errors/skips. Lint has no errors; existing warnings plus a conservative usable-space warning remain.
- Added 14 meaningful regressions for independent acquisitions, raw/full duplicates, tracking loss, reference evidence, promotion to tracked planes, clutter and sparse coverage, collinearity, metric axis signs, reticle-vs-global exposure, invalid display transforms, and glare suppression. Updated guidance assertions for the intended messages.
- APK v2 signature verifies. The certificate matches the previous final APK, supporting an in-place update. This is a debug-signed demonstration build, not a production release-key build.
- APK bytes: 57545351; SHA-256: aa78c6e9c475041c584de3eb8d6c5a4de65d3f8b4611c8ab6bec459661466fc3.
- PanelScan-AR-Demo.apk and PanelScan-Android-Final.apk in the project and on Desktop are byte-identical. The prior final APK is retained as PanelScan-Previous-2026-10-01.apk.
- adb devices -l and adb mdns services found no phone. Native recording/export/replay, reference-image pose, frame rate, and physical measurement accuracy are NOT device-validated. No school recordings or tape-measure results have been received yet.

## Remaining physical evaluation

Run docs/customer/AR_SCHOOL_RECORDING_GUIDE.md on the actual demonstration phone. Evaluate all eight conditions before calibrating the provisional raw-confidence, residual, consensus, coverage, and distance thresholds. These thresholds are engineering starting points, not certified accuracy limits. Recording itself can affect performance; compare with an unrecorded rehearsal as well. Repeated scans and acceptable error must be agreed before claiming demonstration reliability.

## Official sources used

- [Raw Depth](https://developers.google.com/ar/develop/java/depth/raw-depth): confidence and acquisition timestamps.
- [Recording and Playback](https://developers.google.com/ar/develop/java/recording-and-playback/developer-guide): native datasets, start/stop, new-session replay, and replay variability.
- [Augmented Images](https://developers.google.com/ar/develop/java/augmented-images/guide): known physical size, registration, and FULL_TRACKING.
- [Flashlight support](https://developers.google.com/ar/develop/camera/flash/java): query active-camera flash hardware and configure the ARCore torch.
- [Session API](https://developers.google.com/ar/reference/java/com/google/ar/core/Session): recording overhead, flushed stop, and the deprecated always-true support check.
