// Stand in for `next/cache` under Vitest: the `'use cache'` directive isn't
// compiled here, so tags and lifetimes are no-ops and reads run uncached.
const noop = (): undefined => undefined;
export const cacheTag = noop;
export const cacheLife = noop;
export const updateTag = noop;
export const revalidateTag = noop;
export const revalidatePath = noop;
