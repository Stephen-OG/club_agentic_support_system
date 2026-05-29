import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateServicePointDto } from "./dto/create-service-point.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
import { UpdateVenueOpeningHoursDto, VenueOpeningHourDto } from "./dto/update-venue-opening-hours.dto";
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
          openingHours: {
            orderBy: {
              dayOfWeek: "asc"
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

describe("updateVenueOpeningHours", () => {
  const standardOpeningHours = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    closesAt: "23:00",
    dayOfWeek,
    isClosed: false,
    opensAt: "09:00"
  }));

  it("persists updated opening hours and returns the venue with them", async () => {
    const venue = { id: "venue_hours_1", workspaceId: "workspace_1", name: "Blue Note", slug: "blue-note" };
    const updatedVenue = {
      ...venue,
      openingHours: [
        { closesAt: "22:00", dayOfWeek: 0, isClosed: false, opensAt: "10:00" },
        { closesAt: "22:00", dayOfWeek: 1, isClosed: false, opensAt: "10:00" },
        { closesAt: "22:00", dayOfWeek: 2, isClosed: false, opensAt: "10:00" },
        { closesAt: "22:00", dayOfWeek: 3, isClosed: false, opensAt: "10:00" },
        { closesAt: "22:00", dayOfWeek: 4, isClosed: false, opensAt: "10:00" },
        { closesAt: "22:00", dayOfWeek: 5, isClosed: false, opensAt: "10:00" },
        { closesAt: "02:00", dayOfWeek: 6, isClosed: false, opensAt: "20:00" }
      ]
    };
    const txCalls: Array<{ model: string; args: unknown }> = [];
    const prisma = {
      venue: {
        findFirst: async () => venue,
        findFirstOrThrow: async () => updatedVenue
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        return callback({
          venueOpeningHour: {
            deleteMany: async (args: unknown) => {
              txCalls.push({ model: "venueOpeningHour.deleteMany", args });
              return { count: 7 };
            },
            createMany: async (args: unknown) => {
              txCalls.push({ model: "venueOpeningHour.createMany", args });
              return { count: 7 };
            }
          }
        });
      }
    };
    const service = new ServicePointsService(
      {} as never,
      {} as never,
      prisma as never,
      {
        assertCanManageVenue: () => undefined
      } as never
    );

    const result = await service.updateVenueOpeningHours(
      { role: "admin", staffProfileId: "staff_1", workspaceId: "workspace_1" },
      "venue_hours_1",
      { openingHours: standardOpeningHours }
    );

    assert.deepEqual(result, updatedVenue);
    assert.deepEqual(txCalls, [
      {
        model: "venueOpeningHour.deleteMany",
        args: {
          where: { venueId: "venue_hours_1" }
        }
      },
      {
        model: "venueOpeningHour.createMany",
        args: {
          data: standardOpeningHours.map((hours) => ({
            closesAt: hours.closesAt,
            dayOfWeek: hours.dayOfWeek,
            isClosed: hours.isClosed,
            opensAt: hours.opensAt,
            venueId: "venue_hours_1"
          }))
        }
      }
    ]);
  });

  it("throws BadRequestException when fewer than 7 days are provided", async () => {
    const venue = { id: "venue_hours_2", workspaceId: "workspace_1" };
    const service = new ServicePointsService(
      {} as never,
      {} as never,
      {
        venue: {
          findFirst: async () => venue
        }
      } as never,
      {
        assertCanManageVenue: () => undefined
      } as never
    );

    await assert.rejects(
      service.updateVenueOpeningHours(
        { role: "admin", staffProfileId: "staff_1", workspaceId: "workspace_1" },
        "venue_hours_2",
        { openingHours: standardOpeningHours.slice(0, 6) }
      ),
      BadRequestException
    );
  });

  it("throws BadRequestException when duplicate dayOfWeek values are present", async () => {
    const venue = { id: "venue_hours_3", workspaceId: "workspace_1" };
    const duplicateDays = [
      { closesAt: "23:00", dayOfWeek: 0, isClosed: false, opensAt: "09:00" },
      { closesAt: "23:00", dayOfWeek: 1, isClosed: false, opensAt: "09:00" },
      { closesAt: "23:00", dayOfWeek: 2, isClosed: false, opensAt: "09:00" },
      { closesAt: "23:00", dayOfWeek: 3, isClosed: false, opensAt: "09:00" },
      { closesAt: "23:00", dayOfWeek: 4, isClosed: false, opensAt: "09:00" },
      { closesAt: "23:00", dayOfWeek: 5, isClosed: false, opensAt: "09:00" },
      { closesAt: "23:00", dayOfWeek: 5, isClosed: false, opensAt: "09:00" }
    ];
    const service = new ServicePointsService(
      {} as never,
      {} as never,
      {
        venue: {
          findFirst: async () => venue
        }
      } as never,
      {
        assertCanManageVenue: () => undefined
      } as never
    );

    await assert.rejects(
      service.updateVenueOpeningHours(
        { role: "admin", staffProfileId: "staff_1", workspaceId: "workspace_1" },
        "venue_hours_3",
        { openingHours: duplicateDays }
      ),
      BadRequestException
    );
  });

  it("throws NotFoundException when the venue does not exist", async () => {
    const service = new ServicePointsService(
      {} as never,
      {} as never,
      {
        venue: {
          findFirst: async () => null
        }
      } as never,
      {
        assertCanManageVenue: () => undefined
      } as never
    );

    await assert.rejects(
      service.updateVenueOpeningHours(
        { role: "admin", staffProfileId: "staff_1", workspaceId: "workspace_1" },
        "venue_missing",
        { openingHours: standardOpeningHours }
      ),
      NotFoundException
    );
  });

  it("validates time format in UpdateVenueOpeningHoursDto", async () => {
    const valid = plainToInstance(UpdateVenueOpeningHoursDto, {
      openingHours: standardOpeningHours
    });

    const validErrors = await validate(valid);
    assert.equal(validErrors.length, 0);

    const badInput = plainToInstance(UpdateVenueOpeningHoursDto, {
      openingHours: [{ closesAt: "25:00", dayOfWeek: 0, isClosed: false, opensAt: "09:00" }]
    });

    const badErrors = await validate(badInput);
    assert.equal(badErrors.length > 0, true);
  });

  it("validates that openingHours must have exactly 7 entries", async () => {
    const tooFew = plainToInstance(UpdateVenueOpeningHoursDto, {
      openingHours: standardOpeningHours.slice(0, 3)
    });

    const tooFewErrors = await validate(tooFew);
    assert.equal(tooFewErrors.length > 0, true);

    const tooMany = plainToInstance(UpdateVenueOpeningHoursDto, {
      openingHours: [...standardOpeningHours, { closesAt: "23:00", dayOfWeek: 0, isClosed: false, opensAt: "09:00" }]
    });

    const tooManyErrors = await validate(tooMany);
    assert.equal(tooManyErrors.length > 0, true);
  });

  it("validates dayOfWeek range in VenueOpeningHourDto", async () => {
    const tooLarge = plainToInstance(VenueOpeningHourDto, { closesAt: "23:00", dayOfWeek: 7, isClosed: false, opensAt: "09:00" });
    const tooSmall = plainToInstance(VenueOpeningHourDto, { closesAt: "23:00", dayOfWeek: -1, isClosed: false, opensAt: "09:00" });

    assert.equal((await validate(tooLarge)).length > 0, true);
    assert.equal((await validate(tooSmall)).length > 0, true);
  });
});
