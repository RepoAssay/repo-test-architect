# Go Receiver And Callable Ownership Validation Report

This report records parser-backed receiver-binding identity and callable-body ownership against the existing exact Go pins: [`BurntSushi/toml`](https://github.com/BurntSushi/toml) at `c6d720d83547bb8d7afb067ba9df8bad0323e2d1`, [`go-chi/chi`](https://github.com/go-chi/chi) at `8b258c7bb28f97a5f2a856ff7ef962578fec9215`, [`riverqueue/river`](https://github.com/riverqueue/river) at `b6c733cf8699eeb825a0c719c6c81041817d87c9`, [`uber-go/zap`](https://github.com/uber-go/zap) at `5b81b37b81b8e2ed447a6f57991e372ee4fa5c8f`, and [`go-resty/resty`](https://github.com/go-resty/resty) at `503cee173b035791478d5c1f647f4202535591d0`.

## Retained Model

Receiver candidates remain limited to explicit concrete composite-literal bindings and exact result positions from simple concrete constructors. Each candidate now carries its declaration position. The parser resolves the binding visible at each method call, so a nested or unrelated same-named variable cannot suppress or claim that call. Reassignment preserves the statically fixed concrete Go type. Inline and one-hop assertion usage is also tied to the exact receiver-call position.

Direct test evidence is retained per uniquely owned function or receiver method instead of only per source file. A lazy full-file parse maps that callable to its body, and one-hop source evidence is emitted only when the dependency call occurs inside that directly exercised body. This supports multi-callable same-package and module-local caller files without copying a test path through sibling functions or methods. Import provenance, exported-symbol requirements, local shadow checks, unique dependency ownership, and the one-hop ceiling remain unchanged. Any parse error or ambiguous callable body withholds the edge.

## Exact-Pin Results

| Repository | Candidates (`untested / covered / skipped`) | Relationships | Asserted | Samples (ms) | Median | Digest |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| TOML | `8 / 7 / 7` | 28 | 2 | `314 / 252 / 245` | 252 | `66badf372d16fbf101c350ebf23fd6b6e16609456158de38f3a9073f468e2538` |
| Chi | `15 / 22 / 10` | 68 | 4 | `341 / 264 / 257` | 264 | `9780f0686bdbbb77ffca2b83d1724ab0cb63093d2186d06ce9a5490d599dc361` |
| River | `6 / 47 / 10` | 284 | 17 | `1131 / 1031 / 1011` | 1031 | `4974785310a9d70ca93ee36e139e09707cedc6b65b7b1e530b738430bd8c86f9` |
| Zap | `1 / 49 / 9` | 259 | 40 | `716 / 605 / 589` | 605 | `7fd03ebfc28a9055f469ce08325843c7157b133ca09d264823399d8640442687` |
| Resty | `1 / 18 / 2` | 98 | 0 | `729 / 696 / 694` | 696 | `49f718b98c778cd239a31ce0f30f845cdfa8b1d48447857ad60289c970b7fbb0` |

The candidate changes are bounded and reviewed. TOML's `type_fields.go` and `type_toml.go`, Chi's `middleware/terminal.go`, and Resty's `debug.go` lose only file-wide indirect evidence copied from unrelated callables. Zap's `internal/ztest/timeout.go` becomes covered through the directly asserted `zaptest.Timeout` body, which calls `ztest.Timeout`. River retains every candidate classification while dropping 292 net relationships that did not belong to the directly exercised callable.

The same pass recovers exact direct method evidence that the former file-wide receiver-name count suppressed. Reviewed examples include TOML metadata, key, position, and lexer methods; Chi mux, tree, and response-writer methods; River job-completer, producer, and test-worker methods; Zap clock, handler, encoder, field, and writer methods; and Resty client and response methods. New multi-callable dependency edges remain body-local; untested sibling bodies in the adversarial fixture do not propagate.

## Remaining Boundary

This slice does not infer interface dispatch, aliases, embedded promotion, parameter or field types, helper-return receivers, chained or generic constructors, direct composite-literal method calls, helper assertions, init-time ownership, cross-module calls, second-hop dependencies, or runtime reachability. Parser-backed body ownership proves lexical containment and exact static provenance; it does not claim that every path through the callable executes the dependency.
