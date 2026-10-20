"""冰川GPT System One TypeSafe 游戏舆情客户端（Python >= 3.10）。

安装依赖：python -m pip install httpx
设置 BCGPT_API_KEY 后运行：python sentiment_evaluator.py
仅分析文字，不写数据库、不替换现役 Worker、不记录密钥或原始响应。
一次请求最多尝试三次（首次 + 两次重试）；每次请求总超时 3 秒。
批量按输入顺序返回；任何请求失败会显式抛错，不伪造正常判定。
"""

import asyncio
import copy
import json
import math
import os
import sys

import httpx


API_URL = "https://chat-test.q1.com/v1/systemone"
# 平台现役 OpenAPI 的合法模型：jev-latest / jev-1.13.0。
# decision-model-preview 不在该接口的现役合法模型枚举中。
MODEL = "jev-latest"
LEVELS = {"L0", "L1", "L2", "L3"}
TRIGGERS = {"none", "login_or_asset", "compliance_or_refund", "churn"}
QUESTIONS = {
    "level": {
        "type": "choice",
        "instructions": (
            "根据现役v11标准定级。核心判据是是否有具体产品或运营问题，"
            "不是玩家情绪有多激烈。只看原文，不推测图片或后果；帖子/评论独立判定。"
            "无不满的咨询为L0，纯情绪或个人抽卡运气抱怨为L1。"
            "提到概率、暗改、充值、退款或投诉不直接升级；"
            "必须区分无事实支持的运气抱怨与可核查的异常指控。"
            "例如‘80抽全吃保底，垃圾游戏概率绝对暗改了’仅个人运气抱怨，无具体异常证据，判L1；"
            "明确复现情境的卡死、未到账等判L2；存在具体紧急条件才判L3。"
        ),
        "criteria": {
            "L0": "正常/无需处理：无不满异常的咨询、攻略、正常讨论、欧皇晒卡、玩梗广告",
            "L1": "关注级：有明确不满/吐槽但缺少具体可核查问题（如十连全蓝纯抽卡黑、爆率吐槽、单次闪退无复现线索）",
            "L2": "紧急告警：指出具体对象和异常现象（数值失衡、充值未到账、特定关卡Bug、玩法恶性体验），但未达到紧急严重故障",
            "L3": "紧急告警：持续无法登录、盗号、资损漏洞、集体退款/合规投诉、过半弃坑流失等恶性事件",
        },
    },
    "has_verifiable_issue": {
        "type": "noul",
        "instructions": (
            "原文是否指出了可供产研核查的具体异常现象、特定玩法对象或系统Bug"
            "（区别于纯情绪宣泄或纯抽卡黑）？必须同时有具体对象和异常说法；"
            "正常玩法提问、仅说80抽保底或主观断言暗改不算具体异常。"
        ),
    },
    "emergency_trigger": {
        "type": "choice",
        "instructions": (
            "是否命中紧急告警核心条件之一？仅依据原文明确报告，"
            "普通投诉/退款流程咨询、个人口头弃坑、一次偶发掉线不触发。"
        ),
        "criteria": {
            "none": "未触发任何紧急事件",
            "login_or_asset": "持续无法登录/盗号/异常扣款/资损漏洞",
            "compliance_or_refund": "组织集体退款/集体差评/合规及外部投诉",
            "churn": "明确报告公会或大量玩家过半弃坑流失",
        },
    },
}


class SentimentEvaluationError(RuntimeError):
    """安全错误摘要；不包含鉴权、原文或平台原始响应。"""


def _probability(value: object, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SentimentEvaluationError(f"INVALID_RESPONSE: {field} must be numeric")
    number = float(value)
    if not math.isfinite(number) or not 0 <= number <= 1:
        raise SentimentEvaluationError(f"INVALID_RESPONSE: {field} must be in [0, 1]")
    return number


def resolve_sentiment(answers: dict) -> dict:
    """按本次指定顺序应用规则，保留原判及低置信 L3 人工复核标记。

    低置信 L3 即使后续降为 L2/L1，仍 manual_review；L3 因无触发项降
    L2 后不再次执行低置信降级，避免改变指定的执行顺序。
    """
    if not isinstance(answers, dict):
        raise SentimentEvaluationError("INVALID_RESPONSE: answers must be an object")
    level = answers.get("level")
    issue = answers.get("has_verifiable_issue")
    trigger = answers.get("emergency_trigger")
    if not all(isinstance(item, dict) for item in (level, issue, trigger)):
        raise SentimentEvaluationError("INVALID_RESPONSE: missing decision objects")
    raw_level = level.get("choice")
    emergency = trigger.get("choice")
    if not isinstance(raw_level, str) or raw_level not in LEVELS:
        raise SentimentEvaluationError("INVALID_RESPONSE: unknown level")
    if not isinstance(emergency, str) or emergency not in TRIGGERS:
        raise SentimentEvaluationError("INVALID_RESPONSE: unknown emergency trigger")
    confidence = _probability(level.get("confidence"), "level.confidence")
    verifiable = _probability(issue.get("noul"), "has_verifiable_issue.noul")
    final_level, status = raw_level, "auto_passed"
    if confidence < 0.6:
        if raw_level == "L2":
            final_level = "L1"
        elif raw_level == "L3":
            status = "manual_review"
    if raw_level == "L3" and emergency == "none":
        final_level = "L2"
    if raw_level in {"L2", "L3"} and verifiable < 0.5:
        final_level = "L1"
    return {
        "final_level": final_level,
        "status": status,
        "confidence": confidence,
        "raw_level": raw_level,
    }


class SentimentEvaluator:
    """复用连接池；用 async with 保证关闭。信号量跨批次限制并发为 10。"""

    def __init__(self, *, transport: httpx.AsyncBaseTransport | None = None):
        api_key = os.getenv("BCGPT_API_KEY", "").strip()
        if not api_key:
            raise SentimentEvaluationError("请先设置环境变量 BCGPT_API_KEY")
        self._client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            timeout=httpx.Timeout(3.0),
            follow_redirects=False,
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=10),
            transport=transport,
        )
        self._semaphore = asyncio.Semaphore(10)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def evaluate(self, state: str) -> dict:
        if not isinstance(state, str) or not state.strip():
            raise ValueError("state 必须是非空文字")
        payload = {"model": MODEL, "state": state, "questions": copy.deepcopy(QUESTIONS)}
        async with self._semaphore:
            for attempt in range(3):
                try:
                    response = await asyncio.wait_for(
                        self._client.post(API_URL, json=payload), timeout=3.0
                    )
                except (httpx.TransportError, asyncio.TimeoutError):
                    if attempt == 2:
                        raise SentimentEvaluationError("REQUEST_FAILED: network error or 3s timeout") from None
                else:
                    if response.status_code == 429 or 500 <= response.status_code <= 599:
                        if attempt == 2:
                            raise SentimentEvaluationError(f"REQUEST_FAILED: HTTP {response.status_code}")
                    elif not 200 <= response.status_code <= 299:
                        hints = {
                            400: "请求参数未通过校验，请核对平台支持的 model 和 questions 格式",
                            401: "鉴权未通过，请检查 BCGPT_API_KEY 是否有效",
                            403: "没有调用权限，请检查密钥的 chat 权限及平台授权",
                        }
                        hint = hints.get(response.status_code, "平台拒绝请求")
                        raise SentimentEvaluationError(f"REQUEST_REJECTED: HTTP {response.status_code}（{hint}）")
                    else:
                        try:
                            data = response.json()
                        except ValueError:
                            raise SentimentEvaluationError("INVALID_RESPONSE: not JSON") from None
                        if not isinstance(data, dict):
                            raise SentimentEvaluationError("INVALID_RESPONSE: expected object")
                        return resolve_sentiment(data.get("answers"))
                await asyncio.sleep(0.5 * 2**attempt)
        raise SentimentEvaluationError("REQUEST_FAILED")

    async def evaluate_batch(self, posts: list[str]) -> list[dict]:
        if not isinstance(posts, list) or any(not isinstance(post, str) or not post.strip() for post in posts):
            raise ValueError("posts 必须是非空文字组成的列表")
        # 显式取消并等待剩余请求，避免一条失败后仍继续后台调用平台。
        tasks = [asyncio.create_task(self.evaluate(post)) for post in posts]
        try:
            return await asyncio.gather(*tasks)
        except BaseException:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise


DEMO_CASES = [
    ("抽了80抽全吃保底，垃圾游戏概率绝对暗改了！", "L1"),
    ("新人求助，这套阵容第三关怎么过？", "L0"),
    ("竞技场用新英雄打第三回合技能卡死，重进直接判负扣分", "L2"),
    ("全服炸服了，充值648扣款成功但是没到账，大家一起去12315投诉退款！", "L3"),
]


async def _main() -> int:
    async with SentimentEvaluator() as evaluator:
        results = await evaluator.evaluate_batch([text for text, _ in DEMO_CASES])
    passed = True
    for index, ((_, expected), result) in enumerate(zip(DEMO_CASES, results), 1):
        matched = result["final_level"] == expected
        passed = passed and matched
        print(json.dumps({"case": index, "expected": expected, "matched": matched, **result}, ensure_ascii=False))
    return 0 if passed else 1


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(_main()))
    except (SentimentEvaluationError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
