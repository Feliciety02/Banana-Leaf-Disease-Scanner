import Ionicons from '@expo/vector-icons/Ionicons';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text } from 'react-native';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('DahonMD mobile UI crashed.', { message: error.message, componentStack: info.componentStack });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return <SafeAreaView style={styles.page}>
      <Ionicons name="warning-outline" size={48} color="#b6cb56" />
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.copy}>This screen could not be displayed. Your saved scans were not removed.</Text>
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => this.setState({ failed: false })}>
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </SafeAreaView>;
  }
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#153f34' },
  title: { marginTop: 16, color: '#fff', fontSize: 22, fontWeight: '800' },
  copy: { maxWidth: 300, marginTop: 8, color: '#c3d4cd', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  button: { minWidth: 180, minHeight: 48, marginTop: 22, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#b6cb56' },
  buttonText: { color: '#153f34', fontSize: 14, fontWeight: '800' },
});
