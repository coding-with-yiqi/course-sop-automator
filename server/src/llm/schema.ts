import { z } from 'zod';

/**
 * Schema that the LLM must produce. Validated server-side; mismatches trigger
 * a retry at lower temperature, then bubble up as a stage error.
 */
// 放宽 language 约束：Kimi 可能返回不在白名单中的值（如 javascript / plaintext / powershell）
export const StepLanguageSchema = z
  .enum([
    'jsx',
    'tsx',
    'ts',
    'js',
    'python',
    'bash',
    'shell',
    'sh',
    'json',
    'yaml',
    'sql',
    'html',
    'css',
    'go',
    'rust',
    'java',
    'text',
    'other',
  ])
  .catch('other');

export const StepCodeBlockSchema = z.object({
  language: StepLanguageSchema,
  filename: z.string().max(120).nullable().optional(),
  content: z.string().min(1),
});

export const LlmStepSchema = z.object({
  title: z.string().min(1).max(80),
  shortDescription: z.string().min(1).max(160),
  instructionRichText: z.string().min(1),
  timestampSec: z.number().nonnegative(),
  codeBlock: StepCodeBlockSchema.nullable().optional(),
  accentColor: z.enum(['matcha', 'aqua', 'lavender', 'blush']).optional(),
});

export const LlmResponseSchema = z.object({
  steps: z.array(LlmStepSchema).min(1).max(40),
});

export type LlmStep = z.infer<typeof LlmStepSchema>;
export type LlmResponse = z.infer<typeof LlmResponseSchema>;
