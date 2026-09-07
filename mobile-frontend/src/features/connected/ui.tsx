import { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

export const palette = {
  background: '#f4f7f2', card: '#ffffff', green: '#174d3a', greenSoft: '#e5eee8', lime: '#d8ef78',
  ink: '#17231f', muted: '#5e6d67', border: '#dce5df', danger: '#a12c2c', dangerSoft: '#fff0ee',
  warning: '#785b17', warningSoft: '#fff6d9', success: '#1f6a4d', successSoft: '#e6f4ed', scrim: 'rgba(9, 26, 21, 0.48)',
};

export function titleCase(value?: string | null) {
  if (!value) return 'Not available';
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDate(value?: string | null, includeTime = false) {
  if (!value) return 'No activity';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString('en-PH', includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' });
}

type ButtonProps = PropsWithChildren<{
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}>;

export function ActionButton({ children, onPress, variant = 'primary', disabled, icon }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[`${variant}Button`], (pressed || disabled) && styles.buttonDim]}
    >
      {icon && <Ionicons name={icon} size={18} color={variant === 'primary' || variant === 'danger' ? '#fff' : palette.green} />}
      <Text style={[styles.buttonText, styles[`${variant}Text`]]}>{children}</Text>
    </Pressable>
  );
}

export function Field({ label, multiline, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor="#8a9892"
        style={[styles.input, multiline && styles.textarea, props.style]}
      />
    </View>
  );
}

export function Choice({ label, value, options, onChange, emptyLabel = 'Not selected' }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void; emptyLabel?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceWrap}>
        {options.map((option) => (
          <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: value === option }} onPress={() => onChange(option)} style={[styles.choice, value === option && styles.choiceActive]}>
            <Text style={[styles.choiceText, value === option && styles.choiceTextActive]}>{option ? titleCase(option) : emptyLabel}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: '#cbd5cf', true: '#77a992' }} thumbColor={value ? palette.green : '#fff'} />
    </View>
  );
}

export function Notice({ children, tone = 'error' }: PropsWithChildren<{ tone?: 'error' | 'success' | 'warning' }>) {
  return <View style={[styles.notice, styles[`${tone}Notice`]]}><Text style={[styles.noticeText, styles[`${tone}NoticeText`]]}>{children}</Text></View>;
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return <View style={styles.loading}><ActivityIndicator color={palette.green} /><Text style={styles.muted}>{text}</Text></View>;
}

export function Empty({ title, text }: { title: string; text: string }) {
  return <View style={styles.empty}><Ionicons name="leaf-outline" size={30} color={palette.green} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.mutedCenter}>{text}</Text></View>;
}

export function SectionHeader({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text><Text style={styles.muted}>{text}</Text></View>
      {action}
    </View>
  );
}

export function ModalSheet({ visible, title, description, onClose, children }: PropsWithChildren<{ visible: boolean; title: string; description?: string; onClose: () => void }>) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose} style={styles.scrim} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}><View style={styles.sheetHeaderCopy}><Text style={styles.sheetTitle}>{title}</Text>{description && <Text style={styles.muted}>{description}</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose} style={styles.closeButton}><Ionicons name="close" size={22} color={palette.ink} /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ConfirmSheet({ visible, title, text, confirmLabel, busy, onCancel, onConfirm }: { visible: boolean; title: string; text: string; confirmLabel: string; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <ModalSheet visible={visible} title={title} description={text} onClose={() => { if (!busy) onCancel(); }}><View style={styles.modalActions}><ActionButton variant="secondary" disabled={busy} onPress={onCancel}>Cancel</ActionButton><ActionButton variant="danger" disabled={busy} onPress={onConfirm}>{busy ? 'Working…' : confirmLabel}</ActionButton></View></ModalSheet>;
}

export const uiStyles = StyleSheet.create({
  stack: { gap: 14 },
  card: { backgroundColor: palette.card, borderRadius: 20, borderWidth: 1, borderColor: palette.border, padding: 16, gap: 9 },
  cardTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  cardMeta: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  pill: { alignSelf: 'flex-start', backgroundColor: palette.greenSoft, color: palette.green, borderRadius: 999, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '800' },
  dangerText: { color: palette.danger },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  searchField: { flex: 1 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', flexGrow: 1, minHeight: 105, backgroundColor: palette.card, borderRadius: 18, borderWidth: 1, borderColor: palette.border, padding: 14, gap: 5 },
  metricValue: { color: palette.green, fontSize: 26, fontWeight: '900' },
  metricLabel: { color: palette.ink, fontWeight: '700' },
});

const styles = StyleSheet.create({
  button: { minHeight: 44, paddingHorizontal: 14, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1 },
  primaryButton: { backgroundColor: palette.green, borderColor: palette.green }, secondaryButton: { backgroundColor: '#fff', borderColor: palette.green }, dangerButton: { backgroundColor: palette.danger, borderColor: palette.danger }, ghostButton: { backgroundColor: 'transparent', borderColor: palette.border },
  buttonText: { fontSize: 14, fontWeight: '800' }, primaryText: { color: '#fff' }, secondaryText: { color: palette.green }, dangerText: { color: '#fff' }, ghostText: { color: palette.green }, buttonDim: { opacity: 0.55 },
  field: { gap: 7 }, fieldLabel: { color: palette.ink, fontSize: 13, fontWeight: '700' }, input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: '#cbd7d0', backgroundColor: '#fff', paddingHorizontal: 13, color: palette.ink, fontSize: 15 }, textarea: { minHeight: 104, paddingTop: 12, textAlignVertical: 'top' },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { borderRadius: 999, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', paddingHorizontal: 11, paddingVertical: 8 }, choiceActive: { backgroundColor: palette.green, borderColor: palette.green }, choiceText: { color: palette.muted, fontSize: 12, fontWeight: '700' }, choiceTextActive: { color: '#fff' },
  toggleRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, toggleLabel: { flex: 1, color: palette.ink, fontWeight: '700' },
  notice: { borderRadius: 13, padding: 12, borderWidth: 1 }, noticeText: { fontSize: 13, lineHeight: 19 }, errorNotice: { backgroundColor: palette.dangerSoft, borderColor: '#efc2bd' }, errorNoticeText: { color: palette.danger }, successNotice: { backgroundColor: palette.successSoft, borderColor: '#bddfce' }, successNoticeText: { color: palette.success }, warningNotice: { backgroundColor: palette.warningSoft, borderColor: '#ead596' }, warningNoticeText: { color: palette.warning },
  loading: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 10 }, muted: { color: palette.muted, fontSize: 14, lineHeight: 20 }, mutedCenter: { color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  empty: { alignItems: 'center', padding: 28, gap: 8 }, emptyTitle: { color: palette.ink, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  sectionHeader: { gap: 12 }, sectionHeaderCopy: { gap: 5 }, eyebrow: { color: palette.green, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, title: { color: palette.ink, fontSize: 27, lineHeight: 32, fontWeight: '900' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' }, scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.scrim }, sheet: { maxHeight: '91%', backgroundColor: palette.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }, sheetHandle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#b7c4bd', marginTop: 9 }, sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 18, paddingBottom: 13, gap: 10, borderBottomWidth: 1, borderBottomColor: palette.border }, sheetHeaderCopy: { flex: 1, gap: 4 }, sheetTitle: { color: palette.ink, fontSize: 21, fontWeight: '900' }, closeButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#e8eeea', alignItems: 'center', justifyContent: 'center' }, sheetBody: { padding: 18, paddingBottom: 34, gap: 14 }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9 },
});
