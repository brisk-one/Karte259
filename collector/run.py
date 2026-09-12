"""Einstiegspunkt eines Sammellaufs: python3 -m collector.run --trigger schedule"""
import argparse
import json
import os
import sys
import time
import traceback

from . import config, inaday, net, store, world

RUNS_HEADER = ["run_utc", "trigger", "result", "world_changed", "data_last_modified", "players", "villages",
               "allies", "new_conquers", "world_requests", "guest_requests", "inaday_changed_types",
               "inaday_full_scrape", "duration_s", "errors"]


def tribe_members():
    rows = store.read_csv(store.dpath("latest", "players.csv"))
    return [(int(r["id"]), r["name"]) for r in rows if int(r["ally"]) in config.TRIBE_IDS]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--trigger", default="manual")
    ap.add_argument("--skip-inaday", action="store_true")
    args = ap.parse_args(argv)

    t0 = time.time()
    now_utc, now_local = store.now_pair()
    state = store.load_state()
    errors, w, d = [], {}, {}

    try:
        w = world.update(state, now_utc, now_local)
    except Exception as e:
        errors.append(f"Weltdaten: {e}")
        traceback.print_exc()

    if not args.skip_inaday:
        try:
            d = inaday.update(state, now_utc, now_local, tribe_members())
            errors += [f"Tagesbeste: {x}" for x in d.get("errors", [])]
        except Exception as e:
            errors.append(f"Tagesbeste: {e}")
            traceback.print_exc()

    duration = round(time.time() - t0, 1)
    result = "fehler" if errors else ("neu" if w.get("changed") else "unverändert")
    status = {
        "run_utc": store.iso(now_utc),
        "run_local": store.iso(now_local),
        "trigger": args.trigger,
        "result": result,
        "duration_s": duration,
        "world": {k: w.get(k) for k in ("changed", "note", "counts", "new_conquers", "downloads")},
        "data_last_modified": state.get("data_last_modified"),
        "counts": state.get("counts", {}),
        "history_since_utc": state.get("history_since_utc"),
        "inaday": {k: d.get(k) for k in ("changed_types", "full_scrape", "members", "entries", "events", "top_rows",
                                         "deep_rows", "deep_pages", "deep_note", "deep_page_size",
                                         "deep_complete", "deep_targets")},
        "last_full_scrape_utc": state.get("inaday", {}).get("last_full_scrape_utc"),
        "last_deep_scrape_utc": state.get("inaday", {}).get("last_deep_scrape_utc"),
        "requests": {"world": net.Counter.world, "guest": net.Counter.guest},
        "errors": errors,
        "tribe_ids": config.TRIBE_IDS,
    }
    store.save_state(state)
    store.save_json(store.dpath("status.json"), status)
    counts = state.get("counts", {})
    store.append_csv(store.dpath("runs.csv"), RUNS_HEADER, [[
        store.iso(now_utc), args.trigger, result, int(bool(w.get("changed"))), state.get("data_last_modified") or "",
        counts.get("players", ""), counts.get("villages", ""), counts.get("allies", ""), w.get("new_conquers", ""),
        net.Counter.world, net.Counter.guest, " ".join(d.get("changed_types") or []),
        int(bool(d.get("full_scrape"))), duration, " | ".join(errors)]])

    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"changed={'true' if (w.get('changed') or d.get('full_scrape')) else 'false'}\n")
            f.write(f"error={'true' if errors else 'false'}\n")
    print(json.dumps(status, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
