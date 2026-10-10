import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function validateContribution(bytes) {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export function validateDocumentation(path, bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!text.trim() || text.includes("\0")) {
    throw new Error(`${path}: documentation must be nonempty UTF-8 text without NUL bytes`);
  }
  if (/^manual-test-.*\.md$/u.test(basename(path))) {
    if (!/^# TEST ONLY:/mu.test(text)) {
      throw new Error(`${path}: manual test documentation needs an explicit TEST ONLY heading`);
    }
    const disclosure = text.match(/^## AI disclosure[^\S\r\n]*\r?\n([\s\S]*?)(?=^#{1,6} |$(?![\s\S]))/mu)?.[1];
    if (!disclosure?.trim() || !/\bCodex\b/u.test(disclosure)) {
      throw new Error(`${path}: disclose Codex assistance in an AI disclosure section`);
    }
  }
}

export function validateFixture(root, baseSha, headSha) {
  for (const sha of [baseSha, headSha]) {
    if (!/^[a-f0-9]{40}$/u.test(sha ?? "") || /^0{40}$/u.test(sha)) {
      throw new Error("Validation requires concrete base and head commit SHAs");
    }
  }
  validateContribution(readFileSync(resolve(root, "fixtures/contribution.json")));
  const paths = execFileSync(
    "git",
    ["diff", "--diff-filter=ACMR", "--name-only", "-z", baseSha, headSha],
    { cwd: root, encoding: "utf-8" },
  ).split("\0").filter((path) => /\.md$/iu.test(path));
  for (const path of paths) {
    const absolute = resolve(root, path);
    if (!lstatSync(absolute).isFile()) {
      throw new Error(`${path}: changed documentation must be a regular file`);
    }
    validateDocumentation(path, readFileSync(absolute));
  }
  console.log(`Validated contribution JSON and ${paths.length} changed Markdown file(s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  validateFixture(process.cwd(), process.env.BASE_SHA, process.env.HEAD_SHA);
}
