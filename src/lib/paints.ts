export type Paint = { name: string; brand: string; hex: string }

/**
 * Ten well-known UK paint colours, for a starting point that isn't a colour
 * wheel. Hex values are approximations published by colour databases, not
 * brand-supplied data: a screen cannot show a paint accurately anyway, so they
 * are a likeness to work from, not a substitute for a tester pot.
 */
export const PAINTS: Paint[] = [
  { name: 'Ammonite', brand: 'Farrow & Ball', hex: '#ddd8cf' },
  { name: 'Cornforth White', brand: 'Farrow & Ball', hex: '#d1cbc3' },
  { name: "Elephant's Breath", brand: 'Farrow & Ball', hex: '#ccbfb3' },
  { name: 'Pointing', brand: 'Farrow & Ball', hex: '#f3efe3' },
  { name: 'Hague Blue', brand: 'Farrow & Ball', hex: '#3d4e57' },
  { name: 'Railings', brand: 'Farrow & Ball', hex: '#45494c' },
  { name: 'Timeless', brand: 'Dulux', hex: '#f0ede4' },
  { name: 'Denim Drift', brand: 'Dulux', hex: '#7c8d96' },
  { name: 'French Grey', brand: 'Little Greene', hex: '#cbc7c1' },
  { name: 'Jewel Beetle', brand: 'Little Greene', hex: '#566038' },
]
