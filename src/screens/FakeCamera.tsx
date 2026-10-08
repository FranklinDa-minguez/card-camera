import { useCameraPermissions } from 'expo-camera';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { CardTrackerView, CardTrackerViewRef } from '../../modules/card-tracker';
import { Card } from '../cards';
import { PlayingCard } from '../components/PlayingCard';
import { Sensitivity, useSnapDetector } from '../hooks/useSnapDetector';

const YELLOW = '#FFD60A';
const MODES = ['TIME-LAPSE', 'SLO-MO', 'VIDEO', 'PHOTO', 'PORTRAIT', 'PANO'];
const ZOOMS = ['.5', '1', '2'];
// Points; captured at screen scale, so ~1000px wide on most iPhones.
const CARD_FACE_WIDTH = 320;

type Props = {
  card: Card;
  sensitivity: Sensitivity;
  onExit: () => void;
};

export function FakeCamera({ card, sensitivity, onExit }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();

  const [revealed, setRevealed] = useState(false);
  const [cardImageUri, setCardImageUri] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [zoom, setZoom] = useState('1');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const cameraRef = useRef<CardTrackerViewRef>(null);
  const cardFaceRef = useRef<View>(null);
  const [blink] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  // A snap fades the tracked overlay out, revealing the real card underneath.
  useSnapDetector(!revealed, sensitivity, () => setRevealed(true));

  // Snapshot the drawn card to a PNG; the native tracker warps that image onto the real card.
  const captureCardFace = () => {
    requestAnimationFrame(() => {
      captureRef(cardFaceRef, { format: 'png', result: 'tmpfile' })
        .then(setCardImageUri)
        .catch((e) => console.warn('Could not capture card face', e));
    });
  };

  const shoot = async () => {
    blink.setValue(1);
    Animated.timing(blink, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    try {
      const uri = await cameraRef.current?.takePhoto();
      if (uri) setThumbnail(uri);
    } catch {}
  };

  // Layout: iPhone camera uses a 4:3 viewfinder between a top and bottom control bar.
  const topH = insets.top + 48;
  const minBottomH = 190;
  const previewH = Math.min(width * (4 / 3), height - topH - minBottomH);
  const bottomH = height - topH - previewH;

  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <View style={[styles.topBar, { height: topH, paddingTop: insets.top }]}>
        <Pressable onPress={() => setFlashOn((f) => !f)} style={styles.topButton} hitSlop={10}>
          <SymbolView
            name={flashOn ? 'bolt.fill' : 'bolt.slash.fill'}
            size={17}
            tintColor={flashOn ? YELLOW : '#fff'}
          />
        </Pressable>
        <SymbolView name="chevron.up" size={16} tintColor="#fff" />
        {/* Manual backup: toggles between the fake card and the real one (also re-arms the snap). */}
        <Pressable onPress={() => setRevealed((value) => !value)} style={styles.topButton} hitSlop={10}>
          <SymbolView name={revealed ? 'lock.open' : 'lock.fill'} size={18} tintColor="#fff" />
        </Pressable>
      </View>

      {/* Viewfinder */}
      <View style={{ width, height: previewH, overflow: 'hidden', backgroundColor: '#111' }}>
        {/* Rendered once for the snapshot; the camera view covers it. */}
        <View ref={cardFaceRef} collapsable={false} onLayout={captureCardFace} style={styles.cardFace}>
          <PlayingCard card={card} width={CARD_FACE_WIDTH} />
        </View>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />

        {permission?.granted && (
          <CardTrackerView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            cardImageUri={cardImageUri}
            overlayVisible={!revealed}
            facing="front"
            zoom={zoom === '.5' ? 0 : zoom === '2' ? 0.5 : 0.15}
          />
        )}

        <View style={styles.zoomRow} pointerEvents="box-none">
          <View style={styles.zoomPill}>
            {ZOOMS.map((z) => (
              <Pressable
                key={z}
                onPress={() => setZoom(z)}
                style={[styles.zoomButton, zoom === z && styles.zoomButtonActive]}
              >
                <Text style={[styles.zoomText, zoom === z && { color: YELLOW }]}>
                  {zoom === z ? `${z}×` : z}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: blink }]}
        />
      </View>

      {/* Bottom controls */}
      <View style={[styles.bottom, { height: bottomH, paddingBottom: insets.bottom }]}>
        <View style={styles.modes}>
          {MODES.map((m) => (
            <Text key={m} style={[styles.modeText, m === 'PHOTO' && { color: YELLOW }]}>
              {m}
            </Text>
          ))}
        </View>

        <View style={styles.controls}>
          {/* Hidden: long-press the thumbnail to go back and pick another card. */}
          <Pressable onLongPress={onExit} delayLongPress={600} style={styles.thumbnail}>
            {thumbnail && <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} />}
          </Pressable>

          <Pressable onPress={shoot} style={styles.shutterOuter}>
            {({ pressed }) => (
              <View style={[styles.shutterInner, pressed && { transform: [{ scale: 0.9 }] }]} />
            )}
          </Pressable>

          <Pressable onPress={onExit} style={styles.flipButton} hitSlop={10}>
            <SymbolView name="arrow.triangle.2.circlepath" size={24} tintColor="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    backgroundColor: '#000',
  },
  topButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  cardFace: { position: 'absolute', left: 0, top: 0 },
  zoomRow: { position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center' },
  zoomPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 3,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  zoomButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    transform: [{ scale: 0.8 }],
  },
  zoomButtonActive: { transform: [{ scale: 1.1 }] },
  zoomText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  bottom: { backgroundColor: '#000', justifyContent: 'space-evenly' },
  modes: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    // Offset so PHOTO sits centered like the real app.
    marginLeft: -64,
  },
  modeText: { color: '#fff', fontSize: 13, fontWeight: '500', letterSpacing: 0.6 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 34,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#2B2B2D',
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
  flipButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
