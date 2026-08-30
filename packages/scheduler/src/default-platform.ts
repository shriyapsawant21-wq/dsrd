import { WorkloadProofObserver } from "@dsrd/proof";
import { LocalProcessExecutionPlatform } from "@dsrd/runtime";
import type { ExecutionPlatform } from "@dsrd/contracts";

export function createDefaultPlatform(): ExecutionPlatform {
  return new LocalProcessExecutionPlatform({ observer: new WorkloadProofObserver() });
}
