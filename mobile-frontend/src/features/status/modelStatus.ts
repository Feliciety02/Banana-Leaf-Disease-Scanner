import { useEffect, useState } from 'react';
import { getModelFingerprints, isNativeAvailable, prepareBaselineModel, prepareGateModel, prepareModel, type ModelFingerprints } from '../../../modules/dahonmd-tflite';
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
        // Load the baseline too so the first scan does not wait for it; a
        // failure here is non-fatal because the scan loads it on demand.
        prepareBaselineModel().catch(() => undefined);
        prepareGateModel().catch(() => undefined);
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