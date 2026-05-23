#!/usr/bin/env python3
"""HTTP API wrapping the iMessage bridge for the Next.js app to call."""

import json
import logging
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from sender import send_imessage
from reader import get_recent_messages, get_messages_since
from interpreter import interpret_reply, parse_named_reply

load_dotenv()

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/send", methods=["POST"])
def send():
    data = request.json
    phone = data.get("phone")
    message = data.get("message")

    if not phone or not message:
        return jsonify({"error": "phone and message required"}), 400

    success = send_imessage(phone, message)
    return jsonify({"success": success})


@app.route("/read", methods=["GET"])
def read():
    phone = request.args.get("phone")
    limit = int(request.args.get("limit", "10"))

    if not phone:
        return jsonify({"error": "phone required"}), 400

    messages = get_recent_messages(phone, limit=limit)
    return jsonify({
        "messages": [
            {
                "rowid": m.rowid,
                "phone": m.phone,
                "text": m.text,
                "is_from_me": m.is_from_me,
                "timestamp": m.timestamp.isoformat(),
            }
            for m in messages
        ]
    })


@app.route("/read-since", methods=["GET"])
def read_since():
    phone = request.args.get("phone")
    since = request.args.get("since")

    if not phone or not since:
        return jsonify({"error": "phone and since required"}), 400

    since_dt = datetime.fromisoformat(since)
    messages = get_messages_since(phone, since_dt)
    return jsonify({
        "messages": [
            {
                "rowid": m.rowid,
                "phone": m.phone,
                "text": m.text,
                "is_from_me": m.is_from_me,
                "timestamp": m.timestamp.isoformat(),
            }
            for m in messages
        ]
    })


@app.route("/interpret", methods=["POST"])
def interpret():
    data = request.json
    outreach_message = data.get("outreach_message", "")
    client_reply = data.get("client_reply", "")
    client_name = data.get("client_name", "")

    name, body = parse_named_reply(client_reply)
    result = interpret_reply(outreach_message, body, client_name)
    if name:
        result["parsed_name"] = name

    return jsonify(result)


if __name__ == "__main__":
    logger.info("iMessage bridge API starting on port 8787")
    app.run(host="127.0.0.1", port=8787, debug=False)
