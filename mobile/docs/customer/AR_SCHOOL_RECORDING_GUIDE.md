# PanelScan school AR testing instructions

Use the APK named **PanelScan-AR-Demo.apk**, version **1.1-ar-demo**. Install it as an update over your existing PanelScan app. Do not uninstall first, since local orders and saved details are stored on the phone.

These changes are ready for testing. Scanning accuracy, recording/export, reference-image tracking, and replay still need to be checked on your actual phone. A successful build does not establish reliable performance in the school room.

## Before recording

- Clean the camera lens. Use the same phone, room, target surface, route, and distance for every comparison. Start around 1–2 metres away where practical; stay on the floor for ceiling tests.
- Keep ordinary scanning enabled for the first eight captures. Keep the Vision Enhancement preview off and use the default automatic enhancement settings.
- Find the flashlight button on the AR screen. Use PanelScan's own flashlight control; another camera/flashlight app can interrupt AR. If no flashlight button appears, report that the device does not support this control. Do not substitute another app.
- Leave enough free storage. The app requires at least 250 MB free before a capture; all eight recordings can need considerably more. Share each recording as you finish it.
- Keep people, private documents, and personal information out of the camera view. Check that moving with room lights off is safe. Failed scans are useful evidence: you do not need a confirmed corner or measurement to record them.

## Record these eight conditions

| Capture | Surface | Room lights | PanelScan flashlight |
|---|---|---|---|
| 1 | Wall | OFF | OFF |
| 2 | Wall | OFF | ON |
| 3 | Wall | ON | OFF |
| 4 | Wall | ON | ON |
| 5 | Ceiling | OFF | OFF |
| 6 | Ceiling | OFF | ON |
| 7 | Ceiling | ON | OFF |
| 8 | Ceiling | ON | ON |

Record each condition separately. Do not change the lighting during a comparison capture. The recording filename includes wall/ceiling, the reported room-light state, and the flashlight state at the start. Flashlight changes are also logged if one happens accidentally.

## Steps for each capture

1. Set the room lights for that condition. Close AR and reopen it to start a fresh session for each condition. Select **Wall** or **Ceiling**.
2. Set the flashlight using the button in PanelScan before starting.
3. Open **AR tools**. Under **Room lights**, choose the actual **ON** or **OFF** state. The app cannot detect the room-light switch itself.
4. Tap **Start recording**, then **Done** to return to the camera. Check that the recording timer appears.
5. Record **30–60 seconds**. Start with a wide view showing the whole target area, its edges, and corners. Move slowly sideways to give the camera different viewpoints. Avoid fast swings or spinning in place.
6. For walls, show the left/right boundaries and the wall-to-ceiling junction. For ceilings, show the ceiling-to-wall junctions and **all accessible ceiling corners** by slowly sweeping around the room, then return to the area being measured. The corners are needed in the video for context; corner detection is optional for measurement.
7. Include the glare/reflection and the moment scanning fails. Hold still briefly so the failure is visible. Attempt the same measurement if the app permits it; do not force placement when tracking is unavailable.
8. Tap **Stop** beside the timer. Wait for saving to finish. Open **AR tools → Saved recordings → Share ZIP** and send that condition's ZIP. Use **Refresh saved recordings** if the list has not updated yet.

A capture also stops when AR pauses, the phone locks, another app opens, or the two-minute limit is reached. Keep PanelScan open until you have stopped the capture yourself. Original captures remain on the phone after sharing.

## What to send

- The **eight original ZIP files**, sent as files/documents rather than compressed videos. Each ZIP contains the replayable ARCore `session.mp4`, `diagnostics.csv`, and device/test metadata. Reference-assisted captures also contain the registered image database.
- Phone model, Android version, approximate distance to the surface, and a short result for each condition: confirmed / never confirmed / tracking lost / wrong dimensions.
- Tape-measured width and height of the exact same area, if available. Do not mix measurements from different walls or ceiling areas.
- If possible, make a separate **normal screen recording** for the worst condition so we can see messages, reticle state, placed points, and the result. The ARCore MP4 records camera/sensor data, not the PanelScan buttons or overlays. If screen recording makes the phone lag or heat up, capture the screen video in a separate repeated attempt.

## Optional reference-assisted comparison

Do this after the eight ordinary scans, if attaching a removable print is permitted.

1. Print a detailed, nonrepeating photograph on **matte paper**. Avoid QR codes, simple logos, glossy prints, folds, and repeated grids. Use the exact source image you will choose in the app.
2. Measure the width of the **printed image itself**, excluding blank paper margins. Do not use a guessed A4 width or the width of the wall. The app accepts measured image widths of 5–100 cm.
3. Fix it flat against the same wall or ceiling, without a gap or tilt. For a ceiling, have staff attach it safely; do not climb while using the app.
4. Before placing measurement points or starting a recording, open **AR tools → Choose the exact image you printed**, enter its measured width in centimetres, and confirm that it is flat and measured. Tap **Use reference image**.
5. Close the panel and initially show the entire print clearly, filling roughly a quarter of the camera view. Wait for reference tracking and surface confirmation. Keep the print in view as you select points on that same unobstructed surface. Placement pauses when full reference tracking is lost.
6. Record the troublesome condition again and share its ZIP. The metadata identifies it as reference-assisted. Compare the result with the tape measurement.
7. Use **Reset** before changing modes or remounting a print. **Return to ordinary scanning** disables the optional reference mode. Opening a new AR visit requires registering the print again.

Incorrect print dimensions, a tilted print, or points on another wall can produce incorrect results. A printed reference is an optional aid, not a guarantee on reflective surfaces. For the demonstration, choose a configuration that succeeds on the actual phone in that room, and repeat the same scan at least five times before presenting it. Agree on acceptable measurement error before assessing those results.

## Replay

For diagnosis, use **AR tools → Saved recordings → Replay**. This uses the original dataset and, when present, its reference database. You can also open an original ARCore MP4 through **Open ARCore MP4**. If the capture used a print, replaying the saved folder is preferable because the standalone MP4 does not include this app's registered reference database.

Replay runs in real time and does not automatically repeat your button taps or flashlight changes. Try measurement points manually for diagnosis; replay measurements cannot be submitted as a customer order measurement. Use **Return to live camera** when done. A phone screen recording is not a replayable ARCore dataset, and replay results can differ from the original live scan.
