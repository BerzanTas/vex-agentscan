/**
 * TRANSPORT HEADERS FOR A HOST THAT SERVES BYTES SOMEONE ELSE UPLOADED.
 *
 * HSTS is the API's value verbatim (`apps/server/src/plugins/security-headers.ts`,
 * which mirrors the Caddyfile) because it is a property of the domain, not of
 * the service.
 *
 * THE CSP IS DELIBERATELY NOT THE API'S. The API serves JSON to a first-party
 * app and declares `default-src 'self'; script-src 'self' 'unsafe-inline'`.
 * This host's whole job is to hand a browser a file a stranger uploaded, so it
 * declares `default-src 'none'` plus `sandbox`: if a response ever were
 * interpreted as a document, it must be able to load nothing and run nothing.
 * Copying the API's policy here to keep the two files identical would have
 * been the wrong kind of consistency.
 *
 * `X-Content-Type-Options: nosniff` is the load-bearing one and has no
 * counterpart on the API. Our content type comes from magic-byte validation;
 * nosniff is what stops a browser from re-deciding, on the strength of some
 * HTML-looking bytes further into a valid image, that it is looking at a
 * document.
 */

import type { FastifyPluginAsync } from "fastify";

export const STRICT_TRANSPORT_SECURITY = "max-age=31536000; includeSubDomains";
export const ASSET_CONTENT_SECURITY_POLICY = "default-src 'none'; sandbox";

export const assetSecurityHeaders: FastifyPluginAsync = async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("strict-transport-security", STRICT_TRANSPORT_SECURITY);
    reply.header("content-security-policy", ASSET_CONTENT_SECURITY_POLICY);
    reply.header("x-content-type-options", "nosniff");
    reply.header("cross-origin-resource-policy", "cross-origin");
  });
};

Object.defineProperty(assetSecurityHeaders, Symbol.for("skip-override"), { value: true });
