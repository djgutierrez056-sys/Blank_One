/** True when a keyboard event's target is a text input/textarea/contenteditable
 * — global shortcut listeners (2D shortcuts, WASD movement, build hotbar
 * keys) should ignore keystrokes meant for a focused text field like chat. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}
