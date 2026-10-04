import { useState, type ComponentProps } from 'react';
import { Image, type ImageSourcePropType, type ImageStyle, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { ImageViewer } from './ImageViewer';
import { ScanImage } from './ScanImage';

/**
 * A scan photo that opens full screen when tapped. Inside a tappable card the
 * photo takes the tap and the rest of the card keeps its own action.
 */
export function ViewableScanImage({ uri, title, containerStyle, ...imageProps }: ComponentProps<typeof ScanImage> & { title?: string; containerStyle?: StyleProp<ViewStyle> }) {
  const [open, setOpen] = useState(false);
  if (!uri) return <ScanImage uri={uri} {...imageProps} />;
  return <>
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={`${title ?? 'Scan photo'}. Tap to view full screen`} onPress={() => setOpen(true)} style={({ pressed }) => [containerStyle, pressed && { opacity: 0.85 }]}>
      <ScanImage uri={uri} {...imageProps} />
    </Pressable>
    {open && <ImageViewer uri={uri} title={title} visible onClose={() => setOpen(false)} />}
  </>;
}

/** A bundled image (guide example, product photo) that opens full screen when tapped. */
export function ViewableImage({ source, style, title, resizeMode = 'cover', containerStyle }: { source: ImageSourcePropType; style: StyleProp<ImageStyle>; title: string; resizeMode?: 'cover' | 'contain'; containerStyle?: StyleProp<ViewStyle> }) {
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={`${title}. Tap to view full screen`} onPress={() => setOpen(true)} style={({ pressed }) => [containerStyle, pressed && { opacity: 0.85 }]}>
      <Image source={source} style={style} resizeMode={resizeMode} accessibilityIgnoresInvertColors />
    </Pressable>
    {open && <ImageViewer source={source} title={title} visible onClose={() => setOpen(false)} />}
  </>;
}
