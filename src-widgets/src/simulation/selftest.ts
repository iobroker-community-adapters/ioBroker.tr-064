// Only for the simulation (npm start) - never part of the widget build.
// `?scene=tile&w=400&h=300&switchWlan=1&selftest=1`: clicks through the tile like a user and writes
// the results into `<pre id="selftest">`, e.g. for `chrome --headless --dump-dom`.
import type MockSocket from './mockSocket';

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

function click(element: Element | null): void {
    (element as HTMLElement | null)?.click();
}

function dialog(): Element | null {
    return document.querySelector('[role="dialog"]');
}

export async function runSelfTest(socket: MockSocket): Promise<void> {
    const results: string[] = [];
    const check = (name: string, ok: boolean, info = ''): void => {
        results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`);
    };

    await wait(600);
    const tile = document.querySelector('.tr064-fritzbox [role="button"]');
    check('tile rendered', !!tile);
    const text = tile?.textContent || '';
    check('model shown', text.includes('FRITZ!Box 7590 AX'));
    check('download rate shown', text.includes('87.3') && text.includes('Mbit/s'), text.substring(0, 80));
    check('existing band shown (wlan24)', !!document.querySelector('.tr064-fritzbox span[title^="2.4 GHz"]'));
    check('missing band not shown (wlan60)', !document.querySelector('.tr064-fritzbox span[title^="6 GHz"]'));

    // the guest WLAN chip switches the state and does not open the dialog
    const guest = document.querySelector('.tr064-fritzbox span[title^="Guest Wi-Fi"]');
    check('guest chip exists', !!guest, guest?.getAttribute('title') || '');
    click(guest);
    await wait(400);
    const guestState = await socket.getState('tr-064.0.states.wlanGuest');
    check('guest WLAN switched on', guestState?.val === true);
    check('chip click did not open the dialog', !dialog());
    const guestAfter = document.querySelector('.tr064-fritzbox span[title^="Guest Wi-Fi"]');
    check('guest chip shows on', (guestAfter?.getAttribute('title') || '').endsWith(': on'));

    // the tile opens the dialog, the mesh is read
    click(tile);
    await wait(900);
    check('dialog opened', !!dialog());
    check('dialog title', (dialog()?.textContent || '').includes('FRITZ!Box – Mesh'));
    check('mesh loaded in dialog', (dialog()?.textContent || '').includes('Repeater Garten'));

    // the close button closes it for good (the click must not reach the tile again)
    click(document.querySelector('[role="dialog"] button[aria-label]'));
    await wait(500);
    check('close button closes the dialog', !dialog());

    // the backdrop too
    click(tile);
    await wait(400);
    check('dialog opened again', !!dialog());
    click(document.querySelector('.MuiBackdrop-root'));
    await wait(500);
    check('backdrop closes the dialog', !dialog());

    // keyboard
    (tile as HTMLElement | null)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(400);
    check('Enter opens the dialog', !!dialog());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    click(document.querySelector('[role="dialog"] button[aria-label]'));
    await wait(400);
    check('dialog closed at the end', !dialog());

    const pre = document.createElement('pre');
    pre.id = 'selftest';
    pre.textContent = results.join('\n');
    document.body.appendChild(pre);
}
