// Zawmo's address. The first address, mova-it.vercel.app, and www. forward here
// (src/proxy.ts), carrying people's sessions across (src/app/api/session/).
export const CANONICAL_HOST = "zawmo.com";
export const OLD_HOSTS = ["mova-it.vercel.app"];
// The host to print on things people type or read (montage videos): never an old one.
export const publicHost = (host: string) => (OLD_HOSTS.includes(host) ? CANONICAL_HOST : host.replace(/^www\./, ""));
