"""Send concurrent appointment writes to exercise new upstream connections."""

import argparse
import concurrent.futures
import datetime as dt
import json
import os
import secrets
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:53300")
    parser.add_argument("--output", required=True)
    parser.add_argument("--count", type=int, default=60)
    parser.add_argument("--workers", type=int, default=20)
    args = parser.parse_args()
    env = dict(os.environ, AWS_PROFILE="yaniaaws")
    raw = subprocess.run(
        ["aws", "secretsmanager", "get-secret-value", "--secret-id", "p9/sa-platform",
         "--region", "us-east-1", "--query", "SecretString", "--output", "text"],
        check=True, capture_output=True, text=True, env=env,
    ).stdout
    token = json.loads(raw)["appointments-write-token"]
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    def send(index):
        started = dt.datetime.now(dt.timezone.utc)
        trace_id = secrets.token_hex(16)
        payload = json.dumps({
            "petId": "pet-001", "veterinarian": "Dra. P10",
            "reason": f"Ensayo canary concurrente P10 #{index}",
            "scheduledAt": (started + dt.timedelta(days=7, minutes=index)).isoformat(),
        }).encode()
        request = urllib.request.Request(
            args.base_url.rstrip("/") + "/api/appointments", data=payload,
            headers={"Content-Type": "application/json", "x-appointments-write-token": token,
                     "traceparent": f"00-{trace_id}-{secrets.token_hex(8)}-01"},
            method="POST",
        )
        status, appointment_id, error = 0, None, None
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                status = response.status
                body = json.load(response)
                appointment_id = body.get("id")
        except urllib.error.HTTPError as exc:
            status = exc.code
            error = exc.read().decode(errors="replace")[:500]
        except Exception as exc:
            error = str(exc)
        ended = dt.datetime.now(dt.timezone.utc)
        return {"at_utc": started.isoformat(), "ended_utc": ended.isoformat(),
                "sequence": index, "trace_id": trace_id, "status": status,
                "duration_ms": round((ended - started).total_seconds() * 1000, 1),
                "appointment_id": appointment_id, "error": error}

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(send, index) for index in range(args.count)]
        with output.open("a", encoding="utf-8") as handle:
            for future in concurrent.futures.as_completed(futures):
                row = future.result()
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
                handle.flush()
                print({"status": row["status"], "duration_ms": row["duration_ms"],
                       "trace_id": row["trace_id"]}, flush=True)


if __name__ == "__main__":
    main()
