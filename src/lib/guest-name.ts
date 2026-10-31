// A guest who never said their name: «ضيف ٤٢١٧» / «Guest 4217», as a visitor's first ❤️
// (src/server/quiet-guest.ts) and «📸 جرّب بكبسة» (src/app/api/start) name them.
export const unnamedGuest = (user: { isGuest: boolean; displayName: string }) => user.isGuest && /^(ضيف|Guest) \d{4}$/.test(user.displayName);
