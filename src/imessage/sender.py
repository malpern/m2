import subprocess
import logging
import tempfile
import os

logger = logging.getLogger(__name__)


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
            logger.info(f"Sent iMessage to {phone_number}")
            return True
        else:
            logger.error(f"AppleScript error: {result.stderr.strip()}")
            return False
    except subprocess.TimeoutExpired:
        logger.error(f"Timeout sending to {phone_number}")
        return False
    except Exception as e:
        logger.error(f"Failed to send to {phone_number}: {e}")
        return False
    finally:
        os.unlink(tmp_path)
