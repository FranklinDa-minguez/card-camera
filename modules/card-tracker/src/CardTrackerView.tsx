import { requireNativeView } from 'expo';
import * as React from 'react';

import { CardTrackerViewProps } from './CardTracker.types';

const NativeView: React.ComponentType<CardTrackerViewProps> = requireNativeView('CardTracker');

/** Live camera that tracks a playing card and draws `cardImageUri` over it. iOS only. */
export default function CardTrackerView(props: CardTrackerViewProps) {
  return <NativeView {...props} />;
}
