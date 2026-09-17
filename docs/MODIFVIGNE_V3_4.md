# ModifVigne v3.4: unchanged Python research adapter

## Exact source identity

The adapter runs byte-for-byte copies of the user's files. Nothing in the original `modifvigne/` folder is edited, formatted, renamed or imported. Other research versions in that folder are not used. Only the two selected files are copied into `vendor/modifvigne-v3-4/` for portable deployment:

| Original file | SHA-256 |
| --- | --- |
| `gabung_coba_coba_v3_4.py` | `bde33391750173f4c1b5e6825302976f62b7e09c49b2e594fa46411e43e42470` |
| `dekrip_v3_4.py` | `731bb01192d83e631a704df610fa56620dedb0d8ea62471703b55fbf2ea6b56b` |

The transport verifies both hashes before every invocation. Changes fail closed; there is no fallback cipher. Exports include source hashes and key distribution in the public algorithm configuration. Future source revisions require a separate version/adapter rather than silently changing existing experiments.

## Run in the application

Install Python 3 alongside the app's normal Node/pnpm prerequisites. No Python packages are required. Run the app from the repository root. The default executable is `python3`; set `ROR_PYTHON` to an absolute Python executable path if needed (not a command with arguments).

1. Open **New Experiment** or **Manual / Educational Mode**.
2. Select **ModifVigne v3.4 (original Python)**.
3. Optionally click **Check encryption / decryption** and download the independent fixture report.
4. Start the normal RoR experiment. AI, Random Baseline, manual queries, history, diagnostics and JSON/CSV export use the existing workflow. AI still requires a configured real OpenAI key/model. Baseline makes zero queries by design.

Command-line correctness report:

```bash
pnpm test:modifvigne
```

The report separately records recovered-byte equality, original tag verification and displayed-text equality. A byte/tag failure exits nonzero; the known Unicode display difference remains an explicit observation, not an algorithm fix. Fixtures use real OS randomness; each report is an observation of that execution, not exhaustive correctness or a security proof.

## What the bridge does, and what it preserves

The fixed local bridge imports the unchanged encryption module and calls `encrypt_v3_4(message, key)`. It never ports or replaces compression, salt generation, padding, state adjustment, keystream or byte arithmetic. The original calls to `os.urandom` run unchanged; no production monkeypatching or seeded substitute is used.

For the independent correctness check, the decryptor only has an interactive `__main__` entry point. The bridge runs that entire entry point using `runpy`, supplies its two `input()` answers (payload hex and key), captures its terminal output and reads its final `verified` and `pesanakhir` variables. It does not reimplement or repair the decryption flow. No captured stdout, intermediate state or key is sent to the UI. Correctness checks use separate fixed public fixtures and never access a Challenger/session key, database row or hidden world.

The app creates one secret **32-character Base64-alphabet string from 24 OS-random bytes (192 bits)** per round/session and passes that string unchanged as `kunci_str`. This is the experiment's explicit key distribution, not a claim that the algorithm has 192-bit security. The original accepts text keys and doubles short keys; generating a nonempty 32-character key avoids its empty-key infinite loop without modifying that code. The fixtures use their own fixed 32-character ASCII key. Results apply to this key distribution and these input limits, not all possible passwords or longer keys.

## Oracle definition

- Kind: `ENCRYPTION_ROR`.
- Inputs: valid UTF-8, including empty text, NULs and line breaks; maximum **127 decoded bytes**. Hex/Base64 are accepted when they decode to valid UTF-8. Bytes round-trip through strict UTF-8 without normalization or replacement. Invalid UTF-8/oversize inputs are rejected identically in both worlds before spending a query.
- REAL: execute the original encryption function, then expose slices of its returned payload without modification.
- RANDOM: independent uniform bytes for the same three fields; no encryption or plaintext padding is substituted into REAL.

| Field, in original payload order | Length |
| --- | --- |
| `tag` | 128 bytes |
| `salt` | 32 bytes |
| `ciphertext` | `128 * (floor(inputBytes / 128) + 1)` bytes |

Concatenating these three field values reconstructs the original payload exactly. Aligned and empty inputs still get the original full padding block. Every accepted query (0–127 input bytes) returns 288 bytes. A historical 128-byte query returned 416 bytes; new queries of that length are rejected. The browser's hex/Base64 encoding is presentation only.

Seeded mode is disabled for this adapter and rejected by the server, preserving original Python randomness. Built-in AES/HMAC seeded experiments are unaffected. Each fresh process also isolates the source's global `IV` between queries, and the function's own reset runs unchanged.

## Preserved observed behavior

Encryption uses `.encode()` (UTF-8), while the original decryptor uses `.decode('latin-1')` for display. Unicode inputs can recover identical original bytes and pass tag verification while displaying different text. The report shows this distinction. We have not changed the decoder to UTF-8 or altered either source file.

## Isolation and limits

Only the pinned local bridge can execute; callers cannot select scripts or file paths. Secret keys travel over stdin, never process arguments, logs, browser responses or model tools. The child receives no OpenAI credential/master-key environment. Python runs with `-I -B`, without writing bytecode caches. Calls have a 10-second hard process timeout and 32 KiB output limit; errors are sanitized. Runtime/hash health is checked in both worlds. Unavailable Python fails the affected batch without reveal, while the worker remains available for other queued algorithms. The 127-byte input cap bounds synchronous execution inside the existing atomic query transaction. This is a local/self-hosted research integration, not a general Python sandbox or timing-side-channel experiment.

Python timing, decryption validity and private intermediate values are not added to oracle responses. The model receives the public construction description/configuration and normal query transcript only. The independent fixture report cannot distinguish a session's hidden world.

## Verification

Automated coverage includes pinned source checksums; empty/ASCII/NUL/Unicode/64/126/127-byte correctness fixtures through the original decryptor; field/length equivalence; invalid input/seeded rejection; API whitelisting; public export blindness; missing-runtime sanitization; manual browser lifecycle and autonomous batch lifecycle with the controlled test provider. Existing AES/HMAC regressions remain required. Live OpenAI testing is separate from these deterministic provider tests.

## Input policy update — 17 September 2026

At the first policy update, new oracle queries accepted at most 128 decoded bytes (not characters), in both worlds and every encoding. New public configurations/exports record `maxInputBytes: 128`. Historical completed transcripts, including the earlier 1024-byte study, remain unchanged; missing this configuration field in older records denotes the earlier policy. The Python sources and their padding remain unchanged: exactly 128 bytes of input still produces 256 ciphertext bytes because a full padding block is added. Independent correctness fixtures now stay within the same input cap.

## Follow-up input policy — 127-byte maximum

The current maximum is **127 decoded payload bytes**, including for existing active sessions. New configurations record `maxInputBytes: 127`; previous completed 128-byte/1024-byte transcripts remain intact. Exactly 127 bytes receives one original padding byte, yielding 128 ciphertext bytes. The caller supplies the payload; the Challenger creates and holds the secret key. Salt is generated internally by the unchanged original function, never supplied or overridden by the caller. All fixture inputs now fit the 127-byte cap.
