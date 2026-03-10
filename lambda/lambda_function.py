"""
Lambda handler for swordthain automation API.
Routes POST /create and POST /archive to the appropriate handlers.
"""
import json


def lambda_handler(event, context):
    """Route requests by path and method."""
    path = (event.get("path") or event.get("resource") or "").strip().rstrip("/")
    method = event.get("httpMethod", "GET")

    # Normalize: /prod/create -> /create
    if path.startswith("/prod/"):
        path = path[5:]
    elif path.startswith("prod/"):
        path = "/" + path[5:]
    path = path or "/"
    if not path.startswith("/"):
        path = "/" + path

    try:
        body_raw = event.get("body") or "{}"
        body = json.loads(body_raw) if isinstance(body_raw, str) else body_raw
    except json.JSONDecodeError:
        body = {}

    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }

    def ok(data):
        return {"statusCode": 200, "headers": cors_headers, "body": json.dumps(data)}

    def err(message, code=400):
        return {
            "statusCode": code,
            "headers": cors_headers,
            "body": json.dumps({"error": message}),
        }

    if ("/create" in path or path == "create") and method == "POST":
        try:
            from create_company import handle_create
            result = handle_create(body)
            return ok(result)
        except Exception as e:
            return err(str(e), 500)

    if ("/archive" in path or path == "archive") and method == "POST":
        try:
            from archive_company import handle_archive
            result = handle_archive(body)
            return ok(result)
        except Exception as e:
            return err(str(e), 500)

    # CORS preflight
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": cors_headers, "body": ""}

    # Debug: return received path/method so we can fix routing
    debug = {"path": path, "method": method, "raw_path": event.get("path"), "resource": event.get("resource")}
    return {
        "statusCode": 404,
        "headers": cors_headers,
        "body": json.dumps({"error": "Not found", "debug": debug}),
    }
