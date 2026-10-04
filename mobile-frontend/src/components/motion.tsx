import { useEffect, useRef, type PropsWithChildren } from 'react';
import { Animated, LayoutAnimation } from 'react-native';

/**
 * Animates the next layout change (a card opening, a filter switching, a list
 * updating) with a short fade and ease instead of an instant jump.
 */
export function smoothLayout() {
  LayoutAnimation.configureNext({
    duration: 200,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  });
}

/** Fades its content in whenever `trigger` changes, e.g. when switching tabs. */
export function FadeIn({ trigger, children }: PropsWithChildren<{ trigger: string }>) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [trigger, opacity]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}
