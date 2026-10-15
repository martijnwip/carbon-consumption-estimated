// Kilowatt-hours and kilograms of CO2e, as a lower and an upper bound;
// `pricedEnergy` with input and cache tokens counted by their price ratio.
export type SessionImpacts = {
  energy: { min: number; max: number }
  pricedEnergy: { min: number; max: number }
  gwp: { min: number; max: number }
}

declare module 'claude-code' {
  interface PluginState {
    'carbon-consumption-estimated': { session: SessionImpacts | null }
  }
}
