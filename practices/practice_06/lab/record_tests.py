"""Save baseline and security test results without hiding expected red tests."""

import argparse
import hashlib
import json
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


def identifiers(suite):
    for test in suite:
        if isinstance(test, unittest.TestSuite):
            yield from identifiers(test)
        else:
            yield test.id()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent.parent / "evidence" / "before")
    args = parser.parse_args()
    lab = Path(__file__).resolve().parent
    os.chdir(lab)
    # Original HTTP tests use urllib; keep loopback out of any system proxy.
    os.environ["NO_PROXY"] = "127.0.0.1,localhost"
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    clock = timezone(timedelta(hours=3))
    loader = unittest.defaultTestLoader
    baseline = loader.loadTestsFromNames(["test_http", "test_service"])
    security = loader.loadTestsFromName("test_security")
    groups = {"baseline": list(identifiers(baseline)), "security": list(identifiers(security))}
    started = datetime.now(clock).isoformat()
    with (out / "tests.log").open("w", encoding="utf-8") as log:
        result = unittest.TextTestRunner(stream=log, verbosity=2).run(unittest.TestSuite([baseline, security]))
    failed = {test.id() for test, _ in result.failures}
    errors = {test.id() for test, _ in result.errors}
    skipped = {test.id() for test, _ in result.skipped}
    summary = {"started_at_moscow": started, "finished_at_moscow": datetime.now(clock).isoformat(),
               "python": sys.version, "command": sys.argv, "working_directory": str(lab),
               "NO_PROXY": os.environ["NO_PROXY"], "tests_run": result.testsRun,
               "failures": len(result.failures), "errors": len(result.errors), "skipped": len(result.skipped),
               "expected_failures": len(result.expectedFailures), "exit_code": 0 if result.wasSuccessful() else 1,
               "groups": {}, "failed_test_ids": sorted(failed), "error_test_ids": sorted(errors),
               "source_sha256": {n: hashlib.sha256((lab / n).read_bytes()).hexdigest()
                                 for n in ("service.py", "sandbox.py")}}
    for name, ids in groups.items():
        summary["groups"][name] = {"tests": len(ids), "passed": sum(t not in failed | errors | skipped for t in ids),
                                   "failures": sum(t in failed for t in ids), "errors": sum(t in errors for t in ids),
                                   "skipped": sum(t in skipped for t in ids)}
    (out / "tests-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return summary["exit_code"]


if __name__ == "__main__":
    raise SystemExit(main())
