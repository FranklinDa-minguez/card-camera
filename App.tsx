import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Card } from './src/cards';
import type { Sensitivity } from './src/hooks/useSnapDetector';
import { CardPicker } from './src/screens/CardPicker';
import { FakeCamera } from './src/screens/FakeCamera';

export default function App() {
  const [card, setCard] = useState<Card | null>(null);
  const [sensitivity, setSensitivity] = useState<Sensitivity>('medium');

  return (
    <SafeAreaProvider>
      <StatusBar style="light" hidden={card !== null} />
      {card ? (
        <FakeCamera card={card} sensitivity={sensitivity} onExit={() => setCard(null)} />
      ) : (
        <CardPicker sensitivity={sensitivity} onChangeSensitivity={setSensitivity} onPick={setCard} />
      )}
    </SafeAreaProvider>
  );
}
