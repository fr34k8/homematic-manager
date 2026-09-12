/**
 * Free text from the interface processes that arrived with the wrong character set.
 *
 * Every XML-RPC client of the backend decodes answers as ISO-8859-1 (`INTERFACE_ENCODING`), which is
 * what rfd and hmipserver send for units such as `°C`. A link's `NAME` and `DESCRIPTION` are the
 * exception: rfd stores them as whatever bytes its writer sent and hands those bytes back, and both
 * writers send UTF-8 - the CCU WebUI's default description "Standardverknüpfung" and every
 * `setLinkInfo` of `homematic-xmlrpc`, which writes its requests as UTF-8. Read as ISO-8859-1, the
 * two bytes of an "ü" become "Ã¼" (B-23, #156).
 */

/** Strict: a byte sequence that is not UTF-8 throws instead of turning into U+FFFD. */
const UTF8 = new TextDecoder('utf-8', {fatal: true});

/**
 * Undoes an ISO-8859-1 decode of UTF-8 bytes: "StandardverknÃ¼pfung" becomes "Standardverknüpfung".
 *
 * Only a string that *is* such a decode is changed. Every character has to fit into one byte (a
 * string with "€" in it was not decoded as ISO-8859-1), at least one of them has to be above ASCII,
 * and the bytes together have to be valid UTF-8. Real ISO-8859-1 text fails the last test on its
 * own - "°C" is `B0 43` and "Küche" is `4B FC 63 68 65`, and neither `B0` nor `FC` can stand where
 * they stand in UTF-8 - so it comes back untouched, and so does plain ASCII. The browser and Node
 * both have `TextDecoder`, which is why this lives in the core and not next to `Buffer`.
 */
export function repairMisdecodedUtf8(value: string): string {
    const bytes = new Uint8Array(value.length);
    let aboveAscii = false;
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code > 0xff) {
            return value;
        }
        if (code > 0x7f) {
            aboveAscii = true;
        }
        bytes[index] = code;
    }
    if (!aboveAscii) {
        return value;
    }
    try {
        return UTF8.decode(bytes);
    } catch {
        return value;
    }
}
