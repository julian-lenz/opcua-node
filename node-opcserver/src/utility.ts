/**
 * Checks if a value is within a given range.
 * @param value - The value to check.
 * @param min - The minimum bound (inclusive).
 * @param max - The maximum bound (inclusive).
 * @returns True if the value is within bounds, false otherwise.
 */
export function isWithinBounds(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
}
