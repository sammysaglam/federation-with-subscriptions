export const booleanFilter = <T>(
  value: T | false | null | undefined | "" | 0,
): value is T => Boolean(value);
