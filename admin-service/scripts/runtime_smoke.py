"""Isolated Compose acceptance: real Admin/User/PostgreSQL/authenticated Kafka.

Creates a unique disposable project, never uses .env or an existing database/broker.
Seeds TEST-ONLY case data and activates a disposable User account via fixture SQL
inside this project's databases (not a reporting, email verification or bootstrap test).
Credit outcomes are simulated by a test producer using Credit's broker principal;
no Credit application or ledger runs. Never run this producer against a shared stack.
"""

import base64
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]


def run(args, *, env=None, data=None, timeout=600):
    result = subprocess.run(args, cwd=ROOT, env=env, input=data, text=True,
                            capture_output=True, timeout=timeout, encoding="utf-8")
    if result.returncode:
        # Never print command input/environment: they may contain throwaway keys/tokens.
        raise RuntimeError(f"{args[0]} failed ({result.returncode}): {result.stderr[-3000:]}")
    return result.stdout.strip()


def main():
    openssl = shutil.which("openssl")
    if not openssl and os.name == "nt":
        candidate = Path("C:/Program Files/Git/usr/bin/openssl.exe")
        openssl = str(candidate) if candidate.exists() else None
    if not openssl:
        raise RuntimeError("Install OpenSSL to generate disposable signing keys")
    project = "foc-admin-runtime-test-" + uuid.uuid4().hex[:10]
    env = os.environ.copy()
    for service in ("USER", "SUPPLIER", "CREDIT", "ORDER"):
        env.update({f"{service}_DB_NAME": service.lower() + "_test",
                    f"{service}_DB_USER": service.lower() + "_test",
                    f"{service}_DB_PASSWORD": secrets.token_hex(24)})
    for principal in ("ADMIN", "BROKER", "USER_SERVICE", "ORDER_SERVICE", "CREDIT_SERVICE",
                      "ADMIN_SERVICE", "UI_BROKER", "UI_LOGIN"):
        env[f"KAFKA_{principal}_PASSWORD"] = secrets.token_hex(24)
    email, password = "runtime-test@u.nus.edu", "Test!" + secrets.token_hex(16)
    env.update(ADMIN_DB_PASSWORD=secrets.token_hex(24), KAFKA_UI_LOGIN_USERNAME="test-viewer",
               ADMIN_BOOTSTRAP_EMAIL="", ADMIN_BOOTSTRAP_USERNAME="",
               ADMIN_BOOTSTRAP_PASSWORD="", MAIL_PROVIDER="noop",
               ADMIN_SERVICE_KEY_ID="admin-runtime-test", ADMIN_SERVICE_TRUSTED_KEYS="{}")
    with tempfile.TemporaryDirectory(prefix=project) as directory:
        directory = Path(directory)
        for name in ("user", "admin"):
            pem, der, public = (directory / (name + suffix) for suffix in (".pem", ".der", ".pub"))
            run([openssl, "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(pem)])
            run([openssl, "pkcs8", "-topk8", "-nocrypt", "-in", str(pem), "-outform", "DER", "-out", str(der)])
            env["JWT_PRIVATE_KEY" if name == "user" else "ADMIN_SERVICE_PRIVATE_KEY"] = base64.b64encode(der.read_bytes()).decode()
            if name == "admin":
                run([openssl, "pkey", "-in", str(pem), "-pubout", "-outform", "DER", "-out", str(public)])
                env["USER_SERVICE_TRUSTED_KEYS"] = json.dumps({"admin-runtime-test": {
                    "subject": "admin-service", "publicKey": base64.b64encode(public.read_bytes()).decode()}})
        # Random published ports; no collisions and no normal stack dependencies.
        override = directory / "override.yaml"
        scripts = directory / "kafka-scripts"
        shutil.copytree(ROOT / "deploy/kafka", scripts, ignore=shutil.ignore_patterns("k8s"))
        override.write_text("""services:
  user-db:
    ports: !override []
  user-service:
    ports: !override []
  kafka:
    ports: !override []
    volumes: !override
      - KAFKA_SCRIPTS:/opt/foc-kafka:ro
      - kafka-data:/var/lib/kafka
  kafka-init:
    volumes: !override
      - KAFKA_SCRIPTS:/opt/foc-kafka:ro
  admin-service:
    ports: !override ["127.0.0.1::8084"]
    environment:
      ADMIN_ACTION_OUTCOME_TIMEOUT_SECONDS: 3
      ADMIN_KAFKA_RECONCILE_SECONDS: 10
  gateway:
    ports: !override ["127.0.0.1::8088"]
""".replace("KAFKA_SCRIPTS", scripts.as_posix()), encoding="utf-8")
        empty = directory / "empty.env"
        empty.touch()
        prefix = ["docker", "compose", "--project-directory", str(ROOT), "--env-file", str(empty),
                  "-p", project, "-f", str(ROOT / "compose.yaml"), "-f", str(override)]

        def compose(*args, data=None, timeout=600):
            return run(prefix + list(args), env=env, data=data, timeout=timeout)

        def sql(query):
            return compose("exec", "-T", "admin-db", "psql", "-U", "admin_user", "-d", "admin_db",
                           "-v", "ON_ERROR_STOP=1", "-At", data=query)

        def broker(script, data=None):
            return compose("exec", "-T", "kafka", "bash", "-c", script, data=data, timeout=60)

        def poll(check, seconds=60):
            until = time.monotonic() + seconds
            while time.monotonic() < until:
                value = check()
                if value:
                    return value
                time.sleep(1)
            raise AssertionError("Runtime check timed out")

        try:
            compose("config", "--quiet")
            print("Building isolated Admin, User and gateway images", flush=True)
            compose("build", "admin-service", "user-service", "gateway", timeout=1200)
            print("Starting private databases, User, authenticated broker and Admin", flush=True)
            compose("up", "-d", "--wait", "admin-service", timeout=600)
            compose("up", "-d", "--no-deps", "gateway")
            address = compose("port", "gateway", "8088").splitlines()[0]
            base = "http://" + address

            def http(path, method="GET", body=None, token=None, key=None):
                headers = {"Content-Type": "application/json"}
                if token:
                    headers["Authorization"] = "Bearer " + token
                if key:
                    headers["Idempotency-Key"] = key
                request = urllib.request.Request(base + path, method=method, headers=headers,
                    data=None if body is None else json.dumps(body).encode())
                try:
                    with urllib.request.urlopen(request, timeout=10) as response:
                        return response.status, response.read().decode()
                except urllib.error.HTTPError as error:
                    return error.code, error.read().decode()

            def healthy():
                try:
                    return http("/actuator/health")[0] == 200
                except OSError:
                    return False

            poll(healthy)
            assert http("/admin")[0] == 200
            assert http("/api/admin/session")[0] == 401
            assert http("/internal/admin/cases/test/access")[0] == 404
            assert http("/internal/users/test/admin-eligibility")[0] == 404
            status, _ = http("/api/users/registrations", "POST", {
                "email": email, "username": "runtime-test", "password": password})
            assert status in (201, 503), "Disposable User registration failed"
            # No email is sent. User persists an unverified registration when mail is unavailable.
            # Fixture activation/promotion is confined to this newly created test database.
            compose("exec", "-T", "user-db", "psql", "-U", env["USER_DB_USER"], "-d", env["USER_DB_NAME"],
                    "-v", "ON_ERROR_STOP=1", data=f"""UPDATE users SET status='ACTIVE' WHERE email='{email}';
INSERT INTO user_roles(user_id,role) SELECT id,'ADMIN' FROM users WHERE email='{email}';""")
            status, body = http("/api/users/login", "POST", {"email": email, "password": password})
            assert status == 200, "Real User login failed"
            login = json.loads(body)
            status, body = http("/api/users/me/session-role", "PATCH", {"role": "ADMIN"}, login["accessToken"])
            assert status == 200, "Real User Admin mode selection failed"
            token = json.loads(body)["accessToken"]
            assert http("/api/admin/session", token=token)[0] == 200, "User JWKS/current eligibility trust failed"
            print("PASS: gateway UI, private routes, real User JWT and current Admin eligibility", flush=True)
            actor, case, order, target = login["userId"], str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
            sql(f"""INSERT INTO admin_cases(id,order_id,state,reviewer_id,revision) VALUES ('{case}','{order}','UNDER_REVIEW','{actor}',1);
INSERT INTO admin_case_participants(case_id,user_id) VALUES ('{case}','{target}');
INSERT INTO admin_statements(case_id,reporter_id,description,submitted_at,eligibility_revision)
VALUES ('{case}','{target}','TEST ONLY runtime transport',CURRENT_TIMESTAMP,'TEST-ONLY');""")
            key = str(uuid.uuid4())
            path = f"/api/admin/cases/{case}/actions"
            body = {"type": "CREDIT_ADJUSTMENT", "targetUserId": target, "amount": -5,
                    "reason": "TEST ONLY runtime transport; no financial effect"}
            status, receipt = http(path, "POST", body, token, key)
            assert status == 202, "Admin action was not durably accepted"
            operation = json.loads(receipt)["operationId"]
            poll(lambda: sql(f"SELECT published_at IS NOT NULL FROM admin_action_outbox WHERE operation_id='{operation}'") == "t")
            # Read the actual broker command as Credit, not directly from Admin's outbox.
            broker('source /opt/foc-kafka/lib.sh; write_client_properties /tmp/runtime-credit.properties credit_service "$KAFKA_CREDIT_SERVICE_PASSWORD"')
            observed = broker('timeout 40 /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 '
                '--command-config /tmp/runtime-credit.properties --topic admin.credit.commands '
                '--group credit-service-admin --from-beginning --max-messages 1')
            try:
                command = json.loads(observed)
            except json.JSONDecodeError as error:
                raise AssertionError("Test broker observer did not return command JSON: " + observed[:500]) from error
            assert command["data"]["operationId"] == operation
            poll(lambda: json.loads(http(path + "/" + operation, token=token)[1])["status"] == "UNKNOWN")
            assert http(path, "POST", body, token, key) == (202, receipt), "Original receipt changed on retry"
            poll(lambda: int(sql(f"SELECT attempts FROM admin_action_outbox WHERE operation_id='{operation}'")) >= 2)
            original = json.loads(sql(f"SELECT payload FROM admin_action_outbox WHERE operation_id='{operation}'"))
            assert original == command, "Retry changed the command identity"
            print("PASS: authenticated command delivery, UNKNOWN and original retry identity", flush=True)
            outcome = dict(command)
            outcome.update(eventId=str(uuid.uuid4()), eventType="AdminCreditCorrectionRejected",
                           producer="credit-service", causationId=command["eventId"],
                           occurredAt=datetime.now(timezone.utc).isoformat())
            outcome["data"] = {name: command["data"][name] for name in
                               ("operationId", "caseId", "orderId", "targetUserId", "requestedBy", "amount")}
            outcome["data"].update(result="REJECTED", reasonCode="INSUFFICIENT_AVAILABLE_CREDITS",
                                    completedAt=outcome["occurredAt"])
            wire = target + "|" + json.dumps(outcome, separators=(",", ":")) + "\n"
            # TEST PRODUCER ONLY: does not verify Credit balance arithmetic or reserved credits.
            broker('/opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 '
                   '--command-config /tmp/runtime-credit.properties --topic credit.admin.events --sync '
                   '--reader-property parse.key=true --reader-property key.separator="|" '
                   '--command-property enable.idempotence=true --command-property acks=all', data=wire * 2)
            poll(lambda: json.loads(http(path + "/" + operation, token=token)[1])["status"] == "REJECTED")
            assert sql("SELECT count(*) FROM admin_action_inbox") == "1", "Duplicate outcome applied twice"
            assert sql("SELECT count(*) FROM admin_case_outbox WHERE event_type='CaseActionCompleted'") == "1"
            print("PASS: TEST-ONLY rejected outcomes consumed once despite duplicate delivery", flush=True)
            compose("restart", "admin-service")
            compose("up", "-d", "--no-deps", "--wait", "admin-service", timeout=180)
            assert json.loads(http(path + "/" + operation, token=token)[1])["status"] == "REJECTED"
            # Exercise failure without ever changing the normal User Service.
            compose("stop", "user-service")
            assert http("/api/admin/session", token=token)[0] == 503
            print("PASS: packaged UI/auth, real User eligibility, private callbacks, authenticated command delivery, "
                  "UNKNOWN/retry identity, TEST-ONLY duplicate rejected outcomes, restart persistence, User outage.")
            print("NOT VERIFIED: real Credit consumer, financial effect, insufficient funds or reserved-balance arithmetic.")
        except Exception:
            # Admin logs contain startup/transport metadata; never dump User/mail logs or env.
            print(compose("logs", "--no-color", "--tail=50", "admin-service"), flush=True)
            raise
        finally:
            # Only this UUID-named project, created by this invocation. Never touch shared volumes.
            compose("down", "--volumes", "--remove-orphans", timeout=120)


if __name__ == "__main__":
    main()
