import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from services.scrape_cycle import (
    DAILY_DISCOVERY_ONLY_NEWER_THAN,
    DAILY_DISCOVERY_RESULTS_LIMIT,
    enqueue_sync_all_jobs_all_clients,
)


def _make_supabase(*, clients, competitors):
    jobs: list = []

    def table(name: str):
        t = MagicMock()
        if name == "clients":
            chain = MagicMock()
            chain.execute.return_value = SimpleNamespace(data=list(clients))
            t.select.return_value.eq.return_value = chain
        elif name == "competitors":
            chain = MagicMock()
            chain.execute.return_value = SimpleNamespace(data=list(competitors))
            t.select.return_value.eq.return_value = chain
        elif name == "background_jobs":

            def insert(row):
                jobs.append(row)
                im = MagicMock()
                im.execute.return_value = SimpleNamespace(data=[])
                return im

            t.insert.side_effect = insert
        return t

    sb = MagicMock()
    sb.table.side_effect = table
    sb._test_jobs = jobs  # type: ignore[attr-defined]
    return sb


class TestSyncAllCronPolicy(unittest.TestCase):
    @patch("services.scrape_cycle.has_active_job", return_value=False)
    def test_sync_all_queues_profile_only_with_two_day_window(self, _mock_haj) -> None:
        clients = [{"id": "cli1", "org_id": "org1"}]
        competitors = [{"id": "comp_a"}, {"id": "comp_b"}]
        sb = _make_supabase(clients=clients, competitors=competitors)

        enqueue_sync_all_jobs_all_clients(sb)

        jobs = sb._test_jobs  # type: ignore[attr-defined]
        self.assertEqual(len(jobs), 3)

        types = [j["job_type"] for j in jobs]
        self.assertTrue(all(jt == "profile_scrape" for jt in types))
        self.assertEqual(
            sum(1 for j in jobs if j.get("payload", {}).get("scrape_own")),
            1,
        )

        own = next(j for j in jobs if j["payload"].get("scrape_own"))
        self.assertEqual(
            own["payload"]["only_newer_than"],
            DAILY_DISCOVERY_ONLY_NEWER_THAN,
        )
        self.assertEqual(
            own["payload"]["results_limit"],
            DAILY_DISCOVERY_RESULTS_LIMIT,
        )

        comp_jobs = [j for j in jobs if j["payload"].get("competitor_id")]
        self.assertEqual(len(comp_jobs), 2)
        for j in comp_jobs:
            p = j["payload"]
            self.assertIn("competitor_id", p)
            self.assertEqual(p["only_newer_than"], DAILY_DISCOVERY_ONLY_NEWER_THAN)
            self.assertEqual(p["results_limit"], DAILY_DISCOVERY_RESULTS_LIMIT)

        self.assertEqual(
            sum(1 for j in jobs if j["job_type"] == "keyword_reel_similarity"),
            0,
        )
        self.assertEqual(
            sum(1 for j in jobs if j["job_type"] == "baseline_scrape"),
            0,
        )


if __name__ == "__main__":
    unittest.main()
