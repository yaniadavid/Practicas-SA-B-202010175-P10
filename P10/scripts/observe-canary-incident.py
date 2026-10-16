"""Time a real SLO alert -> Tempo trace -> Loki cause during the stage 5 drill."""

import argparse
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def get_json(url):
    with urllib.request.urlopen(url, timeout=10) as response:
        return json.load(response)


def samples(path):
    if not path.exists():
        return []
    result = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            result.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return result


def save_result(path, evidence):
    """Keep a prior confirmed finding when an older observer finishes later."""
    path.parent.mkdir(parents=True, exist_ok=True)
    target = path
    if path.exists() and evidence.get("result") != "confirmed":
        try:
            previous = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            previous = {}
        if previous.get("result") == "confirmed":
            target = path.with_name(path.stem + "-unconfirmed" + path.suffix)
    target.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def find_cause(trace_id):
    tempo = get_json(f"http://localhost:53320/api/traces/{trace_id}")
    services = set()
    slow_span_ms = None
    fault_attribute = False
    for batch in tempo.get("batches", []):
        for attr in batch.get("resource", {}).get("attributes", []):
            if attr.get("key") == "service.name":
                services.add(attr.get("value", {}).get("stringValue"))
        for scope in batch.get("scopeSpans", []):
            for span in scope.get("spans", []):
                attrs = {attr.get("key"): attr.get("value", {}) for attr in span.get("attributes", [])}
                if attrs.get("p10.fault_mode", {}).get("stringValue") == "slow":
                    fault_attribute = True
                    slow_span_ms = round((int(span["endTimeUnixNano"]) - int(span["startTimeUnixNano"])) / 1_000_000, 1)
    query = ('{k8s_namespace_name="sa-p8",k8s_container_name="pets-service"} '
             f'| json | trace_id="{trace_id}" | message="pet_lookup_injected_delay"')
    loki_url = "http://localhost:53100/loki/api/v1/query_range?" + urllib.parse.urlencode({"query": query, "limit": 10})
    loki = get_json(loki_url)
    logs = [json.loads(value[1]) for stream in loki.get("data", {}).get("result", [])
            for value in stream.get("values", [])]
    if fault_attribute and logs and {"api-gateway", "appointments-service", "pets-service"}.issubset(services):
        return {"trace_id": trace_id, "services": sorted(services),
                "pets_span_ms": slow_span_ms, "fault_attribute": "slow",
                "log_event": logs[0]}
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--load", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    deadline = time.monotonic() + args.timeout
    evidence = {"monitor_started_utc": now(), "alert_name": "P10LatencyBudgetBurn"}
    while time.monotonic() < deadline:
        try:
            alerts = get_json("http://localhost:53393/api/v2/alerts")
            match = next((a for a in alerts if a.get("labels", {}).get("alertname") == evidence["alert_name"]
                          and a.get("status", {}).get("state") == "active"), None)
            if match:
                evidence["alert_first_seen_utc"] = now()
                evidence["alert_starts_at_utc"] = match.get("startsAt")
                evidence["receiver"] = [r.get("name") for r in match.get("receivers", [])]
                print(json.dumps({"alert_first_seen_utc": evidence["alert_first_seen_utc"]}), flush=True)
                break
        except Exception as error:
            print(f"alert poll: {error}", flush=True)
        time.sleep(3)
    else:
        evidence["result"] = "alert_not_seen"
        save_result(args.output, evidence)
        return 1

    cause_deadline = time.monotonic() + 180
    while time.monotonic() < cause_deadline:
        candidates = [s for s in samples(args.load) if s.get("status") == 201 and s.get("duration_ms", 0) > 1200]
        for sample in reversed(candidates):
            try:
                cause = find_cause(sample["trace_id"])
                if cause:
                    evidence["cause_confirmed_utc"] = now()
                    evidence["sample"] = sample
                    evidence["cause"] = cause
                    start = datetime.fromisoformat(evidence["alert_first_seen_utc"].replace("Z", "+00:00"))
                    end = datetime.fromisoformat(evidence["cause_confirmed_utc"].replace("Z", "+00:00"))
                    evidence["alert_to_cause_seconds"] = round((end - start).total_seconds(), 1)
                    evidence["result"] = "confirmed"
                    save_result(args.output, evidence)
                    print(json.dumps({"result": "confirmed", "trace_id": sample["trace_id"],
                                      "alert_to_cause_seconds": evidence["alert_to_cause_seconds"]}), flush=True)
                    return 0
            except Exception as error:
                print(f"trace/log poll: {error}", flush=True)
        time.sleep(3)
    evidence["result"] = "cause_not_confirmed"
    save_result(args.output, evidence)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
