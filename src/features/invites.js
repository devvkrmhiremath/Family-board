// Invite links: ?join=<board id>&t=<token>. Links from the older version of the
// app were ?family=<board id> (no token) and only work during a board's grace period.
import { toast } from "../ui/toast.js";
import { isBoardCode } from "../data/local-boards.js";
import { INVITE_DAYS } from "../data/service.js";
import { state } from "../app/state.js";

const isToken = (t) => /^[a-z0-9]{16,64}$/.test(t);

// Accepts a full link or just its query string; anything malformed is ignored
export function parseInvite(text) {
  try {
    const url = new URL(text, location.href);
    const code = url.searchParams.get("join") || url.searchParams.get("family");
    const token = url.searchParams.get("t") || "";
    if (!isBoardCode(code) || (token && !isToken(token))) return null;
    return { code, token };
  } catch {
    return null;
  }
}

export const urlInvite = parseInvite(location.href);

const inviteUrl = (token) =>
  `${location.origin}${location.pathname}?join=${encodeURIComponent(state.code)}&t=${encodeURIComponent(token)}`;

export async function shareInvite() {
  if (!state.api) return;
  let token;
  try {
    token = await state.api.createInvite();
  } catch {
    toast("Couldn't create an invite. Check your connection.");
    return;
  }
  const url = inviteUrl(token);
  const text = `Join “${state.boardName}” on Family Board. The link works for ${INVITE_DAYS} days.`;
  try {
    if (navigator.share) await navigator.share({ title: state.boardName, text, url });
    else { await navigator.clipboard.writeText(url); toast("Invite link copied"); }
  } catch {
    /* the person closed the share sheet */
  }
}
