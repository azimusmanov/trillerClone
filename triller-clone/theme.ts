export const c = {
  bg:         '#080612',
  surface:    '#100d1c',
  surface2:   '#181228',
  border:     '#251b3e',
  accent:     '#8b5cf6',
  accentLo:   '#5b21b6',
  accentGlow: '#a78bfa',
  record:     '#f43f5e',
  recordGlow: '#fb7185',
  text:       '#f0ebff',
  textMuted:  '#7c6b9e',
  textDim:    '#3d3057',
};

export const glow = (color: string, radius = 18) => ({
  shadowColor: color,
  shadowRadius: radius,
  shadowOpacity: 0.7,
  shadowOffset: { width: 0, height: 0 },
});
