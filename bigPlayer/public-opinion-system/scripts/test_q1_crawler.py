import json
import unittest
from io import BytesIO

from urllib import error

import q1_crawler


class FakeResponse:
    def __init__(self, payload, status=201):
        self.payload = json.dumps(payload).encode("utf-8")
        self.status = status

    def read(self):
        return self.payload

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class FeedPaginationTests(unittest.TestCase):
    def test_q1_client_allows_exact_english_host_over_https(self):
        client = q1_crawler.Q1Client(
            "https://club-en.q1.com?env=web&gameId=game&gameVersion=1",
            "token", q1_crawler.DEFAULT_ALLOWED_HOSTS,
        )
        self.assertEqual(client.host, "club-en.q1.com")

    def test_q1_client_rejects_unapproved_or_unsafe_base_urls(self):
        urls = (
            "https://club-en.q1.com.evil.test?env=web&gameId=game&gameVersion=1",
            "https://127.0.0.1?env=web&gameId=game&gameVersion=1",
            "http://club-en.q1.com?env=web&gameId=game&gameVersion=1",
            "https://club-en.q1.com:8443?env=web&gameId=game&gameVersion=1",
        )
        for url in urls:
            with self.subTest(url=url):
                with self.assertRaises(q1_crawler.CrawlError):
                    q1_crawler.Q1Client(url, "token", q1_crawler.DEFAULT_ALLOWED_HOSTS)

    def test_q1_client_rejects_private_reserved_and_local_ip_hosts(self):
        urls = (
            "https://10.0.0.1?env=web&gameId=game&gameVersion=1",
            "https://192.168.1.1?env=web&gameId=game&gameVersion=1",
            "https://169.254.0.1?env=web&gameId=game&gameVersion=1",
            "https://192.0.2.1?env=web&gameId=game&gameVersion=1",
            "https://127.0.0.1?env=web&gameId=game&gameVersion=1",
        )
        for url in urls:
            with self.subTest(url=url):
                with self.assertRaises(q1_crawler.CrawlError):
                    q1_crawler.Q1Client(url, "token", ("10.0.0.1", "192.168.1.1", "169.254.0.1", "192.0.2.1", "127.0.0.1"))

    def test_q1_client_rejects_ipv6_loopback_link_local_ula_and_reserved_hosts(self):
        urls = (
            "https://[::1]?env=web&gameId=game&gameVersion=1",
            "https://[fe80::1]?env=web&gameId=game&gameVersion=1",
            "https://[fd00::1]?env=web&gameId=game&gameVersion=1",
            "https://[2001:db8::1]?env=web&gameId=game&gameVersion=1",
        )
        for url in urls:
            with self.subTest(url=url):
                with self.assertRaises(q1_crawler.CrawlError):
                    q1_crawler.Q1Client(url, "token", ("::1", "fe80::1", "fd00::1", "2001:db8::1"))

        class RedirectResponse:
            def geturl(self):
                return "https://club-en.q1.com.evil.test/redirected"

            def read(self):
                return b'{"code": 0, "data": {}}'

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

        original_urlopen = q1_crawler.request.urlopen
        q1_crawler.request.urlopen = lambda *_args, **_kwargs: RedirectResponse()
        try:
            client = q1_crawler.Q1Client(
                "https://club.q1.com?env=web&gameId=game&gameVersion=1",
                "token", q1_crawler.DEFAULT_ALLOWED_HOSTS,
            )
            with self.assertRaises(q1_crawler.CrawlError):
                client.get("/api/club/v1/auth/user/context", capability="context")
        finally:
            q1_crawler.request.urlopen = original_urlopen

    def test_short_page_continues_until_boundary(self):
        pages = [
            {"data": {"items": [{"id": "2", "createTime": "2026-08-26T01:00:00+08:00"}], "hasMore": True, "nextOffset": 1, "total": 2}},
            {"data": {"items": [{"id": "1", "createTime": "2026-08-25T23:00:00+08:00"}], "hasMore": False, "nextOffset": 2, "total": 2}},
        ]
        class Client:
            base = type("Base", (), {"scheme": "https", "netloc": "club.q1.com"})()
            def get(self, *args, **kwargs): return pages.pop(0)
        feed = {"endpointKind": "merged", "boardId": "b", "sectionId": "s", "pageKind": "home", "tabName": "all"}
        truncated = []
        result = q1_crawler.fetch_feed_posts(Client(), feed, q1_crawler.to_ms("2026-08-26T00:00:00+08:00"), q1_crawler.to_ms("2026-08-27T00:00:00+08:00"), 20, 5, lambda *_: None, truncated)
        self.assertEqual(len(result), 1)
        self.assertEqual(truncated, [])

    def test_explicit_end_before_total_is_partial(self):
        pages = [
            {"data": {"items": [{"id": "2", "createTime": "2026-08-26T01:00:00+08:00"}], "hasMore": False, "total": 2}},
            {"data": {"items": [], "hasMore": False, "total": 2}},
        ]
        class Client:
            base = type("Base", (), {"scheme": "https", "netloc": "club.q1.com"})()
            def get(self, *args, **kwargs): return pages.pop(0)
        feed = {"endpointKind": "merged", "boardId": "b", "sectionId": "s", "pageKind": "home", "tabName": "all"}
        truncated = []
        q1_crawler.fetch_feed_posts(Client(), feed, q1_crawler.to_ms("2026-08-26T00:00:00+08:00"), q1_crawler.to_ms("2026-08-27T00:00:00+08:00"), 20, 5, lambda *_: None, truncated)
        self.assertIn(truncated[0]["reason"], {"total_not_reached", "empty_page_before_boundary"})

    def test_empty_feed_with_unknown_total_not_partial(self):
        """第一页就空且 total 未知：feed 当天确实没内容，不应记 partial。"""
        pages = [{"data": {"items": [], "hasMore": False, "total": None, "nextOffset": 0}}]
        class Client:
            base = type("Base", (), {"scheme": "https", "netloc": "club.q1.com"})()
            def get(self, *args, **kwargs): return pages.pop(0)
        feed = {"endpointKind": "merged", "boardId": "b", "sectionId": "s", "pageKind": "home", "tabName": "all"}
        truncated = []
        result = q1_crawler.fetch_feed_posts(Client(), feed, q1_crawler.to_ms("2026-08-26T00:00:00+08:00"), q1_crawler.to_ms("2026-08-27T00:00:00+08:00"), 20, 5, lambda *_: None, truncated)
        self.assertEqual(len(result), 0)
        self.assertEqual(truncated, [])

    def test_import_batch_retries_on_5xx_then_succeeds(self):
        """导入批次遇 5xx 应指数退避重试，最终成功。"""
        import time as _time
        original_sleep = _time.sleep
        _time.sleep = lambda _: None  # 加速测试
        calls = []

        def fake_import(api_url, source_id, token, batch, timeout=30, opener=None):
            calls.append(batch)
            if len(calls) < 3:
                raise q1_crawler.CrawlError("内容导入 HTTP 状态 500", code="Q1_IMPORT_HTTP_ERROR")
            return {"inserted": 1, "changed": 0, "unchanged": 0, "batches": 1, "analysisEligibleIds": ["c1"]}

        original = q1_crawler.import_batch
        q1_crawler.import_batch = fake_import
        try:
            args = type("Args", (), {
                "import_api_url": "http://import", "source_id": "source-1",
                "account_id": None, "import_token": "secret",
                "import_batch_size": 10, "import_timeout": 5,
                "analysis_batch_size": 10, "since": None, "until": None,
            })()
            result = q1_crawler.import_captured_content(
                args, [{"externalId": "p1"}], [], [],
                lambda *_: None,
            )
            self.assertEqual(result["inserted"], 1)
            self.assertEqual(result["analysisEligibleIds"], ["c1"])
            self.assertEqual(result["failedBatches"], 0)
            self.assertEqual(len(calls), 3)
        finally:
            _time.sleep = original_sleep
            q1_crawler.import_batch = original

    def test_import_batch_skips_failed_batch_continues(self):
        """导入批次重试用尽后跳过该批次，继续后续批次，不丢弃已抓取内容。"""
        import time as _time
        original_sleep = _time.sleep
        _time.sleep = lambda _: None

        def fake_import(api_url, source_id, token, batch, timeout=30, opener=None):
            ids = [item["externalId"] for item in batch["items"]]
            if "p1" in ids:
                raise q1_crawler.CrawlError("内容导入 HTTP 状态 500", code="Q1_IMPORT_HTTP_ERROR")
            return {"inserted": len(ids), "changed": 0, "unchanged": 0, "batches": 1, "analysisEligibleIds": [f"c-{i}" for i in ids]}

        original = q1_crawler.import_batch
        q1_crawler.import_batch = fake_import
        try:
            args = type("Args", (), {
                "import_api_url": "http://import", "source_id": "source-1",
                "account_id": None, "import_token": "secret",
                "import_batch_size": 1, "import_timeout": 5,
                "analysis_batch_size": 2, "since": None, "until": None,
            })()
            result = q1_crawler.import_captured_content(
                args,
                [{"externalId": "p1"}, {"externalId": "p2"}],
                [], [], lambda *_: None,
            )
            self.assertEqual(result["failedBatches"], 1)
            self.assertEqual(result["failedItems"], 1)
            self.assertEqual(result["inserted"], 1)
            self.assertEqual(result["analysisEligibleIds"], ["c-p2"])
        finally:
            _time.sleep = original_sleep
            q1_crawler.import_batch = original
    def test_fetch_feed_shards_deduplicates_overlapping_posts(self):
        calls = []
        posts = [
            [{"externalId": "p1", "publishedAt": "2026-08-26T01:00:00+08:00"}],
            [{"externalId": "p1", "publishedAt": "2026-08-26T01:00:00+08:00"}, {"externalId": "p2", "publishedAt": "2026-08-26T05:00:00+08:00"}],
        ]
        original = q1_crawler.fetch_feed_posts
        q1_crawler.fetch_feed_posts = lambda *args, **kwargs: calls.append(args[1:3]) or posts.pop(0)
        try:
            since = q1_crawler.parse_window_datetime("2026-08-26T00:00:00+08:00")
            until = q1_crawler.parse_window_datetime("2026-08-26T08:00:00+08:00")
            result, count = q1_crawler.fetch_feed_shards(
                object(), {"endpointKind": "merged", "pageKind": "home", "tabName": "all"},
                since, until, 20, 5, lambda *_: None, [])
        finally:
            q1_crawler.fetch_feed_posts = original
        self.assertEqual(count, 2)
        self.assertEqual([item["externalId"] for item in result], ["p1", "p2"])
        self.assertEqual(len(calls), 2)

    def test_import_captured_content_reports_failed_batch_counts(self):
        args = type("Args", (), {"import_api_url": "http://import", "source_id": "s", "account_id": None,
                                  "import_token": "secret", "import_batch_size": 1, "import_timeout": 5,
                                  "since": None, "until": None})()
        original = q1_crawler.import_batch
        q1_crawler.import_batch = lambda *args, **kwargs: {"inserted": 1, "changed": 0, "unchanged": 0, "batches": 1, "analysisEligibleIds": ["ok"]}
        try:
            result = q1_crawler.import_captured_content(args, [{"externalId": "p"}], [], [], lambda *_: None)
        finally:
            q1_crawler.import_batch = original
        self.assertEqual(result["failedBatches"], 0)
        self.assertEqual(result["failedItems"], 0)
        self.assertEqual(result["analysisEligibleIds"], ["ok"])

        since = q1_crawler.parse_window_datetime("2026-08-26T00:00:00+08:00")
        until = q1_crawler.parse_window_datetime("2026-08-27T00:00:00+08:00")
        shards = q1_crawler.build_time_shards(since, until, hours=4, overlap_minutes=10)
        self.assertEqual(shards[0][0], since)
        self.assertEqual(shards[-1][1], until)
        for previous, current in zip(shards, shards[1:]):
            self.assertLess(current[0], previous[1])


        calls = []

        def opener(req, timeout):
            calls.append((req, timeout, req.get_header("Authorization"), json.loads(req.data)))
            return FakeResponse({"data": {"items": 1, "inserted": 1, "changed": 0, "unchanged": 0, "batches": 1, "analysisEligibleIds": ["content-1"]}})

        result = q1_crawler.import_batch(
            "http://127.0.0.1:4320/api/public-opinion",
            "source-1",
            "secret",
            {"items": [{"externalId": "p-1"}]},
            opener=opener,
        )
        self.assertEqual(result["inserted"], 1)
        self.assertEqual(calls[0][0].full_url, "http://127.0.0.1:4320/api/public-opinion/sources/source-1/import")
        self.assertEqual(calls[0][2], "Bearer secret")
        self.assertEqual(calls[0][3]["items"][0]["externalId"], "p-1")

    def test_import_captured_content_sorts_posts_then_comments_and_batches(self):
        calls = []
        args = type("Args", (), {
            "import_api_url": "http://import",
            "source_id": "source-1",
            "account_id": None,
            "import_token": "secret",
            "import_batch_size": 2,
            "import_timeout": 5,
            "analysis_batch_size": 2,
            "since": None,
            "until": None,
        })()

        def fake_import(api_url, source_id, token, batch, timeout=30, opener=None):
            calls.append(batch)
            return {"inserted": len(batch["items"]), "changed": 0, "unchanged": 0, "batches": 1, "analysisEligibleIds": [f"content-{item['externalId']}" for item in batch["items"]]}

        original = q1_crawler.import_batch
        q1_crawler.import_batch = fake_import
        try:
            result = q1_crawler.import_captured_content(
                args,
                [{"externalId": "post-2"}, {"externalId": "post-1"}],
                [{"externalId": "reply-1", "contentDepth": 2}, {"externalId": "comment-1", "contentDepth": 1}],
                [],
                lambda *_: None,
            )
        finally:
            q1_crawler.import_batch = original

        self.assertEqual(result["items"], 4)
        self.assertEqual(result["batches"], 2)
        self.assertEqual(result["analysisEligibleIds"], ["content-post-1", "content-post-2", "content-comment-1", "content-reply-1"])
        self.assertEqual([item["externalId"] for item in calls[0]["items"]], ["post-1", "post-2"])
        self.assertEqual([item["externalId"] for item in calls[1]["items"]], ["comment-1", "reply-1"])

    def test_submit_analysis_batch_sends_content_ids_in_batches(self):
        calls = []

        def opener(req, timeout):
            calls.append((req.full_url, json.loads(req.data), req.get_header("Authorization")))
            return FakeResponse({"data": {"submitted": len(json.loads(req.data)["contentIds"]), "skipped": 0, "failed": 0, "batches": 1}} , status=202)

        result = q1_crawler.submit_captured_analysis(type("Args", (), {
            "import_api_url": "http://127.0.0.1:4320/api/public-opinion",
            "import_token": "secret", "analysis_batch_size": 2, "import_timeout": 5
        })(), ["c1", "c2", "c3"], lambda *_: None, opener=opener)
        self.assertEqual(result["submitted"], 3)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][0], "http://127.0.0.1:4320/api/public-opinion/analysis/content-batch")
        self.assertEqual(calls[0][2], "Bearer secret")
        self.assertEqual(calls[0][1]["contentIds"], ["c1", "c2"])

    def test_import_http_error_does_not_read_or_expose_remote_body(self):
        class SensitiveHttpError(error.HTTPError):
            def __init__(self):
                super().__init__("http://import", 502, "bad", {}, BytesIO(b'{"password":"import-secret"}'))
                self.read_called = False

            def read(self, *args, **kwargs):
                self.read_called = True
                return super().read(*args, **kwargs)

        exc = SensitiveHttpError()
        with self.assertRaises(q1_crawler.CrawlError) as raised:
            q1_crawler.import_batch("http://import", "source-1", "secret", {"items": []}, opener=lambda *args, **kwargs: (_ for _ in ()).throw(exc))
        self.assertFalse(exc.read_called)
        self.assertEqual(raised.exception.code, "Q1_IMPORT_HTTP_ERROR")
        self.assertNotIn("import-secret", str(raised.exception))

    def test_analysis_http_error_does_not_expose_remote_body(self):
        remote = b'{"token":"analysis-secret","error":{"message":"authorization=analysis-secret"}}'
        exc = error.HTTPError("http://import", 500, "bad", {}, BytesIO(remote))
        with self.assertRaises(q1_crawler.CrawlError) as raised:
            q1_crawler.submit_analysis_batch("http://import", "secret", ["c1"], opener=lambda *args, **kwargs: (_ for _ in ()).throw(exc))
        self.assertEqual(raised.exception.code, "Q1_ANALYSIS_HTTP_ERROR")
        self.assertNotIn("analysis-secret", str(raised.exception))

    def test_non_2xx_json_body_does_not_expose_remote_message(self):
        def opener(req, timeout):
            response = FakeResponse({"error": {"message": "password=body-secret"}}, status=400)
            response.status = 400
            return response

        with self.assertRaises(q1_crawler.CrawlError) as raised:
            q1_crawler.import_batch("http://import", "source-1", "secret", {"items": []}, opener=opener)
        self.assertEqual(raised.exception.code, "Q1_IMPORT_HTTP_ERROR")
        self.assertNotIn("body-secret", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
