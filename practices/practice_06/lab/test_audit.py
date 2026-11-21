"""Regression checks for evidence collection on the fixed HTTP service."""

import unittest
from pathlib import Path
from unittest.mock import Mock

from audit_before import audit_observation, resource_observation, v01, v02, v07, v09, v11
from audit_support import LocalShop


class AuditTest(unittest.TestCase):
    def setUp(self):
        self.shop = LocalShop()
        self.addCleanup(self.shop.close)

    def test_sqli_checks_all_three_inputs_including_staff_search(self):
        result = v02(self.shop, None)
        self.assertFalse(result["confirmed"])
        effect = result["effect"]
        self.assertEqual((effect["profile_status"], effect["search_status"], effect["context_status"]), (400, 200, 400))
        self.assertFalse(effect["search_selection_expanded"])

    def test_log_disclosure_probe_also_inspects_stored_secrets_as_staff(self):
        result = v07(self.shop, None)
        self.assertFalse(result["confirmed"])
        effect = result["effect"]
        self.assertEqual((effect["anonymous_status"], effect["customer_status"]), (401, 403))
        self.assertGreater(effect["staff_log_entries"], 2)
        self.assertFalse(effect["password_stored"])
        self.assertFalse(effect["token_stored"])
        self.assertFalse(effect["impersonation_attempted"])

    def test_observations_count_real_logs_and_report_trusted_actor(self):
        growth = resource_observation(self.shop, None)["effect"]
        self.assertEqual(growth["stored_review_markers"], 12)
        self.assertEqual(growth["log_entries_after"] - growth["log_entries_before"], 14)
        audit = audit_observation(self.shop, None)["effect"]
        self.assertIn("actor", audit["event_fields"])
        self.assertEqual(len(audit["admin_events"]), 2)
        self.assertTrue(all(event["actor"] == 1 and event["role"] == "customer" for event in audit["admin_events"]))


class PartialRegressionTest(unittest.TestCase):
    def fixture(self, call):
        shop = Mock()
        shop.login.return_value = {"X-Token": "alice"}
        shop.files.return_value = {}
        shop.root = Path("/synthetic-fixture-not-used")
        shop.call.side_effect = call
        return shop

    def test_one_foreign_profile_leak_confirms_v01(self):
        def call(method, target, body=None, headers=None, **kwargs):
            if target == "/profile?id=1":
                return {"status": 200, "json": [{"id": 1}]}
            if target == "/orders":
                return {"status": 200, "json": [{"owner": 1}]}
            if target == "/profile?id=2" and headers == {"X-Token": "alice"}:
                return {"status": 200, "json": [{"id": 2}]}
            return {"status": 403, "json": {"error": "forbidden"}}
        result = v01(self.fixture(call), None)
        self.assertTrue(result["confirmed"])
        self.assertEqual(sum(result["probes"].values()), 1)

    def test_one_allowed_dangerous_tool_confirms_v09(self):
        def call(method, target, body=None, headers=None, **kwargs):
            allowed = not headers and body["decision"]["arguments"].get("path") == "private/operator-note.txt"
            return {"status": 200 if allowed else 403, "json": {"content": "SYNTHETIC"} if allowed else {"error": "forbidden"}}
        result = v09(self.fixture(call), None)
        self.assertTrue(result["confirmed"])
        self.assertEqual(sum(result["probes"].values()), 1)

    def test_one_server_error_confirms_v11_without_path_leak(self):
        def call(method, target, body=None, headers=None, **kwargs):
            return {"status": 500 if kwargs.get("raw") == b"{" else 400, "json": {"error": "safe message"}}
        result = v11(self.fixture(call), None)
        self.assertTrue(result["confirmed"])
        self.assertFalse(result["effect"]["physical_path_disclosed"])
        self.assertEqual(sum(result["probes"].values()), 1)


if __name__ == "__main__":
    unittest.main()
