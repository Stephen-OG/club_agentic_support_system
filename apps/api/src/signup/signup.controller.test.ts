import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { SetupController } from "./signup.controller";

const setupInput = {
  displayName: "Alex Owner",
  email: "owner@example.com",
  venueName: "Main Venue",
  venueSlug: "main-venue",
  workspaceName: "Madupe Group",
  workspaceSlug: "madupe-group"
};

describe("SetupController", () => {
  it("requires a verified app auth email before workspace setup", async () => {
    const controller = new SetupController(
      {
        initialize: async () => {
          throw new Error("setup should not run for unverified users");
        }
      } as never,
      {
        verifyBearerToken: async () => ({
          user: {
            id: "auth-1",
            email: setupInput.email,
            emailVerifiedAt: null
          }
        })
      } as never
    );

    await assert.rejects(
      () => controller.initialize(setupInput, "Bearer token"),
      UnauthorizedException
    );
  });
});
