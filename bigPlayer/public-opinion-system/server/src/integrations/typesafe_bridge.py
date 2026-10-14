"""API服务内部TypeSafe桥接：stdin输入文字数组，stdout逐条安全JSON结果。"""
import asyncio
import json
from pathlib import Path
import sys

# 源码使用根目录客户端；API运行包将同一文件复制至本目录。
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from sentiment_evaluator import SentimentEvaluator, SentimentEvaluationError


async def main():
    posts = json.load(sys.stdin)
    if not isinstance(posts, list) or not 1 <= len(posts) <= 50:
        raise ValueError("invalid batch")
    async with SentimentEvaluator() as evaluator:
        async def one(index, text):
            try:
                result = await evaluator.evaluate(text)
                item = {"index": index, "result": result}
            except SentimentEvaluationError as error:
                item = {"index": index, "error": str(error)}
            print(json.dumps(item, ensure_ascii=True), flush=True)
        await asyncio.gather(*(one(index, text) for index, text in enumerate(posts)))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception:
        # 不输出环境变量、请求文本、原始响应或堆栈。
        print("TYPESAFE_BRIDGE_FAILED", file=sys.stderr)
        sys.exit(2)
