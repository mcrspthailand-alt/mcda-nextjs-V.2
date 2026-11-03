export type AdvisorLanguage = 'th' | 'en';
export type CriterionDirection = 'benefit' | 'cost';
export type CriterionBasis = 'user_data' | 'web_data' | 'model_estimate';

export type AdvisorAlternative = {
  id: string;
  name: string;
  description: string;
};

export type AdvisorCriterion = {
  id: string;
  name: string;
  group: string;
  unit: string;
  direction: CriterionDirection;
  values: number[];
  basis: CriterionBasis;
  confidence: number;
  measurementNote: string;
};

export type AdvisorStructure = {
  objective: string;
  contextSummary: string;
  alternatives: AdvisorAlternative[];
  groups: Array<{ name: string; description: string; criteriaIds: string[] }>;
  criteria: AdvisorCriterion[];
  caveats: string[];
};

export type MethodName = 'TOPSIS' | 'VIKOR' | 'WASPAS' | 'MOORA' | 'PROMETHEE';

export type MethodResult = {
  method: MethodName;
  higherIsBetter: boolean;
  rawScores: number[];
  displayScores: number[];
  ranks: number[];
  winnerIndex: number;
};

export type AdvisorAnalysis = {
  weights: number[];
  entropy: number[];
  diversification: number[];
  advisors: Array<{
    method: MethodName;
    winnerIndex: number;
    winnerName: string;
    winnerScore: number;
    ranks: Array<{
      alternativeIndex: number;
      alternativeName: string;
      rank: number;
      score: number;
    }>;
  }>;
  consensus: Array<{
    alternativeIndex: number;
    alternativeName: string;
    rank: number;
    averageRank: number;
    topVotes: number;
    averageScore: number;
  }>;
  winnerIndex: number;
  winnerName: string;
  topFactors: Array<{
    criterionId: string;
    criterionName: string;
    group: string;
    weight: number;
    unit: string;
    direction: CriterionDirection;
    basis: CriterionBasis;
  }>;
  agreement: number;
  hasEstimatedData: boolean;
};

const EPSILON = 1e-12;

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function column(matrix: number[][], index: number) {
  return matrix.map((row) => finite(row[index] ?? 0));
}

function minMax(values: number[]) {
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function rankValues(values: number[], higherIsBetter: boolean) {
  const order = values
    .map((value, index) => ({ value: finite(value), index }))
    .sort((a, b) => {
      const delta = higherIsBetter ? b.value - a.value : a.value - b.value;
      return Math.abs(delta) > EPSILON ? delta : a.index - b.index;
    });

  const ranks = Array(values.length).fill(0);
  let previousValue: number | null = null;
  let previousRank = 0;

  order.forEach((item, position) => {
    const sameAsPrevious = previousValue !== null && Math.abs(item.value - previousValue) <= 1e-10;
    const rank = sameAsPrevious ? previousRank : position + 1;
    ranks[item.index] = rank;
    previousValue = item.value;
    previousRank = rank;
  });

  return ranks;
}

function normalizeForDisplay(values: number[], higherIsBetter: boolean) {
  const { min, max } = minMax(values);
  if (Math.abs(max - min) <= EPSILON) return values.map(() => 1);
  return values.map((value) => {
    const normalized = (finite(value) - min) / (max - min);
    return clamp01(higherIsBetter ? normalized : 1 - normalized);
  });
}

function orientedMinMaxMatrix(structure: AdvisorStructure) {
  const matrix = structure.alternatives.map((_, alternativeIndex) =>
    structure.criteria.map((criterion) => finite(criterion.values[alternativeIndex] ?? 0)),
  );

  return matrix.map((row) =>
    row.map((value, criterionIndex) => {
      const criterion = structure.criteria[criterionIndex];
      const values = column(matrix, criterionIndex);
      const { min, max } = minMax(values);
      if (Math.abs(max - min) <= EPSILON) return 1;
      if (criterion.direction === 'cost') return clamp01((max - value) / (max - min));
      return clamp01((value - min) / (max - min));
    }),
  );
}

export function entropyWeights(structure: AdvisorStructure) {
  const alternativeCount = structure.alternatives.length;
  const criterionCount = structure.criteria.length;

  if (alternativeCount < 2 || criterionCount < 1) {
    throw new Error('Entropy weighting requires at least two alternatives and one criterion.');
  }

  const k = 1 / Math.log(alternativeCount);
  const entropy = structure.criteria.map((criterion) => {
    const rawValues = criterion.values.map((value) => Math.max(0, finite(value)));
    const sum = rawValues.reduce((acc, value) => acc + value, 0);

    if (sum <= EPSILON) return 1;

    const entropySum = rawValues.reduce((acc, value) => {
      const p = value / sum;
      return p <= EPSILON ? acc : acc + p * Math.log(p);
    }, 0);

    return clamp01(-k * entropySum);
  });

  const diversification = entropy.map((value) => Math.max(0, 1 - value));
  const diversificationSum = diversification.reduce((acc, value) => acc + value, 0);

  const weights =
    diversificationSum <= EPSILON
      ? diversification.map(() => 1 / criterionCount)
      : diversification.map((value) => value / diversificationSum);

  return { weights, entropy, diversification };
}

function topsis(structure: AdvisorStructure, weights: number[]): MethodResult {
  const normalized = orientedMinMaxMatrix(structure);
  const weighted = normalized.map((row) => row.map((value, j) => value * weights[j]));

  const ideal = structure.criteria.map((_, j) => Math.max(...weighted.map((row) => row[j])));
  const antiIdeal = structure.criteria.map((_, j) => Math.min(...weighted.map((row) => row[j])));

  const positiveDistances = weighted.map((row) =>
    Math.sqrt(row.reduce((sum, value, j) => sum + (value - ideal[j]) ** 2, 0)),
  );
  const negativeDistances = weighted.map((row) =>
    Math.sqrt(row.reduce((sum, value, j) => sum + (value - antiIdeal[j]) ** 2, 0)),
  );

  const rawScores = positiveDistances.map((positive, i) => {
    const negative = negativeDistances[i];
    const denominator = positive + negative;
    return denominator <= EPSILON ? 1 : negative / denominator;
  });

  const ranks = rankValues(rawScores, true);
  return {
    method: 'TOPSIS',
    higherIsBetter: true,
    rawScores,
    displayScores: rawScores.map(clamp01),
    ranks,
    winnerIndex: ranks.indexOf(1),
  };
}

function vikor(structure: AdvisorStructure, weights: number[], v = 0.5): MethodResult {
  const matrix = structure.alternatives.map((_, alternativeIndex) =>
    structure.criteria.map((criterion) => finite(criterion.values[alternativeIndex] ?? 0)),
  );

  const weightedRegret = matrix.map((row) =>
    row.map((value, j) => {
      const criterion = structure.criteria[j];
      const values = column(matrix, j);
      const { min, max } = minMax(values);
      if (Math.abs(max - min) <= EPSILON) return 0;

      const normalizedRegret =
        criterion.direction === 'cost'
          ? (value - min) / (max - min)
          : (max - value) / (max - min);

      return weights[j] * clamp01(normalizedRegret);
    }),
  );

  const s = weightedRegret.map((row) => row.reduce((sum, value) => sum + value, 0));
  const r = weightedRegret.map((row) => Math.max(...row));
  const sBounds = minMax(s);
  const rBounds = minMax(r);

  const q = s.map((sValue, i) => {
    const sPart =
      Math.abs(sBounds.max - sBounds.min) <= EPSILON
        ? 0
        : (sValue - sBounds.min) / (sBounds.max - sBounds.min);
    const rPart =
      Math.abs(rBounds.max - rBounds.min) <= EPSILON
        ? 0
        : (r[i] - rBounds.min) / (rBounds.max - rBounds.min);
    return v * sPart + (1 - v) * rPart;
  });

  const ranks = rankValues(q, false);
  return {
    method: 'VIKOR',
    higherIsBetter: false,
    rawScores: q,
    displayScores: q.map((value) => clamp01(1 - value)),
    ranks,
    winnerIndex: ranks.indexOf(1),
  };
}

function waspas(structure: AdvisorStructure, weights: number[], lambda = 0.5): MethodResult {
  const matrix = structure.alternatives.map((_, alternativeIndex) =>
    structure.criteria.map((criterion) => Math.max(0, finite(criterion.values[alternativeIndex] ?? 0))),
  );

  const normalized = matrix.map((row) =>
    row.map((value, j) => {
      const criterion = structure.criteria[j];
      const values = column(matrix, j).map((candidate) => Math.max(0, candidate));
      const max = Math.max(...values);

      if (criterion.direction === 'benefit') {
        return max <= EPSILON ? 1 : clamp01(value / max);
      }

      const positives = values.filter((candidate) => candidate > EPSILON);
      const minPositive = positives.length ? Math.min(...positives) : 0;
      if (minPositive <= EPSILON) return value <= EPSILON ? 1 : EPSILON / Math.max(value, EPSILON);
      return clamp01(minPositive / Math.max(value, EPSILON));
    }),
  );

  const wsm = normalized.map((row) =>
    row.reduce((sum, value, j) => sum + weights[j] * value, 0),
  );
  const wpm = normalized.map((row) =>
    row.reduce((product, value, j) => product * Math.pow(Math.max(value, EPSILON), weights[j]), 1),
  );
  const q = wsm.map((value, i) => lambda * value + (1 - lambda) * wpm[i]);

  const ranks = rankValues(q, true);
  return {
    method: 'WASPAS',
    higherIsBetter: true,
    rawScores: q,
    displayScores: normalizeForDisplay(q, true),
    ranks,
    winnerIndex: ranks.indexOf(1),
  };
}

function moora(structure: AdvisorStructure, weights: number[]): MethodResult {
  const matrix = structure.alternatives.map((_, alternativeIndex) =>
    structure.criteria.map((criterion) => finite(criterion.values[alternativeIndex] ?? 0)),
  );
  const norms = structure.criteria.map((_, j) =>
    Math.sqrt(column(matrix, j).reduce((sum, value) => sum + value ** 2, 0)),
  );

  const weighted = matrix.map((row) =>
    row.map((value, j) => (norms[j] <= EPSILON ? 0 : (value / norms[j]) * weights[j])),
  );

  const scores = weighted.map((row) =>
    row.reduce(
      (sum, value, j) =>
        sum + (structure.criteria[j].direction === 'cost' ? -value : value),
      0,
    ),
  );

  const ranks = rankValues(scores, true);
  return {
    method: 'MOORA',
    higherIsBetter: true,
    rawScores: scores,
    displayScores: normalizeForDisplay(scores, true),
    ranks,
    winnerIndex: ranks.indexOf(1),
  };
}

function promethee(structure: AdvisorStructure, weights: number[]): MethodResult {
  const oriented = orientedMinMaxMatrix(structure);
  const n = structure.alternatives.length;
  const preference = Array.from({ length: n }, () => Array(n).fill(0));

  for (let a = 0; a < n; a += 1) {
    for (let b = 0; b < n; b += 1) {
      if (a === b) continue;
      preference[a][b] = oriented[a].reduce((sum, value, j) => {
        const positiveDifference = Math.max(value - oriented[b][j], 0);
        return sum + weights[j] * positiveDifference;
      }, 0);
    }
  }

  const divisor = Math.max(1, n - 1);
  const positiveFlow = preference.map((row) => row.reduce((sum, value) => sum + value, 0) / divisor);
  const negativeFlow = Array.from({ length: n }, (_, i) =>
    preference.reduce((sum, row) => sum + row[i], 0) / divisor,
  );
  const netFlow = positiveFlow.map((value, i) => value - negativeFlow[i]);

  const ranks = rankValues(netFlow, true);
  return {
    method: 'PROMETHEE',
    higherIsBetter: true,
    rawScores: netFlow,
    displayScores: normalizeForDisplay(netFlow, true),
    ranks,
    winnerIndex: ranks.indexOf(1),
  };
}

export function validateAdvisorStructure(structure: AdvisorStructure) {
  const alternativeCount = structure.alternatives.length;
  if (alternativeCount < 2) throw new Error('At least two alternatives are required.');
  if (structure.criteria.length < 2) throw new Error('At least two measurable criteria are required.');

  const alternativeIds = new Set(structure.alternatives.map((item) => item.id));
  if (alternativeIds.size !== structure.alternatives.length) {
    throw new Error('Alternative identifiers must be unique.');
  }

  const criterionIds = new Set(structure.criteria.map((item) => item.id));
  if (criterionIds.size !== structure.criteria.length) {
    throw new Error('Criterion identifiers must be unique.');
  }

  for (const criterion of structure.criteria) {
    if (criterion.values.length !== alternativeCount) {
      throw new Error(`Criterion ${criterion.id} does not contain one value per alternative.`);
    }
    if (criterion.values.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error(`Criterion ${criterion.id} must use finite, non-negative values.`);
    }
  }
}

export function analyzeAdvisorStructure(structure: AdvisorStructure): AdvisorAnalysis {
  validateAdvisorStructure(structure);
  const { weights, entropy, diversification } = entropyWeights(structure);

  const methods: MethodResult[] = [
    topsis(structure, weights),
    vikor(structure, weights),
    waspas(structure, weights),
    moora(structure, weights),
    promethee(structure, weights),
  ];

  const advisors = methods.map((method) => ({
    method: method.method,
    winnerIndex: method.winnerIndex,
    winnerName: structure.alternatives[method.winnerIndex].name,
    winnerScore: method.displayScores[method.winnerIndex],
    ranks: structure.alternatives
      .map((alternative, alternativeIndex) => ({
        alternativeIndex,
        alternativeName: alternative.name,
        rank: method.ranks[alternativeIndex],
        score: method.displayScores[alternativeIndex],
      }))
      .sort((a, b) => a.rank - b.rank || b.score - a.score),
  }));

  const consensus = structure.alternatives.map((alternative, alternativeIndex) => {
    const ranks = methods.map((method) => method.ranks[alternativeIndex]);
    const scores = methods.map((method) => method.displayScores[alternativeIndex]);
    return {
      alternativeIndex,
      alternativeName: alternative.name,
      rank: 0,
      averageRank: ranks.reduce((sum, value) => sum + value, 0) / methods.length,
      topVotes: ranks.filter((rank) => rank === 1).length,
      averageScore: scores.reduce((sum, value) => sum + value, 0) / methods.length,
    };
  });

  consensus.sort(
    (a, b) =>
      a.averageRank - b.averageRank ||
      b.topVotes - a.topVotes ||
      b.averageScore - a.averageScore ||
      a.alternativeIndex - b.alternativeIndex,
  );
  consensus.forEach((item, index) => {
    item.rank = index + 1;
  });

  const winner = consensus[0];
  const topFactors = structure.criteria
    .map((criterion, index) => ({
      criterionId: criterion.id,
      criterionName: criterion.name,
      group: criterion.group,
      weight: weights[index],
      unit: criterion.unit,
      direction: criterion.direction,
      basis: criterion.basis,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, Math.min(5, structure.criteria.length));

  return {
    weights,
    entropy,
    diversification,
    advisors,
    consensus,
    winnerIndex: winner.alternativeIndex,
    winnerName: winner.alternativeName,
    topFactors,
    agreement: winner.topVotes / methods.length,
    hasEstimatedData: structure.criteria.some((criterion) => criterion.basis === 'model_estimate'),
  };
}

export function buildDirectAnswer(
  structure: AdvisorStructure,
  analysis: AdvisorAnalysis,
  language: AdvisorLanguage,
) {
  const topFactorNames = analysis.topFactors.slice(0, 3).map((factor) => factor.criterionName);
  const votes = analysis.advisors.filter((advisor) => advisor.winnerIndex === analysis.winnerIndex).length;

  if (language === 'en') {
    return {
      headline: `Recommendation: ${analysis.winnerName}`,
      summary: `${analysis.winnerName} has the strongest overall consensus across the five MCDA advisors${votes ? `, receiving ${votes}/5 first-place votes` : ''}. The highest-information factors are ${topFactorNames.join(', ')}.`,
      estimateNote: analysis.hasEstimatedData
        ? 'Some numeric values are model-derived proxy estimates. Replace them with observed data before using the result for a high-stakes decision.'
        : null,
    };
  }

  return {
    headline: `คำแนะนำ: ${analysis.winnerName}`,
    summary: `${analysis.winnerName} มีฉันทามติโดยรวมดีที่สุดจากที่ปรึกษา MCDA ทั้ง 5 วิธี${votes ? ` และได้อันดับ 1 จำนวน ${votes}/5 วิธี` : ''} โดยปัจจัยที่ให้ข้อมูลสูงสุดคือ ${topFactorNames.join(' · ')}`,
    estimateNote: analysis.hasEstimatedData
      ? 'ตัวเลขบางส่วนเป็นค่า proxy ที่ AI ประเมินเพื่อให้สามารถวิเคราะห์ได้ ควรแทนด้วยข้อมูลจริงก่อนใช้กับการตัดสินใจที่มีผลกระทบสูง'
      : null,
  };
}

export const METHOD_EXPLANATIONS: Record<MethodName, { th: string; en: string }> = {
  TOPSIS: {
    th: 'ประเมินความใกล้จุดอุดมคติและความห่างจากจุดที่แย่ที่สุด โดยใช้ min–max normalization ตามโครงสร้างในไฟล์ TOPSIS ที่แนบมา',
    en: 'Evaluates closeness to the ideal and distance from the anti-ideal using the min–max normalization pattern in the supplied TOPSIS workbook.',
  },
  VIKOR: {
    th: 'ประเมิน compromise solution ด้วย S, R และ Q โดยใช้ v = 0.50 ตามโครงสร้างในไฟล์ VIKOR',
    en: 'Evaluates a compromise solution through S, R, and Q with v = 0.50, following the supplied VIKOR workbook.',
  },
  WASPAS: {
    th: 'ผสม Weighted Sum Model และ Weighted Product Model ด้วย λ = 0.50 ตามโครงสร้างในไฟล์ WASPAS',
    en: 'Combines the Weighted Sum and Weighted Product models with λ = 0.50, following the supplied WASPAS workbook.',
  },
  MOORA: {
    th: 'ใช้ vector normalization แล้วรวมเกณฑ์ Benefit ลบด้วยเกณฑ์ Cost ตามโครงสร้างในไฟล์ MOORA',
    en: 'Uses vector normalization and subtracts Cost contributions from Benefit contributions, following the supplied MOORA workbook.',
  },
  PROMETHEE: {
    th: 'ใช้ min–max normalization, pairwise positive preference, positive/negative flow และ net flow ตามโครงสร้างในไฟล์ PROMETHEE',
    en: 'Uses min–max normalization, pairwise positive preference, positive/negative flows, and net flow, following the supplied PROMETHEE workbook.',
  },
};
