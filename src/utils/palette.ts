// Single source of truth for node color palette and presets.
// Values are CSS custom property references defined in styles.css —
// change a color there and it propagates everywhere automatically.

export const COLOR_PALETTE = [
  "var(--color-white)",
  "var(--color-gray)",
  "var(--color-black)",
  "var(--color-rose)",
  "var(--color-red)",
  "var(--color-orange)",
  "var(--color-yellow)",
  "var(--color-green)",
  "var(--color-blue)",
  "var(--color-purple)",
]

export const PRESETS: { label: string; color: string; backgroundColor: string }[] = [
  { label: "Green Light",  color: "var(--preset-green-light-fg)",  backgroundColor: "var(--preset-green-light-bg)" },
  { label: "Yellow Light", color: "var(--preset-yellow-light-fg)", backgroundColor: "var(--preset-yellow-light-bg)" },
  { label: "Red Light",    color: "var(--preset-red-light-fg)",    backgroundColor: "var(--preset-red-light-bg)" },
  { label: "Success",      color: "var(--color-white)",            backgroundColor: "var(--color-green)" },
  { label: "Warning",      color: "var(--preset-dark)",            backgroundColor: "var(--color-yellow)" },
  { label: "Danger!",      color: "var(--color-white)",            backgroundColor: "var(--color-rose)" },
  { label: "Soothing",     color: "var(--preset-soothing-fg)",     backgroundColor: "var(--preset-soothing-bg)" },
  { label: "Royals",       color: "var(--color-white)",            backgroundColor: "var(--color-purple)" },
  { label: "Solar",        color: "var(--preset-dark)",            backgroundColor: "var(--color-orange)" },
  { label: "Invert",       color: "var(--color-white)",            backgroundColor: "var(--color-black)" },
  { label: "Console",      color: "var(--color-green)",            backgroundColor: "var(--preset-dark)" },
  { label: "Rusty",        color: "var(--color-orange)",           backgroundColor: "var(--preset-rusty-bg)" },
]
