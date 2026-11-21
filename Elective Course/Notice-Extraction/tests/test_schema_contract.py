import unittest

from contract import consumer_validate

VALID_RECORD = {"schema_version": "1.0", "domain": "example.com", "expires_on": "2026-12-20"}


class SchemaContractTests(unittest.TestCase):
    def test_additive_change_accepted_breaking_change_rejected(self):
        # Additive: a new optional field (registrar) is ignored, not rejected.
        additive = {**VALID_RECORD, "registrar": "NameVault Inc."}
        self.assertTrue(consumer_validate(additive))

        # Breaking: required field renamed (domain -> hostname).
        renamed = {"schema_version": "1.0", "hostname": "example.com", "expires_on": "2026-12-20"}
        self.assertFalse(consumer_validate(renamed))

        # Breaking: expires_on changes shape from string to object.
        retyped = {**VALID_RECORD, "expires_on": {"date": "2026-12-20"}}
        self.assertFalse(consumer_validate(retyped))


if __name__ == "__main__":
    unittest.main()
