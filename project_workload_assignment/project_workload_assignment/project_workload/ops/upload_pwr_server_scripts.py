# Copyright (c) 2026, Dinext
"""Upload PWR API server scripts from .sandbox/local to a Frappe site via HTTP API."""

from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import quote

WORKSPACE = Path(__file__).resolve().parents[6]
API_DIR = WORKSPACE / ".cursor" / "skills" / "api" / "scripts"
COMMON_DIR = WORKSPACE / ".cursor" / "skills" / "frappe-script-fixture-sandbox-workflow" / "scripts"
sys.path.insert(0, str(COMMON_DIR))
sys.path.insert(0, str(API_DIR))

from certs import build_request_cert, cleanup_client_certificate  # noqa: E402
from client import FrappeApiClient  # noqa: E402
from common import parse_metadata, strip_metadata_block  # noqa: E402
from runtime import load_env, resolve_connection  # noqa: E402

SANDBOX_API = WORKSPACE / ".sandbox" / "local" / "server-script" / "api"

TARGET_SCRIPTS = [
	"Get Projects Workload Data_Exp_V2.py",
	"Get_Project_Workload_Data_V3.py",
	"Get Tasks Exp And WorkloadV3.py",
	"Сheck Workload Overload_V2.py",
]

DISABLE_SCRIPTS = [
	"PWR Legacy - Get Projects Workload Data Exp V2 (Pre-Phase2)",
	"PWR Legacy - Get Project Workload Data V3 (Pre-Phase2)",
	"Get Projects Workload Data_Exp",
	"Get Projects Workload Data_Exp_OLD",
]


def api_call(env: str, method: str, endpoint: str, body: dict | None = None) -> dict:
	env_values = load_env(WORKSPACE / ".sandbox" / ".env")
	connection = resolve_connection(env_name=env, env_values=env_values, base_url_override=None, use_admin=False)
	cert = build_request_cert(env_name=env, client_cert=None, client_key=None, client_p12=None, client_p12_password=None)
	client = FrappeApiClient(connection=connection, client_certificate=cert)
	try:
		response = client.request(method=method, endpoint=endpoint, params=None, body=body, timeout=120)
		payload = response.json()
		if "data" not in payload:
			raise RuntimeError(f"Unexpected API response for {endpoint}: {payload}")
		return payload["data"]
	finally:
		cleanup_client_certificate(cert)


def upload_script(env: str, file_path: Path) -> None:
	meta_text = file_path.read_text(encoding="utf-8")
	metadata = parse_metadata(meta_text)
	script_name = metadata.get("Script Name") or file_path.stem
	encoded = quote(script_name, safe="")
	doc = api_call(env, "GET", f"/api/resource/Server Script/{encoded}")
	doc["script"] = strip_metadata_block(meta_text).strip() + "\n"
	if metadata.get("Disabled") is not None:
		doc["disabled"] = int(metadata.get("Disabled") or 0)
	else:
		doc["disabled"] = 0
	api_call(env, "PUT", f"/api/resource/Server Script/{encoded}", doc)
	print(f"OK: {script_name} (disabled={doc.get('disabled')})")


def disable_script(env: str, name: str) -> None:
	encoded = quote(name, safe="")
	try:
		doc = api_call(env, "GET", f"/api/resource/Server Script/{encoded}")
	except Exception as exc:
		print(f"SKIP disable {name}: {exc}")
		return
	doc["disabled"] = 1
	api_call(env, "PUT", f"/api/resource/Server Script/{encoded}", doc)
	print(f"DISABLED: {name}")


def run(env: str = "test") -> dict:
	uploaded = []
	for filename in TARGET_SCRIPTS:
		path = SANDBOX_API / filename
		if not path.is_file():
			raise FileNotFoundError(path)
		upload_script(env, path)
		uploaded.append(filename)
	disabled = []
	for name in DISABLE_SCRIPTS:
		disable_script(env, name)
		disabled.append(name)
	return {"uploaded": uploaded, "disabled": disabled}


if __name__ == "__main__":
	import argparse

	parser = argparse.ArgumentParser()
	parser.add_argument("--env", default="test")
	args = parser.parse_args()
	result = run(args.env)
	print(result)
