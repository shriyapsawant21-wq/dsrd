import { dirname, resolve } from "node:path";

import type { ExecutionPlatform, Schedule, TargetConfig, Workload } from "@dsrd/contracts";
import { ComposeProofObserver, KubernetesProofObserver, WorkloadProofObserver } from "@dsrd/proof";
import {
  ComposeExecutionPlatform,
  DockerComposeClient,
  DockerComposeServiceDiscovery,
  DockerRuntimeController,
  KubectlKubernetesExecutor,
  KubectlKubernetesResourceDiscovery,
  KubernetesExecutionPlatform,
  LocalProcessExecutionPlatform,
  NodeCommandRunner,
  SystemDelay,
} from "@dsrd/runtime";

export type PlatformRouterOptions = {
  localProcess: ExecutionPlatform;
  composeFor: (target: Extract<TargetConfig, { platform: "compose" }>) => ExecutionPlatform;
  kubernetes?: ExecutionPlatform;
};

export function createPlatformRouter(options: PlatformRouterOptions): ExecutionPlatform {
  const composePlatforms = new Map<string, ExecutionPlatform>();
  const platformFor = (target: TargetConfig): ExecutionPlatform => {
    switch (target.platform) {
      case "local-process":
        return options.localProcess;
      case "compose": {
        const existing = composePlatforms.get(target.composeFile);
        if (existing) return existing;
        const platform = options.composeFor(target);
        composePlatforms.set(target.composeFile, platform);
        return platform;
      }
      case "kubernetes":
        if (options.kubernetes) return options.kubernetes;
        throw new Error("Kubernetes support is not available until C7 is integrated");
    }
  };

  return {
    discover: async (target) => platformFor(target).discover(target),
    reset: async (target) => platformFor(target).reset(target),
    run: async (target, schedule) => platformFor(target).run(target, schedule),
    replay: async (target, schedule) => platformFor(target).replay(target, schedule),
  };
}

export function createDefaultPlatform(): ExecutionPlatform {
  const local = new LocalProcessExecutionPlatform({ observer: new WorkloadProofObserver() });
  const runner = new NodeCommandRunner();
  let kubernetesWorkloads: Workload[] = [];
  const kubernetes = new KubernetesExecutionPlatform({
    discovery: new KubectlKubernetesResourceDiscovery({ runner }),
    executorFor: (target) => new KubectlKubernetesExecutor({
      target,
      runner,
      observer: new KubernetesProofObserver(() => kubernetesWorkloads),
    }),
  });

  return createPlatformRouter({
    localProcess: local,
    composeFor: createComposePlatform,
    kubernetes: {
      discover: async (target) => {
        kubernetesWorkloads = await kubernetes.discover(target);
        return kubernetesWorkloads;
      },
      reset: (target) => kubernetes.reset(target),
      run: async (target, schedule) => {
        kubernetesWorkloads = await kubernetes.discover(target);
        return kubernetes.run(target, schedule);
      },
      replay: async (target, schedule) => {
        kubernetesWorkloads = await kubernetes.discover(target);
        return kubernetes.replay(target, schedule);
      },
    },
  });
}

function createComposePlatform(target: Extract<TargetConfig, { platform: "compose" }>): ExecutionPlatform {
  const composeFile = resolve(target.composeFile);
  const normalizedTarget = { platform: "compose" as const, composeFile };
  const projectDirectory = dirname(composeFile);
  const runner = new NodeCommandRunner();
  let workloads: Workload[] = [];
  const platform = new ComposeExecutionPlatform({
    discovery: new DockerComposeServiceDiscovery({ projectDirectory, runner }),
    executorFor: () => new DockerRuntimeController({
      compose: new DockerComposeClient({ projectDirectory, composeFile, runner }),
      delay: new SystemDelay(),
      observer: new ComposeProofObserver(() => workloads),
    }),
  });

  const prime = async (): Promise<void> => { workloads = await platform.discover(normalizedTarget); };
  return {
    discover: async () => { await prime(); return workloads; },
    reset: () => platform.reset(normalizedTarget),
    run: async (_target: TargetConfig, schedule: Schedule) => { await prime(); return platform.run(normalizedTarget, schedule); },
    replay: async (_target: TargetConfig, schedule: Schedule) => { await prime(); return platform.replay(normalizedTarget, schedule); },
  };
}
