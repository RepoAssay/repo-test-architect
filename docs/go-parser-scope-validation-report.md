# Go Parser-Scoped Binding Validation Report

This report records the first parser-backed Go hardening slice after adapter parity. It replaces file-wide shadow suppression with call-site scope checks only when a possible local binding makes an otherwise exact symbol relationship ambiguous. Candidate selection, package ownership, call shapes, evidence kinds, and evidence strengths are unchanged.

## Bounded Scope Model

The adapter keeps its Go-aware lexical scanner for call and type-construction shapes. A lazy pure-JavaScript `@lezer/go` parse supplies declaration and block ranges for ambiguous names; ordinary audits do not invoke `go list`, compile helper binaries, or execute repository code.

The scoped path covers function parameters and local short, `var`, `const`, and `type` declarations. A binding suppresses evidence only inside the function and nested block where it is visible. Consequently:

- a parameter or local declaration in one function no longer hides an exact same-package or imported call in another function
- a nested-block shadow does not hide a valid call after that block
- named and dot import aliases are checked at the exact function or type-construction site
- Testify aliases can be locally shadowed in one test without downgrading valid assertions in other tests from the same file
- module-local source dependency aliases use the same call-site rule

Only functions containing both a possible binding and a candidate use are parsed, and those functions are cached for the audit. A syntax error takes the conservative path and retains shadow suppression. Receiver type inference, reassignment tracking, helper assertions, interface dispatch, multi-callable cross-package ownership, and deeper data flow remain outside this slice.

## Regression And Live Results

The focused regression matrix covers same-package parameters, nested blocks, named external imports, Testify aliases, and module-local dependency aliases. Shadowed calls remain uncredited while valid calls outside the shadow scope are recovered.

Pinned TOML and Chi audits retain their candidate counts, relationship counts, assertion counts, and canonical digests. Their current three-run samples are `300 / 262 / 254` ms (median 262 ms) and `656 / 599 / 596` ms (median 599 ms), respectively.

River retains `6 / 47 / 10` untested, covered, and skipped targets plus 576 evidence relationships. Fourteen existing relationships in `client_test.go` and `producer_test.go` move from `called` to `asserted` because local variables named `require` are confined to unrelated functions. River now has 26 asserted relationships, and its three-run samples are `1129 / 1037 / 1024` ms (median 1037 ms). The normalized digest is `ef4ae3299b71bbd2ad38324b812fb845cf24d93241abad65c2982f7b681ba5ca`.

Zap remains `2 / 48 / 9` with 287 relationships, 56 asserted relationships, and digest `ef7f291da706cf6f59f0f73c9ada5c455e9914c81edac203491b9387874eba61`; its samples were `745 / 662 / 660` ms. Resty remains the negative control at `0 / 19 / 2`, 119 relationships, zero asserted relationships, and digest `1609fc14f89b36babe350822ca98737eaa321f0e409b7370a0b8be5eadaad487`; its samples were `1631 / 1594 / 1594` ms.

The generated 400-source/200-test fixture remains exactly 200 covered, 200 untested, and 200 evidence relationships. Its measured run was 347 ms inside the existing five-second ceiling. The new parser dependency is MIT-licensed, pure JavaScript, and the production dependency audit reports no known vulnerabilities.

The next parser slice adds exact receiver declaration identity and directly evidenced callable bodies. It intentionally changes the live relationship graphs by removing file-wide indirect leakage while recovering direct receiver calls; current counts and digests are recorded in the [Go Receiver And Callable Ownership Validation Report](go-callable-ownership-validation-report.md). The measurements above remain the historical local-shadow slice baseline.
