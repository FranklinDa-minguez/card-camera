import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from 'expo-audio';
import type { AudioStreamBuffer } from 'expo-audio';
import { useEffect, useRef } from 'react';

export type Sensitivity = 'low' | 'medium' | 'high';

// minPeak: loudest sample (0..1) the buffer must hit.
// ratio: how far the buffer's energy must jump above the running background level.
const THRESHOLDS: Record<Sensitivity, { minPeak: number; ratio: number }> = {
  low: { minPeak: 0.55, ratio: 9 },
  medium: { minPeak: 0.3, ratio: 6 },
  high: { minPeak: 0.15, ratio: 4 },
};

const WARMUP_SECONDS = 0.6;

/**
 * Listens to the microphone and calls `onSnap` on a short, sharp sound (a finger snap,
 * clap or tap) that stands out from the background noise.
 */
export function useSnapDetector(enabled: boolean, sensitivity: Sensitivity, onSnap: () => void) {
  const onSnapRef = useRef(onSnap);
  useEffect(() => {
    onSnapRef.current = onSnap;
  });
  const state = useRef({ floor: 0.01, startedAt: -1 });

  const handleBuffer = (buffer: AudioStreamBuffer) => {
    const samples = new Float32Array(buffer.data);
    if (samples.length === 0) return;

    let peak = 0;
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      const v = Math.abs(samples[i]);
      if (v > peak) peak = v;
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / samples.length);

    const s = state.current;
    if (s.startedAt < 0) s.startedAt = buffer.timestamp;
    const { minPeak, ratio } = THRESHOLDS[sensitivity];
    const warmedUp = buffer.timestamp - s.startedAt > WARMUP_SECONDS;

    if (warmedUp && peak >= minPeak && rms >= s.floor * ratio) {
      onSnapRef.current();
      return;
    }
    // Slowly track the room's background level so steady noise doesn't trigger.
    s.floor = Math.max(0.002, s.floor * 0.92 + rms * 0.08);
  };

  const { stream } = useAudioStream({ sampleRate: 44100, onBuffer: handleBuffer });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    state.current = { floor: 0.01, startedAt: -1 };

    (async () => {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted || cancelled) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (!cancelled) await stream.start();
    })().catch((e) => console.warn('Snap detector failed to start', e));

    return () => {
      cancelled = true;
      try {
        stream.stop();
      } catch {}
    };
  }, [enabled, stream]);
}
