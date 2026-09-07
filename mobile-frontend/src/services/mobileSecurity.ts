import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

const SCREEN_PROTECTION_KEY = 'dahonmd-private-content';

export function useMobilePrivacyProtection() {
  ScreenCapture.usePreventScreenCapture(SCREEN_PROTECTION_KEY);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    ScreenCapture.enableAppSwitcherProtectionAsync(1).catch(() => undefined);
    return () => {
      ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => undefined);
    };
  }, []);
}
