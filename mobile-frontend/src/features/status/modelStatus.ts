import { useEffect, useState } from 'react';
import { getModelFingerprints, isNativeAvailable, prepareModel, type ModelFingerprints } from '../../../modules/dahonmd-tflite';
import { hasConnectedConfiguration } from '../../services/api';

export type ModelStatus = 'loading' | 'real' | 'prototype' | 'unavailable';

export type ModelStatusState = {
  status: ModelStatus;
  fingerprints: ModelFingerprints | null;
};

export function useModelStatus(): ModelStatusState {
  const [state, setState] = useState<ModelStatusState>({ status: 'loading', fingerprints: null });

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!isNativeAvailable()) {
        if (active) setState({ status: 'unavailable', fingerprints: null });
        return;
      }
      try {
        await prepareModel();
        const fingerprints = await getModelFingerprints();
        if (!active) return;
        setState({
          status: hasConnectedConfiguration() ? 'real' : 'prototype',
          fingerprints,
        });
      } catch {
        if (active) setState({ status: 'unavailable', fingerprints: null });
      }
    };
    check();
    return () => { active = false; };
  }, []);

  return state;
}