"""Local-only HTTP fixture shared by the audit and security regression tests."""

import hashlib
import http.client
import json
import os
import queue
import subprocess
import sys
import threading
from pathlib import Path


LAB = Path(__file__).resolve().parent


class LocalShop:
    """Own a disposable server in another process; never connect to an existing one."""

    def __init__(self):
        self.requests = []
        self.closed = False
        self.process = subprocess.Popen(
            [sys.executable, "-X", "utf8", "-B", str(Path(__file__).resolve()), "--serve"],
            cwd=LAB, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )
        startup = queue.Queue()
        threading.Thread(target=lambda: startup.put(self.process.stdout.readline()), daemon=True).start()
        try:
            self.info = json.loads(startup.get(timeout=15))
            if self.info["host"] != "127.0.0.1" or self.info["pid"] != self.process.pid:
                raise RuntimeError("Unexpected server identity")
            self.root = Path(self.info["sandbox_root"])
        except Exception:
            self.process.kill()
            self.process.communicate()
            raise

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def close(self):
        if self.closed:
            return
        self.closed = True
        try:
            stdout, stderr = self.process.communicate("stop\n", timeout=15)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.communicate()
            raise RuntimeError("Fixture did not shut down gracefully")
        self.shutdown = {"exit_code": self.process.returncode, "stderr": stderr,
                         "extra_stdout": stdout, "temporary_root_removed": not self.root.exists()}
        if self.process.returncode or self.root.exists():
            raise RuntimeError(f"Fixture cleanup failed: {self.shutdown}")

    def call(self, method, target, body=None, headers=None, *, raw=None, label=""):
        if not target.startswith("/") or target.startswith("//"):
            raise ValueError("Only relative local API targets are allowed")
        if raw is not None and body is not None:
            raise ValueError("Choose JSON or raw bytes")
        payload = raw if raw is not None else (
            json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        )
        sent_headers = {"Host": f"127.0.0.1:{self.info['port']}", "Accept-Encoding": "identity",
                        "Connection": "close", **(headers or {})}
        if payload is not None:
            sent_headers.setdefault("Content-Type", "application/json")
            sent_headers["Content-Length"] = str(len(payload))
        connection = http.client.HTTPConnection("127.0.0.1", self.info["port"], timeout=5)
        try:
            connection.request(method, target, body=payload, headers=sent_headers)
            response = connection.getresponse()
            text = response.read().decode("utf-8")
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                parsed = None
            result = {"label": label, "request": {"method": method, "target": target,
                      "headers": sent_headers, "body_text": payload.decode("utf-8") if payload is not None else None},
                      "response": {"status": response.status, "headers": dict(response.getheaders()),
                                   "body_text": text, "json": parsed}}
            self.requests.append(result)
            return result["response"]
        finally:
            connection.close()

    def login(self, username="alice", password=None):
        response = self.call("POST", "/login", {"username": username, "password": password or f"learn-{username}"},
                             label=f"legitimate login: {username}")
        if response["status"] != 200:
            raise RuntimeError(f"Fixture login failed: {response}")
        return {"X-Token": response["json"]["token"]}

    def files(self):
        """Read only this owned fixture's files; record contents and hashes."""
        if not self.root.exists():
            return {}
        result = {}
        for path in sorted(self.root.rglob("*")):
            if path.is_file():
                resolved = path.resolve()
                if self.root.resolve() not in resolved.parents:
                    raise RuntimeError("Refusing snapshot outside fixture")
                raw = path.read_bytes()
                result[path.relative_to(self.root).as_posix()] = {
                    "sha256": hashlib.sha256(raw).hexdigest(), "text": raw.decode("utf-8")}
        return result


def serve():
    # Same unmodified application and HTTP handler; stdin is a test lifecycle
    # control channel, not a new HTTP endpoint or a tool available to clients.
    from http.server import ThreadingHTTPServer
    from service import Shop, make_handler

    shop = Shop()
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(shop))
    server.daemon_threads = True
    thread = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.05), daemon=True)
    thread.start()
    try:
        print(json.dumps({"host": "127.0.0.1", "port": server.server_port,
                          "pid": os.getpid(), "sandbox_root": str(shop.sandbox.root)}), flush=True)
        sys.stdin.readline()
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()
        shop.close()


if __name__ == "__main__":
    if sys.argv[1:] != ["--serve"]:
        raise SystemExit("Internal fixture: use audit_before.py or unittest")
    serve()
