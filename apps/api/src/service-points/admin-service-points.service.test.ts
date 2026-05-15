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

  it("lists workspace venues with locations and service points for admins", async () => {
    const venues = [
      {
        id: "venue_1",
        workspaceId: "workspace_1",
        name: "Main Room",
        locations: [{ id: "location_1", name: "Floor", venueId: "venue_1" }],
        servicePoints: [{ id: "service_point_1", label: "Table 1", venueId: "venue_1" }]
      }
    ];
    const calls: unknown[] = [];
    const service = new ServicePointsService(
      {} as never,
      {} as never,
      {
        venue: {
          findMany: async (args: unknown) => {
            calls.push(args);
            return venues;
          }
        }
      } as never,
      {} as never
    );

    const result = await service.listVenues({
      role: "admin",
      staffProfileId: "staff_1",
      workspaceId: "workspace_1"
    });

    assert.deepEqual(result, venues);
    assert.deepEqual(calls, [
      {
        where: {
          workspaceId: "workspace_1"
        },
        include: {
          locations: {
            orderBy: {
              name: "asc"
            }
          },
          servicePoints: {
            orderBy: {
              label: "asc"
            }
          }
        },
        orderBy: {
          name: "asc"
        }
      }
    ]);
  });

  it("scopes venue listing to the assigned venue for staff", async () => {
    const calls: unknown[] = [];
    const service = new ServicePointsService(
      {} as never,
      {} as never,
      {
        venue: {
          findMany: async (args: unknown) => {
            calls.push(args);
            return [];
          }
        }
      } as never,
      {} as never
    );

    await service.listVenues({
      role: "staff",
      staffProfileId: "staff_1",
      workspaceId: "workspace_1",
      venueId: "venue_1"
    });

    assert.equal((calls[0] as { where: { id: string } }).where.id, "venue_1");
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

  it("rejects malformed location IDs during DTO validation", async () => {
    const servicePoint = plainToInstance(CreateServicePointDto, {
      label: "Main Bar",
      locationId: "not-a-uuid"
    });

    const errors = await validate(servicePoint);

    assert.equal(errors.some((error) => error.property === "locationId"), true);
  });
});
