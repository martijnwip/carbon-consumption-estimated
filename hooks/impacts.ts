// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at
// https://mozilla.org/MPL/2.0/.
//
// A TypeScript port of EcoLogits' LLM inference model (ecologits/impacts/llm.py)
// and of its Anthropic data (models.json, electricity_mixes.json and the provider
// config in tracers/utils.py), from https://github.com/genai-impact/ecologits at
// commit d0b76e3 (2026-10-14). Copyright the EcoLogits authors.

// A range: EcoLogits estimates closed models with a lower and an upper bound.
export type Range = { min: number; max: number }

// Energy in kWh, CO2-equivalent in kg, water in litres.
export type Impacts = { energy: Range; gwp: Range; water: Range }

type Model = {
  // Parameters in billions; for a dense model `total` equals `active`.
  active: Range
  total: Range
  // Tokens per second and time to first token, in seconds.
  tps: number
  ttft: number
}

const moe = (total: number, min: number, max: number, tps: number, ttft: number): Model => ({
  active: { min, max },
  total: { min: total, max: total },
  tps,
  ttft,
})

const dense = (min: number, max: number, tps: number, ttft: number): Model => ({
  active: { min, max },
  total: { min, max },
  tps,
  ttft,
})

// Longest prefix first, so `claude-opus-5-5` does not match `claude-opus-5`.
const MODELS: ReadonlyArray<readonly [string, Model]> = [
  ['claude-fable-5-1', moe(1340, 134, 400, 51, 3.89)],
  ['claude-fable-5', moe(1340, 134, 400, 57, 3.58)],
  ['claude-opus-5-5', moe(670, 70, 200, 102.8, 2.68)],
  ['claude-opus-5', moe(670, 67, 200, 89.5, 1.84)],
  ['claude-opus-4-8', moe(670, 67, 200, 110.8, 0.87)],
  ['claude-opus-4-7', moe(670, 67, 200, 42, 1.75)],
  ['claude-opus-4-6', moe(670, 67, 200, 35, 1.95)],
  ['claude-opus-4-5', moe(670, 67, 200, 30.5, 5.03)],
  ['claude-sonnet-5-5', moe(293, 29, 88, 102, 2.21)],
  ['claude-sonnet-5', moe(293, 29, 88, 79.5, 1.76)],
  ['claude-sonnet-4-6', moe(440, 44, 132, 40, 1.15)],
  ['claude-sonnet-4-5', moe(440, 44, 132, 42, 1.15)],
  ['claude-haiku-5-5', dense(10, 35, 147, 1.75)],
  ['claude-haiku-4-5', dense(10, 35, 79, 0.5)],
]

export function modelFor(name: string): Model | undefined {
  const base = name.replace(/^(us\.|eu\.|global\.)?anthropic\./, '')
  return MODELS.find(([prefix]) => base.startsWith(prefix))?.[1]
}

// Electricity mix per zone (ISO 3166-1 alpha-3, WOR for the world average):
// kg CO2e per kWh and litres of water per kWh.
export const ZONES = {
  USA: { gwp: 0.3844, wue: 3.1321 },
  WOR: { gwp: 0.45829, wue: 3.908 },
  IRL: { gwp: 0.25654, wue: 1.4769 },
  GBR: { gwp: 0.21741, wue: 2.329 },
  NLD: { gwp: 0.25356, wue: 3.433 },
  DEU: { gwp: 0.32965, wue: 1.947 },
  FRA: { gwp: 0.04144, wue: 3.6737 },
  SWE: { gwp: 0.03526, wue: 6.0315 },
  CAN: { gwp: 0.19072, wue: 8.1662 },
} as const

export type Zone = keyof typeof ZONES

export const isZone = (value: unknown): value is Zone => typeof value === 'string' && Object.hasOwn(ZONES, value)

// Anthropic's data centres as EcoLogits models them (AWS and Google, USA).
const PUE: Range = { min: 1.09, max: 1.14 }
const WUE: Range = { min: 0.13, max: 0.999 }

const GPU_ENERGY_ALPHA = 1.1665273170451914e-6
const GPU_ENERGY_BETA = -0.011205921025579175
const GPU_ENERGY_GAMMA = 4.052928146734005e-5
const GPU_MEMORY = 80 // GB
const GPU_EMBODIED_GWP = 273 // kg CO2e
const SERVER_GPUS = 8
const SERVER_POWER = 1.2 // kW
const SERVER_EMBODIED_GWP = 5700 // kg CO2e
const HARDWARE_LIFESPAN = 3 * 365 * 24 * 60 * 60 // seconds
const BATCH_SIZE = 64
const QUANTIZATION_BITS = 16

// One bound of one request. `latency` is the measured request time in seconds;
// Claude Code does not record it, so it defaults to no cap, as in EcoLogits.
function bound(active: number, total: number, pue: number, wue: number, m: Model, output: number, zone: Zone, latency: number) {
  const gpuEnergy =
    (output * (GPU_ENERGY_ALPHA * Math.exp(GPU_ENERGY_BETA * BATCH_SIZE) * active + GPU_ENERGY_GAMMA)) / 1000
  const generation = Math.min(latency, output / m.tps + m.ttft)
  const gpus = 2 ** Math.ceil(Math.log2(Math.ceil((1.2 * total * QUANTIZATION_BITS) / 8 / GPU_MEMORY)))
  const serverEnergy = (generation / 3600) * SERVER_POWER * (gpus / SERVER_GPUS) * (1 / BATCH_SIZE)
  const itEnergy = serverEnergy + gpus * gpuEnergy
  const energy = pue * itEnergy

  const embodied = (gpus / SERVER_GPUS) * SERVER_EMBODIED_GWP + gpus * GPU_EMBODIED_GWP
  const mix = ZONES[zone]

  return {
    energy,
    gwp: energy * mix.gwp + (generation * embodied) / (HARDWARE_LIFESPAN * BATCH_SIZE),
    water: itEnergy * (wue + pue * mix.wue),
  }
}

// The estimated impacts of one API response; undefined for an unknown model.
export function impactsOf(model: string, outputTokens: number, zone: Zone, latency = Infinity): Impacts | undefined {
  const m = modelFor(model)
  if (m === undefined) return undefined

  const low = bound(m.active.min, m.total.min, PUE.min, WUE.min, m, outputTokens, zone, latency)
  const high = bound(m.active.max, m.total.max, PUE.max, WUE.max, m, outputTokens, zone, latency)

  return {
    energy: { min: low.energy, max: high.energy },
    gwp: { min: low.gwp, max: high.gwp },
    water: { min: low.water, max: high.water },
  }
}
