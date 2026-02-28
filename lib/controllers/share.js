import { IndiekitError } from "@indiekit/error";
import { validationResult } from "express-validator";

export const shareController = {
  /**
   * View share page
   * @type {import("express").RequestHandler}
   */
  get(request, response) {
    const { content, name, url, success, type } = request.query;
    const shareType = type === "note" ? "note" : "bookmark";

    response.render("share", {
      title: response.locals.__("share.title"),
      data: { content, name, url },
      shareType,
      success,
      minimalui: request.params.path === "bookmarklet",
    });
  },

  /**
   * Post share content
   * @type {import("express").RequestHandler}
   */
  async post(request, response) {
    const { application } = request.app.locals;
    const data = request.body || {};
    const shareType = data.type || "bookmark";

    // Remove type from data before sending to Micropub
    delete data.type;

    if (shareType === "note") {
      // Note: build content from name + URL, no bookmark-of
      const name = data.name || "";
      const url = data.url || data["bookmark-of"] || "";
      data.content = data.content || `${name}\n${url}`.trim();
      delete data["bookmark-of"];
      delete data.url;
      delete data.name;
    } else {
      // Bookmark: existing behavior
      data["bookmark-of"] = data.url || data["bookmark-of"];
      delete data.url;
    }

    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      return response.status(422).render("share", {
        title: response.locals.__("share.title"),
        data: request.body,
        shareType,
        errors: errors.mapped(),
        minimalui: request.params.path === "bookmarklet",
      });
    }

    try {
      const micropubResponse = await fetch(application.micropubEndpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(data).toString(),
      });

      if (!micropubResponse.ok) {
        throw await IndiekitError.fromFetch(micropubResponse);
      }

      /** @type {object} */
      const body = await micropubResponse.json();

      const message = encodeURIComponent(body.success_description);

      response.redirect(`?success=${message}`);
    } catch (error) {
      response.status(error.status || 500);
      response.render("share", {
        title: response.locals.__("share.title"),
        data: request.body,
        shareType,
        error,
        minimalui: request.params.path === "bookmarklet",
      });
    }
  },
};
