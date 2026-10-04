import { Linking, StyleSheet, Text } from 'react-native';

import { palette } from '../features/connected/ui';

export type Coordinates = { latitude: number; longitude: number };

export function mapUrl({ latitude, longitude }: Coordinates) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=14/${latitude}/${longitude}`;
}

/** "Scanned near …" line that opens the rounded scan location in a map. */
export function MapLink({ location }: { location: Coordinates }) {
  return <Text accessibilityRole="link" style={styles.link} onPress={() => { void Linking.openURL(mapUrl(location)); }}>
    Scanned near {location.latitude.toFixed(3)}, {location.longitude.toFixed(3)} · view on map
  </Text>;
}

const styles = StyleSheet.create({
  link: { color: palette.green, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
});
