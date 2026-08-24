export type KeyboardPanDirection = 'up' | 'down' | 'left' | 'right';

export interface KeyboardPanLabels {
    up: string;
    left: string;
    down: string;
    right: string;
}

const PHYSICAL_PAN_CODES: Readonly<Record<string, KeyboardPanDirection>> = {
    KeyW: 'up',
    KeyA: 'left',
    KeyS: 'down',
    KeyD: 'right',
};

const ARROW_PAN_KEYS: Readonly<Record<string, KeyboardPanDirection>> = {
    ArrowUp: 'up',
    ArrowLeft: 'left',
    ArrowDown: 'down',
    ArrowRight: 'right',
};

const FALLBACK_PAN_KEYS: Readonly<Record<string, KeyboardPanDirection>> = {
    w: 'up',
    z: 'up',
    a: 'left',
    q: 'left',
    s: 'down',
    d: 'right',
};

/**
 * `KeyboardEvent.code` follows physical US positions. The same four codes are
 * therefore WASD on QWERTY and ZQSD on AZERTY without asking the user to pick
 * a layout. `key` remains as a fallback for unusual browser implementations.
 */
export const keyboardPanDirection = (
    code: string,
    key: string,
): KeyboardPanDirection | null => (
    ARROW_PAN_KEYS[key]
    ?? PHYSICAL_PAN_CODES[code]
    ?? FALLBACK_PAN_KEYS[key.toLocaleLowerCase()]
    ?? null
);

export const keyboardPanToken = (code: string, key: string): string | null => {
    const direction = keyboardPanDirection(code, key);
    if (!direction) return null;
    return ARROW_PAN_KEYS[key] ? key : code || key.toLocaleLowerCase();
};

type KeyboardLayoutMap = { get(code: string): string | undefined };
type NavigatorWithKeyboard = Navigator & {
    keyboard?: { getLayoutMap?: () => Promise<KeyboardLayoutMap> };
};

export const detectKeyboardPanLabels = async (): Promise<KeyboardPanLabels> => {
    const fallback: KeyboardPanLabels = { up: 'W/Z', left: 'A/Q', down: 'S', right: 'D' };
    try {
        const layout = await (navigator as NavigatorWithKeyboard).keyboard?.getLayoutMap?.();
        if (!layout) return fallback;
        return {
            up: (layout.get('KeyW') ?? fallback.up).toLocaleUpperCase(),
            left: (layout.get('KeyA') ?? fallback.left).toLocaleUpperCase(),
            down: (layout.get('KeyS') ?? fallback.down).toLocaleUpperCase(),
            right: (layout.get('KeyD') ?? fallback.right).toLocaleUpperCase(),
        };
    } catch {
        return fallback;
    }
};

export const isEditableKeyboardTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tagName = target.tagName.toLocaleLowerCase();
    return tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || target.isContentEditable;
};
