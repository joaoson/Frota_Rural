from django.test import SimpleTestCase
from drf_spectacular.generators import SchemaGenerator
from drf_spectacular.validation import validate_schema


class ServiceDocumentationTests(SimpleTestCase):
    def test_every_operation_has_summary_description_and_response(self):
        schema = SchemaGenerator().get_schema(request=None, public=True)
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
