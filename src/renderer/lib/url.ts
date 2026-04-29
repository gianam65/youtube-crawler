// Detect whether a YouTube URL points to a user-curated playlist (PL/FL/OL/UU/LL/WL)
// vs a single video or auto-generated mix/radio (RD*).
//
// PL = user playlist
// FL = "favorites list" (legacy)
// OL = uploaded playlists (channel)
// UU = channel uploads playlist
// LL = liked videos
// WL = watch later
// RD* = auto-generated mixes/radios — we treat these as single video
export function isUserPlaylist(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const list = u.searchParams.get('list');
    if (!list) return false;
    return /^(PL|FL|OL|UU|LL|WL)/i.test(list);
  } catch {
    return false;
  }
}
