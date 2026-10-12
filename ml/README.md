# On-device model — quantized MiniLM embedder

RAGnosis retrieves knowledge-base passages with `all-MiniLM-L6-v2`
embeddings. The server runs the PyTorch model; the **mobile app runs this
quantized ONNX export on-device**, so report-text embedding (and therefore
passage retrieval) works without a network round-trip.

## Artifacts (`ml/artifacts/`)

| File | Size | Role |
|---|---|---|
| `minilm-fp32.onnx` | 90.4 MB | Full-precision ONNX export (reference) |
| `minilm-int8.onnx` | **23.0 MB** | **On-device artifact** — dynamic int8, per-channel weight scales |
| `tokenizer/` | ~0.7 MB | WordPiece tokenizer files for the host runtime |
| `model.json` | — | Machine-readable metadata (sizes, parity, latency) |

## Measured results (this machine, CPU, batch of 1)

| | PyTorch fp32 | ONNX fp32 | ONNX int8 (shipped) |
|---|---|---|---|
| Size | ~90 MB | 90.4 MB | **23.0 MB (−75%)** |
| Latency / embedding | 21.9 ms | 5.6 ms | **4.0 ms** |
| Cosine vs PyTorch reference | 1.0 | 1.0000 | **0.9929** |
| Retrieval top-1 agreement | — | — | **1.0** (12-sentence probe corpus) |

Acceptance gates in `export_onnx.py`: fp32 parity cosine > 0.999,
int8 parity cosine ≥ 0.98, retrieval top-1 agreement = 1.0.
Note: plain per-tensor dynamic int8 measured only 0.966 cosine —
**per-channel weight scales** are what recover parity (0.9929) at the
same 23 MB size.

## Reproduce

```bash
python ml/export_onnx.py   # needs: torch, sentence-transformers, onnx, onnxruntime
```

## Host-runtime contract (mobile)

The ONNX graph is the transformer only. The host must:
1. Tokenize with `artifacts/tokenizer/` (WordPiece, max 256 tokens).
2. Run the model with `input_ids`, `attention_mask`, `token_type_ids` (int64).
3. Mean-pool `last_hidden_state` over the attention mask and L2-normalize
   → a 384-dim embedding, identical in construction to the server's.

`mobile/src/services/ondevice.ts` implements this against
`onnxruntime-react-native`; `mobile/assets/` carries a bundled copy of the
int8 artifact + `model.json`. If the model can't load (e.g. Expo Go, which
lacks the native module), the app falls back to server mode — embedding
requests go to the API instead. The deterministic analysis pipeline
(extraction, classification, scoring) is unaffected either way: it never
depended on embeddings.
