# Contributing

Thank you for improving Factorio Lamp Editor. This repository intentionally has no open-source license, as explained in [LICENSE](LICENSE). Contact the maintainer before submitting substantial work so that the copyright terms for the contribution can be agreed explicitly.

For an approved contribution:

1. Create a focused branch from the current main branch.
2. Install dependencies with `npm ci`.
3. Keep media fixtures and generated artifacts out of Git; `release/`, `dist/`, and `node_modules/` are ignored.
4. Make the smallest coherent change and add or update validation scripts when logic changes.
5. Run `npm run lint`, `npm run build`, and `npm run test:ci`.
6. Describe user-visible behavior, Factorio-version assumptions, and blueprint-size impact in the pull request.

For UI changes, test both a narrow sidebar and a resized desktop sidebar. For blueprint changes, import a generated sample in Factorio 2.x whenever possible. Never commit copyrighted test media, generated portable executables, credentials, or private paths.

By submitting a contribution, you confirm that you have the right to submit your original work. Submission alone does not override the restrictions applying to upstream-derived code.
