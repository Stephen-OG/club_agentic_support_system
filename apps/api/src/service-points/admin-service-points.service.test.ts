import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateServicePointDto } from "./dto/create-service-point.dto";
import { CreateVenueLocationDto } from "./dto/create-venue-location.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
import { UpdateServicePointDto } from "./dto/update-service-point.dto";
import { UpdateVenueOpeningHoursDto, VenueOpeningHourDto } from "./dto/update-venue-opening-hours.dto";
import { ServicePointsService } from "./service-points.service";

function createService(
  aiTriage: ConstructorParameters<typeof ServicePointsService>[0],
  priorityClassifier: ConstructorParameters<typeof ServicePointsService>[3],
  prisma: ConstructorParameters<typeof ServicePointsService>[4],
  venueAccess: ConstructorParameters<typeof ServicePointsService>[5],
  cacheOverride?: Partial<ConstructorParameters<typeof ServicePointsService>[1]>
) {
  const cache = {
    get: async () => null,
    set: async () => undefined,
    del: async () => undefined,
    delPattern: async () => undefined,
    ...cacheOverride
  } as never;
  const queue = { add: async () => ({ id: "mock-job-id" }) } as never;

  return new ServicePointsService(aiTriage, cache, queue, priorityClassifier, prisma, venueAccess);
}

describe("ServicePointsService admin helpers", () => {
  it("creates URL-safe QR tokens", () => {
    const service = createService({} as never, {} as never, {} as never, {} as never);
    const token = service.createQrToken("Main Bar");

    assert.match(token, /^sp_[a-z0-9_]+_[a-f0-9]{24}$/);
  });

  it("rejects a location that is not attached to the venue", async () => {
    let created = false;
    const service = createService(
      {} as never,
      {} as never,
      {
        venue: {
          findFirst: async () => ({ id: "venue_1", organizationId: "workspace_1" })
        },
        venueLocation: {
          findFirst: async () => null
        },
        qrPoint: {
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
        { role: "admin", staffProfileId: "staff_1", organizationId: "workspace_1" },
        "venue_1",
        { label: "Main Bar", locationId: "location_1" }
      ),
      BadRequestException
    );
    assert.equal(created, false);
  });

  it("uses workspace-scoped venue lookup before authorization", async () => {
    let authorizeCalled = false;
    const service = createService(
      {} as never,
      {} as never,
      {
        venue: {
          findFirst: async (query: unknown) => {
            assert.deepEqual(query, {
              where: {
                id: "venue_1",
                organizationId: "workspace_1"
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
        { role: "admin", staffProfileId: "staff_1", organizationId: "workspace_1" },
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
        organizationId: "workspace_1",
        name: "Main Room",
        locations: [{ id: "location_1", name: "Floor", venueId: "venue_1" }],
        qrPoints: [{ id: "service_point_1", label: "Table 1", venueId: "venue_1" }]
      }
    ];
    const calls: unknown[] = [];
    const service = createService(
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
      organizationId: "workspace_1"
    });

    assert.deepEqual(result, venues);
    assert.deepEqual(calls, [
      {
        where: {
          organizationId: "workspace_1"
        },
        include: {
          locations: {
            orderBy: {
              name: "asc"
            }
          },
          hours: {
            orderBy: {
              dayOfWeek: "asc"
            }
          },
          qrPoints: {
            where: {
              isActive: true
            },
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
    const service = createService(
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
      organizationId: "workspace_1",
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

  it("creates a venue zone after checking workspace scope and manage permission", async () => {
    const venue = { id: "venue_1", organizationId: "workspace_1" };
    const createdLocation = { id: "location_1", venueId: "venue_1", name: "Balcony", zone: null };
    let authorizeCalled = false;
    const service = createService(
      {} as never,
      {} as never,
      {
        venue: {
          findFirst: async () => venue
        },
        venueLocation: {
          create: async (args: unknown) => {
            assert.deepEqual(args, {
              data: {
                venueId: "venue_1",
                name: "Balcony",
                zone: null
              }
            });
            return createdLocation;
          }
        }
      } as never,
      {
        assertCanManageVenue: () => {
          authorizeCalled = true;
        }
      } as never
    );

    const result = await service.createVenueLocation(
      { role: "admin", staffProfileId: "staff_1", organizationId: "workspace_1" },
      "venue_1",
      { name: "  Balcony  " }
    );

    assert.deepEqual(result, createdLocation);
    assert.equal(authorizeCalled, true);
  });

  it("updates a QR point label and location inside the venue", async () => {
    const venue = { id: "venue_1", organizationId: "workspace_1" };
    const point = { id: "point_1", venueId: "venue_1", label: "Table 1" };
    const updatedPoint = { ...point, label: "VIP Booth", locationId: "location_1" };
    const service = createService(
      {} as never,
      {} as never,
      {
        venue: {
          findFirst: async () => venue
        },
        qrPoint: {
          findFirst: async () => point,
          update: async (args: unknown) => {
            assert.deepEqual(args, {
              where: { id: "point_1" },
              data: {
                label: "VIP Booth",
                locationId: "location_1"
              }
            });
            return updatedPoint;
          }
        },
        venueLocation: {
          findFirst: async () => ({ id: "location_1", venueId: "venue_1" })
        }
      } as never,
      {
        assertCanManageVenue: () => undefined
      } as never
    );

    const result = await service.updateServicePoint(
      { role: "admin", staffProfileId: "staff_1", organizationId: "workspace_1" },
      "venue_1",
      "point_1",
      { label: "  VIP Booth  ", locationId: "location_1" }
    );

    assert.deepEqual(result, updatedPoint);
  });

  it("soft-deletes QR points so historical request data is preserved", async () => {
    const service = createService(
      {} as never,
      {} as never,
      {
        venue: {
          findFirst: async () => ({ id: "venue_1", organizationId: "workspace_1" })
        },
        qrPoint: {
          findFirst: async () => ({ id: "point_1", venueId: "venue_1", isActive: true }),
          update: async (args: unknown) => {
            assert.deepEqual(args, {
              where: { id: "point_1" },
              data: { isActive: false }
            });
            return { id: "point_1", venueId: "venue_1", isActive: false };
          }
        }
      } as never,
      {
        assertCanManageVenue: () => undefined
      } as never
    );

    const result = await service.deleteServicePoint(
      { role: "admin", staffProfileId: "staff_1", organizationId: "workspace_1" },
      "venue_1",
      "point_1"
    );

    assert.equal(result.isActive, false);
  });

  it("validates zone and QR point update DTOs", async () => {
    const blankLocation = plainToInstance(CreateVenueLocationDto, { name: "   " });
    const blankUpdate = plainToInstance(UpdateServicePointDto, { label: "   " });

    assert.equal((await validate(blankLocation)).some((error) => error.property === "name"), true);
    assert.equal((await validate(blankUpdate)).some((error) => error.property === "label"), true);
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
    const venue = { id: "venue_hours_1", organizationId: "workspace_1", name: "Blue Note", slug: "blue-note" };
    const updatedVenue = {
      ...venue,
      hours: [
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
          venueHours: {
            deleteMany: async (args: unknown) => {
              txCalls.push({ model: "venueHours.deleteMany", args });
              return { count: 7 };
            },
            createMany: async (args: unknown) => {
              txCalls.push({ model: "venueHours.createMany", args });
              return { count: 7 };
            }
          }
        });
      }
    };
    const service = createService(
      {} as never,
      {} as never,
      prisma as never,
      {
        assertCanManageVenue: () => undefined
      } as never
    );

    const result = await service.updateVenueOpeningHours(
      { role: "admin", staffProfileId: "staff_1", organizationId: "workspace_1" },
      "venue_hours_1",
      { openingHours: standardOpeningHours }
    );

    assert.deepEqual(result, updatedVenue);
    assert.deepEqual(txCalls, [
      {
        model: "venueHours.deleteMany",
        args: {
          where: { venueId: "venue_hours_1" }
        }
      },
      {
        model: "venueHours.createMany",
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

  it("invalidates public intake caches after opening hours change", async () => {
    const venue = { id: "venue_hours_cache", organizationId: "workspace_1", slug: "venue-cache" };
    const deletedPatterns: string[] = [];
    const service = createService(
      {} as never,
      {} as never,
      {
        venue: {
          findFirst: async () => venue,
          findFirstOrThrow: async () => venue
        },
        $transaction: async (operation: any) =>
          operation({
            venueHours: {
              createMany: async () => undefined,
              deleteMany: async () => undefined
            }
          })
      } as never,
      {
        assertCanManageVenue: () => undefined
      } as never,
      {
        del: async (key: string) => {
          deletedPatterns.push(key);
        },
        delPattern: async (pattern: string) => {
          deletedPatterns.push(pattern);
        }
      }
    );

    await service.updateVenueOpeningHours(
      { role: "admin", staffProfileId: "staff_1", organizationId: "workspace_1" },
      "venue_hours_cache",
      { openingHours: standardOpeningHours }
    );

    assert.deepEqual(deletedPatterns, ["venue:intake:venue-cache", "sp:intake:*"]);
  });

  it("throws BadRequestException when fewer than 7 days are provided", async () => {
    const venue = { id: "venue_hours_2", organizationId: "workspace_1" };
    const service = createService(
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
        { role: "admin", staffProfileId: "staff_1", organizationId: "workspace_1" },
        "venue_hours_2",
        { openingHours: standardOpeningHours.slice(0, 6) }
      ),
      BadRequestException
    );
  });

  it("throws BadRequestException when duplicate dayOfWeek values are present", async () => {
    const venue = { id: "venue_hours_3", organizationId: "workspace_1" };
    const duplicateDays = [
      { closesAt: "23:00", dayOfWeek: 0, isClosed: false, opensAt: "09:00" },
      { closesAt: "23:00", dayOfWeek: 1, isClosed: false, opensAt: "09:00" },
      { closesAt: "23:00", dayOfWeek: 2, isClosed: false, opensAt: "09:00" },
      { closesAt: "23:00", dayOfWeek: 3, isClosed: false, opensAt: "09:00" },
      { closesAt: "23:00", dayOfWeek: 4, isClosed: false, opensAt: "09:00" },
      { closesAt: "23:00", dayOfWeek: 5, isClosed: false, opensAt: "09:00" },
      { closesAt: "23:00", dayOfWeek: 5, isClosed: false, opensAt: "09:00" }
    ];
    const service = createService(
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
        { role: "admin", staffProfileId: "staff_1", organizationId: "workspace_1" },
        "venue_hours_3",
        { openingHours: duplicateDays }
      ),
      BadRequestException
    );
  });

  it("throws NotFoundException when the venue does not exist", async () => {
    const service = createService(
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
        { role: "admin", staffProfileId: "staff_1", organizationId: "workspace_1" },
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
