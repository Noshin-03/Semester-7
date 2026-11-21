import unittest

from agentlab.lm import Ledger, cost_usd, result_from_response, run_call


class FakeBackend:
    def __init__(self):
        self.calls = []

    def chat(self, **kwargs):
        self.calls.append(kwargs)
        return {"message": {"content": '{"ok": true}'}, "prompt_eval_count": 20,
                "eval_count": 6}


class LedgerTests(unittest.TestCase):
    def test_cost_uses_both_ollama_counts(self):
        self.assertAlmostEqual(cost_usd(1_000_000, 1_000_000), 0.75)

    def test_response_preserves_counts_and_calculates_cost(self):
        result = result_from_response(
            {"message": {"content": "answer"}, "prompt_eval_count": 10, "eval_count": 2},
            0.25)
        self.assertEqual((result.input_tokens, result.output_tokens), (10, 2))
        self.assertAlmostEqual(result.cost_usd, 0.0000027)

    def test_run_call_passes_schema_as_top_level_format(self):
        backend = FakeBackend()
        schema = {"type": "object"}
        run_call(backend, model="fake", system_prompt="sys", prompt="p", format=schema)
        self.assertIs(backend.calls[0]["format"], schema)

    def test_run_call_omits_format_when_not_given(self):
        backend = FakeBackend()
        run_call(backend, model="fake", system_prompt="sys", prompt="p")
        self.assertIsNone(backend.calls[0]["format"])

    def test_ledger_groups_cost_and_tokens_by_method_and_run(self):
        ledger = Ledger()
        backend = FakeBackend()
        for method in ("prompt_only", "grammar_constrained"):
            for run in (1, 2):
                result = run_call(backend, model="fake", system_prompt="sys", prompt="p")
                ledger.record(method=method, run=run, item_id="1", result=result, valid=True)
        self.assertEqual(len(ledger.entries), 4)
        self.assertAlmostEqual(
            ledger.total_cost("prompt_only"),
            ledger.total_cost("grammar_constrained"))
        self.assertAlmostEqual(ledger.total_cost(), ledger.total_cost("prompt_only") * 2)


if __name__ == "__main__":
    unittest.main()
