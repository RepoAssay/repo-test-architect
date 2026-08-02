# Swift And Python Exact-Pin Phase Profile — August 2026

## Decision

Optimize Swift before Python, and keep both changes adapter-local.

The exact Swift Package Index Server baseline spends 14,187 ms of its 14,443 ms audit median in evidence classification and artifact assembly. A one-run CPU profile attributes 46.41% of samples to repeatedly scanning test import lines, with another 17.22% in Swift comment/string masking and 13.07% in symbol-usage analysis. Immutable per-test facts now derive normalized imports, masked code, local declarations, assertion bodies, and reusable identifier indexes once while preserving the existing target-qualified ownership checks. The exact-pin median falls to 725 ms with an unchanged canonical artifact.

The exact Django profile spends 2,488 ms of its 3,823 ms audit median in test parsing/indexing and 858 ms in evidence classification and artifact assembly. Its CPU profile is distributed across repeated Python masking, function parsing, import binding, fixture analysis, and framework-client analysis. An immutable parsed test/support-file index now reuses those lexical facts across runnable-test, fixture, import, and framework-client consumers without introducing a shared parser or weakening discovery boundaries. The exact-pin median falls to 2,129 ms with an unchanged canonical artifact.

Traversal is not an optimization target at either pin: its median is 17 ms for Swift and 154 ms for Django.

## Reproduction

Measurements ran on Darwin arm64 with an Apple M1 Pro and Node.js `v23.7.0`. Each checkout was detached at the full commit recorded in `evals/validation-corpus.json`; the corpus tool verified the checkout SHA, performed five audits, required one complete ordered phase set per audit, and rejected canonical artifact drift.

```powershell
npm run corpus:measure -- --case swift-package-index-server --checkout /path/to/pinned/swift-package-index-server --profile-phases
npm run corpus:measure -- --case python-django --checkout /path/to/pinned/django --profile-phases
```

The phase medians are calculated independently, so their rounded values need not sum exactly to the independently measured overall median.

## Swift Package Index Server

- repository: `SwiftPackageIndex/SwiftPackageIndex-Server`
- exact pin: `26943bfd3e62f29348e6a06722ba5fcd9dc11d58`
- repository snapshot: 964 files, 498 Swift files, approximately 14.7 MB
- audit samples: 14,900 / 14,520 / 14,410 / 14,424 / 14,443 ms
- audit median: 14,443 ms
- canonical audit: `73578ce9b98f0e1f3d688c0159bc7969d235cb27f73a8bc2be0f4bdccb7b5db8`
- artifact shape: 86 untested, 96 covered-but-risky, 168 skipped, 265 evidence relationships

| Phase | Five samples (ms) | Median | Share of overall median |
| --- | --- | ---: | ---: |
| Traversal and text read | 28 / 17 / 20 / 16 / 16 | 17 ms | 0.1% |
| Project and build ownership | 216 / 186 / 185 / 162 / 167 | 185 ms | 1.3% |
| Source discovery and index | 70 / 68 / 69 / 73 / 72 | 70 ms | 0.5% |
| Test parsing and index | 8 / 0 / 0 / 1 / 1 | 1 ms | less than 0.1% |
| Evidence classification and artifact | 14,578 / 14,248 / 14,135 / 14,173 / 14,187 | 14,187 ms | 98.2% |

The phase boundary exposes the problem clearly: `testFiles` currently contains only path/content records, so `findExistingTestEvidence` recomputes owner imports and symbol-search inputs while iterating source/test pairs. A high-frequency one-run V8 CPU profile confirms that shape:

| Self-sampled work | CPU samples |
| --- | ---: |
| test import-line regular-expression scan | 46.41% |
| `maskSwiftCommentsAndStrings` | 17.22% |
| `findSwiftSymbolUsage` | 13.07% |
| imported-module capture regular expression | 7.71% |

These figures are directional CPU samples rather than portable benchmarks. They identify repeated work; the five-run phase medians remain the acceptance baseline.

### Bounded Swift optimization

Complete: adapter-local immutable test records are built once before the evidence phase. The cache contains only facts already derived from each test's unchanged content and path; the existing `sourceGraph` still owns source/test eligibility, and source-specific symbol uniqueness remains outside the cache. A regression distinguishes an extension of an imported source type from an actual test-local declaration because the former remains valid top-level symbol evidence while still blocking unsafe extension-member receiver inference.

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Exact-pin audit median | 14,443 ms | 725 ms | 95.0% lower |
| Test parsing/index median | 1 ms | 62 ms | expected cache-construction shift |
| Evidence/classification median | 14,187 ms | 407 ms | 97.1% lower |
| Generated 400-source/200-test audit | 439 ms | 81 ms | 81.5% lower |

The exact-pin after samples are 814 / 751 / 722 / 720 / 725 ms. They retain 86 untested, 96 covered-but-risky, 168 skipped, 265 evidence relationships, and canonical SHA-256 `73578ce9b98f0e1f3d688c0159bc7969d235cb27f73a8bc2be0f4bdccb7b5db8`.

Acceptance adds to the standing gates:

- canonical exact-pin SHA remains `73578ce9b98f0e1f3d688c0159bc7969d235cb27f73a8bc2be0f4bdccb7b5db8`
- candidate, skipped, and 265 evidence-relationship counts remain unchanged
- focused positive and negative symbol/owner tests remain byte-identical
- same-machine five-run median improves materially and does not regress by more than 10% — met at 95.0% lower

## Django

- repository: `django/django`
- exact pin: `dca76b15c62a1118325b71678ce3235e2231198d`
- repository snapshot: 7,073 files, 2,927 Python files, approximately 46.7 MB
- audit samples: 3,961 / 3,884 / 3,794 / 3,788 / 3,823 ms
- audit median: 3,823 ms
- canonical audit: `541ccfb9779cdd34a9d9d2c338d97117770160f2ff456646b6b625d5d496e222`
- artifact shape: 104 untested, 400 covered-but-risky, 197 skipped, 4,935 evidence relationships

| Phase | Five samples (ms) | Median | Share of overall median |
| --- | --- | ---: | ---: |
| Traversal and text read | 173 / 154 / 149 / 147 / 186 | 154 ms | 4.0% |
| Project and build ownership | 192 / 186 / 184 / 185 / 191 | 186 ms | 4.9% |
| Source discovery and index | 127 / 115 / 115 / 115 / 114 | 115 ms | 3.0% |
| Test parsing and index | 2,517 / 2,491 / 2,488 / 2,486 / 2,475 | 2,488 ms | 65.1% |
| Evidence classification and artifact | 951 / 938 / 858 / 855 / 857 | 858 ms | 22.4% |

The test phase initially parses runnable test records, then fixture and framework-client collectors derive overlapping masks, functions, and imports from the same test/support content. The one-run V8 CPU profile shows the residual cost spread across this repeated lexical work:

| Self-sampled work | CPU samples |
| --- | ---: |
| `maskPythonCommentsAndStrings` | 11.66% |
| `parsePythonFunctions` | 10.44% |
| `collectPythonModuleImportBindings` | 5.71% |
| from-import regular-expression scan | 5.20% |
| `maskPythonFunctionBlocks` | 4.71% |
| assertion regular-expression scan | 4.70% |
| `maskPythonStatement` | 4.68% |
| import regular-expression scan | 4.58% |

### Bounded Python optimization

Complete: an adapter-local immutable index keyed by normalized path stores each test/support file's masked content, function-block mask, parsed functions, and resolved import bindings. Runnable-test analysis, pytest fixture discovery, and framework-client evidence reuse those records. Pytest configuration, fixture visibility, source-layout ownership, Django URL ownership, client/route matching, and evidence strength decisions remain in their existing consumers.

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Exact-pin audit median | 3,823 ms | 2,129 ms | 44.3% lower |
| Test parsing/index median | 2,488 ms | 844 ms | 66.1% lower |
| Evidence/classification median | 858 ms | 843 ms | 1.7% lower |
| Generated 400-source/200-test audit | 50 ms | 47 ms | stable small-fixture noise |

The exact-pin after samples are 2,348 / 2,145 / 2,117 / 2,118 / 2,129 ms. They retain 104 untested, 400 covered-but-risky, 197 skipped, 4,935 evidence relationships, and canonical SHA-256 `541ccfb9779cdd34a9d9d2c338d97117770160f2ff456646b6b625d5d496e222`. All 13 checked-in Python example audits remain byte-identical to the pre-cache adapter. A focused regression drives one `conftest.py` through both fixture-source and framework-client consumers while proving a triple-quoted decoy import cannot create evidence.

Acceptance adds to the standing gates:

- canonical exact-pin SHA remains `541ccfb9779cdd34a9d9d2c338d97117770160f2ff456646b6b625d5d496e222`
- candidate, skipped, and 4,935 evidence-relationship counts remain unchanged
- pytest/unittest, fixture visibility, duplicate-root, and Django client-route negatives remain byte-identical
- same-machine five-run median improves materially and does not regress by more than 10% — met at 44.3% lower

## Architectural Consequence

Neither result supports a universal source/test parser or immediate Swift/Python adoption of the PHP/Elixir traversal helper. The performance opportunity is memoization of adapter-specific derived facts. Shared traversal remains a maintenance primitive, while parsing, owner qualification, framework interpretation, and evidence semantics remain adapter-owned.
