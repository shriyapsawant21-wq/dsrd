# Checkpoint Prompt Index

Use exactly one fresh Codex session per assigned checkpoint. Every prompt requires Superpowers, reads the shared design/plan/status documents, runs a verification command, and updates `docs/checkpoints.md` on completion.

| Order | Prompt | Lead | Starts when | Completion handoff |
|---|---|---|---|---|
| 1 | [C0](C0.md) | Akil | immediately | C1, C2, C3 may begin after staging/review |
| 2 | [C1](C1.md) | Akil | C0 staged | wait for C2/C3, then C4 |
| 2 | [C2](C2.md) | Riya | C0 staged | wait for C1/C3, then C4 |
| 2 | [C3](C3.md) | Shriya | C0 staged | wait for C1/C2, then C4 |
| 3 | [C4](C4.md) | Team | C1-C3 integrated | C5 |
| 4 | [C5](C5.md) | Team | C4 complete | C6 |
| 5 | [C6](C6.md) | Riya/Shriya/Akil | C4/C5 stable | C7 admission review |
| 6 | [C7](C7.md) | Team | explicit Kubernetes admission | final platform checkpoint |
