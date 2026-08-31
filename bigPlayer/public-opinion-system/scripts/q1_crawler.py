#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""大玩家社区（club.q1.com）帖子 + 评论抓取脚本。

本脚本复用生产连接器 bigPlayerH5Connector.js 中已验证的 Q1 授权只读接口和字段映射，
用纯 Python（仅标准库 urllib）实现同样的抓取链路：

    user/context  -> 发现授权看板 board
    board schema  -> 发现首页 / 资讯 / 玩家圈的全部 Tab feed
    每个 feed     -> 分页拉取帖子
    每个帖子      -> 分页拉取顶层评论
    评论若有更多回复 -> 用 commentId 再分页拉取回复

安全与口径约束（与 Node 连接器保持一致）：
  - Token 只从环境变量 / --token 读取，绝不写入代码、日志或输出文件。
  - 只请求白名单 host（默认 club.q1.com），拒绝跨站重定向。
  - 只按发布时间窗口 [--since, --until) 过滤帖子；缺失时间戳时按 fail-closed 处理。
  - provider / 网络 / JSON 错误一律显式报错，绝不用空结果伪装成功。

用法示例：
    # 方式一：复用「抓取账号管理」后台配置（链接 + token 均在后台维护，推荐）
    python q1_crawler.py --source-id <采集源UUID> --yesterday --out ../../.temp/q1-crawl
    #   → 自动从 po_sources.config 读 baseUrl，用 AES-256-GCM 解密 po_credentials 取授权 token
    #     （复用 resolve_source_credential.js，与 Node 采集器共用同一凭据存储与解密逻辑）

    # 方式二：手动传参（临时调试；token 建议走环境变量，别写进命令历史）
    export Q1_API_TOKEN='<授权 Bearer token>'
    python q1_crawler.py \
        --base-url 'https://club.q1.com?env=web&gameId=xxx&gameVersion=yyy&lang=zh-Hans' \
        --yesterday \
        --out ../../.temp/q1-crawl

只输出落地文件路径和统计摘要，不打印 Token / Cookie / 原始敏感响应。
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib import request, parse, error

# 北京时间与 Node 侧 businessDay.js 保持一致：UTC+8。
BEIJING = timezone(timedelta(hours=8))

# 与 bigPlayerH5Connector.js 完全一致的接口路径。
EP_USER_CONTEXT = "/api/club/v1/auth/user/context"
EP_BOARD = "/api/club/v2/auth/board"
EP_MERGED = "/api/club/v1/auth/post/model/merged-list"
EP_INFO = "/api/club/v1/auth/post/list"
EP_ACTIVITY = "/api/club/v1/auth/post/activity/list"
EP_COMMENT = "/api/club/v1/auth/comment/"  # + postId


class CrawlError(Exception):
    """采集失败：结构化错误码，绝不把失败伪装成空结果。"""
    def __init__(self, message, code="Q1_CRAWLER_FAILED", details=None):
        super().__init__(message)
        self.code = code
        self.details = details or {}


def error_payload(error, failure_phase="collection"):
    return {"status": "collection_failed", "errorCode": getattr(error, "code", "Q1_CRAWLER_FAILED"),
            "failurePhase": failure_phase, "message": str(error), "details": getattr(error, "details", {})}


def emit_error(error, failure_phase="collection"):
    print(json.dumps(error_payload(error, failure_phase), ensure_ascii=False), flush=True)


# --------------------------------------------------------------------------- #
# HTTP 客户端
# --------------------------------------------------------------------------- #
class Q1Client:
    def __init__(self, base_url, token, allowed_hosts, timeout=15, delay_ms=500):
        parsed = parse.urlparse(base_url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise CrawlError("base-url 必须是 http(s) 且包含 host")
        self.base = parsed
        self.host = parsed.hostname or ""
        if self.host not in allowed_hosts:
            raise CrawlError(f"host {self.host} 不在白名单 {allowed_hosts}")
        # env / gameId / gameVersion / lang 由 base-url 的 query 携带（与 q1Context 一致）。
        q = dict(parse.parse_qsl(parsed.query))
        self.game_id = q.get("gameId", "")
        self.game_version = q.get("gameVersion", "")
        self.env = q.get("env", "web")
        lang = (q.get("lang") or "").strip().lower()
        self.language = "zh-Hans" if lang in ("", "zh-cn", "zh-hans") else q.get("lang")
        if not self.game_id or not self.game_version or not self.env:
            raise CrawlError("base-url 必须包含 env、gameId、gameVersion 查询参数")
        self.token = token
        self.allowed_hosts = allowed_hosts
        self.timeout = timeout
        self.delay = max(0, delay_ms) / 1000.0

    def _auth_header(self):
        value = str(self.token or "").strip()
        return value if value.lower().startswith("bearer ") else f"Bearer {value}"

    def get(self, path, params=None, capability="posts"):
        if self.delay:
            time.sleep(self.delay)
        url = parse.urlunparse(
            (self.base.scheme, self.base.netloc, path, "", "", "")
        )
        clean = {k: str(v) for k, v in (params or {}).items() if v not in (None, "")}
        if clean:
            url = f"{url}?{parse.urlencode(clean)}"
        # 复用连接器的请求头（不含 Cookie）。
        req = request.Request(
            url,
            headers={
                "accept": "application/json",
                "authorization": self._auth_header(),
                "content-language": self.language,
                "user-agent": "PublicOpinionSystem/1.0",
            },
            method="GET",
        )
        try:
            with request.urlopen(req, timeout=self.timeout) as resp:
                final_host = parse.urlparse(resp.geturl()).hostname or ""
                if final_host and final_host not in self.allowed_hosts:
                    raise CrawlError(f"{capability}: 重定向到白名单外 host {final_host}")
                body = resp.read()
        except error.HTTPError as exc:
            code = {
                401: "UNAUTHORIZED",
                403: "PERMISSION_DENIED",
                429: "RATE_LIMITED",
            }.get(exc.code, "Q1_HTTP_ERROR")
            raise CrawlError(f"{capability}: HTTP 状态 {exc.code}", code=code, details={"status": exc.code})
        except error.URLError as exc:
            raise CrawlError(f"{capability}: 网络错误 {exc.reason}") from None
        try:
            payload = json.loads(body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise CrawlError(f"{capability}: 返回非法 JSON") from None
        if payload.get("code") is not None and int(payload["code"]) != 0:
            raise CrawlError(f"{capability}: provider 返回错误 code={payload['code']}")
        return payload


# --------------------------------------------------------------------------- #
# 解析辅助（对齐 Node 连接器里的 q1* 函数）
# --------------------------------------------------------------------------- #
def first_array(*values):
    for v in values:
        if isinstance(v, list):
            return v
    return []


def positive_id(value):
    if value is None or str(value).strip() == "":
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return str(value).strip() if n > 0 else None


def q1_media(content):
    media_keys = {"url", "imageUrl", "image_url", "src", "image", "images", "pics", "pictures", "attachments", "media"}
    media = []

    def visit(value, key=""):
        if isinstance(value, str):
            value = value.strip()
            if value and (key in media_keys or value.startswith(("http://", "https://", "//"))) and value not in media:
                media.append(value)
            return
        if isinstance(value, list):
            for item in value:
                visit(item, key)
            return
        if not isinstance(value, dict):
            return
        for child_key, child_value in value.items():
            if child_key in media_keys or child_key in {"data", "content", "children", "blocks"}:
                visit(child_value, child_key)

    visit(content)
    return media


def q1_body(content):
    """递归提取 Q1 富文本中的文本，兼容不同 block 类型并保留段落换行。"""
    text_keys = {"text", "value", "content", "data", "desc", "description", "title"}
    parts = []

    def visit(value, key=""):
        if isinstance(value, str):
            if value.strip():
                parts.append(value.strip())
            return
        if isinstance(value, list):
            for item in value:
                visit(item, key)
            return
        if not isinstance(value, dict):
            return
        for child_key, child_value in value.items():
            if child_key in text_keys or child_key in {"children", "blocks"}:
                visit(child_value, child_key)

    visit(content)
    return "\n".join(dict.fromkeys(parts)).strip()


def find_boards(payload):
    """从 user/context 深度搜索 board 列表，对齐 q1Boards。"""
    candidates = []

    def visit(value, key=""):
        if not isinstance(value, (dict, list)):
            return
        if "board" in key.lower():
            if isinstance(value, list):
                candidates.extend(value)
            else:
                candidates.append(value)
        items = value.values() if isinstance(value, dict) else enumerate(value)
        if isinstance(value, dict):
            for k, v in value.items():
                visit(v, k)
        else:
            for v in value:
                visit(v, key)

    visit(payload)
    seen, boards = set(), []
    for item in candidates:
        if isinstance(item, dict) and item.get("id") is not None:
            bid = str(item["id"]).strip()
            if bid and bid not in seen:
                seen.add(bid)
                boards.append({"id": bid, "name": str(item.get("name") or "").strip()})
    if not boards:
        raise CrawlError("user/context 未返回任何 board")
    return boards


def group_candidates(value, result=None):
    if result is None:
        result = []
    if isinstance(value, list):
        group_like = [
            it for it in value
            if isinstance(it, dict)
            and (it.get("id") is not None or it.get("sectionId") is not None)
            and it.get("type") is not None
            and any(k in it for k in ("sections", "children", "items", "subSections", "name"))
        ]
        if group_like:
            result.append(group_like)
        for it in value:
            group_candidates(it, result)
    elif isinstance(value, dict):
        for v in value.values():
            group_candidates(v, result)
    return result


def board_feeds(payload, board):
    """从 board schema 展开首页 / 资讯 / 玩家圈全部 Tab，对齐 q1BoardFeeds。"""
    data = payload.get("data") if isinstance(payload, dict) else None
    schema = (data or {}).get("board") or (data or {}).get("model") or data
    if not isinstance(schema, dict):
        raise CrawlError("board schema 非法")
    groups = first_array(
        (data or {}).get("groups"), schema.get("groups"), payload.get("groups"),
        (data or {}).get("boardGroups"), schema.get("boardGroups"),
        (data or {}).get("tabs"), schema.get("tabs"),
        *group_candidates(payload),
    )
    if not groups:
        raise CrawlError("board schema 未返回 groups")

    feeds, keys = [], set()

    def feed_key(f):
        return ":".join(str(x) for x in [
            f["boardId"], f["pageKind"], f["endpointKind"], f.get("groupId") or "",
            f.get("sectionId") or "", f.get("type") if f.get("type") is not None else "",
            f.get("orderType") if f.get("orderType") is not None else "",
            "" if f.get("isUltimate") is None else int(bool(f["isUltimate"])),
        ])

    def add(d):
        f = {
            "boardId": str(board["id"]),
            "groupId": None if d.get("groupId") is None else str(d["groupId"]),
            "sectionId": None if d.get("sectionId") is None else str(d["sectionId"]),
            "orderType": None if d.get("orderType") is None else int(d["orderType"]),
            "isUltimate": None if d.get("isUltimate") is None else bool(d["isUltimate"]),
        }
        f.update(d)
        f["feedKey"] = feed_key(f)
        if f["feedKey"] not in keys:
            keys.add(f["feedKey"])
            feeds.append(f)

    def children_of(node):
        return first_array(node.get("sections"), node.get("children"),
                           node.get("items"), node.get("subSections")) if isinstance(node, dict) else []

    # 首页合并流。
    add({"pageKind": "home", "endpointKind": "merged", "groupId": None, "groupType": None,
         "sectionId": "0", "tabName": "首页", "type": None, "orderType": None, "isUltimate": None})

    def add_info(node, group):
        sid = positive_id(node.get("id") if node.get("id") is not None else node.get("sectionId"))
        if sid:
            add({"pageKind": "info", "endpointKind": "info",
                 "groupId": str(group.get("id") if group.get("id") is not None else group.get("sectionId")),
                 "groupType": int(group.get("type")), "sectionId": sid,
                 "tabName": str(node.get("name") or group.get("name") or "").strip(),
                 "type": 1, "orderType": node.get("orderType"),
                 "isUltimate": node.get("isUltimate") if node.get("isUltimate") is not None
                 else len(children_of(node)) == 0})
        for child in children_of(node):
            add_info(child, group)

    for group in groups:
        gid = positive_id(group.get("id") if group.get("id") is not None else group.get("sectionId"))
        try:
            gtype = int(group.get("type"))
        except (TypeError, ValueError):
            continue
        if not gid:
            continue
        if gtype == 0:
            add_info(group, group)
        elif gtype == 1:
            common = {"pageKind": "circle", "endpointKind": "activity", "groupId": gid,
                      "groupType": gtype, "sectionId": gid, "orderType": group.get("orderType"),
                      "isUltimate": False}
            add({**common, "tabName": "全部", "type": 3})
            add({**common, "tabName": "精选", "type": 4})

            def visit(node):
                kids = children_of(node)
                sid = positive_id(node.get("id") if node.get("id") is not None else node.get("sectionId"))
                if sid and sid != gid:
                    add({"pageKind": "circle", "endpointKind": "activity", "groupId": gid,
                         "groupType": gtype, "sectionId": sid,
                         "tabName": str(node.get("name") or "").strip(), "type": 5,
                         "orderType": node.get("orderType") if node.get("orderType") is not None
                         else group.get("orderType"),
                         "isUltimate": node.get("isUltimate") if node.get("isUltimate") is not None
                         else len(kids) == 0})
                for child in kids:
                    visit(child)

            for child in children_of(group):
                visit(child)

    if len(feeds) == 1:
        raise CrawlError("board schema 未暴露任何 info / circle feed")
    return feeds


def page_items(payload):
    """从帖子分页响应里取出 items / hasMore / total / nextOffset，对齐 q1PageData。"""
    data = payload.get("data")
    items = first_array(
        data if isinstance(data, list) else None,
        (data or {}).get("items") if isinstance(data, dict) else None,
        (data or {}).get("list") if isinstance(data, dict) else None,
        (data or {}).get("records") if isinstance(data, dict) else None,
        (data or {}).get("rows") if isinstance(data, dict) else None,
        (data or {}).get("posts") if isinstance(data, dict) else None,
        payload.get("items"), payload.get("list"),
    )
    meta = data if isinstance(data, dict) else payload

    def as_bool(*vals):
        for v in vals:
            if isinstance(v, bool):
                return v
            if v in (1, "1", "true"):
                return True
            if v in (0, "0", "false"):
                return False
        return None

    def as_num(*vals):
        for v in vals:
            try:
                return float(v)
            except (TypeError, ValueError):
                continue
        return None

    return {
        "items": items,
        "hasMore": as_bool(meta.get("hasMore"), meta.get("has_next"), meta.get("has_more"), meta.get("hasNext"),
                           payload.get("hasMore"), payload.get("has_next"), payload.get("has_more"), payload.get("hasNext")),
        "total": as_num(meta.get("total"), meta.get("totalCount"), meta.get("count"),
                        payload.get("total"), payload.get("totalCount"), payload.get("count")),
        "nextOffset": as_num(meta.get("nextOffset"), meta.get("nextOffsetId"),
                             meta.get("next_offset"), payload.get("nextOffset"),
                             payload.get("nextOffsetId")),
    }


def parse_post(item, client):
    if item.get("id") is None:
        raise CrawlError("Q1 post 缺少 id")
    user = item.get("user") or {}
    personality = user.get("personality") or {}
    account = user.get("account") or {}
    detail = (f"{client.base.scheme}://{client.base.netloc}/api/club/v1/auth/post/"
              f"?postId={parse.quote(str(item['id']))}&source=0")
    return {
        "externalId": str(item["id"]),
        "contentType": "post",
        "title": str(item.get("title") or "").strip(),
        "body": q1_body(item.get("content")),
        "media": q1_media(item.get("content")),
        "rawPayload": item,
        "authorName": str(personality.get("nickName") or personality.get("nickname") or "").strip(),
        "platformAuthorId": None if account.get("id") is None else str(account["id"]),
        "publishedAt": item.get("createTime") or None,
        "sourceUrl": detail,
        "engagement": {
            "comments": int(item.get("commentCount") or 0),
            "likes": int(item.get("thumbsUpCount") or 0),
            "views": int(item.get("clickCount") or 0),
        },
        "boardId": None if item.get("boardId") is None else str(item["boardId"]),
        "sectionId": None if item.get("sectionId") is None else str(item["sectionId"]),
        "isDeleted": bool(item.get("isDeleted") is True or item.get("moderatorIsDelete") is True
                          or (item.get("status") is not None and int(item["status"]) < 0)),
    }


def parse_comment(item, client, root_id, parent_id=None):
    if item.get("id") is None:
        raise CrawlError("Q1 comment 缺少 id")
    user = item.get("user") or {}
    personality = user.get("personality") or {}
    account = user.get("account") or {}
    detail = (f"{client.base.scheme}://{client.base.netloc}/api/club/v1/auth/post/"
              f"?postId={parse.quote(str(root_id))}&source=0")
    resolved_parent = parent_id if parent_id is not None else item.get("parentId")
    return {
        "externalId": str(item["id"]),
        "contentType": "comment",
        "body": q1_body(item.get("content")),
        "media": q1_media(item.get("content")),
        "rawPayload": item,
        "authorName": str(personality.get("nickName") or personality.get("nickname") or "").strip(),
        "platformAuthorId": None if account.get("id") is None else str(account["id"]),
        "publishedAt": item.get("createTime") or None,
        "sourceUrl": detail,
        "platformParentId": None if resolved_parent is None else str(resolved_parent),
        "rootPlatformContentId": str(root_id),
        "contentDepth": 1 if (parent_id is None and item.get("parentId") is None) else 2,
        "engagement": {"likes": int(item.get("thumbsUpCount") or 0)},
        "isDeleted": bool(item.get("isDeleted") is True or item.get("moderatorIsDelete") is True
                          or item.get("isEnabled") is False
                          or (item.get("status") is not None and int(item["status"]) < 0)),
    }


# --------------------------------------------------------------------------- #
# 抓取流程
# --------------------------------------------------------------------------- #
def to_ms(iso):
    if not iso:
        return None
    try:
        # Q1 createTime 多为 ISO8601；容忍末尾 Z。
        s = str(iso).replace("Z", "+00:00")
        return datetime.fromisoformat(s).timestamp() * 1000
    except ValueError:
        try:
            return float(iso)  # 兼容毫秒时间戳
        except (TypeError, ValueError):
            return None


def build_time_shards(since, until, hours=4, overlap_minutes=10):
    """Generate overlapping half-open time shards for a bounded crawl."""
    if since is None or until is None or until <= since:
        return [(since, until)]
    shards = []
    cursor = since
    step = timedelta(hours=max(1, int(hours)))
    overlap = timedelta(minutes=max(0, int(overlap_minutes)))
    while cursor < until:
        end = min(until, cursor + step)
        shards.append((max(since, cursor - (overlap if shards else timedelta(0))), end))
        cursor = end
    return shards


def fetch_feed_shards(client, feed, since, until, page_size, max_pages, log, truncated):
    """Fetch each shard from a fresh cursor and merge posts by external ID."""
    merged = {}
    shards = build_time_shards(since, until)
    for shard_since, shard_until in shards:
        shard_posts = fetch_feed_posts(client, feed, shard_since.timestamp() * 1000 if shard_since else None, shard_until.timestamp() * 1000 if shard_until else None, page_size, max_pages, log, truncated)
        for post in shard_posts:
            merged.setdefault(post["externalId"], post)
    return list(merged.values()), len(shards)
def fetch_feed_posts(client, feed, since_ms, until_ms, page_size, max_pages, log, truncated):
    """分页拉取单个 feed；短页不能证明已到末尾，必须验证游标/总量/时间边界。"""
    endpoint = {"merged": EP_MERGED, "info": EP_INFO, "activity": EP_ACTIVITY}[feed["endpointKind"]]
    posts, page_index, offset_id, prev_fp = [], 1, 0, None
    pages = 0
    consumed_total = 0
    crossed = False
    for _ in range(max_pages):
        pages += 1
        params = {"boardId": feed["boardId"], "sectionId": feed["sectionId"], "pageSize": page_size, "offsetId": offset_id}
        if feed["endpointKind"] == "merged":
            params["pageIndex"] = page_index
        else:
            params["type"] = int(feed["type"])
            if feed.get("orderType") is not None: params["orderType"] = int(feed["orderType"])
            if feed.get("isUltimate") is not None: params["isUltimate"] = int(bool(feed["isUltimate"]))
        result = page_items(client.get(endpoint, params, capability="posts"))
        raw = result["items"]
        if not isinstance(raw, list): raise CrawlError("帖子分页结果非法")
        fp = ",".join(str(it.get("id") or it.get("postId") or "") for it in raw)
        if raw and fp == prev_fp: raise CrawlError("帖子分页返回重复页")
        parsed = [parse_post(it, client) for it in raw]
        feed_hint = {"feedKey": feed.get("feedKey"), "pageKind": feed.get("pageKind"), "sectionId": feed.get("sectionId"), "boardId": feed.get("boardId"), "tabName": feed.get("tabName"), "endpointKind": feed.get("endpointKind"), "groupId": feed.get("groupId")}
        for p in parsed: p["feed"] = feed_hint
        stamps = [to_ms(p["publishedAt"]) for p in parsed]
        if since_ms is not None and any(s is None for s in stamps): raise CrawlError("帖子缺少可用发布时间，无法验证窗口边界")
        posts.extend(p for p, s in zip(parsed, stamps) if since_ms is None or since_ms <= s < until_ms)
        consumed_offset = offset_id + len(raw)
        next_off = int(result["nextOffset"]) if result["nextOffset"] is not None else consumed_offset
        total = result["total"]
        explicit_more = result["hasMore"]
        if explicit_more is None:
            has_more = bool(total is None or consumed_offset < int(total))
        elif explicit_more is False:
            has_more = bool(total is not None and consumed_offset < int(total))
        else:
            has_more = True

        consumed_total += len(raw)
        crossed = bool(since_ms is not None and stamps and min(s for s in stamps if s is not None) < since_ms)
        if total is not None and consumed_total >= int(total):
            break
        if crossed:
            break
        if not has_more:
            if total is not None and consumed_total < int(total):
                truncated.append({"feed": f"{feed['pageKind']}/{feed.get('tabName','')}", "reason": "total_not_reached", "pages": pages, "consumed": consumed_total, "total": int(total)})
            elif since_ms is not None and consumed_total >= page_size and not crossed:
                # total 未知但本页是满页（page_size），无法证明已覆盖到窗口下界，才记 partial。
                # total=None 且本页未满页时，说明 feed 已自然结束，不算不完整。
                truncated.append({"feed": f"{feed['pageKind']}/{feed.get('tabName','')}", "reason": "boundary_unverified", "pages": pages, "consumed": consumed_total})
            break
        if not raw:
            # 第一页就空且 total 未知/为 0：feed 当天确实没内容，不算不完整。
            # 只有之前已抓到内容（consumed_total>0）又翻到空页时才记 partial。
            if consumed_total > 0:
                truncated.append({"feed": f"{feed['pageKind']}/{feed.get('tabName','')}", "reason": "empty_page_before_boundary", "pages": pages, "consumed": consumed_total, "total": int(total) if total is not None else None})
            break
        if next_off <= offset_id:
            raise CrawlError("帖子分页游标未前进")
        offset_id, prev_fp, page_index = next_off, fp, page_index + 1
    else:
        if since_ms is not None and not crossed:
            truncated.append({"feed": f"{feed['pageKind']}/{feed.get('tabName','')}", "reason": "max_pages", "pages": pages, "kept": len(posts), "consumed": consumed_total})
    log(f"  feed[{feed['pageKind']}/{feed.get('tabName','')}] 翻页 {pages} 页，命中窗口帖子 {len(posts)}")
    return posts


def fetch_comments(client, post_id, page_size, max_pages, log):
    """拉取一个帖子的全部顶层评论，并对声明有更多回复的评论再抓回复。"""
    all_nodes, reply_targets = [], []
    offset_id, prev_fp = "0", None
    pages = 0
    for _ in range(max_pages):
        pages += 1
        payload = client.get(EP_COMMENT + parse.quote(str(post_id)),
                             {"offsetId": offset_id, "pageSize": page_size,
                              "postId": str(post_id), "sortType": 0},
                             capability="comments")
        data = payload.get("data")
        if not isinstance(data, list) or not isinstance(payload.get("total"), (int, float)):
            raise CrawlError("评论响应非法")
        fp = ",".join(str(it.get("id") or "") for it in data)
        if data and fp == prev_fp:
            raise CrawlError("评论分页返回重复页")
        for it in data:
            top = parse_comment(it, client, post_id, None)
            replies = first_array(it.get("replies"), it.get("children"))
            all_nodes.append(top)
            for r in replies:
                all_nodes.append(parse_comment(r, client, post_id, top["externalId"]))
            if int(it.get("commentCount") or 0) > len(replies) or it.get("hasMore") is True \
                    or it.get("repliesHasMore") is True:
                reply_targets.append(top["externalId"])
        total = int(payload["total"])
        consumed_more = len(data) >= page_size and len(all_nodes) < total
        has_more = len(data) > 0 and consumed_more
        next_off = str(data[-1].get("id")) if data else ""
        if not has_more or not next_off or next_off == offset_id:
            break
        offset_id, prev_fp = next_off, fp

    # 对每个声明「回复未取全」的顶层评论，用 commentId 再分页取回复。
    for cid in reply_targets:
        r_offset, r_prev = "0", None
        for _ in range(max_pages):
            payload = client.get(EP_COMMENT + parse.quote(str(post_id)),
                                 {"offsetId": r_offset, "pageSize": page_size,
                                  "postId": str(post_id), "commentId": cid, "sortType": 0},
                                 capability="comments")
            data = payload.get("data")
            if not isinstance(data, list):
                raise CrawlError("回复响应非法")
            fp = ",".join(str(it.get("id") or "") for it in data)
            if data and fp == r_prev:
                break
            for it in data:
                all_nodes.append(parse_comment(it, client, post_id, cid))
            total = int(payload.get("total") or 0)
            has_more = len(data) >= page_size and len(data) > 0
            next_off = str(data[-1].get("id")) if data else ""
            if not has_more or not next_off or next_off == r_offset:
                break
            r_offset, r_prev = next_off, fp

    # 去重（同 externalId 只保留一次）。
    seen, unique = set(), []
    for node in all_nodes:
        if node["externalId"] not in seen:
            seen.add(node["externalId"])
            unique.append(node)
    log(f"    post {post_id} 顶层评论翻页 {pages} 页，评论/回复 {len(unique)}")
    return unique


def parse_window_datetime(value):
    text = str(value).strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    return datetime.fromisoformat(text)


def resolve_window(args):
    if args.since and args.until:
        since = parse_window_datetime(args.since)
        until = parse_window_datetime(args.until)
        if since.tzinfo is None:
            since = since.replace(tzinfo=BEIJING)
        if until.tzinfo is None:
            until = until.replace(tzinfo=BEIJING)
        return since, until, "custom"
    if args.yesterday:
        now = datetime.now(BEIJING)
        today0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return today0 - timedelta(days=1), today0, (today0 - timedelta(days=1)).strftime("%Y-%m-%d")
    return None, None, "all"


def resolve_from_account_management(args, log):
    """通过生产凭据解析器读采集源 baseUrl 并解密授权 token。

    复用 resolve_source_credential.js：它与后台共用同一套 Repository + CredentialContext +
    AES-256-GCM 解密逻辑，保证 token 口径与生产一致且绝不明文落盘。仅在后台未配置时失败。
    """
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resolve_source_credential.js")
    node_bin = os.environ.get("NODE_BIN", "node")
    cmd = [node_bin, script]
    if getattr(args, "source_id", None): cmd += ["--source-id", args.source_id]
    elif getattr(args, "account_id", None): cmd += ["--account-id", args.account_id]
    cmd += ["--credential-type", args.credential_type]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                              timeout=30, check=False)
    except Exception as exc:
        raise CrawlError("凭据解析器启动失败", code="CREDENTIAL_RESOLVER_FAILED") from None
    if proc.returncode != 0:
        raise CrawlError("后台凭据解析失败", code="CREDENTIAL_RESOLVE_FAILED")
    line = (proc.stdout or "").strip().splitlines()
    if not line:
        raise CrawlError("凭据解析器未返回结果")
    try:
        data = json.loads(line[-1])
    except json.JSONDecodeError as exc:
        raise CrawlError(f"凭据解析器输出非法：{exc}")
    if not data.get("baseUrl") or not data.get("token"):
        raise CrawlError("后台凭据缺少 baseUrl 或 token")
    return data["baseUrl"], data["token"]


def import_batch(api_url, source_id, token, batch, timeout=30, opener=request.urlopen):
    if not api_url:
        raise CrawlError("导入模式缺少 --import-api-url")
    if not source_id:
        raise CrawlError("导入模式必须提供 --source-id")
    endpoint = api_url.rstrip('/') + f"/sources/{parse.quote(str(source_id), safe='')}/import"
    payload = json.dumps(batch, ensure_ascii=False).encode("utf-8")
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    req = request.Request(endpoint, data=payload, method="POST", headers=headers)
    try:
        with opener(req, timeout=timeout) as response:
            raw = response.read()
            status = getattr(response, "status", 200)
    except error.HTTPError as exc:
        raise CrawlError(f"内容导入 HTTP 状态 {exc.code}", code="Q1_IMPORT_HTTP_ERROR", details={"status": exc.code})
    except (error.URLError, TimeoutError, OSError):
        raise CrawlError("内容导入网络失败", code="Q1_IMPORT_NETWORK_ERROR") from None
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise CrawlError("内容导入响应非法", code="Q1_IMPORT_INVALID_RESPONSE") from None
    if status < 200 or status >= 300:
        raise CrawlError(f"内容导入 HTTP 状态 {status}", code="Q1_IMPORT_HTTP_ERROR", details={"status": status})
    data = body.get("data") if isinstance(body, dict) else None
    if not isinstance(data, dict):
        raise CrawlError("内容导入响应缺少 data")
    return data


def submit_analysis_batch(api_url, token, content_ids, timeout=30, opener=request.urlopen):
    if not api_url:
        raise CrawlError("分析提交模式缺少 --import-api-url")
    payload = json.dumps({"contentIds": content_ids, "profile": "light", "triggerReason": "q1_import"}, ensure_ascii=False).encode("utf-8")
    endpoint = api_url.rstrip('/') + "/analysis/content-batch"
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    req = request.Request(endpoint, data=payload, method="POST", headers=headers)
    try:
        with opener(req, timeout=timeout) as response:
            raw = response.read()
            status = getattr(response, "status", 200)
    except error.HTTPError as exc:
        raise CrawlError(f"AI 分析提交 HTTP 状态 {exc.code}", code="Q1_ANALYSIS_HTTP_ERROR", details={"status": exc.code})
    except (error.URLError, TimeoutError, OSError):
        raise CrawlError("AI 分析提交网络失败", code="Q1_ANALYSIS_NETWORK_ERROR") from None
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise CrawlError("AI 分析提交响应非法", code="Q1_ANALYSIS_INVALID_RESPONSE") from None
    if status < 200 or status >= 300:
        raise CrawlError(f"AI 分析提交 HTTP 状态 {status}", code="Q1_ANALYSIS_HTTP_ERROR", details={"status": status})
    data = body.get("data") if isinstance(body, dict) else None
    if not isinstance(data, dict):
        raise CrawlError("AI 分析提交响应缺少 data")
    return data


def submit_captured_analysis(args, content_ids, log, opener=request.urlopen):
    unique_ids = list(dict.fromkeys(str(value) for value in content_ids if value))
    batch_size = min(max(1, int(args.analysis_batch_size)), 200)
    totals = {"status": "submitted", "submitted": 0, "skipped": 0, "failed": 0, "batches": 0, "failedIds": []}
    for start in range(0, len(unique_ids), batch_size):
        result = submit_analysis_batch(args.import_api_url, args.import_token, unique_ids[start:start + batch_size], timeout=args.import_timeout, opener=opener)
        for key in ("submitted", "skipped", "failed", "batches"):
            totals[key] += int(result.get(key, 0) or 0)
        totals["failedIds"].extend(result.get("failedIds") or [])
        log(f"      AI 分析任务批次 {start // batch_size + 1}: {len(unique_ids[start:start + batch_size])} 条")
    return totals


IMPORT_RETRY_CODES = {"Q1_IMPORT_HTTP_ERROR", "Q1_IMPORT_NETWORK_ERROR"}


def import_batch_with_retry(api_url, source_id, token, batch, account_id, window,
                            feeds, batch_items, timeout, max_attempts=3, base_delay=2.0, log=None):
    """对单个导入批次做指数退避重试，仅在 5xx/网络错误时重试。

    重试只针对瞬态故障（如 MariaDB InnoDB 表空间自动扩展临时失败、
    连接超时）；4xx 等客户端错误不重试。批次内全部重试用尽后抛出，
    由调用方决定是跳过该批次还是中止整体导入。
    """
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            result = import_batch(api_url, source_id, token, {
                "accountId": account_id,
                "window": window,
                "feeds": feeds,
                "items": batch_items,
            }, timeout=timeout)
            if attempt > 1 and log:
                log(f"      导入批次重试 {attempt - 1} 次后成功")
            return result, None
        except CrawlError as exc:
            last_error = exc
            if exc.code not in IMPORT_RETRY_CODES or attempt >= max_attempts:
                raise
            delay = base_delay * (2 ** (attempt - 1))
            if log:
                log(f"      导入批次遇到 {exc.code}，{delay:.0f}s 后重试（{attempt}/{max_attempts}）")
            time.sleep(delay)
    raise last_error  # 不可达，保险

def import_captured_content(args, posts, comments, feeds, log):
    batch_size = max(1, int(args.import_batch_size))
    items = sorted(posts, key=lambda item: str(item.get("externalId", "")))
    items += sorted(comments, key=lambda item: (int(item.get("contentDepth", 0)), str(item.get("externalId", ""))))
    totals = {"items": len(items), "inserted": 0, "changed": 0, "unchanged": 0, "batches": 0,
              "analysisEligibleIds": [], "failedBatches": 0, "failedItems": 0}
    window = {"from": args.since, "to": args.until} if args.since and args.until else {}
    for start in range(0, len(items), batch_size):
        batch_items = items[start:start + batch_size]
        batch_no = start // batch_size + 1
        try:
            result, _ = import_batch_with_retry(
                args.import_api_url, args.source_id, args.import_token, {},
                args.account_id, window, feeds, batch_items, timeout=args.import_timeout, log=log)
            for key in ("inserted", "changed", "unchanged", "batches"):
                totals[key] += int(result.get(key, 0) or 0)
            totals["analysisEligibleIds"].extend(result.get("analysisEligibleIds") or [])
            log(f"      导入批次 {batch_no}: {len(batch_items)} 条")
        except CrawlError as exc:
            # 单个批次重试用尽后跳过，继续后续批次，不丢弃已抓取内容。
            totals["failedBatches"] += 1
            totals["failedItems"] += len(batch_items)
            log(f"      导入批次 {batch_no} 失败（已跳过）: {exc.code}")
    totals["analysisEligibleIds"] = list(dict.fromkeys(totals["analysisEligibleIds"]))
    return totals


def main(argv=None):
    ap = argparse.ArgumentParser(description="抓取 club.q1.com 大玩家社区帖子与评论")
    src = ap.add_mutually_exclusive_group()
    src.add_argument("--source-id", metavar="UUID",
                     help="抓取账号管理里的采集源 ID：从 po_sources.config 读 baseUrl，"
                          "并用生产 AES-256-GCM 解密 po_credentials 取授权 token（链接+token 均在后台配置）")
    src.add_argument("--account-id", metavar="UUID",
                     help="账号 ID：直接用该账号的密文凭据解密取 token，baseUrl 取关联采集源")
    ap.add_argument("--credential-type", default="api_token", help="凭据类型（默认 api_token）")
    ap.add_argument("--base-url", default=os.environ.get("Q1_BASE_URL", ""),
                    help="社区完整地址，须含 env/gameId/gameVersion/lang 查询参数（--source-id/--account-id 时自动读取，可省）")
    ap.add_argument("--token", default=os.environ.get("Q1_API_TOKEN", ""),
                    help="授权 Bearer token（建议用环境变量 Q1_API_TOKEN，不要写进命令历史）")
    ap.add_argument("--allowed-hosts", default=os.environ.get("Q1_ALLOWED_HOSTS", "club.q1.com"),
                    help="逗号分隔的白名单 host")
    ap.add_argument("--yesterday", action="store_true", help="只抓昨天（北京时间自然日）发布的内容")
    ap.add_argument("--since", help="自定义窗口起点 ISO 时间（含），默认按北京时间")
    ap.add_argument("--until", help="自定义窗口终点 ISO 时间（不含）")
    ap.add_argument("--page-size", type=int, default=20)
    ap.add_argument("--max-post-pages", type=int, default=200, help="每个 feed 最多翻页数（撞上限且未够到窗口下界会告警为 partial）")
    ap.add_argument("--max-comment-pages", type=int, default=20, help="每个帖子评论最多翻页数")
    ap.add_argument("--no-comments", action="store_true", help="只抓帖子，不抓评论")
    ap.add_argument("--delay-ms", type=int, default=500, help="每次请求间隔，降低对站点压力")
    ap.add_argument("--out", default="", help="输出目录，落地 posts.jsonl / comments.jsonl / summary.json")
    ap.add_argument("--import-to-server", action="store_true", help="抓取完成后通过 HTTP 导入正式公共舆情服务")
    ap.add_argument("--import-api-url", default=os.environ.get("PUBLIC_OPINION_IMPORT_API_URL", "http://127.0.0.1:4320/api/public-opinion"), help="公共舆情服务 API 根地址")
    ap.add_argument("--import-token", default=os.environ.get("PUBLIC_OPINION_IMPORT_TOKEN", ""), help="导入接口 Bearer token，建议使用环境变量")
    ap.add_argument("--import-batch-size", type=int, default=200, help="每批导入条数")
    ap.add_argument("--import-timeout", type=float, default=30, help="导入请求超时秒数")
    ap.add_argument("--analysis-batch-size", type=int, default=200, help="每批提交 AI 分析任务的内容数")
    args = ap.parse_args(argv)

    def log(msg):
        # 抓取过程实时可见，但绝不打印 Token。
        print(msg, file=sys.stderr, flush=True)

    # 优先走「抓取账号管理」：--source-id/--account-id 时从后台读 baseUrl 并解密 token，
    # 与 Node 采集器共用同一凭据存储，实现链接+token 后台可配。
    if args.source_id or args.account_id:
        try:
            resolved_base, resolved_token = resolve_from_account_management(args, log)
        except CrawlError as exc:
            emit_error(exc, "preflight")
            return 1
        args.base_url = args.base_url or resolved_base
        args.token = args.token or resolved_token
        log("      已从抓取账号管理读取 baseUrl 与授权凭据")

    if not args.base_url:
        emit_error(CrawlError("缺少 --base-url", code="BASE_URL_MISSING"), "preflight")
        return 2
    if not args.token:
        emit_error(CrawlError("缺少授权 token", code="TOKEN_EMPTY"), "preflight")
        return 2

    if args.import_to_server and not args.source_id:
        emit_error(CrawlError("导入模式必须提供 --source-id", code="SOURCE_ID_REQUIRED"), "preflight")
        return 2
    if args.import_batch_size < 1 or args.analysis_batch_size < 1 or args.import_timeout <= 0:
        emit_error(CrawlError("批次和超时参数必须为正数", code="INVALID_ARGUMENT"), "preflight")
        return 2

    allowed = [h.strip() for h in args.allowed_hosts.split(",") if h.strip()]
    since, until, label = resolve_window(args)
    since_ms = since.timestamp() * 1000 if since else None
    until_ms = until.timestamp() * 1000 if until else None

    try:
        client = Q1Client(args.base_url, args.token, allowed,
                          delay_ms=args.delay_ms)
        log(f"[1/4] 发现看板 board … 窗口={label}")
        boards = find_boards(client.get(EP_USER_CONTEXT, capability="context"))
        log(f"      board: {[b['id'] for b in boards]}")

        log("[2/4] 展开 feed（首页/资讯/玩家圈全部 Tab）…")
        feeds = []
        for b in boards:
            feeds.extend(board_feeds(client.get(EP_BOARD, {"id": b["id"]}, "board"), b))
        log(f"      共 {len(feeds)} 个 feed")

        log("[3/4] 分页抓取帖子…")
        posts, post_seen, truncated, shard_count = [], set(), [], 0
        for feed in feeds:
            feed_posts, count = fetch_feed_shards(client, feed, since, until, args.page_size, args.max_post_pages, log, truncated)
            shard_count = max(shard_count, count)
            for p in feed_posts:
                if p["externalId"] not in post_seen:
                    post_seen.add(p["externalId"])
                    posts.append(p)
        log(f"      去重后帖子 {len(posts)} 篇")

        comments = []
        if not args.no_comments:
            log("[4/4] 抓取评论与回复…")
            for p in posts:
                comments.extend(fetch_comments(client, p["externalId"],
                                               args.page_size, args.max_comment_pages, log))
        else:
            log("[4/4] 跳过评论抓取（--no-comments）")

    except CrawlError as exc:
        emit_error(exc, "collection")
        return 1

    summary = {
        "status": "collection_partial" if truncated else "collection_completed",
        "window": label,
        "publishedFrom": since.astimezone(timezone.utc).isoformat() if since else None,
        "publishedTo": until.astimezone(timezone.utc).isoformat() if until else None,
        "feeds": len(feeds),
        "shards": shard_count,
        "rawPosts": len(posts),
        "posts": len(posts),
        "comments": len([c for c in comments if c["contentDepth"] == 1]),
        "replies": len([c for c in comments if c["contentDepth"] == 2]),
        "truncatedFeeds": truncated,
    }

    if args.out:
        os.makedirs(args.out, exist_ok=True)
        summary["outDir"] = os.path.abspath(args.out)
        with open(os.path.join(args.out, "posts.jsonl"), "w", encoding="utf-8") as f:
            for p in posts:
                f.write(json.dumps(p, ensure_ascii=False) + "\n")
        with open(os.path.join(args.out, "comments.jsonl"), "w", encoding="utf-8") as f:
            for c in comments:
                f.write(json.dumps(c, ensure_ascii=False) + "\n")

    if args.import_to_server:
        try:
            import_stats = import_captured_content(args, posts, comments, feeds, log)
            summary["import"] = import_stats
            if import_stats.get("failedBatches", 0) > 0 and import_stats.get("analysisEligibleIds"):
                # 部分批次失败但有内容已导入：继续提交分析，标记 import_partial
                summary["status"] = "import_partial"
            elif import_stats.get("failedBatches", 0) > 0 and not import_stats.get("analysisEligibleIds"):
                summary["status"] = "collection_import_failed"
                summary["importError"] = f"全部 {import_stats.get('failedBatches')} 个导入批次失败"
                if args.out:
                    with open(os.path.join(args.out, "summary.json"), "w", encoding="utf-8") as f:
                        json.dump(summary, f, ensure_ascii=False, indent=2)
                print(json.dumps(summary, ensure_ascii=False), flush=True)
                return 1
            summary["analysis"] = submit_captured_analysis(args, import_stats.get("analysisEligibleIds", []), log)
        except CrawlError as exc:
            if summary.get("import"):
                summary["status"] = "analysis_submit_failed"
                summary["analysis"] = {"status": "analysis_submit_failed", "submitted": 0, "skipped": 0, "failed": len(summary["import"].get("analysisEligibleIds", [])), "batches": 0, "failedIds": summary["import"].get("analysisEligibleIds", [])}
                summary["analysisError"] = str(exc)
            else:
                summary["status"] = "collection_import_failed"
                summary["importError"] = str(exc)
            if args.out:
                with open(os.path.join(args.out, "summary.json"), "w", encoding="utf-8") as f:
                    json.dump(summary, f, ensure_ascii=False, indent=2)
            print(json.dumps(summary, ensure_ascii=False), flush=True)
            return 1

    if args.out:
        with open(os.path.join(args.out, "summary.json"), "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)

    print(json.dumps(summary, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
