#!/usr/bin/env python3
"""Mutation check: do the new tests fail when the code they guard is broken?

Applies one small change at a time to a source file, runs the test command and
expects it to FAIL (the mutation is "killed"). A mutation after which the tests
still pass "survived": the tests do not guard that behaviour.

    python3 .claude/skills/review-a-copilot-pr/mutation-check.py mutations.json \
        --build "npx tsdown" -- npm run test:only -- test/unit/MyNewThing.test.js

mutations.json is a list of objects:

    [{"name": "drop the realm check",
      "file": "src/ops/WidgetOps.ts",
      "find": "if (!realm) return false;",
      "replace": "if (false) return false;"}]

`find` must occur exactly once in the file, so the script never guesses. Every
file is restored from memory after each run (also on Ctrl-C or a crash) and the
script verifies at the end that no touched file differs from before. Do not edit
the repository while it runs. Exit status: 0 all killed, 1 some survived,
2 bad input.
"""
import hashlib
import json
import signal
import subprocess
import sys


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def run(cmd, shell):
    return subprocess.run(
        cmd, shell=shell, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    ).returncode


def main(argv):
    if "--" not in argv or len(argv) < 4:
        print(__doc__)
        return 2
    split = argv.index("--")
    head, test_cmd = argv[1:split], argv[split + 1 :]
    build = None
    if "--build" in head:
        build = head[head.index("--build") + 1]
        head = [a for a in head if a not in ("--build", build)]
    if len(head) != 1 or not test_cmd:
        print(__doc__)
        return 2
    with open(head[0]) as f:
        mutations = json.load(f)

    originals = {}
    for m in mutations:
        if m["file"] not in originals:
            with open(m["file"], encoding="utf-8") as f:
                originals[m["file"]] = f.read()
    hashes = {p: sha(p) for p in originals}

    def restore():
        for path, text in originals.items():
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)

    def on_signal(signum, frame):
        restore()
        sys.exit(130)

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    # Baseline: the tests must pass before anything is broken.
    if build and run(build, True) != 0:
        print("baseline build failed")
        return 2
    if run(test_cmd, False) != 0:
        print("baseline tests fail: fix that first, a mutation check needs green tests")
        return 2

    results = []
    try:
        for m in mutations:
            text = originals[m["file"]]
            name = m.get("name") or f'{m["file"]}: {m["find"][:40]}'
            if text.count(m["find"]) != 1:
                results.append((name, "INVALID (find must occur exactly once)"))
                continue
            with open(m["file"], "w", encoding="utf-8") as f:
                f.write(text.replace(m["find"], m["replace"], 1))
            try:
                if build and run(build, True) != 0:
                    results.append((name, "killed (build breaks)"))
                    continue
                code = run(test_cmd, False)
                results.append((name, "killed" if code != 0 else "SURVIVED"))
            finally:
                restore()
    finally:
        restore()
        if build:
            run(build, True)  # leave dist/ matching the restored source

    for path, digest in hashes.items():
        if sha(path) != digest:
            print(f"ERROR: {path} differs from before the run; check git diff")
            return 2

    width = max(len(n) for n, _ in results) if results else 0
    for name, verdict in results:
        print(f"{name.ljust(width)}  {verdict}")
    survivors = [n for n, v in results if v == "SURVIVED" or v.startswith("INVALID")]
    killed = len(results) - len(survivors)
    print(f"\n{killed} of {len(results)} mutations killed")
    return 1 if survivors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
