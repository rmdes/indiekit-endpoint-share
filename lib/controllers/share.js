import { IndiekitError } from "@indiekit/error";
import { validationResult } from "express-validator";

/**
 * Build checkbox items for the publication's syndication targets
 * @param {object} publication - Publication configuration
 * @returns {Array<object>} Checkbox items
 */
const getSyndicationTargetItems = (publication) =>
  (publication.syndicationTargets || []).map((target) => ({
    label: target.info.service.name,
    ...(target?.info?.error
      ? {
          disabled: true,
          hint: target?.info?.error || false,
        }
      : {
          hint: target?.info.uid,
          value: target?.info.uid,
        }),
  }));

export const shareController = {
  /**
   * View share page
   * @type {import("express").RequestHandler}
   */
  get(request, response) {
    const { publication } = request.app.locals;
    const { content, name, url, success } = request.query;

    response.render("share", {
      title: response.locals.__("share.title"),
      properties: { content, name, url },
      syndicationTargetItems: getSyndicationTargetItems(publication),
      success,
      minimalui: request.params.path === "bookmarklet",
    });
  },

  /**
   * Post share content
   * @type {import("express").RequestHandler}
   */
  async post(request, response) {
    const { application, publication } = request.app.locals;
    const properties = request.body || {};
    properties["bookmark-of"] = properties.url || properties["bookmark-of"];
    delete properties.url;

    // Extract mp-syndicate-to so each target is sent as a repeated parameter
    const syndicateTo = properties["mp-syndicate-to"];
    delete properties["mp-syndicate-to"];

    const syndicationTargetItems = getSyndicationTargetItems(publication);

    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      return response.status(422).render("share", {
        title: response.locals.__("share.title"),
        properties: request.body,
        syndicationTargetItems,
        errors: errors.mapped(),
        minimalui: request.params.path === "bookmarklet",
      });
    }

    try {
      const parameters = new URLSearchParams(properties);
      if (syndicateTo) {
        const targets = Array.isArray(syndicateTo)
          ? syndicateTo
          : [syndicateTo];
        for (const target of targets) {
          parameters.append("mp-syndicate-to", target);
        }
      }

      const micropubResponse = await fetch(application.micropubEndpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: parameters.toString(),
      });

      if (!micropubResponse.ok) {
        throw await IndiekitError.fromFetch(micropubResponse);
      }

      /**
       * @type {object}
       */
      const body = await micropubResponse.json();

      const message = encodeURIComponent(body.success_description);

      response.redirect(`?success=${message}`);
    } catch (error) {
      response.status(error.status || 500);
      response.render("share", {
        title: response.locals.__("share.title"),
        properties: request.body,
        syndicationTargetItems,
        error,
        minimalui: request.params.path === "bookmarklet",
      });
    }
  },
};
