# Statistical methods

Real or Random Lab calculates diagnostics from public transcript bytes and guessing statistics from completed experiments. These empirical measurements do not replace formal cryptanalysis or prove cryptographic security. High empirical entropy, a large binomial p-value, and an observed success rate near 50% are not security guarantees.

## Public transcript diagnostics

All raw response fields contribute bytes, including public nonces and authentication tags. Hex characters are decoded before counting; text previews and encoding overhead do not contribute. Input identity uses the canonical base64 encoding of decoded bytes, so UTF-8, hex, and base64 presentations of the same input count together.

- **Unique inputs:** number of different decoded byte strings.
- **Repeated inputs:** total queries minus unique inputs; each observation after an input's first occurrence counts once.
- **Duplicate outputs:** total queries minus distinct complete responses. Field names, byte lengths, boundaries, and byte values define complete response identity; hex letter case is irrelevant.
- **Repeated inputs stable:** every repeat of the same input matches its first complete response. This is true when there are no repeated inputs. Stable repeats are expected in both PRF worlds. Encryption responses can vary when plaintext repeats.
- **Frequency distribution:** 256 counts, indexed by byte value from 0 to 255.
- **Empirical Shannon entropy:** `H = -sum(p_i * log2(p_i))`, measured in bits per byte. Zero-count terms are omitted. This plug-in estimate depends strongly on sample size and can be high even for predictable data.
- **Mean byte value:** sum of unsigned byte values divided by output byte count.
- **Most/least frequent observed byte:** minima exclude unobserved bytes. Ties choose the smallest unsigned byte value.
- **Printable fraction:** fraction of bytes in inclusive ASCII range `0x20..0x7e`; control bytes and DEL are excluded. This is a byte diagnostic, not a UTF-8 text validity test.

With no output bytes, entropy and printable fraction are zero by convention; mean and most/least observed bytes are `null`. Counts and the histogram remain zero. An empty input remains a valid distinct byte string.

## Guessing statistics

Only `COMPLETED` experiments count toward sample size `N`. Active and aborted experiments are excluded from every group, query bucket, and cumulative point.

For `C` correct guesses:

```text
observed success probability = C / N
empirical advantage = abs(2 * C / N - 1)
incorrect guesses = N - C
```

This advantage convention is symmetric: consistently incorrect guesses also produce a high empirical advantage because reversing the guess labels would improve success. Small samples can produce extreme values by chance.

### Wilson 95% confidence interval

The implementation uses `z = 1.959963984540054` and the Wilson score interval:

```text
d = 1 + z²/N
center = (p + z²/(2N)) / d
radius = z * sqrt(p(1-p)/N + z²/(4N²)) / d
interval = [max(0, center-radius), min(1, center+radius)]
```

An interval describes sampling uncertainty under the binomial model. It does not account for changes in a person's guessing strategy, dependent trials, optional stopping, or comparisons chosen after observing the results.

### Exact two-sided binomial test

The null hypothesis is independent guesses with success probability `p = 0.5`. Symmetry gives:

```text
k = min(C, N-C)
p-value = min(1, 2 * P(Binomial(N, 0.5) <= k))
```

The finite binomial distribution is evaluated by a recurrence starting at its mode, using relative probability mass and then normalization. This avoids the premature underflow of starting at `2^-N`, which would incorrectly return zero even for large, nearly balanced samples. The result uses JavaScript floating-point arithmetic; probabilities below the smallest representable value round to zero. No normal approximation or Monte Carlo simulation is used.

The p-value is not the probability that a cipher is secure or that the null hypothesis is true. Repeating the same seeded experiment does not provide independent trials; interpret such aggregates cautiously.

### Groups and charts

- Algorithm and experiment-kind groups each use the same formulas on their completed subset.
- Query buckets are `0`, `1–4`, `5–16`, `17–32`, `33–128`, and `129+`, inclusive and non-overlapping. Zero-query completed experiments are valid.
- Average and median count queries used before the final guess.
- Cumulative success is ordered by completion timestamp, with experiment ID breaking timestamp ties.
- Samples smaller than 20 completed experiments carry the small-sample flag. This threshold is a presentation warning, not a significance boundary.

For `N = 0`, success rate, advantage, Wilson interval, and p-value are `null`; average and median queries are zero. Charts must present absent rates as unavailable, not as observed zero success.

## Validation

`tests/unit/statistics.test.ts` covers constant and uniform byte distributions, known entropy values, byte identity across encodings, printable boundaries, empty data, response field boundaries, Wilson reference values, exact small binomial probabilities, large-sample numerical behavior, completed-only grouping, query bucket boundaries, cumulative ordering, and the advantage convention.
