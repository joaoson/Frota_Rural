from django.test import SimpleTestCase
from drf_spectacular.generators import SchemaGenerator
from drf_spectacular.validation import validate_schema


class ServiceDocumentationTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.schema = SchemaGenerator().get_schema(request=None, public=True)

    def test_every_operation_has_summary_description_and_response(self):
        schema = self.schema
        validate_schema(schema)
        self.assertIn("/api/payments/webhook", schema["paths"])
        for path, methods in schema["paths"].items():
            for method, operation in methods.items():
                with self.subTest(path=path, method=method):
                    self.assertTrue(operation.get("summary"))
                    self.assertTrue(operation.get("description"))
                    self.assertTrue(operation.get("responses"))
                    self.assertTrue(operation.get("tags"))
        deletion = schema["paths"]["/api/notifications/{id}"]["delete"]
        self.assertIn("204", deletion["responses"])
        self.assertNotIn("requestBody", deletion)
        self.assertNotIn("security", schema["paths"]["/api/payments/webhook"]["post"])
        self.assertNotIn("/api/rentals/", schema["paths"])

    def test_try_it_out_uses_current_origin_and_all_groups_are_described(self):
        self.assertEqual(self.schema["servers"][0]["url"], "/")
        documented_tags = {tag["name"] for tag in self.schema["tags"] if tag.get("description")}
        for methods in self.schema["paths"].values():
            for operation in methods.values():
                self.assertTrue(set(operation["tags"]).issubset(documented_tags))

    def test_json_success_responses_have_a_schema_and_empty_webhook_does_not(self):
        for path, methods in self.schema["paths"].items():
            for method, operation in methods.items():
                for code, response in operation["responses"].items():
                    if code.startswith("2") and code != "204":
                        with self.subTest(path=path, method=method, code=code):
                            if path == "/api/payments/webhook":
                                self.assertNotIn("content", response)
                            else:
                                self.assertIn("application/json", response["content"])

    def test_rental_write_schemas_do_not_advertise_server_controlled_fields(self):
        create = self.schema["components"]["schemas"]["RentalCreateInputRequest"]["properties"]
        update = self.schema["components"]["schemas"]["PatchedRentalUpdateInputRequest"]["properties"]
        self.assertNotIn("total_price", create)
        self.assertNotIn("status", create)
        self.assertEqual(set(update), {"operator", "start_date", "end_date", "notes"})
        self.assertIn("409", self.schema["paths"]["/api/rentals/{id}"]["patch"]["responses"])
        self.assertNotIn("204", self.schema["paths"]["/api/rentals/{id}"]["delete"]["responses"])
