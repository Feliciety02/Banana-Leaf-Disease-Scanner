import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { SessionUser } from '../../services/api';
import { askAssistant, ChatTurn } from '../../services/chat';
import { ActionButton, Loading, Notice, palette } from '../connected/ui';

type DisplayMessage = ChatTurn & { id: string };

const INTRO: DisplayMessage = {
  id: 'intro',
  role: 'assistant',
  content: 'Ask me about banana leaf symptoms, care, or taking a clear photo.',
};

const STARTERS = [
  'What is Sigatoka?',
  'How do I take a clear photo?',
  'When should I get help?',
];

export function ChatAssistant({ user, onSignIn }: { user: SessionUser | null | undefined; onSignIn: () => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([INTRO]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nextId = useRef(1);
  const conversation = useRef<ScrollView>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => conversation.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [busy, messages, open]);

  const clear = () => {
    if (busy) return;
    setMessages([INTRO]);
    setDraft('');
    setError('');
  };

  const send = async (suggestion?: string) => {
    const content = (suggestion ?? draft).trim();
    if (!user || !content || busy) return;

    const userMessage: DisplayMessage = { id: `message-${nextId.current++}`, role: 'user', content };
    const transcript: ChatTurn[] = [...messages.filter(({ id }) => id !== 'intro'), userMessage]
      .slice(-8)
      .map(({ role, content: messageContent }) => ({ role, content: messageContent }));
    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setError('');
    setBusy(true);

    try {
      const response = await askAssistant(transcript);
      setMessages((current) => [...current, {
        id: `message-${nextId.current++}`,
        role: 'assistant',
        content: response.reply,
      }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not send. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open Ask Dahon"
      onPress={() => setOpen(true)}
      style={({ pressed }) => [styles.launcher, pressed && styles.launcherPressed]}
    >
      <Ionicons name="chatbubble-ellipses-outline" size={24} color="#fff" />
    </Pressable>

    <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close assistant" onPress={() => setOpen(false)} style={styles.backdrop} />
        <View style={[styles.sheet, user ? styles.chatSheet : styles.compactSheet]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.avatar}><Ionicons name="leaf" size={20} color={palette.green} /></View>
            <Text style={styles.title}>Ask Dahon</Text>
            {user && messages.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel="Clear conversation" disabled={busy} onPress={clear} style={styles.headerButton}><Ionicons name="refresh" size={19} color={palette.green} /></Pressable> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Close assistant" onPress={() => setOpen(false)} style={styles.headerButton}><Ionicons name="close" size={22} color={palette.ink} /></Pressable>
          </View>

          {user === undefined ? <View style={styles.stateBody}><Loading text="Loading..." /></View> : !user ? <View style={styles.stateBody}>
            <Text style={styles.stateTitle}>Sign in to chat</Text>
            <Text style={styles.stateText}>Ask questions about banana leaf care using your DahonMD account.</Text>
            <Notice tone="warning">Guidance only. Confirm a diagnosis with the scanner or an expert.</Notice>
            <ActionButton icon="log-in-outline" onPress={() => { setOpen(false); onSignIn(); }}>Sign in</ActionButton>
          </View> : <>
            <ScrollView ref={conversation} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.messages}>
              {messages.map((message) => <View key={message.id} style={[styles.bubbleRow, message.role === 'user' && styles.userRow]}>
                <View style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
                  <Text style={[styles.messageText, message.role === 'user' && styles.userText]}>{message.content}</Text>
                </View>
              </View>)}
              {busy && <View style={styles.bubbleRow}><View style={[styles.bubble, styles.assistantBubble, styles.thinking]}><ActivityIndicator size="small" color={palette.green} /><Text style={styles.thinkingText}>One moment...</Text></View></View>}
              {messages.length === 1 && <View style={styles.starters}>{STARTERS.map((starter) => <Pressable key={starter} accessibilityRole="button" onPress={() => send(starter)} style={styles.starter}><Text style={styles.starterText}>{starter}</Text><Ionicons name="arrow-forward" size={14} color={palette.green} /></Pressable>)}</View>}
              {error && <Notice>{error}</Notice>}
            </ScrollView>

            <View style={styles.composerArea}>
              <View style={styles.composer}>
                <TextInput
                  accessibilityLabel="Message Ask Dahon"
                  multiline
                  maxLength={800}
                  onChangeText={setDraft}
                  placeholder="Ask about a banana leaf..."
                  placeholderTextColor="#809089"
                  style={styles.input}
                  value={draft}
                />
                <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={busy || !draft.trim()} onPress={() => send()} style={[styles.sendButton, (busy || !draft.trim()) && styles.disabled]}>
                  <Ionicons name="arrow-up" size={21} color="#fff" />
                </Pressable>
              </View>
              <Text style={styles.note}>General guidance only</Text>
            </View>
          </>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  launcher: { position: 'absolute', right: 20, bottom: 88, zIndex: 40, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.green, borderWidth: 1, borderColor: '#2f725b', shadowColor: '#08271c', shadowOpacity: 0.2, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  launcherPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(7, 25, 19, 0.32)' },
  sheet: { backgroundColor: '#f8faf9', borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden', shadowColor: '#071d15', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: -5 }, elevation: 16 },
  chatSheet: { height: '78%' },
  compactSheet: { minHeight: 300 },
  handle: { alignSelf: 'center', width: 36, height: 4, marginTop: 8, marginBottom: 3, borderRadius: 2, backgroundColor: '#c6d0ca' },
  header: { minHeight: 60, paddingHorizontal: 14, paddingBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: '#fff' },
  avatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.lime },
  title: { flex: 1, color: palette.ink, fontSize: 17, fontWeight: '800' },
  headerButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stateBody: { flex: 1, justifyContent: 'center', padding: 28, gap: 12 },
  stateTitle: { color: palette.ink, fontSize: 21, fontWeight: '800', textAlign: 'center' },
  stateText: { color: palette.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  messages: { padding: 14, paddingBottom: 18, gap: 10 },
  bubbleRow: { maxWidth: '88%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'flex-end' },
  userRow: { alignSelf: 'flex-end' },
  bubble: { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10 },
  assistantBubble: { backgroundColor: '#fff', borderWidth: 1, borderColor: palette.border, borderBottomLeftRadius: 4 },
  userBubble: { backgroundColor: palette.green, borderBottomRightRadius: 4 },
  messageText: { color: palette.ink, fontSize: 15, lineHeight: 21 },
  userText: { color: '#fff' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thinkingText: { color: palette.muted, fontSize: 13 },
  starters: { gap: 8, marginTop: 2 },
  starter: { minHeight: 42, paddingHorizontal: 13, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff' },
  starterText: { flex: 1, color: palette.green, fontSize: 13, fontWeight: '700' },
  composerArea: { padding: 11, paddingBottom: Platform.OS === 'ios' ? 20 : 12, gap: 6, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: '#fff' },
  composer: { minHeight: 52, paddingLeft: 7, paddingRight: 5, paddingVertical: 5, borderRadius: 14, flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: 1, borderColor: '#c8d5ce', backgroundColor: '#fff' },
  input: { flex: 1, minHeight: 42, maxHeight: 105, paddingHorizontal: 8, paddingVertical: 10, color: palette.ink, fontSize: 15, textAlignVertical: 'top' },
  sendButton: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.green },
  disabled: { opacity: 0.4 },
  note: { color: palette.muted, fontSize: 10, lineHeight: 14, textAlign: 'center' },
});
