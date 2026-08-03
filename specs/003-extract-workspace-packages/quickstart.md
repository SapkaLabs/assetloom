# Quickstart: Verify Workspace Extraction

```sh
yarn install --immutable
yarn build
yarn lint
yarn typecheck
yarn test
yarn pack:smoke
```

Expected: all five workspaces build in topological order; architecture tests find no cycles, forbidden edges, private imports, or misplaced CLI code; the pack smoke installs all five tarballs and imports their public roots.
