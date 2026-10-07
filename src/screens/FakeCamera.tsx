import { CameraView, useCameraPermissions } from 'expo-camera';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '../cards';
import { PlayingCard } from '../components/PlayingCard';
import { Sensitivity, useSnapDetector } from '../hooks/useSnapDetector';

const YELLOW = '#FFD60A';
const MODES = ['TIME-LAPSE', 'SLO-MO', 'VIDEO', 'PHOTO', 'PORTRAIT', 'PANO'];
const ZOOMS = ['.5', '1', '2'];

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
  const [flashOn, setFlashOn] = useState(false);
  const [zoom, setZoom] = useState('1');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const blink = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const reveal = () => {
    if (revealed) return;
    setRevealed(true);
    Animated.timing(cardOpacity, { toValue: 0, duration: 140, useNativeDriver: true }).start();
  };

  useSnapDetector(!revealed, sensitivity, reveal);

  const shoot = async () => {
    blink.setValue(1);
    Animated.timing(blink, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    // Only keep a real photo once the real card is showing, so the thumbnail never gives it away.
    if (!revealed) return;
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.5, shutterSound: false });
      if (photo) setThumbnail(photo.uri);
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
        <View style={styles.topButton}>
          <SymbolView name="livephoto" size={22} tintColor="#fff" />
        </View>
      </View>

      {/* Viewfinder */}
      <View style={{ width, height: previewH, overflow: 'hidden', backgroundColor: '#111' }}>
        {permission?.granted && (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" animateShutter={false} />
        )}

        <Animated.View
          pointerEvents={revealed ? 'none' : 'box-none'}
          style={[StyleSheet.absoluteFill, { opacity: cardOpacity }]}
        >
          <DraggableCard card={card} width={width * 0.42} />
        </Animated.View>

        <View style={styles.zoomRow} pointerEvents="box-none">
          <View style={styles.zoomPill}>
            {ZOOMS.map((z) => (
              <Pressable
                key={z}
                onPress={() => setZoom(z)}
                // Hidden backup: long-press the zoom buttons to reveal if the snap isn't heard.
                onLongPress={reveal}
                delayLongPress={450}
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

          <View style={styles.flipButton}>
            <SymbolView name="arrow.triangle.2.circlepath" size={24} tintColor="#fff" />
          </View>
        </View>
      </View>
    </View>
  );
}

/** The chosen card, placed over the viewfinder. Drag to move; pinch to resize and rotate. */
function DraggableCard({ card, width }: { card: Card; width: number }) {
  const [t, setT] = useState({ x: 0, y: 0, scale: 1, rotation: 0 });
  const tRef = useRef(t);
  tRef.current = t;
  const gesture = useRef<{
    mode: 'pan' | 'pinch' | null;
    base: typeof t;
    startX: number;
    startY: number;
    startDist: number;
    startAngle: number;
  }>({ mode: null, base: t, startX: 0, startY: 0, startDist: 1, startAngle: 0 });

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        gesture.current.mode = null;
      },
      onPanResponderMove: (e) => {
        const touches = e.nativeEvent.touches;
        const g = gesture.current;
        if (touches.length >= 2) {
          const dx = touches[1].pageX - touches[0].pageX;
          const dy = touches[1].pageY - touches[0].pageY;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const angle = Math.atan2(dy, dx);
          if (g.mode !== 'pinch') {
            Object.assign(g, { mode: 'pinch', base: tRef.current, startDist: dist, startAngle: angle });
            return;
          }
          setT({
            ...g.base,
            scale: Math.min(4, Math.max(0.3, (g.base.scale * dist) / g.startDist)),
            rotation: g.base.rotation + (angle - g.startAngle),
          });
        } else if (touches.length === 1) {
          const { pageX, pageY } = touches[0];
          if (g.mode !== 'pan') {
            Object.assign(g, { mode: 'pan', base: tRef.current, startX: pageX, startY: pageY });
            return;
          }
          setT({ ...g.base, x: g.base.x + pageX - g.startX, y: g.base.y + pageY - g.startY });
        }
      },
      onPanResponderRelease: () => {
        gesture.current.mode = null;
      },
    }),
  ).current;

  return (
    <View style={styles.cardCenter} pointerEvents="box-none">
      <View
        {...responder.panHandlers}
        style={[
          styles.cardShadow,
          {
            transform: [
              { translateX: t.x },
              { translateY: t.y },
              { scale: t.scale },
              { rotate: `${t.rotation}rad` },
            ],
          },
        ]}
      >
        <PlayingCard card={card} width={width} />
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
  cardCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  cardShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
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
