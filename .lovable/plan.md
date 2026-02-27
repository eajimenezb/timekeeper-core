

## Auto-Capture Face Detection

Modify `FaceCapture` to continuously run face detection in a loop once the camera is active, and automatically trigger capture when a face is detected with sufficient confidence — no button press needed.

### Implementation Steps

1. **Add auto-detection loop in `FaceCapture.tsx`**:
   - Once `cameraReady` is true, start a `setInterval` (every ~500ms) that calls `detectFace()`
   - When a face is detected, automatically call `onCapture(result)` and stop the loop
   - Show a visual indicator (scanning animation/overlay) while detecting
   - Keep the manual capture button as a fallback

2. **Add detection state UI**:
   - Show a "Scanning..." label with a pulsing animation over the video feed while the loop runs
   - On successful detection, briefly flash a success indicator before auto-proceeding
   - If no face detected after ~10 seconds, show a hint message ("Make sure your face is visible")

3. **Guard against rapid re-triggers**:
   - Use a ref to track if capture already happened, preventing double-fires
   - Clear the interval on unmount and on successful capture

No backend or database changes needed — this is purely a frontend UX improvement.

