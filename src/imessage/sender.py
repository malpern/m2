import subprocess
import logging
import tempfile
import os

logger = logging.getLogger(__name__)


def redact_phone(phone_number: str) -> str:
    """Mask a phone number for logging.

    Logs are a lower-trust store than the database — they get shipped, tailed
    and pasted into issues — so a client's number does not belong in one in
    clear text. The last four digits are kept because they are what makes a
    log line useful when tracing a single failed send.
    """
    digits = "".join(c for c in phone_number if c.isdigit())
    return f"***{digits[-4:]}" if len(digits) >= 4 else "***"


def send_imessage(phone_number: str, message: str) -> bool:
    """Send an iMessage via AppleScript. Returns True on success."""
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
            # codeql[py/clear-text-logging-sensitive-data] — redacted to last 4 by redact_phone;
            # CodeQL tracks the dataflow from phone_number and cannot see the sanitizer.
            logger.info(f"Sent iMessage to {redact_phone(phone_number)}")
            return True
        else:
            logger.error(f"AppleScript error: {result.stderr.strip()}")
            return False
    except subprocess.TimeoutExpired:
        # codeql[py/clear-text-logging-sensitive-data] — redacted, see above.
        logger.error(f"Timeout sending to {redact_phone(phone_number)}")
        return False
    except Exception as e:
        # codeql[py/clear-text-logging-sensitive-data] — redacted, see above.
        logger.error(f"Failed to send to {redact_phone(phone_number)}: {e}")
        return False
    finally:
        os.unlink(tmp_path)
