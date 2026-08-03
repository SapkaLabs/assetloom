# Package Boundary Requirement Checklist

- [x] Does every required responsibility have one owning workspace? [Completeness, Plan §Workspace Structure]
- [x] Are direct and transitive forbidden dependency edges distinguishable? [Clarity, Contract]
- [x] Are source imports and manifest declarations both checked? [Coverage, FR-015]
- [x] Is the facade permitted to compose all packages without reverse edges? [Consistency, FR-004/FR-011]
- [x] Are declaration and runtime export targets required? [Completeness, FR-007]
- [x] Does packed verification avoid relying on workspace links? [Edge case, Research]
- [x] Is transitional compatibility code constrained to the facade? [Scope, Plan §Extraction Sequence]
- [x] Are all validation commands reproducible? [Traceability, Quickstart]
