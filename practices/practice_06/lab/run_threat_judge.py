"""Submit a complete evidence package to the independent OpenCode judge."""

import argparse
import hashlib
import json
import os
import textwrap
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from opencode_runner import run_model


PRACTICE = Path(__file__).resolve().parent.parent


def package_materials(experiment_name="H-09-final"):
    files = [PRACTICE / name for name in (
        "THREAT_MODEL.md", "REPORT_01.md", "REPORT_02.md", "judge-system-prompt.md",
        "planner-system.txt", "opencode.json", "README.md", "lab/README.md", "lab/audit_browser.cjs")]
    files.extend(sorted((PRACTICE / "lab").glob("*.py")))
    files.extend([PRACTICE / "Makefile", PRACTICE / "lab" / "Makefile",
                  PRACTICE / "evidence" / "after" / "make-results.json",
                  PRACTICE / "evidence" / "after" / "make-step6.log",
                  PRACTICE / "evidence" / "after" / "make-test.log"])
    for phase in ("before", "after"):
        evidence = PRACTICE / "evidence" / phase
        files.extend(sorted(evidence.glob("V-*.json")))
        files.extend(evidence / name for name in ("audit-summary.json", "tests-summary.json", "CONTROLS.json"))
        files.extend(sorted((evidence / "H-09").glob("*")))
        files.extend(sorted((evidence / experiment_name).glob("*")))
        files.extend(sorted((evidence / "source").glob("*.txt")))
        files.extend(evidence / name for name in ("OBS-01-resources.json", "OBS-02-audit.json"))
    files.extend(PRACTICE / "evidence" / "after" / name for name in ("tests.log", "input-matrix.json"))
    for phase in ("unicode-before", "unicode-final"):
        evidence = PRACTICE / "evidence" / phase
        files.append(evidence / "result.json")
        files.extend(sorted((evidence / "source").glob("*.txt")))
    package = {path.relative_to(PRACTICE).as_posix(): path.read_text(encoding="utf-8")
               for path in files if path.is_file()}
    required = [f"evidence/{phase}/{case}" for phase in ("before", "after")
                for case in ("V-09.json", "V-10.json", "source/service.py.txt", "source/sandbox.py.txt",
                             f"{experiment_name}/H-09-control-run.json", f"{experiment_name}/H-09-attack-run.json",
                             f"{experiment_name}/H-09-direct-dangerous.json", f"{experiment_name}/H-09-experiment-summary.json")]
    required.extend(f"evidence/{phase}/{name}" for phase in ("unicode-before", "unicode-final")
                    for name in ("result.json", "source/service.py.txt", "source/sandbox.py.txt"))
    if any(name not in package for name in required):
        raise ValueError("The judge package requires both source snapshots and complete before/after model/tool traces")
    return {"materials": package,
            "limitations": f"Актуальный модельный эксперимент: {experiment_name}; H-09 — исторический прогон. "
                            "Сравнивай решения и эффекты по фактическим трассам; результаты могут различаться между прогонами. "
                            "Исходный набор из 59 тестов исторический, текущий набор расширен. "
                            "unicode-before — промежуточная версия с 85 тестами; исходный before — версия курса. "
                            "Проверяй факты по содержимому, а не по одним ссылкам. "
                            "delete_tree запрещён всем ролям; положительного сценария удаления через API нет."}


def run_threat_judge(model, output, experiment_name="H-09-final", prepare_only=False):
    output = Path(output).resolve()
    if output.exists():
        raise FileExistsError("Judge evidence already exists; select a new --output directory")
    package = package_materials(experiment_name)
    output.mkdir(parents=True)
    input_files = prepare_attachments(package, output / "materials")
    started = datetime.now(timezone(timedelta(hours=3))).isoformat()
    request = {"status": "prepared", "agent": "threat-judge", "model": model,
               "system_prompt": "judge-system-prompt.md", "experiment_name": experiment_name,
               "material_count": len(package["materials"]), "material_paths": list(package["materials"]),
               "materials_sha256": {name: hashlib.sha256(content.encode("utf-8")).hexdigest()
                                    for name, content in package["materials"].items()},
               "attachments": [{"path": str(path.relative_to(output)),
                                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                                "bytes": path.stat().st_size,
                                "max_line_characters": max(map(len, path.read_text(encoding="utf-8").splitlines()), default=0)}
                               for path in input_files], "started_at_moscow": started}
    (output / "request.json").write_text(json.dumps(request, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if prepare_only:
        return request
    return submit_prepared(output)


def submit_prepared(output):
    """Submit exactly the locally prepared attachments, after verifying their hashes."""
    output = Path(output).resolve()
    request = json.loads((output / "request.json").read_text(encoding="utf-8"))
    if request["status"] != "prepared":
        raise ValueError("Only an unsubmitted prepared package may be submitted")
    input_files = []
    for item in request["attachments"]:
        path = (output / item["path"]).resolve()
        if not path.is_relative_to(output / "materials") or hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
            raise ValueError("Prepared attachment changed or escaped the package")
        input_files.append(path)
    system_prompt = (PRACTICE / "judge-system-prompt.md").read_text(encoding="utf-8")
    if hashlib.sha256(system_prompt.encode("utf-8")).hexdigest() != request["materials_sha256"]["judge-system-prompt.md"]:
        raise ValueError("Judge system prompt changed since package preparation")
    started = datetime.now(timezone(timedelta(hours=3))).isoformat()
    request.update(status="submitted", submitted_at_moscow=started)
    (output / "request.json").write_text(json.dumps(request, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    result = run_model(input_files, request["model"], "threat-judge", PRACTICE,
                       "Оцени все переданные материалы по системному промпту. Дай независимый вердикт и основания.")
    result.update(started_at_moscow=started,
                  finished_at_moscow=datetime.now(timezone(timedelta(hours=3))).isoformat(),
                  input_sha256={str(path.relative_to(output)): hashlib.sha256(path.read_bytes()).hexdigest()
                                for path in input_files},
                  system_prompt=system_prompt)
    (output / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    request.update(status=result["status"], finished_at_moscow=result["finished_at_moscow"], result="result.json")
    (output / "request.json").write_text(json.dumps(request, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if result["status"] == "ok":
        (output / "response.md").write_text(result["assistant_text"] + "\n", encoding="utf-8")
    archive_attachments(output)
    return result


def archive_attachments(output):
    """Keep exact submitted bytes in one archive instead of hundreds of files."""
    output = Path(output).resolve()
    request = json.loads((output / "request.json").read_text(encoding="utf-8"))
    if request["status"] in ("prepared", "submitted"):
        raise ValueError("Do not archive attachments before the model run finishes")
    files = []
    for item in request["attachments"]:
        path = (output / item["path"]).resolve()
        if not path.is_relative_to(output / "materials") or hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
            raise ValueError("Attachment changed or escaped the package")
        files.append((path, path.relative_to(output).as_posix(), item["sha256"]))
    archive = output / "materials.zip"
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as package:
        for path, name, _ in files:
            package.write(path, name)
    with zipfile.ZipFile(archive) as package:
        for _, name, expected in files:
            if hashlib.sha256(package.read(name)).hexdigest() != expected:
                raise ValueError("Archived attachment hash mismatch; originals retained")
    for path, _, _ in files:
        path.unlink()
    directory = output / "materials"
    if not any(directory.iterdir()):
        directory.rmdir()
    return archive


def prepare_attachments(package, directory):
    """Keep attachments below the CLI read limits, including long JSON lines."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=False)
    documents = {"limitations": package["limitations"], **package["materials"]}
    attachments = []
    for name, content in documents.items():
        lines = []
        for line in content.splitlines():
            lines.extend(textwrap.wrap(line, width=1000, replace_whitespace=False,
                                       drop_whitespace=False, break_on_hyphens=False) or [""])
        chunk = []
        characters = 0
        for line in lines + [None]:
            if chunk and (line is None or characters + len(line) > 5000):
                path = directory / f"{len(attachments) + 1:03d}.txt"
                path.write_text(f"Source: {name}\nContinuation chunks retain source order. Long lines are wrapped.\n\n"
                                + "\n".join(chunk) + "\n", encoding="utf-8")
                attachments.append(path)
                chunk, characters = [], 0
            if line is not None:
                chunk.append(line)
                characters += len(line) + 1
    return attachments


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=os.environ.get("OPENCODE_MODEL", "vsellm/openai/gpt-5"))
    parser.add_argument("--output", type=Path, default=PRACTICE / "evidence" / "judge")
    parser.add_argument("--experiment-name", default="H-09-final")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--prepare-only", action="store_true", help="create a reviewable local package without calling a model")
    mode.add_argument("--submit-prepared", action="store_true", help="submit the exact existing prepared package")
    args = parser.parse_args()
    result = (submit_prepared(args.output) if args.submit_prepared else
              run_threat_judge(args.model, args.output, args.experiment_name, args.prepare_only))
    print(json.dumps({"status": result["status"], "output": str(args.output)}, ensure_ascii=False))
    if result["status"] not in ("ok", "prepared"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
