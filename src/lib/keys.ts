/**
 * Whether a keydown belongs to an IME composition. Safari reports the Enter that ends a composition with
 * `isComposing` false, but with keyCode 229.
 */
export const isComposing = (event: KeyboardEvent) => event.isComposing || event.keyCode === 229
