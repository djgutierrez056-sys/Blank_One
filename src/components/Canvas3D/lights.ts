export interface LightSourceConfig {
  color: string;
  intensity: number;
  distance: number;
  /** Height (ft) of the actual bulb above the item's own placed elevation. */
  heightOffsetFt: number;
  /** If set, items of this catalog id always spawn at this elevation (ft)
   * instead of wherever they'd normally land — a ceiling light should hang
   * near the ceiling by default, not sit on the floor. */
  defaultElevationFt?: number;
}

export const LIGHT_SOURCES: Record<string, LightSourceConfig> = {
  'floor-lamp': { color: '#ffd9a0', intensity: 8, distance: 16, heightOffsetFt: 4.3 },
  'table-lamp': { color: '#ffd9a0', intensity: 5, distance: 12, heightOffsetFt: 1.7 },
  'ceiling-light': { color: '#fff3d6', intensity: 12, distance: 22, heightOffsetFt: 0, defaultElevationFt: 7.4 },
};

export function getLightSource(catalogId: string): LightSourceConfig | undefined {
  return LIGHT_SOURCES[catalogId];
}
