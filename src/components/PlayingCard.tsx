import { StyleSheet, Text, View } from 'react-native';
import { Card, PIP_LAYOUTS, cardColor } from '../cards';
import { SuitIcon } from './SuitIcon';

export const CARD_ASPECT = 3.5 / 2.5;

type Props = { card: Card; width: number; simple?: boolean };

/** A playing card drawn entirely in code. `simple` drops the pips for tiny thumbnails. */
export function PlayingCard({ card, width, simple }: Props) {
  const height = width * CARD_ASPECT;
  const color = cardColor(card.suit);
  const radius = width * 0.07;

  const corner = (
    <View style={{ alignItems: 'center', width: width * 0.14 }}>
      <Text
        style={{
          color,
          fontSize: width * (card.rank === '10' ? 0.13 : 0.15),
          fontWeight: '600',
          letterSpacing: card.rank === '10' ? -width * 0.012 : 0,
          lineHeight: width * 0.17,
        }}
      >
        {card.rank}
      </Text>
      <SuitIcon suit={card.suit} size={width * 0.1} />
    </View>
  );

  return (
    <View style={[styles.card, { width, height, borderRadius: radius }]}>
      <View style={{ position: 'absolute', left: width * 0.03, top: width * 0.04 }}>{corner}</View>
      <View
        style={{
          position: 'absolute',
          right: width * 0.03,
          bottom: width * 0.04,
          transform: [{ rotate: '180deg' }],
        }}
      >
        {corner}
      </View>
      {!simple && <CardCenter card={card} width={width} height={height} />}
    </View>
  );
}

function CardCenter({ card, width, height }: { card: Card; width: number; height: number }) {
  const color = cardColor(card.suit);

  if (card.rank === 'A') {
    return (
      <View style={styles.center}>
        <SuitIcon suit={card.suit} size={width * (card.suit === 'spades' ? 0.5 : 0.36)} />
      </View>
    );
  }

  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') {
    const frameW = width * 0.6;
    const frameH = height * 0.72;
    return (
      <View style={styles.center}>
        <View
          style={{
            width: frameW,
            height: frameH,
            borderWidth: Math.max(1, width * 0.012),
            borderColor: color,
            borderRadius: width * 0.02,
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: frameH * 0.08,
            backgroundColor: card.suit === 'hearts' || card.suit === 'diamonds' ? '#FFF6F4' : '#F6F7FB',
          }}
        >
          <SuitIcon suit={card.suit} size={width * 0.14} />
          <Text style={{ color, fontSize: width * 0.36, fontWeight: '700', fontFamily: 'Georgia' }}>
            {card.rank}
          </Text>
          <View style={{ transform: [{ rotate: '180deg' }] }}>
            <SuitIcon suit={card.suit} size={width * 0.14} />
          </View>
        </View>
      </View>
    );
  }

  // Pip columns sit well inside the corner indices, like a standard deck.
  const pip = width * 0.15;
  const areaLeft = width * 0.31;
  const areaW = width * 0.38;
  const areaTop = height * 0.17;
  const areaH = height * 0.66;

  return (
    <>
      {PIP_LAYOUTS[card.rank].map(([x, y], i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: areaLeft + x * areaW - pip / 2,
            top: areaTop + y * areaH - pip / 2,
            transform: y > 0.5 ? [{ rotate: '180deg' }] : undefined,
          }}
        >
          <SuitIcon suit={card.suit} size={pip} />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FDFDFB',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
