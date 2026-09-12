import {describe, expect, it} from 'vitest';

import {repairMisdecodedUtf8} from './text.js';

/** What an ISO-8859-1 decode makes of the UTF-8 bytes of a string - the way the XML-RPC client reads rfd. */
function readAsLatin1(text: string): string {
    return Buffer.from(text, 'utf8').toString('latin1');
}

describe('repairMisdecodedUtf8 (B-23, #156)', () => {
    it("repairs the CCU WebUI's default link description", () => {
        expect(readAsLatin1('Standardverknüpfung')).toBe('StandardverknÃ¼pfung');
        expect(repairMisdecodedUtf8('StandardverknÃ¼pfung')).toBe('Standardverknüpfung');
    });

    it('repairs every width of UTF-8, not only the umlauts', () => {
        for (const text of ['Küche', 'Außentür', 'Wohnzimmer 22 °C', '5 €', 'Terrasse \u{1f31e}']) {
            expect(repairMisdecodedUtf8(readAsLatin1(text))).toBe(text);
        }
    });

    it('leaves real ISO-8859-1 text alone', () => {
        expect(repairMisdecodedUtf8('°C')).toBe('°C');
        expect(repairMisdecodedUtf8('Küche')).toBe('Küche');
        expect(repairMisdecodedUtf8('Außentür')).toBe('Außentür');
        // a lead byte at the very end, with nothing after it
        expect(repairMisdecodedUtf8('Ã')).toBe('Ã');
    });

    it('leaves plain ASCII and the empty string alone', () => {
        expect(repairMisdecodedUtf8('Taster 1 -> Licht')).toBe('Taster 1 -> Licht');
        expect(repairMisdecodedUtf8('')).toBe('');
    });

    it('leaves a string alone that was never decoded as ISO-8859-1', () => {
        // the BIN-RPC library decodes as UTF-8, so its strings may hold characters above one byte
        expect(repairMisdecodedUtf8('5 € für Ã¼')).toBe('5 € für Ã¼');
    });

    it('refuses the byte sequences UTF-8 forbids', () => {
        // overlong "/" (C0 AF), a UTF-16 surrogate (ED A0 80) and a code point above U+10FFFF (F4 90 80 80)
        for (const text of ['\u00c0\u00af', '\u00ed\u00a0\u0080', '\u00f4\u0090\u0080\u0080']) {
            expect(repairMisdecodedUtf8(text)).toBe(text);
        }
    });
});
