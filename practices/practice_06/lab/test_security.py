"""Security requirements: intentionally fail on the unmodified vulnerable shop.

These are ordinary assertions, not expectedFailure tests. Each HTTP test owns
a fresh subprocess on loopback; no existing service or external host is used.
"""

import json
import http.client
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.parse import urlencode

from audit_support import LocalShop
from service import Shop, make_handler


class SecurityHttpTest(unittest.TestCase):
    def setUp(self):
        self.shop = LocalShop()
        self.addCleanup(self.shop.close)
        self.auth = self.shop.login()

    def denied(self, response):
        self.assertIn(response["status"], (400, 401, 403, 404), response)

    def test_v01_profile_requires_session(self):
        self.denied(self.shop.call("GET", "/profile?id=1"))

    def test_v01_invalid_token_does_not_read_profile(self):
        self.denied(self.shop.call("GET", "/profile?id=2", headers={"X-Token": "invalid"}))

    def test_v01_other_profile_not_disclosed(self):
        response = self.shop.call("GET", "/profile?id=2", headers=self.auth)
        if response["status"] == 200:
            self.assertEqual(response["json"], [], response)
        else:
            self.denied(response)

    def test_v01_orders_require_session(self):
        self.denied(self.shop.call("GET", "/orders"))

    def test_v01_orders_only_show_owner(self):
        response = self.shop.call("GET", "/orders", headers=self.auth)
        self.assertEqual(response["status"], 200)
        self.assertTrue(all(row["owner"] == 1 for row in response["json"]), response)

    def test_v01_search_does_not_disclose_other_profile(self):
        response = self.shop.call("GET", "/search?q=TEST_BOB", headers=self.auth)
        if response["status"] == 200:
            self.assertNotIn("TEST_BOB", response["body_text"])
        else:
            self.denied(response)

    def test_v02_profile_input_cannot_expand_selection(self):
        response = self.shop.call("GET", "/profile?" + urlencode({"id": "1 OR 1=1"}), headers=self.auth)
        if response["status"] == 200:
            self.assertTrue(all(row["id"] == 1 for row in response["json"]), response)
        else:
            self.denied(response)

    def test_v02_search_input_is_literal(self):
        staff = self.shop.login("staff")
        normal = self.shop.call("GET", "/search?q=TEST_ALICE", headers=staff)
        self.assertEqual(normal["status"], 200)
        self.assertEqual([row["id"] for row in normal["json"]], [1])
        response = self.shop.call("GET", "/search?" + urlencode({"q": "' OR 1=1 -- "}), headers=staff)
        self.assertEqual(response["status"], 200, response)
        self.assertEqual(response["json"], [], response)

    def test_v02_context_id_cannot_select_other_orders(self):
        response = self.shop.call("GET", "/assistant/context?" + urlencode({"order_id": "1 OR 1=1"}), headers=self.auth)
        if response["status"] == 200:
            self.assertNotIn('"owner": 2', response["json"]["prompt"])
            self.assertNotIn('"owner":2', response["json"]["prompt"])
        else:
            self.denied(response)

    def test_v03_role_header_without_session_is_not_authority(self):
        self.denied(self.shop.call("GET", "/admin/export", headers={"X-Role": "staff"}))

    def test_v03_client_cannot_claim_staff(self):
        self.denied(self.shop.call("GET", "/admin/export", headers={**self.auth, "X-Role": "staff"}))

    def test_v03_staff_session_does_not_need_role_header(self):
        staff = self.shop.login("staff")
        response = self.shop.call("GET", "/admin/export", headers=staff)
        self.assertEqual(response["status"], 200, response)
        self.assertEqual(len(response["json"]), 2)

    def check_price(self, price):
        response = self.shop.call("POST", "/orders", {"product": "chair", "price": price}, self.auth)
        if response["status"] == 201:
            self.assertEqual(response["json"]["price"], 5000, response)
            self.assertEqual(response["json"]["owner"], 1)
        else:
            self.assertIn(response["status"], (400, 422), response)

    def test_v04_customer_cannot_reduce_price(self):
        self.check_price(1)

    def test_v04_negative_price_not_persisted(self):
        self.check_price(-5)

    def test_v04_text_price_not_persisted(self):
        self.check_price("free")

    def test_v04_null_price_not_persisted(self):
        self.check_price(None)

    def test_v05_receipt_requires_session(self):
        self.denied(self.shop.call("GET", "/files?user=alice&path=receipt.txt"))

    def test_v05_other_users_receipt_denied(self):
        self.denied(self.shop.call("GET", "/files?user=bob&path=receipt.txt", headers=self.auth))

    def test_v05_traversal_to_operator_note_denied(self):
        target = "/files?" + urlencode({"user": "alice", "path": "../../private/operator-note.txt"})
        self.denied(self.shop.call("GET", target, headers=self.auth))

    def test_v06_review_is_not_executable_html(self):
        payload = '<script>document.documentElement.dataset.auditXss="V-06"</script>'
        saved = self.shop.call("POST", "/reviews", {"product": "chair", "text": payload}, self.auth)
        self.assertEqual(saved["status"], 201)
        response = self.shop.call("GET", "/reviews/view")
        self.assertEqual(response["status"], 200)
        self.assertNotIn("<script>", response["body_text"])

    def test_v07_anonymous_cannot_read_request_logs(self):
        self.denied(self.shop.call("GET", "/debug/logs"))

    def test_v07_customer_cannot_read_request_logs(self):
        self.denied(self.shop.call("GET", "/debug/logs", headers=self.auth))

    def test_v08_context_requires_session(self):
        self.denied(self.shop.call("GET", "/assistant/context?order_id=1"))

    def test_v08_other_order_context_denied(self):
        self.denied(self.shop.call("GET", "/assistant/context?order_id=2", headers=self.auth))

    def test_v09_anonymous_cannot_read_file_via_tool(self):
        decision = {"tool": "read_file", "arguments": {"path": "files/bob/receipt.txt"}}
        self.denied(self.shop.call("POST", "/assistant/execute", {"decision": decision}))

    def test_v09_customer_cannot_read_other_receipt_via_tool(self):
        decision = {"tool": "read_file", "arguments": {"path": "files/bob/receipt.txt"}}
        self.denied(self.shop.call("POST", "/assistant/execute", {"decision": decision}, self.auth))

    def test_v09_customer_cannot_read_operator_note_via_tool(self):
        decision = {"tool": "read_file", "arguments": {"path": "private/operator-note.txt"}}
        self.denied(self.shop.call("POST", "/assistant/execute", {"decision": decision}, self.auth))

    def test_v09_anonymous_cannot_export_via_tool(self):
        decision = {"tool": "export_profiles", "arguments": {}}
        self.denied(self.shop.call("POST", "/assistant/execute", {"decision": decision}))

    def test_v09_customer_cannot_export_via_tool(self):
        decision = {"tool": "export_profiles", "arguments": {}}
        self.denied(self.shop.call("POST", "/assistant/execute", {"decision": decision}, self.auth))

    def test_v10_customer_cannot_destroy_fixture(self):
        before = self.shop.files()
        decision = {"tool": "delete_tree", "arguments": {"path": "."}}
        response = self.shop.call("POST", "/assistant/execute", {"decision": decision}, self.auth)
        after = self.shop.files()
        self.denied(response)
        self.assertEqual(after, before)

    def test_v10_anonymous_cannot_destroy_fixture(self):
        before = self.shop.files()
        decision = {"tool": "delete_tree", "arguments": {"path": "."}}
        response = self.shop.call("POST", "/assistant/execute", {"decision": decision})
        after = self.shop.files()
        self.denied(response)
        self.assertEqual(after, before)

    def test_v11_malformed_json_is_client_error(self):
        response = self.shop.call("POST", "/login", raw=b"{")
        self.assertIn(response["status"], (400, 422), response)

    def test_v11_json_array_is_client_error(self):
        response = self.shop.call("POST", "/login", raw=b"[]")
        self.assertIn(response["status"], (400, 422), response)

    def test_v11_missing_product_is_client_error(self):
        response = self.shop.call("POST", "/orders", {}, self.auth)
        self.assertIn(response["status"], (400, 422), response)

    def test_v11_missing_review_text_is_client_error(self):
        response = self.shop.call("POST", "/reviews", {"product": "chair"}, self.auth)
        self.assertIn(response["status"], (400, 422), response)

    def test_v11_missing_tool_is_client_error(self):
        response = self.shop.call("POST", "/assistant/execute", {"decision": {}}, self.auth)
        self.assertIn(response["status"], (400, 422), response)

    def test_v11_invalid_unicode_review_cannot_poison_shared_views(self):
        staff = self.shop.login("staff")
        for text in ("\ud800", "\udfff"):
            with self.subTest(text=repr(text)):
                raw = json.dumps({"product": "chair", "text": text}).encode("ascii")
                response = self.shop.call("POST", "/reviews", headers=self.auth, raw=raw)
                self.assertEqual(response["status"], 400, response)
                for target, headers in (("/reviews/view", {}), ("/assistant/context?order_id=1", self.auth),
                                        ("/debug/logs", staff)):
                    self.assertEqual(self.shop.call("GET", target, headers=headers)["status"], 200)

    def test_v11_invalid_unicode_anonymous_input_cannot_poison_logs(self):
        staff = self.shop.login("staff")
        for body in ({"username": "\ud800", "password": "wrong"},
                     {"username": "unknown", "extra": [{"text": "\udfff"}]},
                     {"username": "unknown", "\ud800": "invalid key"}):
            with self.subTest(body=repr(body)):
                response = self.shop.call("POST", "/login", raw=json.dumps(body).encode("ascii"))
                self.assertEqual(response["status"], 400, response)
                logs = self.shop.call("GET", "/debug/logs", headers=staff)
                self.assertEqual(logs["status"], 200)
                self.assertNotIn("\\ud800", json.dumps(logs["json"]))
                self.assertNotIn("\\udfff", json.dumps(logs["json"]))

    def test_v11_valid_unicode_and_escaped_emoji_are_preserved(self):
        text = "Receipt \U0001f600 \u0447\u0435\u043a"
        response = self.shop.call("POST", "/reviews", headers=self.auth,
                                  raw=json.dumps({"product": "chair", "text": text}).encode("ascii"))
        self.assertEqual(response["status"], 201)
        response = self.shop.call("GET", "/reviews/view")
        self.assertEqual(response["status"], 200)
        self.assertIn(text, response["body_text"])

    def test_v11_nonfinite_json_numbers_cannot_poison_logs(self):
        staff = self.shop.login("staff")
        for number in (b"NaN", b"Infinity", b"-Infinity", b"1e400"):
            with self.subTest(number=number):
                raw = b'{"username":"unknown","extra":' + number + b'}'
                response = self.shop.call("POST", "/login", raw=raw)
                self.assertEqual(response["status"], 400, response)
                logs = self.shop.call("GET", "/debug/logs", headers=staff)
                self.assertEqual(logs["status"], 200)
                json.loads(logs["body_text"], parse_constant=lambda value: self.fail("Non-finite number in response"))

    def test_v11_profile_id_outside_database_range_is_client_error(self):
        staff = self.shop.login("staff")
        for identifier in (str(2**63), str(-(2**63) - 1), "9" * 5000):
            with self.subTest(identifier=identifier[:30]):
                response = self.shop.call("GET", "/profile?" + urlencode({"id": identifier}), headers=staff)
                self.assertEqual(response["status"], 400, response)

    def test_v11_order_id_outside_database_range_is_client_error(self):
        for identifier in (str(2**63), str(-(2**63) - 1), "9" * 5000):
            with self.subTest(identifier=identifier[:30]):
                response = self.shop.call("GET", "/assistant/context?" + urlencode({"order_id": identifier}),
                                          headers=self.auth)
                self.assertEqual(response["status"], 400, response)

    def test_v08_context_describes_only_authorized_actions(self):
        response = self.shop.call("GET", "/assistant/context?order_id=1", headers=self.auth)
        self.assertEqual(response["status"], 200)
        prompt = response["json"]["prompt"]
        self.assertIn('"path": "files/alice/receipt.txt"', prompt)
        self.assertNotIn("files/bob/receipt.txt", prompt)
        self.assertNotIn("export_profiles", prompt)
        self.assertNotIn("delete_tree", prompt)
        self.assertNotIn(self.auth["X-Token"], prompt)

    def test_v11_missing_file_does_not_disclose_internal_path(self):
        response = self.shop.call("GET", "/files?user=alice&path=missing.txt", headers=self.auth)
        self.assertNotIn(self.shop.root.name, response["body_text"])
        self.assertNotIn("FileNotFoundError", response["body_text"])
        self.assertIn(response["status"], (400, 403, 404), response)

    def test_control_wrong_password_denied(self):
        response = self.shop.call("POST", "/login", {"username": "alice", "password": "wrong"})
        self.assertEqual(response["status"], 401)

    def test_control_order_requires_session(self):
        response = self.shop.call("POST", "/orders", {"product": "chair"})
        self.assertEqual(response["status"], 401)

    def test_control_unknown_product_denied(self):
        response = self.shop.call("POST", "/orders", {"product": "unknown"}, self.auth)
        self.assertEqual(response["status"], 400)

    def test_control_unknown_tool_has_no_effect(self):
        before = self.shop.files()
        response = self.shop.call("POST", "/assistant/execute", {"decision": {"tool": "unknown", "arguments": {}}}, self.auth)
        self.assertEqual(response["status"], 400)
        self.assertEqual(self.shop.files(), before)

    def test_control_refuse_is_explicit_and_has_no_effect(self):
        before = self.shop.files()
        response = self.shop.call("POST", "/assistant/execute", {
            "decision": {"tool": "refuse", "arguments": {"reason": "No safe action"}}
        }, self.auth)
        self.assertEqual(response["status"], 400)
        self.assertEqual(response["json"], {"error": "refused", "reason": "No safe action"})
        self.assertEqual(self.shop.files(), before)

    def test_control_tool_cannot_escape_physical_sandbox(self):
        before = self.shop.files()
        decision = {"tool": "delete_tree", "arguments": {"path": "../outside"}}
        response = self.shop.call("POST", "/assistant/execute", {"decision": decision}, self.auth)
        self.assertNotEqual(response["status"], 200)
        self.assertEqual(self.shop.files(), before)


class SecurityLoggingTest(unittest.TestCase):
    def test_v07_password_and_token_not_stored_in_logs(self):
        shop = Shop()
        self.addCleanup(shop.close)
        status, login = shop.dispatch("POST", "/login", {"username": "alice", "password": "learn-alice"}, {})
        self.assertEqual(status, 200)
        shop.dispatch("GET", "/profile?id=1", {}, {"X-Token": login["token"]})
        logs = json.dumps(getattr(shop, "logs", []))
        self.assertNotIn("learn-alice", logs)
        self.assertNotIn(login["token"], logs)


class SecuritySerializationTest(unittest.TestCase):
    def test_v11_response_encoding_failures_return_safe_http_errors(self):
        shop = Shop()
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(shop))
        server.daemon_threads = True
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        original = shop.dispatch
        try:
            for broken_result in ("\ud800", {"bad": "\udfff"}, {"bad": {1, 2}}, {"bad": float("nan")}, {"bad": float("inf")}):
                shop.dispatch = lambda *args: (200, broken_result)
                connection = http.client.HTTPConnection(*server.server_address, timeout=5)
                try:
                    connection.request("GET", "/health")
                    response = connection.getresponse()
                    self.assertEqual(response.status, 500)
                    self.assertEqual(json.loads(response.read()), {"error": "internal server error"})
                finally:
                    connection.close()
            shop.dispatch = original
            connection = http.client.HTTPConnection(*server.server_address, timeout=5)
            try:
                connection.request("GET", "/health")
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertEqual(json.loads(response.read()), {"status": "ok"})
            finally:
                connection.close()
        finally:
            server.shutdown()
            thread.join(timeout=5)
            server.server_close()
            shop.close()


if __name__ == "__main__":
    unittest.main()
