import type {Transport} from '@homematic-manager/core';

/**
 * Task 26 (openccu-lite 28.9): eQ-3's service-message suppression, HmIP only, through the generic
 * `rpc.call` - the backend has no method of its own for it, and the two calls are exactly what the
 * addendum documents. Shared by the paramset dialog (channel 0) and the service-messages tab.
 *
 * - `getSuppressedServiceMessages(channelAddress) -> String[]`: the service parameters whose
 *   messages the HmIP server currently suppresses for the channel.
 * - `suppressServiceMessages(channelAddress, parameter, suppress)`: `parameter` carries the
 *   service flag, or is `''` for every service parameter of the channel. Suppression works by the
 *   interface reporting a value that raises no message (`UNREACH` becomes `false`).
 */

/**
 * The suppressed list of a channel; `undefined` where the interface does not offer the method
 * (BidCos, Homegear), so a caller can leave the whole feature away without raising a notice.
 */
export async function readSuppressed(
    transport: Transport,
    interfaceName: string,
    address: string,
): Promise<string[] | undefined> {
    try {
        const result = await transport.request('rpc.call', interfaceName, 'getSuppressedServiceMessages', [address]);
        return Array.isArray(result) ? result.filter((entry): entry is string => typeof entry === 'string') : [];
    } catch {
        return undefined;
    }
}

/** One `suppressServiceMessages` call. Throws what the interface answered; the caller reports it. */
export async function writeSuppressed(
    transport: Transport,
    interfaceName: string,
    address: string,
    parameter: string,
    suppress: boolean,
): Promise<void> {
    await transport.request('rpc.call', interfaceName, 'suppressServiceMessages', [address, parameter, suppress]);
}

/** The exact call, as the preview and the change list print it. */
export function suppressCallText(address: string, parameter: string, suppress: boolean): string {
    return `suppressServiceMessages(${address}, ${JSON.stringify(parameter)}, ${suppress ? 'true' : 'false'})`;
}

/** Is this the HmIP interface, the only one with the addendum? By name or by interface type. */
export function isHmipInterface(name: string, type = ''): boolean {
    return /hmip/i.test(name) || /hmip/i.test(type);
}
