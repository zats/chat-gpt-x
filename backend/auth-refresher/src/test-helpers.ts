export function jwtAt(isoDate: string): string {
  const header = base64Url({ alg: "none" });
  const payload = base64Url({ exp: new Date(isoDate).getTime() / 1000 });
  return `${header}.${payload}.signature`;
}

function base64Url(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
