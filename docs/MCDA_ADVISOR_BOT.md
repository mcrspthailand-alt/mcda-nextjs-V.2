# MCDA Advisor Bot

## Purpose

MCDA Advisor is a conversational decision-support layer for the MCDA web application. The bot converts a user's question into a hierarchical, measurable decision structure, calculates objective criterion weights with Entropy Weight Method (EWM), runs five MCDA methods independently, and returns a direct recommendation.

The five methods are treated as five advisors:

1. TOPSIS
2. VIKOR
3. WASPAS
4. MOORA
5. PROMETHEE

The language model does **not** calculate the Entropy weights or the MCDA rankings. It only structures the decision problem and gathers or estimates criterion data. All weights and rankings are calculated deterministically on the server in `lib/advisor/mcda.ts`.

## Decision pipeline

```
User question
    ↓
Hierarchical Data Structure
    ├─ Objective
    ├─ Alternatives
    └─ Factor groups
         └─ Measurable criteria
              ├─ unit
              ├─ benefit / cost direction
              ├─ values by alternative
              └─ evidence basis
                   ├─ user_data
                   ├─ web_data
                   └─ model_estimate
    ↓
Entropy Weight Method
    ↓
Five independent MCDA advisors
    ├─ TOPSIS
    ├─ VIKOR
    ├─ WASPAS
    ├─ MOORA
    └─ PROMETHEE
    ↓
Consensus ranking
    ↓
Direct recommendation
```

## Entropy Weight Method

The implementation follows the attached `Entropy_Weight_Method_Summary.docx`.

For criterion (j), using non-negative values (x_{ij}):

1. Proportion normalization

[
p_{ij} = \frac{x_{ij}}{\sum_i x_{ij}}
]

2. Entropy

[
E_j = -K\sum_i p_{ij}\ln(p_{ij}), \qquad K=\frac{1}{\ln(m)}
]

When (p_{ij}=0), the term (p_{ij}\ln(p_{ij})) is treated as 0.

3. Degree of diversification

[
d_j = 1-E_j
]

4. Weight

[
w_j = \frac{d_j}{\sum_k d_k}
]

If all criteria have zero diversification, the engine falls back to equal weights to avoid division by zero.

## MCDA mappings to the supplied workbooks

### TOPSIS

Reference workbook: `W - 5 MCDA - TOPSIS _ 9 August 2025(1).xlsx`

The bot follows the workbook's min-max orientation, weighted normalized matrix, positive/negative ideal solutions, Euclidean distances, relative closeness, and descending ranking by closeness.

### VIKOR

Reference workbook: `VIKOR.xlsx`

The bot calculates weighted regret terms, (S), (R), and (Q). The strategy parameter is fixed at (v=0.50), matching the workbook's default. Lower (Q) is preferred.

### WASPAS

Reference workbook: `WASPAS.xlsx`

The bot uses Benefit (x/\max(x)) and Cost (\min(x)/x) normalization, then combines WSM and WPM. The mixing parameter is fixed at (lambda=0.50).

### MOORA

Reference workbook: `MOORA.xlsx`

The bot uses vector normalization, applies the Entropy weights, and calculates the final score as the weighted Benefit sum minus the weighted Cost sum. Higher values are preferred.

### PROMETHEE

Reference workbook: `PRROMETHEE.xlsx`

The bot follows the workbook's min-max direction handling, pairwise positive preference differences, weighted preference aggregation, positive flow, negative flow, and net flow.

**Workbook inconsistency:** the supplied workbook computes net flow as positive flow minus negative flow, but its displayed `RANK(...,1)` formula ranks the smallest net flow first. Standard PROMETHEE II interprets a larger net flow as better. The bot therefore preserves the workbook's normalization, preference, and flow calculations but ranks **higher net flow as better**. This correction is explicit so it is not silently substituted for the source workbook.

## Evidence policy

The bot uses three evidence labels:

- `user_data`: numeric information supplied by the user.
- `web_data`: current or externally verifiable information retrieved through web search/fetch.
- `model_estimate`: a transparent proxy estimate used only when verified numeric evidence is unavailable.

Model estimates must be presented as proxy values rather than claimed facts. For consequential decisions, users should replace proxy values with observed data before relying on the ranking.

## Response policy

Default response behavior is concise:

- state the recommended alternative;
- show the five advisor outcomes;
- show the highest-information Entropy factors;
- keep the Data Structure, criterion weights, assumptions, and sources inside expandable details.

Method formulas and calculation explanations are returned only when the user's question explicitly asks for the method, formula, principle, or calculation steps.

## AI runtime

The route `/api/advisor` uses the Vercel AI SDK and Vercel AI Gateway.

Required server environment:

```env
AI_GATEWAY_API_KEY=
MCDA_ADVISOR_MODEL=openai/gpt-5.5
```

The model creates the structured decision representation. When the question depends on current or external facts, the route can use AI Gateway Browserbase search/fetch tools. The deterministic server engine remains responsible for Entropy and MCDA calculations.

## Safety and interpretation

The output is decision support, not an assertion that one option is universally correct. The result depends on:

- the alternatives represented;
- measurable criteria selected;
- criterion data quality;
- benefit/cost direction;
- Entropy dispersion in the dataset;
- method-specific aggregation logic.

For high-impact decisions, replace proxy estimates with validated measurements and review the hierarchy before acting on the result.
