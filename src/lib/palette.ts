/** Colours for flows and areas. Mid-tone so they hold up on both the light and the dark sheets. */
export const MARK_COLORS = [
  { value: '#2fbf71', name: 'Green' },
  { value: '#f5a623', name: 'Amber' },
  { value: '#2d9cdb', name: 'Blue' },
  { value: '#e5558d', name: 'Pink' },
  { value: '#8b6cf0', name: 'Violet' },
  { value: '#14b8a6', name: 'Teal' },
  { value: '#ef6c3e', name: 'Orange' },
  { value: '#94a3b8', name: 'Slate' },
] as const

export const nextColor = (used: string[]) =>
  MARK_COLORS.find((c) => !used.includes(c.value))?.value ?? MARK_COLORS[used.length % MARK_COLORS.length].value

/** Dark or light text, whichever reads better on the colour. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return l > 0.3 ? '#0e231d' : '#ffffff'
}
