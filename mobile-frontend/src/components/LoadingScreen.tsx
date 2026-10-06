import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet } from 'react-native';

/** Matches the native Android splash colour so the hand-off is seamless. */
export const LOADING_BACKGROUND = '#f4f7f2';
const MINIMUM_VISIBLE_MS = 700;
const FADE_MS = 320;
// Never block the app if start-up work stalls; the screens show their own progress.
const MAXIMUM_VISIBLE_MS = 8000;

/**
 * Full-screen start-up screen: the DahonMD logo on a soft white background. It stays until
 * `ready` is true (and at least a short moment, so it never flickers), then
 * fades out over the already-rendered app and unmounts itself.
 */
export function LoadingScreen({ ready }: { ready: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [visible, setVisible] = useState(true);
  const done = (ready || timedOut) && minimumElapsed;

  useEffect(() => {
    const minimum = setTimeout(() => setMinimumElapsed(true), MINIMUM_VISIBLE_MS);
    const maximum = setTimeout(() => setTimedOut(true), MAXIMUM_VISIBLE_MS);
    return () => { clearTimeout(minimum); clearTimeout(maximum); };
  }, []);

  useEffect(() => {
    if (!done) return;
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true })
      .start(({ finished }) => { if (finished) setVisible(false); });
  }, [done, opacity]);

  if (!visible) return null;
  return (
    <Animated.View style={[styles.screen, { opacity }]} pointerEvents={done ? 'none' : 'auto'} accessibilityLabel="DahonMD is loading">
      <Image source={require('../../assets/dahonmd-logo-green.webp')} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: LOADING_BACKGROUND },
  logo: { width: 104, height: 104 },
});
