import React, { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, ApiError } from '../api/client';
import type { RootStackParamList } from '../navigation';
import { colors, common } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

interface Message {
  role: 'user' | 'assistant';
  text: string;
  model?: string;
  sources?: string;
}

interface AskResponse {
  answer: string;
  citations?: Array<{ topic?: string } | string>;
  model?: string;
  session_id?: string;
}

const CHIPS = [
  'Which of my values are out of range?',
  'Explain my report',
  'What is my health score?',
  'Show all my values',
];

export default function Chat({ route }: Props) {
  const reportId = route.params?.reportId;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  const send = async (raw: string) => {
    const question = raw.trim();
    if (!question || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setBusy(true);
    try {
      const d = await api<AskResponse>('/chat/ask', {
        method: 'POST',
        body: {
          question,
          report_id: reportId || undefined,
          session_id: sessionId || undefined,
        },
      });
      if (d.session_id) setSessionId(d.session_id);
      const topics = (d.citations ?? [])
        .map((c) => (typeof c === 'string' ? c : c.topic))
        .filter((t): t is string => !!t);
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: d.answer,
          model: d.model,
          sources: topics.length ? topics.join(', ') : undefined,
        },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text:
            e instanceof ApiError
              ? e.message
              : 'Something went wrong asking that. Please try again.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
          {reportId
            ? 'This chat has the selected report’s full data — every extracted value, its reference range and your health score.'
            : 'Ask about your reports in plain language. Attach a report from its page for answers about its exact values.'}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {CHIPS.map((c) => (
            <TouchableOpacity key={c} style={common.chip} onPress={() => send(c)}>
              <Text style={common.chipText}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 16 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <Text style={{ color: colors.muted, fontSize: 14, marginTop: 16 }}>
            No messages yet — tap a question above or type your own.
          </Text>
        }
        renderItem={({ item }) => (
          <View
            style={{
              alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
              backgroundColor: item.role === 'user' ? colors.primary : '#fff',
              borderWidth: item.role === 'user' ? 0 : 1,
              borderColor: colors.border,
              borderRadius: 14,
              padding: 12,
              marginBottom: 10,
              maxWidth: '88%',
            }}
          >
            <Text
              style={{
                color: item.role === 'user' ? '#fff' : colors.ink,
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              {item.text}
            </Text>
            {!!item.sources && (
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>
                Sources: {item.sources}
              </Text>
            )}
            {!!item.model && (
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>{item.model}</Text>
            )}
          </View>
        )}
      />

      <View
        style={{
          flexDirection: 'row',
          padding: 12,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: '#fff',
          alignItems: 'flex-end',
        }}
      >
        <TextInput
          style={[common.input, { flex: 1, marginRight: 8 }]}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about your report…"
          placeholderTextColor={colors.muted}
          multiline
          onSubmitEditing={() => send(input)}
        />
        <TouchableOpacity
          style={{
            backgroundColor: colors.primary,
            borderRadius: 10,
            paddingVertical: 12,
            paddingHorizontal: 16,
            opacity: busy ? 0.55 : 1,
          }}
          onPress={() => send(input)}
          disabled={busy}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>{busy ? '…' : 'Ask'}</Text>
        </TouchableOpacity>
      </View>

      <Text
        style={{
          fontSize: 11,
          color: colors.warn,
          backgroundColor: colors.warnBg,
          paddingHorizontal: 16,
          paddingVertical: 8,
          lineHeight: 15,
        }}
      >
        Educational information only — not a diagnosis. Answers explain your report and
        general health information; they are not medical advice.
      </Text>
    </KeyboardAvoidingView>
  );
}
