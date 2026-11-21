"""Record Unicode input probes on owned disposable fixtures, preserving old evidence."""

import argparse
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from audit_support import LAB, LocalShop


def probe(shop, method, target, headers=None, raw=None):
    record = {"request": {"method": method, "target": target, "headers": headers or {},
                          "body_text": raw.decode("ascii") if raw is not None else None}}
    try:
        record["response"] = shop.call(method, target, headers=headers, raw=raw)
    except Exception as error:
        record["transport_error"] = {"type": type(error).__name__, "message": str(error)}
    return record


def collect():
    cases = []
    with LocalShop() as shop:
        alice, staff = shop.login(), shop.login("staff")
        probes = [probe(shop, "GET", "/reviews/view"),
                  probe(shop, "POST", "/reviews", alice, br'{"product":"chair","text":"\ud800"}')]
        probes.extend(probe(shop, "GET", target, headers) for target, headers in (
            ("/reviews/view", {}), ("/assistant/context?order_id=1", alice),
            ("/debug/logs", staff), ("/health", {}), ("/profile?id=1", alice)))
        cases.append({"id": "review", "server": shop.info, "probes": probes})
    cases[-1]["server_shutdown"] = shop.shutdown
    with LocalShop() as shop:
        staff = shop.login("staff")
        probes = [probe(shop, "POST", "/login", raw=br'{"username":"\ud800","password":"wrong"}'),
                  probe(shop, "GET", "/debug/logs", staff), probe(shop, "GET", "/health")]
        cases.append({"id": "anonymous_log", "server": shop.info, "probes": probes})
    cases[-1]["server_shutdown"] = shop.shutdown
    fixed = (cases[0]["probes"][1].get("response", {}).get("status") == 400
             and cases[1]["probes"][0].get("response", {}).get("status") == 400
             and all(probe.get("response", {}).get("status") == 200
                     for probe in cases[0]["probes"][2:] + cases[1]["probes"][1:])
             and all(not case["server_shutdown"]["stderr"] for case in cases))
    vulnerable = (cases[0]["probes"][1].get("response", {}).get("status") == 201
                  and any("transport_error" in probe for probe in cases[0]["probes"][2:])
                  and "transport_error" in cases[1]["probes"][1])
    return {"fixed": fixed, "vulnerable": vulnerable, "cases": cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expect", choices=("vulnerable", "fixed"), required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    source = output / "source"
    source.mkdir()
    hashes = {}
    for name in ("service.py", "sandbox.py"):
        raw = (LAB / name).read_bytes()
        (source / (name + ".txt")).write_bytes(raw)
        hashes[name] = hashlib.sha256(raw).hexdigest()
    clock = timezone(timedelta(hours=3))
    started = datetime.now(clock).isoformat()
    result = collect()
    result.update(command=sys.argv, started_at_moscow=started,
                  finished_at_moscow=datetime.now(clock).isoformat(), source_sha256=hashes,
                  source_unchanged=all(hashlib.sha256((LAB / n).read_bytes()).hexdigest() == h for n, h in hashes.items()))
    (output / "result.json").write_text(json.dumps(result, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "fixed": result["fixed"], "vulnerable": result["vulnerable"]}))
    if not result[args.expect] or not result["source_unchanged"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
