# Testing and Verification

Run focused tests while implementing a task, then run workspace typecheck:

```bash
npx vitest run packages/contracts/test
npm run typecheck
```

For a full primary-checkout validation:

```bash
npm test
```

Compose integration is Docker-gated. A missing Docker prerequisite may skip a
dedicated integration; a present daemon followed by a target/setup failure must
be reported as a failure outcome, not skipped. Record active test counts only
for the current checkout—never include nested worktrees or build output.

Repository-search API tests verify that terminal SSE events retain tested
schedule counts and redacted diagnostics, then close for every terminal phase.

Run the opt-in Docker Compose conformance check when Docker Engine and the
Compose plugin are both available:

```bash
DSRD_DOCKER_CONFORMANCE=1 npx vitest run packages/runtime/test/compose.conformance.test.ts
```

The focused CLI suite covers checkout and pinned-Git onboarding, inspection,
replay, stable JSON terminal records, and malformed input. The API suite covers
asynchronous repository search, artifact persistence, report retrieval, replay,
and terminal SSE closure.

Kubernetes conformance is optional and requires `kubectl`, `kind`, and a
disposable Kind cluster. Select the `kind-dsrd-c7` context (or provide its
kubeconfig) and run:

```bash
KUBECONFIG=/path/to/kubeconfig KUBERNETES_C7_INTEGRATION=1 \
  npx vitest run packages/scheduler/src/kubernetes-kind.integration.test.ts
```

The fixture owns only the `dsrd-kubernetes-race` namespace and removes that
namespace after each test; it never creates or deletes the selected cluster.
The test is opt-in so ordinary unit and Compose development remains
cluster-free.
