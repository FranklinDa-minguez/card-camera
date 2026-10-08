import { CardTrackerViewProps } from './CardTracker.types';

// CardTrackerView is not available on the web platform.
export default function CardTrackerView(_props: CardTrackerViewProps) {
  throw new Error('CardTrackerView is not available on the web platform.');
}
