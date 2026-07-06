#!/usr/bin/env python3
import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as temp_file:
            json.dump(data, temp_file, ensure_ascii=False, indent=2)
            temp_file.write("\n")
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description="Append a Spec Kit companion context history entry.")
    parser.add_argument("--feature-dir", required=True)
    parser.add_argument("--step", required=True)
    parser.add_argument("--finish", action="store_true")
    parser.add_argument("--by", required=True)
    args = parser.parse_args()

    context_path = Path(args.feature_dir) / ".spec-context.json"
    with context_path.open("r", encoding="utf-8") as context_file:
        context = json.load(context_file)

    history = context.setdefault("history", [])
    history.append(
        {
            "step": args.step,
            "substep": None,
            "kind": "complete" if args.finish else "start",
            "by": args.by,
            "at": utc_now(),
        }
    )
    context["currentStep"] = args.step

    atomic_write_json(context_path, context)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
