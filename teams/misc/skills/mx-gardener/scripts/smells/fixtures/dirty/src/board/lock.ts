export function holder(card: { holder: string | null }) {
  return card.holder ?? null;
}
