import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getOnDeviceStatus, loadModelMetadata } from '../services/ondevice';
import type { ModelMetadata, OnDeviceStatus } from '../services/ondevice';
import { colors, common } from '../theme';

function MetaRow({ k, v }: { k: string; v?: string | number | null }) {
  if (v === undefined || v === null || v === '') return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 7,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 13, color: colors.muted }}>{k}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink }}>{String(v)}</Text>
    </View>
  );
}

export default function OnDevice() {
  const [metadata] = useState<ModelMetadata | null>(() => loadModelMetadata());
  const [status, setStatus] = useState<OnDeviceStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      setStatus(await getOnDeviceStatus());
    } finally {
      setChecking(false);
    }
  };

  return (
    <ScrollView style={common.screen}>
      <Text style={common.title}>On-device AI</Text>
      <Text style={common.sub}>
        RAGnosis can embed your report text with a small neural model that runs entirely on
        this phone — the same all-MiniLM-L6-v2 model the server uses, quantized to INT8 so it
        stays small and fast.
      </Text>

      <View style={[common.card, { marginTop: 12 }]}>
        <Text style={common.heading}>Why on-device?</Text>
        <Text style={{ fontSize: 14, color: colors.ink, lineHeight: 21 }}>
          • Privacy: report text never leaves the phone for the embedding step.{'\n'}
          • Speed &amp; offline use: retrieval works without a network round-trip.{'\n'}
          • Same answers: embeddings match the server model, so results are identical.
        </Text>
      </View>

      <View style={common.card}>
        <Text style={common.heading}>Bundled model</Text>
        {metadata ? (
          <View>
            <MetaRow k="Model" v={metadata.name} />
            <MetaRow k="Task" v={metadata.task} />
            <MetaRow k="Quantization" v={metadata.quantization} />
            <MetaRow k="Embedding size" v={metadata.embeddingDim} />
            <MetaRow k="Approx. size (MB)" v={metadata.sizeMb} />
            <MetaRow k="Version" v={metadata.version} />
            <MetaRow k="Model file" v={metadata.modelFile ?? 'not bundled yet'} />
            {!!metadata.notes && (
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 17 }}>
                {metadata.notes}
              </Text>
            )}
          </View>
        ) : (
          <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>
            No model metadata found — assets/model.json is not bundled with this build.
          </Text>
        )}
      </View>

      <View style={common.card}>
        <Text style={common.heading}>Current mode</Text>
        {status ? (
          <>
            <View
              style={{
                alignSelf: 'flex-start',
                backgroundColor: status.mode === 'device' ? colors.okBg : colors.chipBg,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 5,
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  fontWeight: '700',
                  fontSize: 13,
                  color: status.mode === 'device' ? colors.ok : colors.primaryDark,
                }}
              >
                {status.mode === 'device' ? 'On-device' : 'Server mode'}
              </Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.ink, lineHeight: 20 }}>{status.detail}</Text>
          </>
        ) : (
          <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>
            Not checked yet. The check tries to open the ONNX model with ONNX Runtime; any
            failure safely falls back to server mode.
          </Text>
        )}
        <TouchableOpacity
          style={[common.button, checking && common.buttonDisabled]}
          onPress={check}
          disabled={checking}
        >
          <Text style={common.buttonText}>
            {checking ? 'Checking…' : 'Check on-device model'}
          </Text>
        </TouchableOpacity>
        {checking && <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />}
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 12, lineHeight: 17 }}>
          Note: ONNX Runtime is a native module — on-device inference needs an Expo dev
          build. In Expo Go, or until a .onnx file is bundled, the app simply uses the
          server, with the same answers.
        </Text>
      </View>
    </ScrollView>
  );
}
