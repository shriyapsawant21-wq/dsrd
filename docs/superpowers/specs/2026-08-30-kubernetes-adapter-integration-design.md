# Kubernetes Adapter Integration Design

## Goal

Complete C7 as an optional Kubernetes `ExecutionPlatform` path that proves a
real startup race through discovery, minimization, artifact serialization, and
deterministic replay on a disposable local cluster.

## Constraints

- Kubernetes is selected only by `TargetConfig.platform === "kubernetes"`.
- Compose and local-process tests, CLI paths, and dependencies do not require
  `kubectl`, a cluster, credentials, or kubeconfig data.
- The runtime adapter owns resource lifecycle and normalized observations.
- The proof layer alone classifies a run as pass or failure.
- The scheduler remains platform agnostic and calls the selected platform's
  `discover`, `run`, and `replay` methods.
- The fixture and namespace are disposable and no artifact stores credentials.

## Architecture

`KubernetesExecutionPlatform` discovers labelled Deployments, StatefulSets,
and Jobs using client-side `kubectl` rendering. It resets the fixture's
namespace-scoped resources, creates workload objects independently according
to the generic schedule, and collects resource state and container logs.

`KubernetesProofObserver` adapts those normalized observations to
`WorkloadProofObserver`. It emits only oracle-owned `RunResult` values;
`kubectl` lifecycle errors reject execution and are never converted into race
discoveries.

The scheduler receives a Kubernetes platform through the same injected
execution boundary used by Compose and local-process adapters. A Kubernetes
fixture exposes a normal startup path and a delayed-dependency path with a
machine-verifiable failed Job. Search saves a target-aware v2 artifact,
minimizes its single start delay, and replay calls `platform.replay` with the
saved target and minimized schedule.

## Verification

Unit tests use command and observer fakes. A local-Kind integration test is
explicitly gated by `KUBERNETES_C7_INTEGRATION=1`, so standard local and
Compose development remains cluster-free. When enabled, it validates:

1. normal schedule passes;
2. search finds an oracle-detected failed Job;
3. minimization does not add perturbations;
4. the artifact retains the Kubernetes target; and
5. replay reproduces the expected failure and cleanup removes the fixture
   namespace.
