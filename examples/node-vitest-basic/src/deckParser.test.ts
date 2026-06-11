import { describe, expect, it } from "vitest";
import { parseDeck } from "./deckParser";

describe("parseDeck", () => {
  it("parses a deck name and cards", () => {
    expect(parseDeck("Demo\nCard A\nCard B")).toEqual({
      name: "Demo",
      cards: ["Card A", "Card B"]
    });
  });
});
