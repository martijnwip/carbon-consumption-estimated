# carbon-consumption-estimated

How much energy, CO₂ and water does your Claude Code usage take? Anthropic publishes no figures, so this plugin **estimates** them with the open [EcoLogits](https://ecologits.ai) method, entirely on your own machine.

## What you get

**Live in the status line**, after every model request (here: one Opus 5.5 answer of 1,000 tokens on a 190k-token context):

```
≈ 3.1–5.9 Wh · price-weighted 11–22 Wh · 1.3–2.3 g CO₂e (est.)
```

**An overview with `/carbon`**, across all your sessions on this machine:

```
Overview (estimated)
┌─────────────────┬────────┬───────────┬─────────────┬────────────────┬────────────┬───────────┐
│ Period          │ Output │ Responses │      Energy │ Price-weighted │       CO₂e │     Water │
├─────────────────┼────────┼───────────┼─────────────┼────────────────┼────────────┼───────────┤
│ Today           │   202k │       285 │ 0.6–1.2 kWh │    3.5–6.7 kWh │  255–476 g │ 2.0–4.8 L │
│ Last 7 days     │   761k │     1,175 │ 2.4–4.5 kWh │      12–23 kWh │ 1.0–1.8 kg │    8–18 L │
│ This month      │   1.7M │     2,532 │    5–10 kWh │      26–49 kWh │ 2.2–4.1 kg │   18–42 L │
├─────────────────┼────────┼───────────┼─────────────┼────────────────┼────────────┼───────────┤
│ Total           │   2.4M │     3,482 │    7–14 kWh │      35–68 kWh │ 3.0–5.5 kg │   24–56 L │
└─────────────────┴────────┴───────────┴─────────────┴────────────────┴────────────┴───────────┘
```

- `/carbon`: today, the last 7 days, this month and the total, plus a breakdown per model
- `/carbon day`: the last 14 days
- `/carbon month`: per month

## Install

In Claude Code, type:

```
/plugin install carbon-consumption-estimated --marketplace martijnwip/carbon-consumption-estimated
```

## Settings

Set them during install or with `/plugin configure carbon-consumption-estimated@carbon-consumption-estimated`:

| Setting | Default | What it does |
| --- | --- | --- |
| `language` | `auto` | `auto`, `en` or `nl` |
| `zone` | `USA` | The electricity mix for CO₂ and water: `USA` (where EcoLogits places Anthropic's data centres), `WOR` (world average), `IRL`, `GBR`, `NLD`, `DEU`, `FRA`, `SWE` or `CAN` |
| `statusLine` | on | Show the session's estimate in the status line |

## How it estimates

Per API response, the plugin takes the model and the number of **output** tokens and runs EcoLogits' LLM inference model ([methodology](https://ecologits.ai/latest/methodology/llm_inference/)):

- GPU energy per generated token, from the model's active parameters;
- server energy for the generation time, from the model's tokens per second and time to first token;
- the number of GPUs the model needs, from its total parameters;
- times the data centre's PUE (1.09–1.14), then the electricity mix for CO₂ and water, plus the embodied CO₂ of the hardware.

Every figure is a **range**: EcoLogits estimates the size of Claude models from public benchmarks, with a lower and an upper bound. The plugin's results match EcoLogits' own Python library to nine digits (see the tests).

### Two estimates: a lower bound and a price-weighted one

EcoLogits counts **output tokens only**. In Claude Code they are a tiny share of the tokens (often well under 1%): almost everything is context read back from the cache, often more than 100k tokens per request. That context costs energy too, so the plugin shows a second figure:

- **Energy** (and CO₂e, water): EcoLogits as is. A lower bound.
- **Price-weighted**: the same, with input and cache tokens added as output tokens by their **price ratio** within the model. On Opus 5.5 an input token costs 1/5 of an output token and a cache read 1/100, so 100k cache reads weigh as 1,000 output tokens. Cache writes count at the input price: their premium pays for keeping the cache in memory, not for computing it.

Why price: a provider prices token types roughly by the GPU time they take, and GPU time is roughly power. Only the ratios within one model are used, never the absolute price, which follows the market (Opus 4.5 cost a third of Opus 4).

Why it is only an indication: processing input (prefill) is far more efficient per token than generating output, so the price ratio likely overstates input. But each output token also reads the whole cached context, which EcoLogits, measured on short contexts, leaves out. The real figure most likely lies between the two.

## Good to know

- **This is an estimate, not a measurement.** Anthropic does not publish model sizes or energy figures.
- **The lower bound counts only output tokens.** The price-weighted figure adds input and cache, by price, not by measurement.
- Claude Code does not record how long each request took, so the generation time comes from EcoLogits' tokens-per-second figure per model. Fast mode is not taken into account.
- Only Claude Code usage on this machine counts, not claude.ai chats.
- Models EcoLogits does not know are listed separately and not counted.
- The status line counts from the moment the session (or the plugin) started; `/carbon` reads all transcripts.
- The plugin sends nothing anywhere: everything is calculated locally. See [PRIVACY.md](PRIVACY.md).

## License

MIT, except `hooks/impacts.ts`: a port of EcoLogits' model and data, under the [Mozilla Public License 2.0](https://mozilla.org/MPL/2.0/) like EcoLogits itself.

## About

Made by Martijn. More about my work: **[martijnwip.nl](https://martijnwip.nl)**. Companion to [token-cost](https://github.com/martijnwip/token-cost), which shows the same usage in API dollars.
