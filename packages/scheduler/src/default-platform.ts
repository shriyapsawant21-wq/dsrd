import { KubernetesProofObserver, WorkloadProofObserver } from "@dsrd/proof";
import { KubectlKubernetesExecutor, KubectlKubernetesResourceDiscovery, KubernetesExecutionPlatform, LocalProcessExecutionPlatform, NodeCommandRunner } from "@dsrd/runtime";
import type { ExecutionPlatform, Workload } from "@dsrd/contracts";

export function createDefaultPlatform(): ExecutionPlatform {
  const local = new LocalProcessExecutionPlatform({ observer: new WorkloadProofObserver() });
  const runner = new NodeCommandRunner();
  let workloads: Workload[] = [];
  const kubernetes = new KubernetesExecutionPlatform({
    discovery: new KubectlKubernetesResourceDiscovery({ runner }),
    executorFor: (target) => new KubectlKubernetesExecutor({
      target,
      runner,
      observer: new KubernetesProofObserver(() => workloads),
    }),
  });
  return {
    async discover(target) {
      const result = target.platform === "kubernetes" ? await kubernetes.discover(target) : await local.discover(target);
      if (target.platform === "kubernetes") workloads = result;
      return result;
    },
    reset: (target) => target.platform === "kubernetes" ? kubernetes.reset(target) : local.reset(target),
    async run(target, schedule) {
      if (target.platform === "kubernetes") await this.discover(target);
      return target.platform === "kubernetes" ? kubernetes.run(target, schedule) : local.run(target, schedule);
    },
    async replay(target, schedule) {
      if (target.platform === "kubernetes") await this.discover(target);
      return target.platform === "kubernetes" ? kubernetes.replay(target, schedule) : local.replay(target, schedule);
    },
  };
}
