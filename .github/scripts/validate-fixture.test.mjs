import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validateContribution, validateDocumentation, validateFixture } from "./validate-fixture.mjs";

test("keeps actual JSON parsing and rejects malformed or invalid UTF-8 fixtures", () => {
  assert.deepEqual(validateContribution(Buffer.from('{"revision":2}')), { revision: 2 });
  assert.throws(() => validateContribution(Buffer.from('{"revision":')));
  assert.throws(() => validateContribution(Buffer.from([0xff])));
});

test("ordinary documentation must be readable, nonempty and NUL-free", () => {
  assert.doesNotThrow(() => validateDocumentation("README.md", Buffer.from("# Sandbox\n")));
  for (const bytes of [Buffer.from(" \n"), Buffer.from("# text\0"), Buffer.from([0xff])]) {
    assert.throws(() => validateDocumentation("README.md", bytes));
  }
});

test("manual test documentation needs TEST labeling and a truthful AI disclosure", () => {
  const valid = "# TEST ONLY: walkthrough\n\n## AI disclosure\nCodex assisted this test.\n";
  assert.doesNotThrow(() => validateDocumentation("manual-test-20261010.md", Buffer.from(valid)));
  for (const text of [valid.replace("TEST ONLY:", "Achievement:"), valid.replace("## AI disclosure", "## Notes"), valid.replace("Codex", "Tool")]) {
    assert.throws(() => validateDocumentation("manual-test-20261010.md", Buffer.from(text)));
  }
  assert.throws(() => validateDocumentation("manual-test-20261010.md", Buffer.from("# TEST ONLY: Codex walkthrough\n\n## AI disclosure\n\n## Notes\nCodex assisted this test.\n")));
});

test("rejects unknown or injected git references before executing git", () => {
  for (const sha of [undefined, "main", "0".repeat(40), "HEAD; echo private"]) {
    assert.throws(() => validateFixture(".", sha, "a".repeat(40)), /concrete base and head/u);
  }
});

test("validates the actual git diff and rejects a malformed documentation-only revision", () => {
  const root = mkdtempSync(join(tmpdir(), "sandbox-validation-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "-q");
    git("config", "user.name", "Local validation fixture");
    git("config", "user.email", "validation@example.invalid");
    mkdirSync(join(root, "fixtures"));
    writeFileSync(join(root, "fixtures/contribution.json"), '{"revision":2}\n');
    git("add", ".");
    git("commit", "-qm", "Local base fixture");
    const base = git("rev-parse", "HEAD");
    const document = join(root, "manual-test-local.md");
    writeFileSync(document, "# TEST ONLY: local fixture\n\n## AI disclosure\nCodex assisted this synthetic test.\n");
    git("add", ".");
    git("commit", "-qm", "Local documentation fixture");
    assert.doesNotThrow(() => validateFixture(root, base, git("rev-parse", "HEAD")));
    writeFileSync(document, "# TEST ONLY: Codex fixture\n\n## AI disclosure\n\n## Notes\nCodex assisted.\n");
    git("add", ".");
    git("commit", "-qm", "Local invalid disclosure fixture");
    assert.throws(() => validateFixture(root, base, git("rev-parse", "HEAD")), /AI disclosure/u);
    writeFileSync(join(root, "fixtures/contribution.json"), "{");
    assert.throws(() => validateFixture(root, base, git("rev-parse", "HEAD")), SyntaxError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
