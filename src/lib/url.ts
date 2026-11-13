/** Prefix an internal path with the deploy base (GitHub Pages project site). */
export function url(path = ""): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  if (/^(https?:|mailto:|#)/.test(path)) return path;
  return `${base}/${path.replace(/^\//, "")}`;
}
export function media(id: string, small = false): string {
  return url(`media/${id}${small ? "-sm" : ""}.webp`);
}
