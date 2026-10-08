# card-camera

An iPhone app for a card trick. It looks just like the iOS Camera app. When you hold a playing card up to the camera, the screen shows a different card: the one you picked in the app. Snap your fingers and the real card is revealed.

Built with Expo / React Native, plus a small native iOS module for live card tracking.

## How the trick works

1. **Pick a card** from the full 52-card deck in the app. You can also set how sensitive snap detection is.
2. The app switches to a screen that copies the **iOS Camera app**: flash and chevron at the top, a 4:3 viewfinder, the `.5 / 1× / 2` zoom buttons, the mode strip with PHOTO highlighted, a shutter button, and a thumbnail.
3. Hold a real card in front of the camera. The app finds the card in every frame and draws your chosen card over it, matching its position, size, angle, perspective and lighting. Move the card around and the fake one moves with it.
4. **Snap your fingers.** The microphone hears the snap, the fake card fades out, and the real card is revealed.

### Hidden controls

| Action | What it does |
| --- | --- |
| Snap (or any sharp sound) | Fades out the fake card to reveal the real one |
| Tap the lock icon (top right) | Switches between the fake and real card by hand, and re-arms the snap |
| Tap the flip button (bottom right) | Goes back to the card picker |
| Long-press the thumbnail (bottom left) | Goes back to the card picker |
| Shutter | Takes a photo of exactly what's on screen, fake card included |

### Tips for a convincing effect

- Use a **white-bordered card against a darker background**. Detection needs the card's edges to stand out.
- **Hold the card by an edge or corner.** The fake card is drawn over your fingers wherever they cross the card. If a finger hides a whole corner, tracking can drop out.
- Practise the snap at the sensitivity you'll perform with. Talking or clapping nearby can trigger it on **High**.

## Running it

The app needs a **real iPhone**. The card tracking uses custom native code, so it **won't run in Expo Go**, and the iOS Simulator has no camera.

Requirements: a Mac with **Xcode**, Node.js, and an iPhone connected with a data cable, with **Developer Mode** turned on (Settings → Privacy & Security). A free Apple ID is enough for signing.

```bash
npm install
npx expo run:ios --device
```

The `ios/` folder isn't in the repo. It's generated from `app.json` on the first build ([Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)), so don't edit it by hand.

After the first build, `npx expo start` reloads JavaScript changes straight onto the phone. Changes to the Swift code need another `npx expo run:ios --device`.

## How the card tracking works

The native module is in [`modules/card-tracker`](modules/card-tracker). [`CardTrackerView.swift`](modules/card-tracker/ios/CardTrackerView.swift) does all of this:

- **Camera:** runs the front camera itself with AVFoundation, mirrored like the real Camera app.
- **Detection:** Apple's Vision framework (`VNDetectRectanglesRequest`) finds the card's four corners in each frame, filtered to playing-card proportions. Light smoothing reduces jitter.
- **Warping:** a snapshot of the drawn card (captured from React Native with `react-native-view-shot`) is stretched onto those corners with Core Image. It's drawn about 3.5% larger so the real card's edges don't peek out.
- **Lighting:** the white border on all four edges of the real card is measured. The fake card gets the same overall brightness, colour cast and side-to-side shading, plus a slight blur to match the camera.
- **Rendering:** the camera frame and the overlay are combined into one image before display (Metal), so the fake card never lags a frame behind the real one.

Things you might want to tune, all in `CardTrackerView.swift`:
- `holdFrames`: how long the overlay stays after the card is lost
- the smoothing amount `0.65` in `updateTracking`
- the oversize factor `1.035` in `overlay`

Snap detection is in [`src/hooks/useSnapDetector.ts`](src/hooks/useSnapDetector.ts). It reads raw microphone audio with `expo-audio` and fires when a sharp sound stands out from the background noise.

## Project layout

```
App.tsx                         switches between the picker and the camera
src/screens/CardPicker.tsx      card grid + sensitivity setting
src/screens/FakeCamera.tsx      the iOS Camera look-alike
src/components/PlayingCard.tsx  playing cards drawn in code
src/hooks/useSnapDetector.ts    finger-snap detection from the mic
modules/card-tracker/           native iOS card tracking + overlay
```

## Notes

- **iOS only.** There's no Android version of the tracking module.
- **iOS 27:** apps built with Xcode 27 must use the UIScene lifecycle, which is turned on through `expo-build-properties` (`ios.enableSceneSupport` in `app.json`). Without it, the app crashes on launch.
