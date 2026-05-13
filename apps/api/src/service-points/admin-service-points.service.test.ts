import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateServicePointDto } from "./dto/create-service-point.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
import { ServicePointsService } from "./service-points.service";

describe("ServicePointsService admin helpers", () => {
  it("creates URL-safe QR tokens", () => {
    const service = new ServicePointsService({} as never, {} as never, {} as never, {} as never);
    const token = service.createQrToken("Main Bar");

    assert.match(token, /^sp_[a-z0-9_]+_[a-f0-9]{24}$/);
  });

  it("rejects a location that is not attached to the venue", async () => {
    let created = false;
    const service = new ServicePointsService(
      {} as never,
      {} as never,
      {
        venue: {
          findFirst: async () => ({ id: "venue_1", workspaceId: "workspace_1" })
        },
        venueLocation: {
          findFirst: async () => null
        },
        servicePoint: {
          create: async () => {
            created = true;
          }
        }
      } as never,
      {
        assertCanManageVenue: () => undefined
      } as never
    );

    await assert.rejects(
      service.createServicePoint(
        { role: "admin", staffProfileId: "staff_1", workspaceId: "workspace_1" },
        "venue_1",
        { label: "Main Bar", locationId: "location_1" }
      ),
      BadRequestException
    );
    assert.equal(created, false);
  });

  it("uses workspace-scoped venue lookup before authorization", async () => {
    let authorizeCalled = false;
    const service = new ServicePointsService(
      {} as never,
      {} as never,
      {
        venue: {
          findFirst: async (query: unknown) => {
            assert.deepEqual(query, {
              where: {
                id: "venue_1",
                workspaceId: "workspace_1"
              }
            });
            return null;
          }
        }
      } as never,
      {
        assertCanManageVenue: () => {
          authorizeCalled = true;
        }
      } as never
    );

    await assert.rejects(
      service.createServicePoint(
        { role: "admin", staffProfileId: "staff_1", workspaceId: "workspace_1" },
        "venue_1",
        { label: "Main Bar" }
      ),
      NotFoundException
    );
    assert.equal(authorizeCalled, false);
  });

  it("normalizes DTO whitespace before validation", async () => {
    const venue = plainToInstance(CreateVenueDto, { name: "  Main Bar  ", slug: "main-bar" });
    const servicePoint = plainToInstance(CreateServicePointDto, { label: "  Patio  " });
    const blankVenue = plainToInstance(CreateVenueDto, { name: "   ", slug: "blank" });
    const blankServicePoint = plainToInstance(CreateServicePointDto, { label: "   " });

    assert.equal(venue.name, "Main Bar");
    assert.equal(servicePoint.label, "Patio");
    assert.equal((await validate(blankVenue)).length > 0, true);
    assert.equal((await validate(blankServicePoint)).length > 0, true);
  });
});
