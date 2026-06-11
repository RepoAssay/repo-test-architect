export interface ParsedDeck {
  name: string;
  cards: string[];
}

export function parseDeck(input: string): ParsedDeck {
  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("Deck input is empty.");
  }

  return {
    name: lines[0],
    cards: lines.slice(1)
  };
}
