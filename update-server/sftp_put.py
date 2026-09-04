import paramiko, sys, os, time

# Credentials come from update-server/.env (git-ignored) or the environment.
def _load_env():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if os.path.exists(env_path):
        for line in open(env_path, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

_load_env()
HOST = os.environ.get('LX_UPDATE_HOST')
USER = os.environ.get('LX_UPDATE_SSH_USER', 'root')
PASS = os.environ.get('LX_UPDATE_SSH_PASS')
if not HOST or not PASS:
    sys.exit('LX_UPDATE_HOST / LX_UPDATE_SSH_PASS missing — set them in update-server/.env (git-ignored) or the environment')
SKIP_DIRS = {"node_modules", ".git", "dist", ".env", "dist-electron", "vendor"}

def connect():
    for attempt in range(5):
        try:
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(HOST, username=USER, password=PASS, timeout=30, banner_timeout=30, auth_timeout=30)
            return client
        except Exception as e:
            print(f"  attempt {attempt+1}: {e}", flush=True)
            time.sleep(3)
    raise Exception("connect failed")

def sftp_mkdirs(sftp, remote_dir):
    path = ""
    for p in remote_dir.strip("/").split("/"):
        path += "/" + p
        try: sftp.stat(path)
        except: sftp.mkdir(path)

def upload_dir(sftp, local_dir, remote_dir):
    sftp_mkdirs(sftp, remote_dir)
    count = 0
    for root, dirs, files in os.walk(local_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        rel = os.path.relpath(root, local_dir).replace("\\", "/")
        rdir = remote_dir if rel == "." else remote_dir + "/" + rel
        sftp_mkdirs(sftp, rdir)
        for f in files:
            local_path = os.path.join(root, f)
            remote_path = rdir + "/" + f
            for attempt in range(3):
                try:
                    sftp.put(local_path, remote_path)
                    count += 1
                    break
                except: time.sleep(2)
            if count % 20 == 0: print(f"  {count} files...", flush=True)
    return count

if __name__ == "__main__":
    local, remote = sys.argv[1], sys.argv[2]
    client = connect()
    sftp = client.open_sftp()
    n = upload_dir(sftp, local, remote)
    print(f"done: {n} files", flush=True)
    sftp.close()
    client.close()
