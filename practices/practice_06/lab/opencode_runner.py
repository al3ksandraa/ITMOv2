"""Execute OpenCode and accept only its final structured text event."""

import json
import shutil
import subprocess
from pathlib import Path


def final_text(stdout):
    answer = None
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict) or event.get("type") != "text":
            continue
        part = event.get("part")
        if isinstance(part, dict) and part.get("type") == "text":
            answer = part.get("text")
    return answer if isinstance(answer, str) and answer.strip() else None


def decoded(value):
    return value.decode("utf-8", errors="replace") if isinstance(value, bytes) else (value or "")


def run_model(context_path, model, agent, directory, message):
    directory = Path(directory).resolve()
    paths = context_path if isinstance(context_path, (list, tuple)) else [context_path]
    file_args = []
    for path in paths:
        path = Path(path).resolve()
        try:
            file_args.append(str(path.relative_to(directory)))
        except ValueError:
            file_args.append(str(path))
    installed = Path.home() / ".opencode" / "bin" / "opencode"
    executable = shutil.which("opencode") or (str(installed) if installed.is_file() else "opencode")
    command = [executable, "run", "--dir", str(directory), "--agent", agent,
               "--model", model, "--format", "json", "--file", *file_args, "--", message]
    result = {"command": command, "cwd": str(directory), "model": model, "agent": agent,
              "status": "not_run", "stdout": "", "stderr": "", "returncode": None,
              "assistant_text": None}
    try:
        process = subprocess.run(command, cwd=directory, capture_output=True,
                                 text=True, encoding="utf-8", timeout=180)
    except FileNotFoundError as error:
        result.update(status="not_found", stderr=str(error))
        return result
    except subprocess.TimeoutExpired as error:
        result.update(status="timeout", stdout=decoded(error.stdout), stderr=decoded(error.stderr))
        return result
    result.update(stdout=process.stdout, stderr=process.stderr, returncode=process.returncode)
    result["assistant_text"] = final_text(process.stdout)
    result["status"] = ("failed_process" if process.returncode != 0 else
                        "ok" if result["assistant_text"] is not None else "invalid_output")
    return result
