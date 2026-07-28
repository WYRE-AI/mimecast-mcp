import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyS2sHeader } from "../s2s-verify.js";

function deriveRecipientSubkey(masterSecret: string, slug: string): string {
  return createHmac("sha256", masterSecret).update(`s2s-recipient:${slug}`).digest("hex");
}

function mintHeader(secret: string, unixSeconds: number): string {
  const message = `t=${unixSeconds}`;
  const hex = createHmac("sha256", secret).update(message).digest("hex");
  return `${message},v1=${hex}`;
}

describe("verifyS2sHeader", () => {
  const MASTER = "test-master-secret-do-not-use-in-prod";
  const mimecastSubkey = deriveRecipientSubkey(MASTER, "mimecast");
  const siblingSubkey = deriveRecipientSubkey(MASTER, "proofpoint");
  it("accepts a header minted with this vendor's own derived subkey", () => {
    const now = Math.floor(Date.now() / 1000);
    const header = mintHeader(mimecastSubkey, now);
    expect(verifyS2sHeader(header, mimecastSubkey)).toBe(true);
  });

  it("REJECTS a header minted for a different vendor's derived subkey (recipient-binding proof)", () => {
    const now = Math.floor(Date.now() / 1000);
    const headerMintedForSibling = mintHeader(siblingSubkey, now);
    expect(verifyS2sHeader(headerMintedForSibling, mimecastSubkey)).toBe(false);
  });

  it("rejects a stale timestamp outside the skew window", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyS2sHeader(mintHeader(mimecastSubkey, now - 301), mimecastSubkey)).toBe(false);
  });

  it("rejects a future timestamp outside the skew window", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyS2sHeader(mintHeader(mimecastSubkey, now + 301), mimecastSubkey)).toBe(false);
  });

  it("accepts a timestamp at the edge of the skew window", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyS2sHeader(mintHeader(mimecastSubkey, now - 300), mimecastSubkey)).toBe(true);
  });

  it("rejects a malformed header value", () => {
    expect(verifyS2sHeader("not-a-valid-header", mimecastSubkey)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifyS2sHeader(undefined, mimecastSubkey)).toBe(false);
  });

  it("rejects when the secret is empty (dark-by-default guarantee)", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyS2sHeader(mintHeader(mimecastSubkey, now), "")).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const now = Math.floor(Date.now() / 1000);
    const header = mintHeader(mimecastSubkey, now);
    const tampered = header.slice(0, -1) + (header.endsWith("0") ? "1" : "0");
    expect(verifyS2sHeader(tampered, mimecastSubkey)).toBe(false);
  });
});
