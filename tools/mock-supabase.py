#!/usr/bin/env python3
"""
TrailNote · 本地模拟 Supabase
================================
为什么有这个文件：
    真正的 Supabase 需要注册账号才能测。这个脚本用 20 行逻辑模拟了
    supabase.sql 里那三个 RPC，接口形状和 Supabase 的 PostgREST 一致，
    所以前端代码不用改就能对着它跑。

用途：
    * 没有 Supabase 账号时，本地验证「分享 / 查看 / 停止分享」整条链路
    * 当作接口契约的参考

用法：
    python3 tools/mock-supabase.py            # 默认 http://127.0.0.1:8126
    # 然后给前端注入配置（不用改 js/config.js）：
    #   window.__TRAILNOTE_SUPABASE__ = { url: 'http://127.0.0.1:8126', anonKey: 'mock' }

注意：这是内存存储，进程一停数据就没了。别拿它当生产后端。
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8126
MAX_PAYLOAD = 2 * 1024 * 1024

STORE = {}  # token -> {edit_key, payload, version, created_at, updated_at}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # ---------- 工具 ----------
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type, apikey, authorization, prefer")
        self.send_header("Access-Control-Max-Age", "86400")

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _error(self, code, message):
        # Supabase/PostgREST 的错误形状
        self._json(code, {"message": message, "code": "P0001", "hint": None, "details": None})

    def log_message(self, fmt, *args):
        sys.stderr.write("[mock] %s\n" % (fmt % args))

    # ---------- 路由 ----------
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        if not self.path.startswith("/rest/v1/rpc/"):
            return self._error(404, "not found")

        fn = self.path.rsplit("/", 1)[-1]
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            params = json.loads(raw or b"{}")
        except Exception:
            return self._error(400, "请求体不是合法 JSON")

        if fn == "publish_shared_trip":
            return self.publish(params)
        if fn == "get_shared_trip":
            return self.get(params)
        if fn == "revoke_shared_trip":
            return self.revoke(params)
        return self._error(404, "function not found: " + fn)

    # ---------- RPC ----------
    def publish(self, p):
        token = p.get("p_token") or ""
        edit_key = p.get("p_edit_key") or ""
        payload = p.get("p_payload")

        if len(token) < 12:
            return self._error(400, "分享码无效")
        if len(edit_key) < 12:
            return self._error(400, "编辑密钥无效")
        if not isinstance(payload, dict):
            return self._error(400, "内容为空")
        if len(json.dumps(payload)) > MAX_PAYLOAD:
            return self._error(400, "内容过大（超过 2MB）")

        row = STORE.get(token)
        if row:
            if row["edit_key"] != edit_key:
                return self._error(403, "没有修改这个分享的权限")
            row["payload"] = payload
            row["version"] += 1
        else:
            STORE[token] = {"edit_key": edit_key, "payload": payload, "version": 1}

        row = STORE[token]
        return self._json(200, {"version": row["version"], "updated_at": "2026-10-24T00:00:00Z"})

    def get(self, p):
        token = p.get("p_token") or ""
        if len(token) < 12:
            return self._json(200, None)
        row = STORE.get(token)
        if not row:
            return self._json(200, None)
        return self._json(200, {
            "payload": row["payload"],
            "version": row["version"],
            "updated_at": "2026-10-24T00:00:00Z",
        })

    def revoke(self, p):
        token = p.get("p_token") or ""
        edit_key = p.get("p_edit_key") or ""
        row = STORE.get(token)
        if not row:
            return self._json(200, False)
        if row["edit_key"] != edit_key:
            return self._error(403, "没有删除这个分享的权限")
        del STORE[token]
        return self._json(200, True)


if __name__ == "__main__":
    print("TrailNote mock Supabase  →  http://127.0.0.1:%d" % PORT)
    print("把这段注入前端可以用它测试：")
    print("  window.__TRAILNOTE_SUPABASE__ = { url: 'http://127.0.0.1:%d', anonKey: 'mock' }" % PORT)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
