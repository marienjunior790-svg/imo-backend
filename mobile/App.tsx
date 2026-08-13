import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import {
  cancelAction,
  chat,
  chatFromImage,
  clearTokens,
  confirmAction,
  isLoggedIn,
  login,
  type ChatMessage,
  type ChatResponse,
  type PendingAction,
} from './src/api';

type Bubble = { id: string; role: 'user' | 'assistant'; content: string };

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Intelligence ITC — posez une question, confirmez une action, ou envoyez une photo de dégât.',
    },
  ]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const historyRef = useRef<ChatMessage[]>([]);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    void (async () => {
      setAuthed(await isLoggedIn());
      setReady(true);
    })();
  }, []);

  const push = useCallback((role: 'user' | 'assistant', content: string) => {
    setBubbles((prev) => [...prev, { id: `${Date.now()}-${role}`, role, content }]);
  }, []);

  const applyReply = useCallback(
    (userText: string | null, res: ChatResponse) => {
      if (userText) historyRef.current.push({ role: 'user', content: userText });
      historyRef.current.push({ role: 'assistant', content: res.reply });
      historyRef.current = historyRef.current.slice(-20);
      push('assistant', res.reply);
      setPending(res.pendingAction ?? null);
      setSuggestions(res.suggestions?.slice(0, 4) ?? []);
      if (res.documentUrl) {
        push('assistant', `Document : ${res.documentUrl}`);
      }
    },
    [push],
  );

  const onLogin = async () => {
    setLoginError('');
    setLoggingIn(true);
    try {
      await login(identifier.trim(), password);
      setAuthed(true);
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Connexion impossible');
    } finally {
      setLoggingIn(false);
    }
  };

  const onLogout = async () => {
    await clearTokens();
    setAuthed(false);
    setPending(null);
    historyRef.current = [];
    setBubbles([
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Déconnecté. Connectez-vous pour parler à Intelligence ITC.',
      },
    ]);
  };

  const sendText = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput('');
    push('user', message);
    setBusy(true);
    try {
      const res = await chat(message, historyRef.current);
      applyReply(message, res);
    } catch (e) {
      push('assistant', e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    push('user', 'oui');
    try {
      const res = await confirmAction(pending.id);
      applyReply('oui', res);
    } catch (e) {
      push('assistant', e instanceof Error ? e.message : 'Confirmation échouée');
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const res = await cancelAction(pending.id);
      applyReply('annule', res);
    } catch (e) {
      push('assistant', e instanceof Error ? e.message : 'Annulation échouée');
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const onPickImage = async () => {
    if (busy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      push('assistant', 'Autorisez l’accès aux photos pour envoyer une image.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    const prompt = input.trim() || undefined;
    setInput('');
    push('user', prompt ? `📷 ${prompt}` : '📷 Photo envoyée');
    setBusy(true);
    try {
      const res = await chatFromImage(
        asset.uri,
        asset.mimeType || 'image/jpeg',
        asset.fileName || 'photo.jpg',
        prompt,
      );
      applyReply(prompt || '[image]', res);
    } catch (e) {
      push('assistant', e instanceof Error ? e.message : 'Vision échouée');
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0B3D2E" size="large" />
      </View>
    );
  }

  if (!authed) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.hero}>
          <Text style={styles.brand}>Intelligence ITC</Text>
          <Text style={styles.tagline}>Copilote immobilier — Congo / XAF</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Identifiant (email ou login)</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="vous@agence.cg"
            placeholderTextColor="#7A8A82"
          />
          <Text style={styles.label}>Mot de passe</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#7A8A82"
          />
          {!!loginError && <Text style={styles.error}>{loginError}</Text>}
          <Pressable style={styles.cta} onPress={onLogin} disabled={loggingIn}>
            {loggingIn ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Se connecter</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Text style={styles.topBrand}>Intelligence ITC</Text>
        <Pressable onPress={onLogout}>
          <Text style={styles.logout}>Déconnexion</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={12}
      >
        <FlatList
          ref={listRef}
          data={bubbles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === 'user' ? styles.bubbleUser : styles.bubbleAi,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  item.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAi,
                ]}
              >
                {item.content}
              </Text>
            </View>
          )}
        />

        {pending ? (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingTitle}>{pending.title}</Text>
            <Text style={styles.pendingSummary}>{pending.summary}</Text>
            <View style={styles.pendingRow}>
              <Pressable style={[styles.cta, styles.confirmBtn]} onPress={onConfirm} disabled={busy}>
                <Text style={styles.ctaText}>Confirmer</Text>
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={busy}>
                <Text style={styles.cancelText}>Annuler</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {suggestions.length > 0 && !pending ? (
          <View style={styles.suggestRow}>
            {suggestions.map((s) => (
              <Pressable key={s} style={styles.chip} onPress={() => void sendText(s)} disabled={busy}>
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.composer}>
          <Pressable style={styles.iconBtn} onPress={onPickImage} disabled={busy}>
            <Text style={styles.iconBtnText}>📷</Text>
          </Pressable>
          <TextInput
            style={styles.composerInput}
            value={input}
            onChangeText={setInput}
            placeholder="Écrire à ITC…"
            placeholderTextColor="#7A8A82"
            editable={!busy}
            onSubmitEditing={() => void sendText(input)}
            returnKeyType="send"
          />
          <Pressable
            style={[styles.sendBtn, (!input.trim() || busy) && styles.sendDisabled]}
            onPress={() => void sendText(input)}
            disabled={!input.trim() || busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>OK</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B3D2E' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F6F4' },
  hero: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 24 },
  brand: {
    fontSize: 34,
    fontWeight: '800',
    color: '#F4F7F5',
    letterSpacing: -0.5,
  },
  tagline: { marginTop: 8, color: '#B7D0C4', fontSize: 15 },
  card: {
    marginHorizontal: 20,
    backgroundColor: '#F4F7F5',
    borderRadius: 18,
    padding: 20,
    gap: 8,
  },
  label: { color: '#1C2B24', fontWeight: '600', marginTop: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D5E0DA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#12201A',
  },
  error: { color: '#A12B2B', marginTop: 4 },
  cta: {
    marginTop: 12,
    backgroundColor: '#1F6B4F',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0B3D2E',
  },
  topBrand: { color: '#F4F7F5', fontWeight: '800', fontSize: 18 },
  logout: { color: '#B7D0C4', fontWeight: '600' },
  list: { padding: 16, paddingBottom: 8, backgroundColor: '#F3F6F4', flexGrow: 1 },
  bubble: {
    maxWidth: '88%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#1F6B4F' },
  bubbleAi: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#D5E0DA' },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextAi: { color: '#12201A' },
  pendingBox: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#FFF8E8',
    borderColor: '#E0C37A',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  pendingTitle: { fontWeight: '800', color: '#3D2E0B', marginBottom: 4 },
  pendingSummary: { color: '#5A4A20', marginBottom: 10 },
  pendingRow: { flexDirection: 'row', gap: 10 },
  confirmBtn: { flex: 1, marginTop: 0 },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A12B2B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  cancelText: { color: '#A12B2B', fontWeight: '700' },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  chip: {
    backgroundColor: '#E4F0EA',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { color: '#0B3D2E', fontWeight: '600', fontSize: 13 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#F3F6F4',
    borderTopWidth: 1,
    borderTopColor: '#D5E0DA',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E4F0EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 20 },
  composerInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5E0DA',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#12201A',
  },
  sendBtn: {
    backgroundColor: '#1F6B4F',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.5 },
});
