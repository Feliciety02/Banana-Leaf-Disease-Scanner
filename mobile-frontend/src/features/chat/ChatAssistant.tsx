import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
const TOPIC_STARTERS = ['What does this result mean?', 'What should I do next with this plant?'];

export type ScanTopic = { key: number; diagnosisId: number; label: string };

export function ChatAssistant({ user, onSignIn, resumeKey = 0, scanTopic = null }: { resumeKey?: number; user: SessionUser | null | undefined; onSignIn: () => void; scanTopic?: ScanTopic | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (resumeKey) setOpen(true); }, [resumeKey]);
  const [messages, setMessages] = useState<DisplayMessage[]>([INTRO]);
  // The scan the farmer opened the assistant from; its result and review are added on the server.
  const [topic, setTopic] = useState<ScanTopic | null>(null);
  // A conversation belongs to one account; start fresh whenever someone else signs in.
  useEffect(() => { setMessages([INTRO]); setTopic(null); setDraft(''); setError(''); }, [user?.id]);
  useEffect(() => {
    if (!scanTopic) return;
    setTopic(scanTopic);
    setMessages([INTRO]);
    setOpen(true);
  }, [scanTopic?.key]);
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
    setTopic(null);
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
      const response = await askAssistant(transcript, topic?.diagnosisId);
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
            <View style={styles.avatar}><Image source={require('../../../assets/dahonmd-logo-green.webp')} style={styles.avatarLogo} resizeMode="contain" accessibilityLabel="DahonMD logo" /></View>
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
              {topic ? <View style={styles.topic}>
                <Ionicons name="leaf-outline" size={16} color={palette.green} />
                <Text style={styles.topicText}>About your scan: {topic.label}. Dahon sees its result and any expert review, not your photo or location.</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Stop asking about this scan" onPress={() => setTopic(null)} hitSlop={8}><Ionicons name="close" size={16} color={palette.muted} /></Pressable>
              </View> : null}
              {messages.map((message) => <View key={message.id} style={[styles.bubbleRow, message.role === 'user' && styles.userRow]}>
                <View style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
                  <Text style={[styles.messageText, message.role === 'user' && styles.userText]}>{message.content}</Text>
                </View>
              </View>)}
              {busy && <View style={styles.bubbleRow}><View style={[styles.bubble, styles.assistantBubble, styles.thinking]}><ActivityIndicator size="small" color={palette.green} /><Text style={styles.thinkingText}>One moment...</Text></View></View>}
              {messages.length === 1 && <View style={styles.starters}>{(topic ? TOPIC_STARTERS : STARTERS).map((starter) => <Pressable key={starter} accessibilityRole="button" onPress={() => send(starter)} style={styles.starter}><Text style={styles.starterText}>{starter}</Text><Ionicons name="arrow-forward" size={14} color={palette.green} /></Pressable>)}</View>}
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
  topic: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 12, backgroundColor: palette.greenSoft },
  topicText: { flex: 1, color: palette.ink, fontSize: 13, lineHeight: 18 },
  launcher: { position: 'absolute', right: 18, bottom: 80, zIndex: 40, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.green, borderWidth: 1, borderColor: '#2f725b', shadowColor: '#08271c', shadowOpacity: 0.2, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  launcherPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8, 29, 20, 0.58)' },
  sheet: { backgroundColor: '#f8faf8', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', shadowColor: '#071d15', shadowOpacity: 0.22, shadowRadius: 26, shadowOffset: { width: 0, height: -8 }, elevation: 16 },
  chatSheet: { height: '84%' },
  compactSheet: { minHeight: 340 },
  handle: { alignSelf: 'center', width: 42, height: 5, marginTop: 10, marginBottom: 5, borderRadius: 3, backgroundColor: '#a6baa9' },
  header: { minHeight: 68, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: '#e4ece5', backgroundColor: '#fff' },
  avatar: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e9f4ec' },
  avatarLogo: { width: 27, height: 27 },
  title: { flex: 1, color: palette.ink, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  headerButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f4f1' },
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
