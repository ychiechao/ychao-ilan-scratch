import appHandler from "vinext/server/app-router-entry";

const LEGACY_SITE_HOST = "yilan-scratch-course.ychao-ilc.chatgpt.site";
const CANONICAL_HOST = "yilan-scratch-course.ychao-ilc.workers.dev";

export default {
  async fetch(request: Request, env?: Parameters<typeof appHandler.fetch>[1], ctx?: Parameters<typeof appHandler.fetch>[2]) {
    const url = new URL(request.url);

    if (url.hostname === LEGACY_SITE_HOST) {
      url.hostname = CANONICAL_HOST;
      url.port = "";
      return Response.redirect(url.toString(), 308);
    }

    return appHandler.fetch(request, env, ctx);
  },
};
