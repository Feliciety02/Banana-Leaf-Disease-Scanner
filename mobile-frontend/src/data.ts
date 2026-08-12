import { Disease } from './types';

export const diseases: Disease[] = [];

export const unconfiguredDisease: Disease = {
  id: 'development-unconfigured',
  name: 'Unconfigured development result',
  scientific: '',
  status: 'warning',
  summary: 'Disease guidance is unavailable until the final five model labels and scientific sources are verified.',
  symptoms: [],
  management: 'No disease-specific action is provided for this simulated result. Ask a qualified agriculture professional if symptoms are severe, unusual, or spreading.',
  prevention: '',
  imageOnlyLimitations: 'A leaf image cannot provide laboratory confirmation.',
  professionalReferral: 'Ask a qualified agriculture or plant-health professional when symptoms are severe, unusual, spreading rapidly, or uncertain.',
  isVerified: false,
};

export const getDisease = (id: string, catalog: Disease[] = diseases) => catalog.find((disease) => disease.id === id) ?? unconfiguredDisease;
