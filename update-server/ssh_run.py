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

def run(cmd, timeout=600):
    client = connect()
    chan = client.get_transport().open_session()
    chan.settimeout(timeout)
    chan.exec_command(cmd)
    out = b""
    err = b""
    while True:
        if chan.recv_ready(): out += chan.recv(65536)
        if chan.recv_stderr_ready(): err += chan.recv_stderr(65536)
        if chan.exit_status_ready() and not chan.recv_ready() and not chan.recv_stderr_ready(): break
    while chan.recv_ready(): out += chan.recv(65536)
    while chan.recv_stderr_ready(): err += chan.recv_stderr(65536)
    code = chan.recv_exit_status()
    client.close()
    return out.decode("utf-8", errors="replace"), err.decode("utf-8", errors="replace"), code

if __name__ == "__main__":
    cmd = sys.argv[1]
    out, err, code = run(cmd)
    print(out, end="")
    if err: print(err, end="", file=sys.stderr)
    sys.exit(code)
