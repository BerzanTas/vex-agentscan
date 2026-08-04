import type { FastifyPluginAsync } from "fastify";

const STRICT_TRANSPORT_SECURITY = "max-age=31536000; includeSubDomains";
const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self' 'unsafe-inline'";

export const securityHeaders: FastifyPluginAsync = async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("strict-transport-security", STRICT_TRANSPORT_SECURITY);
    reply.header("content-security-policy", CONTENT_SECURITY_POLICY);
  });
};

Object.defineProperty(securityHeaders, Symbol.for("skip-override"), { value: true });
