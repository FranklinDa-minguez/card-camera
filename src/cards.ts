export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export type Card = { rank: Rank; suit: Suit };

export const SUITS: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const isRed = (suit: Suit) => suit === 'hearts' || suit === 'diamonds';

export const cardColor = (suit: Suit) => (isRed(suit) ? '#C8102E' : '#111111');

export const cardKey = (card: Card) => `${card.rank}-${card.suit}`;

// Pip positions on a 0..1 grid (x across the pip area, y down it).
// Pips in the lower half are drawn upside down, like a real deck.
const L = 0;
const C = 0.5;
const R = 1;
export const PIP_LAYOUTS: Record<string, [number, number][]> = {
  '2': [[C, 0], [C, 1]],
  '3': [[C, 0], [C, 0.5], [C, 1]],
  '4': [[L, 0], [R, 0], [L, 1], [R, 1]],
  '5': [[L, 0], [R, 0], [C, 0.5], [L, 1], [R, 1]],
  '6': [[L, 0], [R, 0], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  '7': [[L, 0], [R, 0], [C, 0.25], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  '8': [[L, 0], [R, 0], [C, 0.25], [L, 0.5], [R, 0.5], [C, 0.75], [L, 1], [R, 1]],
  '9': [[L, 0], [R, 0], [L, 1 / 3], [R, 1 / 3], [C, 0.5], [L, 2 / 3], [R, 2 / 3], [L, 1], [R, 1]],
  '10': [
    [L, 0], [R, 0], [C, 1 / 6], [L, 1 / 3], [R, 1 / 3],
    [L, 2 / 3], [R, 2 / 3], [C, 5 / 6], [L, 1], [R, 1],
  ],
};
