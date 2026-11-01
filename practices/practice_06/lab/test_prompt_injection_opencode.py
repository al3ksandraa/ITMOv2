"""Offline checks of model output validation and experiment failure reporting."""

import contextlib
import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import prompt_injection_opencode as runner
import run_threat_judge as judge
from opencode_runner import run_model


def text_event(text):
    return {"type": "text", "part": {"type": "text", "text": text}}


class OpencodeRunnerTests(unittest.TestCase):
    def run_events(self, events, returncode=0):
        stdout = "\n".join(json.dumps(event) for event in events)
        process = subprocess.CompletedProcess([], returncode, stdout, "diagnostic")
        with patch("opencode_runner.subprocess.run", return_value=process):
            return runner.run_opencode(Path("context.txt"), "test/model")

    def assert_invalid(self, result):
        self.assertEqual(result["status"], "invalid_output")
        self.assertFalse(result["decision_valid"])
        self.assertIsNone(result["decision"])

    def test_correct_answer(self):
        decision = {"tool": "read_file", "arguments": {"path": "files/alice/receipt.txt"}}
        result = self.run_events([text_event(json.dumps(decision))])
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["decision"], decision)
        process = subprocess.CompletedProcess([], 0, json.dumps(text_event(json.dumps(decision))), "")
        with patch("opencode_runner.subprocess.run", return_value=process):
            multiple = run_model([Path("one.txt"), Path("two.txt")], "test/model", "threat-judge", Path.cwd(), "review")
        first_file = multiple["command"].index("--file") + 1
        self.assertEqual(multiple["command"][first_file:first_file + 2], ["one.txt", "two.txt"])

    def test_correct_refuse(self):
        result = self.run_events([text_event('{"tool":"refuse","arguments":{"reason":"no safe action"}}')])
        self.assertTrue(result["decision_valid"])
        self.assertEqual(result["decision"]["tool"], "refuse")

    def test_nonzero_returncode_even_with_json(self):
        result = self.run_events([text_event('{"tool":"export_profiles","arguments":{}}')], 1)
        self.assertEqual(result["status"], "failed_process")
        self.assertIsNone(result["decision"])
        self.assertFalse(result["decision_valid"])

    def test_timeout_preserves_partial_output(self):
        error = subprocess.TimeoutExpired([], 180, output=b"partial output", stderr=b"partial error")
        with patch("opencode_runner.subprocess.run", side_effect=error):
            result = runner.run_opencode(Path("context.txt"), "test/model")
        self.assertEqual(result["status"], "timeout")
        self.assertEqual(result["stdout"], "partial output")
        self.assertEqual(result["stderr"], "partial error")
        self.assertFalse(result["decision_valid"])

    def test_missing_executable(self):
        with patch("opencode_runner.subprocess.run", side_effect=FileNotFoundError("opencode")):
            result = runner.run_opencode(Path("context.txt"), "test/model")
        self.assertEqual(result["status"], "not_found")
        self.assertFalse(result["decision_valid"])

    def test_invalid_json(self):
        self.assert_invalid(self.run_events([text_event("not JSON")]))

    def test_arguments_must_be_an_object(self):
        self.assert_invalid(self.run_events([text_event('{"tool":"export_profiles","arguments":1}')]))

    def test_arguments_are_required(self):
        self.assert_invalid(self.run_events([text_event('{"tool":"export_profiles"}')]))

    def test_tool_must_be_nonempty_string(self):
        for tool in ("", 7, None):
            with self.subTest(tool=tool):
                self.assert_invalid(self.run_events([text_event(json.dumps({"tool": tool, "arguments": {}}))]))

    def test_extra_fields_are_not_a_decision(self):
        self.assert_invalid(self.run_events([text_event('{"tool":"refuse","arguments":{},"extra":true}')]))

    def test_non_text_event_cannot_supply_decision(self):
        event = {"type": "log", "part": {"type": "text", "text": '{"tool":"export_profiles","arguments":{}}'}}
        self.assert_invalid(self.run_events([event]))

    def test_unstructured_json_cannot_supply_decision(self):
        self.assert_invalid(self.run_events([[], {"tool": "export_profiles", "arguments": {}}]))

    def test_invalid_final_answer_does_not_reuse_previous_decision(self):
        result = self.run_events([text_event('{"tool":"export_profiles","arguments":{}}'), text_event("not JSON")])
        self.assert_invalid(result)
        self.assertEqual(result["assistant_text"], "not JSON")

    def test_non_string_final_text_does_not_reuse_previous_decision(self):
        self.assert_invalid(self.run_events([text_event('{"tool":"export_profiles","arguments":{}}'), text_event(None)]))

    def test_main_reports_incomplete_experiment(self):
        def failed_experiment(mode, model, output):
            output.mkdir(parents=True)
            (output / "H-09-experiment-summary.json").write_text(
                json.dumps({"control_model_status": "ok", "attack_model_status": "invalid_output"}), encoding="utf-8")

        with tempfile.TemporaryDirectory() as directory:
            with patch.object(runner, "LAB", Path(directory) / "lab"), \
                    patch.object(runner, "experiment", side_effect=failed_experiment) as experiment, \
                    patch("sys.argv", ["experiment", "--model", "test/model"]), \
                    contextlib.redirect_stdout(io.StringIO()) as output:
                with self.assertRaises(SystemExit) as raised:
                    runner.main()
        self.assertEqual(raised.exception.code, 1)
        self.assertEqual(experiment.call_count, 2)
        self.assertEqual(json.loads(output.getvalue())["failures"], ["before", "after"])

    def judge_fixture(self, directory):
        root = Path(directory)
        (root / "judge-system-prompt.md").write_text("Independent review", encoding="utf-8")
        for phase in ("before", "after"):
            evidence = root / "evidence" / phase
            for name in ("V-09.json", "V-10.json", "source/service.py.txt", "source/sandbox.py.txt",
                         "H-09-final/H-09-control-run.json", "H-09-final/H-09-attack-run.json",
                         "H-09-final/H-09-direct-dangerous.json", "H-09-final/H-09-experiment-summary.json"):
                path = evidence / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(phase + ":" + name, encoding="utf-8")
        for phase in ("unicode-before", "unicode-final"):
            for name in ("result.json", "source/service.py.txt", "source/sandbox.py.txt"):
                path = root / "evidence" / phase / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(phase + ":" + name, encoding="utf-8")
        return root

    def test_judge_receives_both_source_snapshots(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self.judge_fixture(directory)
            with patch.object(judge, "PRACTICE", root):
                package = judge.package_materials()
            for phase in ("before", "after"):
                for name in ("service.py", "sandbox.py"):
                    path = f"evidence/{phase}/source/{name}.txt"
                    self.assertEqual(package["materials"][path], phase + ":source/" + name + ".txt")

    def test_judge_rejects_missing_original_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self.judge_fixture(directory)
            (root / "evidence/before/source/service.py.txt").unlink()
            with patch.object(judge, "PRACTICE", root), self.assertRaises(ValueError):
                judge.package_materials()

    def test_prepare_judge_package_does_not_call_model(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self.judge_fixture(directory)
            output = root / "prepared"
            with patch.object(judge, "PRACTICE", root), patch.object(judge, "run_model") as run:
                result = judge.run_threat_judge("test/model", output, prepare_only=True)
            run.assert_not_called()
            self.assertEqual(result["status"], "prepared")
            self.assertTrue((output / "request.json").is_file())
            self.assertFalse((output / "result.json").exists())

    def test_judge_rejects_modified_prepared_attachment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self.judge_fixture(directory)
            output = root / "prepared"
            with patch.object(judge, "PRACTICE", root), patch.object(judge, "run_model") as run:
                request = judge.run_threat_judge("test/model", output, prepare_only=True)
                (output / request["attachments"][0]["path"]).write_text("changed", encoding="utf-8")
                with self.assertRaises(ValueError):
                    judge.submit_prepared(output)
            run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
