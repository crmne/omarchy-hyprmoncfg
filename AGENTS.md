# Repository guidance

## Validation

Before committing a change, run:

```sh
node --test tests/model.test.js
qmllint *.qml
QT_QUICK_BACKEND=software /usr/lib/qt6/bin/qmltestrunner -platform offscreen -input tests/qml
omarchy plugin validate .
git diff --check
```

## Release process

1. Use the next semantic version. Never move or replace a published tag.
2. Update `manifest.json` and commit all release changes on `main`.
3. Run the full validation commands above.
4. Push `main`, tag the exact release commit as `v<version>`, and push the tag.
5. Confirm the Release workflow completed and the GitHub release exists.
6. Open a new verification issue in `omacom/omarchy-plugin-marketplace` using the verification form. Choose `Verify and publish a newer upstream commit`, keep the form headings unchanged, and target the full 40-character release commit SHA.
7. Confirm the marketplace automation accepts the exact commit. Respond to review findings before considering the release complete.
