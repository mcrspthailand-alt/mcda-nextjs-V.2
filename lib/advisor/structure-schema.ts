import { z } from 'zod';

export const advisorDecisionStructureSchema = z.object({
  objective: z.string().min(3).max(500),
  contextSummary: z.string().min(3).max(1200),
  alternatives: z.array(z.object({
    id: z.string().min(1).max(20),
    name: z.string().min(1).max(160),
    description: z.string().max(500),
  })).min(2).max(8),
  groups: z.array(z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(400),
    criteriaIds: z.array(z.string().min(1).max(30)).min(1).max(12),
  })).min(1).max(6),
  criteria: z.array(z.object({
    id: z.string().min(1).max(30),
    name: z.string().min(1).max(160),
    group: z.string().min(1).max(120),
    unit: z.string().min(1).max(80),
    direction: z.enum(['benefit', 'cost']),
    values: z.array(z.number().finite().nonnegative()).min(2).max(8),
    basis: z.enum(['user_data', 'web_data', 'model_estimate']),
    confidence: z.number().min(0).max(1),
    measurementNote: z.string().min(1).max(600),
    sourceUrls: z.array(z.string().url()).max(5).default([]),
  })).min(3).max(12),
  caveats: z.array(z.string().max(500)).max(8),
});

export type AdvisorDecisionStructureOutput = z.infer<typeof advisorDecisionStructureSchema>;
