#!/usr/bin/env python3
"""
Discord API Bridge — provides Chrome TLS fingerprint via tls_client.
Called by the Node.js bot via child_process for quest-critical requests.

Usage:
  python3 discord_api_bridge.py <method> <path> [json_body]

Input:  JSON body on stdin (if needed)
Output: JSON on stdout  {"status": 200, "body": {...}, "error": null}
"""

import os
import sys
import json
import tls_client

API_BASE = "https://discord.com/api/v10"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) discord/1.0.9215 Chrome/138.0.7204.251 "
    "Electron/37.6.0 Safari/537.36"
)

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"status": 0, "body": None, "error": "Usage: bridge.py <method> <path>"}))
        sys.exit(1)

    method = sys.argv[1].upper()
    path = sys.argv[2]
    url = API_BASE + path

    # Read token from env (passed by Node.js)
    token = os.environ.get("DISCORD_USER_TOKEN", "")

    # Read optional JSON body from stdin
    body = None
    if not sys.stdin.isatty():
        try:
            raw = sys.stdin.read().strip()
            if raw:
                body = json.loads(raw)
        except Exception:
            pass

    session = tls_client.Session(
        client_identifier="chrome_120",
        random_tls_extension_order=True,
    )

    headers = {
        "Authorization": token,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
        "Accept-Language": "en-US",
        "Origin": "https://discord.com",
        "Referer": "https://discord.com/channels/@me",
        "Pragma": "no-cache",
        "Cache-Control": "no-cache",
        "Priority": "u=1, i",
        "sec-ch-ua": '\"Not)A;Brand";v="8", "Chromium";v="138"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '\"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-debug-options": "bugReporterEnabled",
        "x-discord-locale": "en-US",
        "x-discord-timezone": "Asia/Kolkata",
    }

    # x-super-properties from env
    xsup = os.environ.get("DISCORD_XSUP", "")
    if xsup:
        headers["x-super-properties"] = xsup

    try:
        method_fn = getattr(session, method.lower(), None)
        if method_fn is None:
            print(json.dumps({"status": 0, "body": None, "error": "Unsupported method: " + method}))
            sys.exit(1)

        kwargs = {"headers": headers, "timeout_seconds": 15}
        if body is not None:
            kwargs["json"] = body

        response = method_fn(url, **kwargs)

        status = response.status_code

        # Parse response body
        try:
            resp_body = response.json()
        except Exception:
            resp_body = response.text if response.text else None

        print(json.dumps({"status": status, "body": resp_body, "error": None}))

    except Exception as e:
        print(json.dumps({"status": 0, "body": None, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
