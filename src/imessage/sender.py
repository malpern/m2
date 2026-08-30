import subprocess
import logging
import tempfile
import os
from uuid import uuid4

logger = logging.getLogger(__name__)


def _send_id() -> str:
    """An opaque per-send id used to correlate log lines.

    Logs are a lower-trust store than the database — they get shipped, tailed
    and pasted into issues — so a client's phone number does not belong in one.
    Redacting to the last four digits was the first attempt, but any value
    derived from the number stays tainted under dataflow analysis, and more to
    the point the last four digits are still identifying. An unrelated id keeps
    the operational value (all three log lines for one send share it, so a
    failure can be traced end to end) while carrying no personal data at all.

    To find WHICH client a send id belongs to, correlate on timestamp with the
    outreach table, which is access-controlled; the log is not.
    """
    return uuid4().hex[:8]


def send_imessage(phone_number: str, message: str) -> bool:
    """Send an iMessage via AppleScript. Returns True on success."""
    send_id = _send_id()
    escaped_phone = phone_number.replace('"', '')

    # Write message to a temp file to avoid AppleScript escaping issues
    fd, tmp_path = tempfile.mkstemp(suffix=".txt")
    try:
        with os.fdopen(fd, 'w') as f:
            f.write(message)

        applescript = f'''
        set msgFile to POSIX file "{tmp_path}"
        set msgText to read msgFile as «class utf8»
        tell application "Messages"
            set targetService to 1st account whose service type = iMessage
            set targetBuddy to participant "{escaped_phone}" of targetService
            send msgText to targetBuddy
        end tell
        '''

        result = subprocess.run(
            ["osascript", "-e", applescript],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            logger.info(f"Sent iMessage [{send_id}]")
            return True
        else:
            logger.error(f"AppleScript error: {result.stderr.strip()}")
            return False
    except subprocess.TimeoutExpired:
        logger.error(f"Timeout sending iMessage [{send_id}]")
        return False
    except Exception as e:
        logger.error(f"Failed to send iMessage [{send_id}]: {e}")
        return False
    finally:
        os.unlink(tmp_path)
