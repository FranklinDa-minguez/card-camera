import Svg, { Circle, Path } from 'react-native-svg';
import { Suit, cardColor } from '../cards';

const PATHS: Record<Exclude<Suit, 'clubs'>, string> = {
  hearts:
    'M50 92 C22 68 2 50 2 29 C2 13 14 2 28 2 C38 2 46 8 50 17 C54 8 62 2 72 2 C86 2 98 13 98 29 C98 50 78 68 50 92 Z',
  diamonds: 'M50 0 L90 50 L50 100 L10 50 Z',
  spades:
    'M50 2 C38 22 2 40 2 62 C2 76 13 84 26 84 C35 84 42 80 46 73 C45 85 39 94 30 99 L70 99 C61 94 55 85 54 73 C58 80 65 84 74 84 C87 84 98 76 98 62 C98 40 62 22 50 2 Z',
};

export function SuitIcon({ suit, size, color }: { suit: Suit; size: number; color?: string }) {
  const fill = color ?? cardColor(suit);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {suit === 'clubs' ? (
        <>
          <Circle cx={50} cy={27} r={23} fill={fill} />
          <Circle cx={25} cy={60} r={23} fill={fill} />
          <Circle cx={75} cy={60} r={23} fill={fill} />
          <Circle cx={50} cy={55} r={12} fill={fill} />
          <Path d="M46 58 C46 80 40 92 30 99 L70 99 C60 92 54 80 54 58 Z" fill={fill} />
        </>
      ) : (
        <Path d={PATHS[suit]} fill={fill} />
      )}
    </Svg>
  );
}
