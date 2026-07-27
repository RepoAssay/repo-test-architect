# Go Test-Helper Receiver Validation Report

This report records exact statically typed test-helper receiver bindings against the existing Go pins: [`BurntSushi/toml`](https://github.com/BurntSushi/toml) at `c6d720d83547bb8d7afb067ba9df8bad0323e2d1`, [`go-chi/chi`](https://github.com/go-chi/chi) at `8b258c7bb28f97a5f2a856ff7ef962578fec9215`, [`riverqueue/river`](https://github.com/riverqueue/river) at `b6c733cf8699eeb825a0c719c6c81041817d87c9`, [`uber-go/zap`](https://github.com/uber-go/zap) at `5b81b37b81b8e2ed447a6f57991e372ee4fa5c8f`, and [`go-resty/resty`](https://github.com/go-resty/resty) at `503cee173b035791478d5c1f647f4202535591d0`.

## Retained Model

A unique, non-generic test helper can supply a concrete receiver only when its declared simple result list contains the exact source type and a direct `:=` call maps that result position to the local binding. Same-package helpers may live in another `_test.go` file because their top-level declaration belongs to the same Go package. External-package helpers remain same-file so the literal import-qualified return type is owned by the calling file. Parser-backed declaration identity rejects same-file and local shadows, and the receiver call must still resolve to the exact result binding.

The adapter does not inspect helper bodies or infer runtime values. Complex or grouped results, generic helpers, chains such as `client := testClient().Configure()`, aliases, interfaces, parameters, fields, ordinary assignment, cross-file external-package helpers, and helper assertions remain excluded. Receiver calls are indexed once per concrete binding so shared helpers do not multiply full-file method scans.

## Exact-Pin Results

| Repository | Candidates (`untested / covered / skipped`) | Relationships | Asserted | Samples (ms) | Median | Digest |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| TOML | `8 / 7 / 7` | 28 | 2 | `326 / 259 / 256` | 259 | `66badf372d16fbf101c350ebf23fd6b6e16609456158de38f3a9073f468e2538` |
| Chi | `15 / 22 / 10` | 68 | 4 | `320 / 240 / 235` | 240 | `9780f0686bdbbb77ffca2b83d1724ab0cb63093d2186d06ce9a5490d599dc361` |
| River | `6 / 47 / 10` | 284 | 17 | `1252 / 1147 / 1118` | 1147 | `4974785310a9d70ca93ee36e139e09707cedc6b65b7b1e530b738430bd8c86f9` |
| Zap | `1 / 49 / 9` | 259 | 40 | `759 / 645 / 635` | 645 | `7fd03ebfc28a9055f469ce08325843c7157b133ca09d264823399d8640442687` |
| Resty | `1 / 18 / 2` | 103 | 0 | `860 / 748 / 741` | 748 | `d0ae94f8883b7b48b72fc7c35922ea882196faa46072429a5815630e884fa247` |

TOML, Chi, River, and Zap remain byte-for-byte semantic controls. Resty keeps every candidate classification and adds exactly five direct `client.go` relationships from `context_test.go`, `curl_test.go`, `load_balancer_test.go`, `multipart_test.go`, and `retry_test.go`. Each file binds a `*Client` from the shared `dcnl` or `dcldb` helper before calling concrete client methods. The relationships remain `called`: Resty's local assertion helpers are intentionally outside the bounded assertion model.

## Remaining Boundary

The adapter still does not infer helper implementation behavior, helper-to-helper chains, direct chained results, aliases, interfaces, parameters, fields, generic or complex result types, cross-file external-package helper imports, helper assertions, or runtime reachability. Those gaps stay visible for Rust work to begin without turning the final Go slice into general type-flow analysis.
