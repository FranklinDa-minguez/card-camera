import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, RANKS, SUITS, Suit, cardKey } from '../cards';
import { PlayingCard } from '../components/PlayingCard';
import { SuitIcon } from '../components/SuitIcon';
import type { Sensitivity } from '../hooks/useSnapDetector';

const SUIT_NAMES: Record<Suit, string> = {
  spades: 'Spades',
  hearts: 'Hearts',
  clubs: 'Clubs',
  diamonds: 'Diamonds',
};

const COLUMNS = 5;
const GAP = 10;
const SIDE = 16;

type Props = {
  sensitivity: Sensitivity;
  onChangeSensitivity: (s: Sensitivity) => void;
  onPick: (card: Card) => void;
};

export function CardPicker({ sensitivity, onChangeSensitivity, onPick }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardWidth = (width - SIDE * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
    >
      <Text style={styles.title}>Pick a card</Text>
      <Text style={styles.subtitle}>
        The camera will show this card until you snap. Then it reveals the real one.
      </Text>

      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>Snap sensitivity</Text>
        <View style={styles.segment}>
          {(['low', 'medium', 'high'] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => onChangeSensitivity(s)}
              style={[styles.segmentItem, sensitivity === s && styles.segmentItemActive]}
            >
              <Text style={[styles.segmentText, sensitivity === s && styles.segmentTextActive]}>
                {s[0].toUpperCase() + s.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {SUITS.map((suit) => (
        <View key={suit} style={styles.section}>
          <View style={styles.sectionHeader}>
            <SuitIcon suit={suit} size={16} color="#fff" />
            <Text style={styles.sectionTitle}>{SUIT_NAMES[suit]}</Text>
          </View>
          <View style={styles.grid}>
            {RANKS.map((rank) => {
              const card = { rank, suit };
              return (
                <Pressable
                  key={cardKey(card)}
                  onPress={() => onPick(card)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <PlayingCard card={card} width={cardWidth} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E0F12' },
  title: { color: '#fff', fontSize: 34, fontWeight: '700', paddingHorizontal: SIDE },
  subtitle: { color: '#9A9DA6', fontSize: 15, paddingHorizontal: SIDE, marginTop: 6, lineHeight: 20 },
  settingRow: {
    marginTop: 20,
    marginHorizontal: SIDE,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#1B1D22',
    gap: 10,
  },
  settingLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  segment: { flexDirection: 'row', backgroundColor: '#2A2D34', borderRadius: 9, padding: 2 },
  segmentItem: { flex: 1, paddingVertical: 7, borderRadius: 7, alignItems: 'center' },
  segmentItemActive: { backgroundColor: '#5B5F69' },
  segmentText: { color: '#C3C6CE', fontSize: 13, fontWeight: '500' },
  segmentTextActive: { color: '#fff', fontWeight: '600' },
  section: { marginTop: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SIDE,
    marginBottom: 10,
  },
  sectionTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: SIDE },
});
