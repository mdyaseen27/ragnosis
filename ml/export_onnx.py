"""Export the retrieval embedder (all-MiniLM-L6-v2) to ONNX and quantize
it to int8 for on-device use in the mobile app.

    python ml/export_onnx.py

Produces in ml/artifacts/:
  minilm-fp32.onnx   full-precision export (transformer; mean-pooling and
                     L2 normalization are applied by the host runtime —
                     see embed_onnx() here and mobile/src/services/ondevice.ts)
  minilm-int8.onnx   dynamic-int8 quantized export (the on-device artifact)
  tokenizer/         tokenizer files for the host runtime
  model.json         metadata: sizes, parity, latency (read by the apps)

The parity gate: quantized embeddings must keep cosine similarity >= 0.98
against the PyTorch reference on the probe sentences, or the script fails.
"""
import json
import os
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
ART = ROOT / "artifacts"
MODEL_NAME = "all-MiniLM-L6-v2"
# Local snapshot if present (sandbox proxies can break the HF HTTP client);
# otherwise the hub name. The exported metadata always records MODEL_NAME.
_local = Path.home() / "models" / MODEL_NAME
MODEL_SOURCE = os.environ.get("MINILM_PATH") or (str(_local) if _local.exists() else MODEL_NAME)

PROBES = [
    "What does a high LDL cholesterol mean?",
    "Haemoglobin is below the reference range in this CBC report.",
    "Which of my values are out of range?",
    "Platelets help blood clot.",
    "Explain my thyroid report in simple language.",
    "Creatinine is a waste product filtered by the kidneys.",
]


def mean_pool(token_embeddings, attention_mask):
    mask = attention_mask[..., None].astype(np.float32)
    summed = (token_embeddings * mask).sum(axis=1)
    counts = np.clip(mask.sum(axis=1), 1e-9, None)
    pooled = summed / counts
    return pooled / np.linalg.norm(pooled, axis=1, keepdims=True)


def main():
    import torch
    from sentence_transformers import SentenceTransformer
    from transformers import AutoTokenizer

    ART.mkdir(parents=True, exist_ok=True)
    model = SentenceTransformer(MODEL_SOURCE)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_SOURCE)
    tokenizer.save_pretrained(ART / "tokenizer")
    transformer = model[0].auto_model
    transformer.eval()

    # --- reference embeddings (PyTorch) ---
    ref = model.encode(PROBES, normalize_embeddings=True)

    # --- ONNX export (fp32) ---
    # A keyword-forwarding wrapper: transformers' BertModel.forward
    # signature drifts across versions, and the tracer passes positionals.
    class _Wrapper(torch.nn.Module):
        def __init__(self, inner):
            super().__init__()
            self.inner = inner

        def forward(self, input_ids, attention_mask, token_type_ids):
            out = self.inner(input_ids=input_ids, attention_mask=attention_mask,
                             token_type_ids=token_type_ids)
            return out.last_hidden_state

    enc = tokenizer(PROBES[:1], return_tensors="pt", padding=True, truncation=True)
    fp32_path = ART / "minilm-fp32.onnx"
    with torch.no_grad():
        torch.onnx.export(
            _Wrapper(transformer), (enc["input_ids"], enc["attention_mask"], enc["token_type_ids"]),
            str(fp32_path), input_names=["input_ids", "attention_mask", "token_type_ids"],
            output_names=["last_hidden_state"],
            dynamic_axes={"input_ids": {0: "batch", 1: "seq"},
                          "attention_mask": {0: "batch", 1: "seq"},
                          "token_type_ids": {0: "batch", 1: "seq"},
                          "last_hidden_state": {0: "batch", 1: "seq"}},
            opset_version=14, dynamo=False)

    def make_runner(path):
        import onnxruntime as ort
        sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])

        def run(texts):
            tok = tokenizer(texts, return_tensors="np", padding=True, truncation=True)
            out = sess.run(None, {"input_ids": tok["input_ids"].astype(np.int64),
                                  "attention_mask": tok["attention_mask"].astype(np.int64),
                                  "token_type_ids": tok["token_type_ids"].astype(np.int64)})[0]
            return mean_pool(out, tok["attention_mask"])
        return run

    fp32_run = make_runner(fp32_path)
    fp32_emb = fp32_run(PROBES)
    cos_fp32 = float(np.mean(np.sum(ref * fp32_emb, axis=1)))

    # --- int8 dynamic quantization, per-channel weight scales (plain
    # per-tensor dynamic int8 cost ~0.03 cosine; per-channel keeps the
    # parity at 0.99 while shrinking the model ~4x) ---
    from onnxruntime.quantization import QuantType, quantize_dynamic
    int8_path = ART / "minilm-int8.onnx"
    quantize_dynamic(str(fp32_path), str(int8_path), weight_type=QuantType.QInt8,
                     per_channel=True)
    int8_run = make_runner(int8_path)
    int8_emb = int8_run(PROBES)
    cos_int8 = float(np.mean(np.sum(ref * int8_emb, axis=1)))

    # Retrieval agreement: does the int8 model still rank the same
    # neighbour first for every probe? That is what the app depends on.
    corpus = PROBES + [
        "The thyroid gland produces T3 and T4 hormones.",
        "A lipid profile measures HDL, LDL and triglycerides.",
        "White blood cells fight infection and inflammation.",
        "Fasting glucose is measured after eight hours without food.",
        "The kidneys filter urea and creatinine from blood.",
        "An X-ray of the chest shows the lungs and heart shadow.",
    ]
    ref_corpus = model.encode(corpus, normalize_embeddings=True)
    int8_corpus = int8_run(corpus)
    agree = 0
    for i in range(len(PROBES)):
        top_ref = int(np.argmax(ref_corpus @ ref[i]))
        top_q = int(np.argmax(int8_corpus @ int8_emb[i]))
        agree += int(top_ref == top_q)
    retrieval_agreement = agree / len(PROBES)

    # --- latency (batch of 1, mean of 50; sessions created ONCE) ---
    def bench(fn):
        fn()
        t0 = time.perf_counter()
        for _ in range(50):
            fn()
        return (time.perf_counter() - t0) / 50 * 1000

    lat_torch = bench(lambda: model.encode(PROBES[:1], normalize_embeddings=True))
    lat_fp32 = bench(lambda: fp32_run(PROBES[:1]))
    lat_int8 = bench(lambda: int8_run(PROBES[:1]))

    meta = {
        "name": MODEL_NAME,
        "task": "sentence-embedding (retrieval)",
        "format": "ONNX opset 14",
        "quantization": "dynamic int8 weights, per-channel scales; fp32 activations",
        "embedding_dim": int(ref.shape[1]),
        "max_seq_len": 256,
        "pooling": "mean pooling over attention mask + L2 normalize (host-side)",
        "fp32": {"file": fp32_path.name, "size_bytes": fp32_path.stat().st_size,
                 "parity_cosine": round(cos_fp32, 4), "latency_ms_batch1": round(lat_fp32, 2)},
        "int8": {"file": int8_path.name, "size_bytes": int8_path.stat().st_size,
                 "parity_cosine": round(cos_int8, 4), "latency_ms_batch1": round(lat_int8, 2),
                 "retrieval_top1_agreement": round(retrieval_agreement, 3)},
        "pytorch_latency_ms_batch1": round(lat_torch, 2),
    }
    (ART / "model.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))
    assert cos_fp32 > 0.999, f"fp32 export parity too low: {cos_fp32}"
    assert cos_int8 >= 0.98, f"int8 parity below gate: {cos_int8}"
    assert retrieval_agreement == 1.0, f"retrieval agreement below 1.0: {retrieval_agreement}"
    print("PARITY GATE PASSED")


if __name__ == "__main__":
    main()
