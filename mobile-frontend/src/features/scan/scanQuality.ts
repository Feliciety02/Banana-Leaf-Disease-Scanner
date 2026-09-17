import { analyzeImageQuality, type ImageQualityResult } from '../../../modules/dahonmd-tflite';

export type ImageQualityIssue = 'too-dark' | 'too-bright' | 'low-contrast' | 'possibly-blurry' | 'low-resolution';

export type PhotoQuality = { issues: ImageQualityIssue[]; metrics: ImageQualityResult };

const ISSUE_LABELS: Record<ImageQualityIssue, string> = {
  'too-dark': 'too dark',
  'too-bright': 'too bright',
  'low-contrast': 'low contrast',
  'possibly-blurry': 'possibly blurry',
  'low-resolution': 'low resolution',
};

export async function evaluateImageQuality(uri: string): Promise<PhotoQuality> {
  const metrics = await analyzeImageQuality(uri);
  const issues: ImageQualityIssue[] = [];
  if (metrics.meanLuma < 45) issues.push('too-dark');
  else if (metrics.meanLuma > 215) issues.push('too-bright');
  if (metrics.lumaStdDev < 22) issues.push('low-contrast');
  if (metrics.edgeScore < 1.2) issues.push('possibly-blurry');
  if (metrics.width < 480 || metrics.height < 480) issues.push('low-resolution');
  return { issues, metrics };
}

export function describeIssues(issues: ImageQualityIssue[]): string {
  return issues.map((issue) => ISSUE_LABELS[issue]).join(', ');
}