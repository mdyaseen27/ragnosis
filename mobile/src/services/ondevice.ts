// On-device inference service.
//
// Contract: assets/model.json (optional) describes a bundled, quantized
// ONNX embedding model (all-MiniLM-L6-v2, INT8). When a real .onnx file is
// listed there we try to open an ONNX Runtime session with it; embeddings
// for retrieval can then be computed on the phone, so report text does
// not have to leave the device for that step.
//
// Graceful degradation is the rule (repo AGENTS.md): the ONNX runtime is
// imported lazily, and ANY failure — no metadata, no bundled binary,
// runtime unavailable (e.g. Expo Go), load error — resolves to "server
// mode" with a human-readable reason. This module never throws.

// `require` is module-scoped under Metro; declared locally so the guarded
// optional-asset load type-checks with or without the file present.
declare const require: (id: string) => unknown;

export interface ModelMetadata {
  name?: string;
  task?: string;
  version?: string;
  format?: string;
  quantization?: string;
  embeddingDim?: number;
  sizeMb?: number;
  modelFile?: string | null;
  notes?: string;
}

export interface OnDeviceStatus {
  mode: 'device' | 'server';
  detail: string;
  metadata: ModelMetadata | null;
}

export function loadModelMetadata(): ModelMetadata | null {
  try {
    const raw = require('../../assets/model.json') as
      | ModelMetadata
      | { default?: ModelMetadata };
    const meta = (raw as { default?: ModelMetadata }).default ?? (raw as ModelMetadata);
    return meta && typeof meta === 'object' ? meta : null;
  } catch {
    return null;
  }
}

export async function getOnDeviceStatus(): Promise<OnDeviceStatus> {
  const metadata = loadModelMetadata();
  if (!metadata) {
    return {
      mode: 'server',
      metadata: null,
      detail:
        'No on-device model metadata found (assets/model.json is absent). Using server mode.',
    };
  }
  if (!metadata.modelFile) {
    return {
      mode: 'server',
      metadata,
      detail: `Model "${metadata.name ?? 'unknown'}" is described in assets/model.json, but no .onnx file is bundled yet. Using server mode.`,
    };
  }
  try {
    const ort = await import('onnxruntime-react-native');
    const session = await ort.InferenceSession.create(metadata.modelFile);
    // This is a capability probe, not a work session — release it.
    try {
      await session.release();
    } catch {
      // Releasing is best-effort.
    }
    return {
      mode: 'device',
      metadata,
      detail: `On-device model loaded (${metadata.name ?? 'ONNX'}, ${metadata.quantization ?? 'quantized'}). Embeddings run locally on this device.`,
    };
  } catch (e) {
    return {
      mode: 'server',
      metadata,
      detail: `On-device model failed to load (${e instanceof Error ? e.message : 'unknown error'}). Using server mode.`,
    };
  }
}
