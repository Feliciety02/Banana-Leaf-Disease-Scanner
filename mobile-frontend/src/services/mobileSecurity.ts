import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

export function useMobilePrivacyProtection() {
  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    ScreenCapture.enableAppSwitcherProtectionAsync(1).catch(() => undefined);
    return () => {
      ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => undefined);
    };
  }, []);
}
