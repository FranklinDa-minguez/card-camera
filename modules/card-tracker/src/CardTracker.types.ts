import type { Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type CardTrackerViewRef = {
  /** Saves what the viewfinder shows (overlay included) as a JPEG and returns its file URI. */
  takePhoto: () => Promise<string | null>;
};

export type CardTrackerViewProps = {
  ref?: Ref<CardTrackerViewRef>;
  style?: StyleProp<ViewStyle>;
  /** File URI of a PNG of the replacement card (upright, transparent rounded corners). */
  cardImageUri?: string | null;
  /** When false the overlay fades out and the real card shows. */
  overlayVisible?: boolean;
  facing?: 'front' | 'back';
  /** 0...1, like expo-camera. */
  zoom?: number;
};
