import { ClassKey, Disease } from './types';

export const CLASS_KEYS: readonly ClassKey[] = ['healthy', 'sigatoka', 'panama-disease', 'cordana-leaf-spot'] as const;
export const CLASS_DISPLAY_NAMES: Record<ClassKey, string> = { healthy: 'Healthy', sigatoka: 'Sigatoka', 'panama-disease': 'Panama Disease', 'cordana-leaf-spot': 'Cordana Leaf Spot' };
export const diseases: readonly Disease[] = CLASS_KEYS.map((id) => ({ id, name: CLASS_DISPLAY_NAMES[id], summary: id === 'healthy' ? 'The model found the strongest relative support for the validated Healthy class.' : `The model found visible banana leaf-image patterns associated with ${CLASS_DISPLAY_NAMES[id]}.` }));
export function getDisease(id: ClassKey): Disease { const disease = diseases.find((item) => item.id === id); if (!disease) throw new Error(`Unexpected model class: ${id}`); return disease; }
