import { createContext, PropsWithChildren, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useT } from '../../i18n';

export const palette = {
  background: '#ffffff', card: '#ffffff', green: '#236b4b', greenPressed: '#18583b', greenSoft: '#f0f6f2', lime: '#d8ef78',
  ink: '#1d2d24', muted: '#68736d', border: '#dde5e0', danger: '#a12c2c', dangerSoft: '#fff0ee',
  warning: '#785b17', warningSoft: '#fff6d9', success: '#1f6a4d', successSoft: '#eff7f2', scrim: 'rgba(9, 26, 21, 0.48)',
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

const FieldFocusContext = createContext<(() => void) | null>(null);

export function Field({ label, multiline, ...props }: TextInputProps & { label: string }) {
  const revealFocusedField = useContext(FieldFocusContext);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        onFocus={(event) => { props.onFocus?.(event); revealFocusedField?.(); }}
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
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ false: '#cbd5cf', true: '#77a992' }} thumbColor={value ? palette.green : '#fff'} />
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

export function SectionHeader({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}><Text style={styles.title}>{title}</Text><Text style={styles.muted}>{text}</Text></View>
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
          <View style={styles.sheetHeader}><View style={styles.sheetHeaderMark}><Image source={require('../../../assets/dahonmd-logo-green.png')} style={styles.sheetLogo} resizeMode="contain" accessibilityLabel="DahonMD logo" /></View><View style={styles.sheetHeaderCopy}><Text style={styles.sheetTitle}>{title}</Text>{description && <Text style={styles.muted}>{description}</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose} style={styles.closeButton}><Ionicons name="close" size={22} color={palette.ink} /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AuthCardSheet({ visible, title, description, onClose, children, dismissDisabled = false }: PropsWithChildren<{ visible: boolean; title: string; description?: string; onClose: () => void; dismissDisabled?: boolean }>) {
  const { height } = useWindowDimensions();
  // The Android window gets shorter when the keyboard opens. Keep the sheet's
  // resting height and entrance animation tied to the unobstructed window.
  const sheetHeight = useRef(height).current;
  const position = useRef(new Animated.Value(sheetHeight)).current;
  const dragStart = useRef(0);
  const settled = useRef(0);
  const closing = useRef(false);
  const current = useRef({ height: sheetHeight, collapsed: Math.min(sheetHeight * 0.2, 180), onClose, dismissDisabled });
  current.current = { height: sheetHeight, collapsed: Math.min(sheetHeight * 0.2, 180), onClose, dismissDisabled };

  // Keyboard handling. The sheet is a Modal window, where Android's
  // adjustResize is unreliable (and edge-to-edge ignores it), so measure how
  // much of this window the keyboard actually covers and lift the sheet by
  // exactly that. If the window did shrink instead, the overlap is 0 and the
  // shrunken height is used, so the two can never add up.
  const rootRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const scrollY = useRef(0);
  const scrollViewport = useRef(0);
  const [rootHeight, setRootHeight] = useState(sheetHeight);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const keyboardOpen = keyboardTop !== null;
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const changeEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidChangeFrame';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subscriptions = [
      Keyboard.addListener(showEvent, (event) => setKeyboardTop(event.endCoordinates.screenY)),
      Keyboard.addListener(changeEvent, (event) => { if (Keyboard.isVisible()) setKeyboardTop(event.endCoordinates.screenY); }),
      Keyboard.addListener(hideEvent, () => { setKeyboardTop(null); setKeyboardInset(0); }),
    ];
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      setKeyboardTop(null);
      setKeyboardInset(0);
    };
  }, [visible]);

  useEffect(() => {
    if (keyboardTop === null) return;
    const frame = requestAnimationFrame(() => {
      rootRef.current?.measureInWindow((_x, y, _width, measuredHeight) => {
        setKeyboardInset(Math.max(0, Math.round(y + measuredHeight - keyboardTop)));
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [keyboardTop, rootHeight]);

  // Once the keyboard is up and the sheet has resized, bring the focused field
  // (plus a little room for its label and error text) into the visible area.
  const revealFocusedField = useCallback(() => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      const input = TextInput.State.currentlyFocusedInput();
      if (!input || !contentRef.current) return;
      input.measureLayout(contentRef.current, (_x, y, _width, fieldHeight) => {
        const top = Math.max(0, y - 36);
        const bottom = y + fieldHeight + 28;
        if (bottom > scrollY.current + scrollViewport.current) scrollRef.current?.scrollTo({ y: bottom - scrollViewport.current, animated: true });
        else if (top < scrollY.current) scrollRef.current?.scrollTo({ y: top, animated: true });
      }, () => undefined);
    }, 80);
  }, []);
  useEffect(() => {
    if (keyboardOpen) revealFocusedField();
    return () => { if (focusTimer.current) clearTimeout(focusTimer.current); };
  }, [keyboardOpen, keyboardInset, rootHeight, revealFocusedField]);

  useEffect(() => {
    if (!keyboardOpen) return;
    settled.current = 0;
    Animated.spring(position, { toValue: 0, stiffness: 280, damping: 30, useNativeDriver: true }).start();
  }, [keyboardOpen, position]);

  const restingHeight = Math.min(sheetHeight * (title === 'Sign up' ? 0.94 : 0.78), title === 'Sign up' ? 820 : 650);
  // Leave the status bar clear so the sheet's top can never be pushed off-screen.
  const topClearance = (Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 48) + 12;
  const sheetVisibleHeight = keyboardOpen
    ? Math.max(160, Math.min(restingHeight, rootHeight - keyboardInset - topClearance))
    : Math.min(restingHeight, rootHeight - topClearance);

  const snap = (toValue: number) => {
    settled.current = toValue;
    Animated.spring(position, { toValue, stiffness: 280, damping: 30, mass: 1, overshootClamping: true, useNativeDriver: true }).start();
  };
  const dismiss = () => {
    if (closing.current || current.current.dismissDisabled) return;
    Keyboard.dismiss();
    closing.current = true;
    Animated.timing(position, { toValue: current.current.height, duration: 220, useNativeDriver: true }).start(({ finished }) => {
      if (finished) { current.current.onClose(); closing.current = false; settled.current = 0; position.setValue(0); }
      else closing.current = false;
    });
  };
  const snapRef = useRef(snap);
  const dismissRef = useRef(dismiss);
  snapRef.current = snap;
  dismissRef.current = dismiss;
  const keyboardOpenRef = useRef(keyboardOpen);
  keyboardOpenRef.current = keyboardOpen;
  const startedWithKeyboard = useRef(false);
  const activateHandle = () => {
    if (keyboardOpenRef.current) Keyboard.dismiss();
    else snapRef.current(settled.current === 0 ? current.current.collapsed : 0);
  };
  const activateHandleRef = useRef(activateHandle);
  activateHandleRef.current = activateHandle;
  const gesture = useRef(PanResponder.create({
    // Own the touch from the start: Pressable's responder callbacks otherwise
    // compete with PanResponder and turn the grab handle into a dead target.
    onStartShouldSetPanResponder: () => !closing.current,
    onPanResponderTerminationRequest: () => false,
    onMoveShouldSetPanResponder: (_, state) => Math.abs(state.dy) > 6 && Math.abs(state.dy) > Math.abs(state.dx),
    onPanResponderGrant: () => { startedWithKeyboard.current = keyboardOpenRef.current; position.stopAnimation((value) => { dragStart.current = value; }); },
    onPanResponderMove: (_, state) => { if (startedWithKeyboard.current) { if (Math.abs(state.dy) > 6) Keyboard.dismiss(); return; } position.setValue(Math.max(0, Math.min(current.current.height, dragStart.current + state.dy))); },
    onPanResponderRelease: (_, state) => {
      if (startedWithKeyboard.current) { Keyboard.dismiss(); snapRef.current(0); return; }
      if (Math.abs(state.dy) < 6 && Math.abs(state.dx) < 6) { activateHandleRef.current(); return; }
      const { collapsed } = current.current;
      if (current.current.dismissDisabled) { snapRef.current(0); return; }
      if (state.dy > 180 || (state.dy > 40 && state.vy > 1.2)) { dismissRef.current(); return; }
      if (state.dy > 100 && dragStart.current >= collapsed * 0.6) { dismissRef.current(); return; }
      if (state.dy > 55 || state.vy > 0.8) { snapRef.current(collapsed); return; }
      if (state.dy < -40 || state.vy < -0.8) { snapRef.current(0); return; }
      snapRef.current(dragStart.current < collapsed / 2 ? 0 : collapsed);
    },
    onPanResponderTerminate: () => { snapRef.current(settled.current); },
  })).current;

  useEffect(() => {
    if (!visible) return;
    closing.current = false;
    settled.current = 0;
    position.setValue(sheetHeight);
    Animated.spring(position, { toValue: 0, stiffness: 230, damping: 27, mass: 1, overshootClamping: true, useNativeDriver: true }).start();
  }, [visible, sheetHeight, position]);

  return <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
    <View ref={rootRef} onLayout={(event) => setRootHeight(event.nativeEvent.layout.height)} style={[styles.cardModalRoot, styles.authModalRoot, { paddingBottom: keyboardInset }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={dismiss} style={styles.scrim} />
      <Animated.View style={[styles.cardModal, styles.authCardModal, { height: sheetVisibleHeight, transform: [{ translateY: position }] }]}>
        <View style={[styles.authHeader, keyboardOpen && styles.authHeaderCompact]}>
          <View {...gesture.panHandlers} accessible accessibilityRole="button" accessibilityLabel={keyboardOpen ? 'Dismiss keyboard' : 'Move account sheet'} accessibilityHint="Drag down to lower, up to restore, or swipe down farther to close. Tap to toggle." accessibilityActions={[{ name: 'activate' }]} onAccessibilityTap={activateHandle} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'activate') activateHandle(); }} style={styles.authDragZone}><View pointerEvents="none" style={styles.authHandle} /></View>
          <View style={styles.authBrand}><Image source={require('../../../assets/dahonmd-logo-white.png')} style={styles.authBrandLogo} resizeMode="contain" accessibilityLabel="DahonMD logo" /><Text style={styles.authBrandName}>DahonMD</Text></View>
          <Text style={[styles.authTitle, keyboardOpen && styles.authTitleCompact]}>{title === 'Sign up' ? 'Create your account' : 'Log in to your account'}</Text>
          {!keyboardOpen && <Text style={styles.authDescription}>{description || 'Pick up where you left off with your scans.'}</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={dismiss} style={[styles.authCloseButton, keyboardOpen && styles.authCloseButtonCompact]}><Ionicons name="close" size={21} color="#fff" /></Pressable>
        </View>
        <ScrollView
          ref={scrollRef}
          style={styles.authScroll}
          keyboardShouldPersistTaps="handled"
          // Scrolling must not close the keyboard: the form has to stay
          // scrollable while typing so every field and the submit button remain reachable.
          keyboardDismissMode="none"
          scrollEventThrottle={16}
          onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y; }}
          onLayout={(event) => { scrollViewport.current = event.nativeEvent.layout.height; }}
        >
          <FieldFocusContext.Provider value={revealFocusedField}>
            <View ref={contentRef} collapsable={false} style={[styles.sheetBody, styles.authBody]}>{children}</View>
          </FieldFocusContext.Provider>
        </ScrollView>
      </Animated.View>
    </View>
  </Modal>;
}

export function ModalCard({ visible, title, description, onClose, children, auth = false, dismissDisabled = false }: PropsWithChildren<{ visible: boolean; title: string; description?: string; onClose: () => void; auth?: boolean; dismissDisabled?: boolean }>) {
  if (auth) return <AuthCardSheet visible={visible} title={title} description={description} onClose={onClose} dismissDisabled={dismissDisabled}>{children}</AuthCardSheet>;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.cardModalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose} style={styles.scrim} />
        <View style={styles.cardModal}>
          <View style={styles.sheetHeader}><View style={styles.sheetHeaderMark}><Image source={require('../../../assets/dahonmd-logo-green.png')} style={styles.sheetLogo} resizeMode="contain" accessibilityLabel="DahonMD logo" /></View><View style={styles.sheetHeaderCopy}><Text style={styles.sheetTitle}>{title}</Text>{description && <Text style={styles.muted}>{description}</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose} style={styles.closeButton}><Ionicons name="close" size={22} color={palette.ink} /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ConfirmSheet({ visible, title, text, confirmLabel, busy, danger = true, onCancel, onConfirm }: { visible: boolean; title: string; text: string; confirmLabel: string; busy?: boolean; danger?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useT();
  return <ModalSheet visible={visible} title={title} description={text} onClose={() => { if (!busy) onCancel(); }}><View style={styles.modalActions}><ActionButton variant="secondary" disabled={busy} onPress={onCancel}>{t('common.cancel')}</ActionButton><ActionButton variant={danger ? 'danger' : 'primary'} disabled={busy} onPress={onConfirm}>{busy ? t('common.working') : confirmLabel}</ActionButton></View></ModalSheet>;
}

export const uiStyles = StyleSheet.create({
  stack: { gap: 14 },
  card: { backgroundColor: palette.card, borderRadius: 14, borderWidth: 1, borderColor: palette.border, padding: 16, gap: 9 },
  cardTitle: { color: palette.ink, fontSize: 16, fontWeight: '800' },
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
  metric: { width: '48%', flexGrow: 1, minHeight: 96, backgroundColor: palette.card, borderRadius: 14, borderWidth: 1, borderColor: palette.border, padding: 14, gap: 5 },
  metricValue: { color: palette.green, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  metricLabel: { color: palette.muted, fontSize: 13, fontWeight: '700' },
});

const styles = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1 },
  primaryButton: { backgroundColor: palette.green, borderColor: palette.green }, secondaryButton: { backgroundColor: '#fff', borderColor: '#b9cbc1' }, dangerButton: { backgroundColor: palette.danger, borderColor: palette.danger }, ghostButton: { backgroundColor: 'transparent', borderColor: palette.border },
  buttonText: { fontSize: 15, fontWeight: '800' }, primaryText: { color: '#fff' }, secondaryText: { color: palette.green }, dangerText: { color: '#fff' }, ghostText: { color: palette.green }, buttonDim: { opacity: 0.55 },
  field: { gap: 7 }, fieldLabel: { color: palette.ink, fontSize: 13, fontWeight: '700' }, input: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: '#ccd7d0', backgroundColor: '#fff', paddingHorizontal: 13, color: palette.ink, fontSize: 15 }, textarea: { minHeight: 104, paddingTop: 12, textAlignVertical: 'top' },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { borderRadius: 999, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', paddingHorizontal: 11, paddingVertical: 8 }, choiceActive: { backgroundColor: palette.green, borderColor: palette.green }, choiceText: { color: palette.muted, fontSize: 12, fontWeight: '700' }, choiceTextActive: { color: '#fff' },
  toggleRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, toggleLabel: { flex: 1, color: palette.ink, fontWeight: '700' },
  notice: { borderRadius: 10, padding: 12, borderWidth: 1 }, noticeText: { fontSize: 13, lineHeight: 19 }, errorNotice: { backgroundColor: palette.dangerSoft, borderColor: '#efc2bd' }, errorNoticeText: { color: palette.danger }, successNotice: { backgroundColor: palette.successSoft, borderColor: '#c7ddce' }, successNoticeText: { color: palette.success }, warningNotice: { backgroundColor: palette.warningSoft, borderColor: '#ead596' }, warningNoticeText: { color: palette.warning },
  loading: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 10 }, muted: { color: palette.muted, fontSize: 14, lineHeight: 20 }, mutedCenter: { color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  empty: { alignItems: 'center', padding: 28, gap: 8 }, emptyTitle: { color: palette.ink, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  sectionHeader: { gap: 12 }, sectionHeaderCopy: { gap: 5 }, title: { color: palette.ink, fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.4 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' }, scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8, 29, 20, 0.58)' }, cardModalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 18 }, cardModal: { width: '100%', maxWidth: 460, maxHeight: '90%', backgroundColor: '#f8faf8', borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: '#e0e9e2', shadowColor: '#10251d', shadowOpacity: 0.22, shadowRadius: 30, shadowOffset: { width: 0, height: 14 }, elevation: 16 }, sheet: { maxHeight: '92%', backgroundColor: '#f8faf8', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', shadowColor: '#10251d', shadowOpacity: 0.22, shadowRadius: 26, shadowOffset: { width: 0, height: -8 }, elevation: 16 }, sheetHandle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#a6baa9', marginTop: 10 }, sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18, gap: 12, borderBottomWidth: 1, borderBottomColor: '#e4ece5', backgroundColor: '#fff' }, sheetHeaderMark: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e9f4ec' }, sheetHeaderCopy: { flex: 1, gap: 4 }, sheetTitle: { color: palette.ink, fontSize: 21, lineHeight: 27, fontWeight: '800', letterSpacing: -0.4 }, closeButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#f0f4f1', alignItems: 'center', justifyContent: 'center' }, sheetBody: { padding: 20, paddingBottom: 38, gap: 16 }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9 },
  authModalRoot: { justifyContent: 'flex-end', padding: 0 },
  authCardModal: { maxWidth: 520, maxHeight: '100%', borderWidth: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, shadowOpacity: 0.22, shadowRadius: 30, elevation: 16 },
  authHeader: { paddingHorizontal: 26, paddingTop: 34, paddingBottom: 25, backgroundColor: '#174d3a' },
  authDragZone: { position: 'absolute', top: 0, left: '25%', right: '25%', height: 44, zIndex: 2, alignItems: 'center', justifyContent: 'center' },
  authHandle: { width: 44, height: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.6)' },
  authBrand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  authBrandLogo: { width: 36, height: 36 },
  authBrandName: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  authTitle: { marginTop: 28, maxWidth: 330, color: '#fff', fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },
  sheetLogo: { width: 28, height: 28 },
  authDescription: { marginTop: 8, maxWidth: 320, color: '#dcece2', fontSize: 14, lineHeight: 21 },
  authCloseButton: { position: 'absolute', top: 30, right: 22, width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 12 },
  authScroll: { flex: 1 },
  // While the keyboard is open the header gives its space to the form.
  authHeaderCompact: { paddingTop: 22, paddingBottom: 14 },
  authTitleCompact: { marginTop: 10, fontSize: 21, lineHeight: 27 },
  authCloseButtonCompact: { top: 14 },
  authBody: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 42, gap: 16 },
});
