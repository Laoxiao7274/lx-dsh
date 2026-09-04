import requests, json, sys, os

# ── publish.py — publish a release to the LX-DSH update server ──────────────────
#
# Uploads both the full NSIS installer AND the lightweight update package (delta
# zip) for a given version.  The installer is served via /win/latest.yml for the
# electron-updater full-fallback path; the update package is served via
# /update/win/latest.json for the delta update path.
#
# Usage:
#   python publish.py <version> <installer.exe> <update.zip> <base_version>
#
#   version        e.g. 0.3.0
#   installer.exe  dist/LX-DSH Setup 0.3.0.exe   (full NSIS installer)
#   update.zip     dist/LX-DSH-update-0.3.0.zip  (delta update package)
#   base_version   e.g. 0.2.0  (the version the delta was built against;
#                  pass "none" if this is the first release / full snapshot)
#
# Optional env overrides (all read from update-server/.env, git-ignored):
#   LX_UPDATE_SERVER   e.g. http://<host>
#   ADMIN_USER
#   ADMIN_PASS

def _load_env():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if os.path.exists(env_path):
        for line in open(env_path, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

_load_env()
SERVER = os.environ.get("LX_UPDATE_SERVER")
USER = os.environ.get("ADMIN_USER")
PASS = os.environ.get("ADMIN_PASS")
if not SERVER or not USER or not PASS:
    sys.exit("LX_UPDATE_SERVER / ADMIN_USER / ADMIN_PASS missing — set them in update-server/.env (git-ignored) or the environment")

if len(sys.argv) < 4:
    print("Usage: python publish.py <version> <installer.exe> <update.zip> [base_version]")
    sys.exit(1)

version = sys.argv[1]
installer_path = sys.argv[2]
update_path = sys.argv[3]
base_version = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] != "none" else None

# ── login ──────────────────────────────────────────────────────────────────────
r = requests.post(SERVER + "/api/admin/login", json={"username": USER, "password": PASS}, timeout=15)
token = r.json()["token"]
headers = {"Authorization": "Bearer " + token}
print("logged in")

# ── create or reuse version ────────────────────────────────────────────────────
# Check if the version already exists; if so reuse its id, otherwise create it.
r = requests.get(SERVER + "/api/versions", headers=headers, timeout=15)
existing = {v["version"]: v["id"] for v in r.json()}

if version in existing:
    vid = existing[version]
    print(f"version {version} already exists (id={vid}), reusing")
else:
    version_data = {
        "version": version,
        "channel": "stable",
        "summary": f"LX-DSH v{version}",
        "date": __import__("datetime").date.today().strftime("%Y.%m.%d"),
        "notes": []
    }
    r = requests.post(SERVER + "/api/admin/versions", json=version_data, headers=headers, timeout=15)
    vid = r.json()["id"]
    print(f"created version {version}, id: {vid}")

# ── upload full installer (kind=portable) ──────────────────────────────────────
size = os.path.getsize(installer_path)
print(f"\nuploading installer {installer_path} ({size/1048576:.1f} MB)...")
with open(installer_path, "rb") as f:
    r = requests.post(
        SERVER + f"/api/admin/versions/{vid}/upload",
        data={"platform": "win", "kind": "portable"},
        files={"file": (f"LX-DSH-{version}-win.exe", f)},
        headers=headers,
        timeout=600
    )
print("installer upload:", r.json())

# ── upload update package (kind=update, baseVersion=...) ──────────────────────
size = os.path.getsize(update_path)
print(f"\nuploading update package {update_path} ({size/1048576:.1f} MB)...")
with open(update_path, "rb") as f:
    data = {"platform": "win", "kind": "update"}
    if base_version:
        data["baseVersion"] = base_version
    r = requests.post(
        SERVER + f"/api/admin/versions/{vid}/upload",
        data=data,
        files={"file": (f"LX-DSH-update-{version}-win.zip", f)},
        headers=headers,
        timeout=600
    )
print("update upload:", r.json())

# ── verify ────────────────────────────────────────────────────────────────────
print("\n── verifying ──")

r = requests.get(SERVER + "/api/versions/latest", timeout=15)
print("latest version:", json.dumps(r.json(), ensure_ascii=False, indent=2)[:400])

r = requests.get(SERVER + "/win/latest.yml", timeout=15)
print("\n/win/latest.yml (full installer):")
print(r.text)

r = requests.get(SERVER + "/update/win/latest.json", timeout=15)
print("/update/win/latest.json (delta package):")
print(json.dumps(r.json(), ensure_ascii=False, indent=2))
