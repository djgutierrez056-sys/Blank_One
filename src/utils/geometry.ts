export function snapValue(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function snapAngle(angle: number, step = 15): number {
  const normalized = ((angle % 360) + 360) % 360;
  return Math.round(normalized / step) * step;
}

export function feetLabel(feet: number): string {
  const whole = Math.floor(feet);
  const inches = Math.round((feet - whole) * 12);
  if (inches === 0) return `${whole}'`;
  if (inches === 12) return `${whole + 1}'`;
  return `${whole}'${inches}"`;
}

export function areaLabel(widthFt: number, heightFt: number): string {
  const area = widthFt * heightFt;
  return `${area.toFixed(0)} sq ft`;
}
