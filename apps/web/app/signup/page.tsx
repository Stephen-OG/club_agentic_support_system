"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, Globe, Hash, Loader2, MapPinned, User, Users } from "lucide-react";
import { createBrowserAuthClient } from "@/lib/app-auth/browser";
import { useAuthSession } from "@/lib/app-auth/use-session";
import { getSignedInRouteAction, mustChangePassword } from "@/lib/auth/session-route-policy";
import type { CommandUser } from "@/lib/auth/types";
import { getSignupSlugError, normalizeSignupSlug } from "@/lib/auth/signup-flow";
import { apiBaseUrl, createApiUnreachableError } from "@/lib/api/client";
import { safeReplace } from "@/lib/navigation";

type Step = "welcome" | "organization" | "venue" | "creating";

export default function SetupPage() {
  const router = useRouter();
  const authClient = useMemo(() => createBrowserAuthClient(), []);
  const session = useAuthSession();
  const [step, setStep] = useState<Step>("welcome");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueSlug, setVenueSlug] = useState("");
  const [timezone, setTimezone] = useState("Europe/London");

  // Redirect if not authenticated or already set up
  useEffect(() => {
    if (session === undefined) return;

    if (!session) {
      safeReplace(router, "/login");
      return;
    }

    if (mustChangePassword(session.user)) {
      safeReplace(router, "/login");
      return;
    }

    if (!session.user.email_confirmed_at && !session.user.confirmed_at) {
      setError("Verify your email before completing organization setup.");
      return;
    }

    // Check if user already has a staff profile by calling /me.
    fetch(`${apiBaseUrl}/me`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    })
      .then(async (res) => {
        if (res.ok) {
          const user = (await res.json().catch(() => null)) as CommandUser | null;
          if (user) {
            const action = getSignedInRouteAction({
              user,
              userMetadata: session.user.user_metadata
            });
            if (action.kind === "redirect") {
              safeReplace(router, action.path);
            }
          } else {
            safeReplace(router, "/command");
          }
        }
        // If 401/403, proceed with setup
      })
      .catch(() => {
        // API might not be reachable, stay on setup
      });
  }, [session, router]);

  useEffect(() => {
    if (!session || displayName) {
      return;
    }

    const metadataName = typeof session.user.user_metadata?.displayName === "string"
      ? session.user.user_metadata.displayName
      : typeof session.user.user_metadata?.full_name === "string"
      ? session.user.user_metadata.full_name
      : "";
    const emailName = session.user.email?.split("@")[0]?.replace(/[._-]+/g, " ") || "";
    setDisplayName(metadataName || emailName);
  }, [displayName, session]);

  // Auto-generate slugs from names
  function toSlug(value: string) {
    return normalizeSignupSlug(value);
  }

  async function handleStartWorkspace(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError("Please enter your name.");
      return;
    }

    setStep("organization");
  }

  async function handleCreateWorkspace(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!organizationName.trim()) {
      setError("Please enter an organization name.");
      return;
    }

    const nextOrganizationSlug = organizationSlug || toSlug(organizationName);
    const slugError = getSignupSlugError("Organization", nextOrganizationSlug);
    if (slugError) {
      setError(slugError);
      setOrganizationSlug(nextOrganizationSlug);
      return;
    }

    setOrganizationSlug(nextOrganizationSlug);
    setStep("venue");
  }

  async function handleCompleteSetup(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!venueName.trim()) {
      setError("Please enter a venue name.");
      return;
    }

    const nextOrganizationSlug = organizationSlug || toSlug(organizationName);
    const organizationSlugError = getSignupSlugError("Organization", nextOrganizationSlug);
    if (organizationSlugError) {
      setError(organizationSlugError);
      setOrganizationSlug(nextOrganizationSlug);
      setStep("organization");
      return;
    }

    const nextVenueSlug = venueSlug || toSlug(venueName);
    const venueSlugError = getSignupSlugError("Venue", nextVenueSlug);
    if (venueSlugError) {
      setError(venueSlugError);
      setVenueSlug(nextVenueSlug);
      return;
    }

    setOrganizationSlug(nextOrganizationSlug);
    setVenueSlug(nextVenueSlug);

    if (!session || !authClient) {
      setError("Session expired. Please sign in again.");
      return;
    }

    setLoading(true);
    setStep("creating");

    try {
      let response: Response;

      try {
        response = await fetch(`${apiBaseUrl}/signup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            email: session.user.email,
            displayName: displayName.trim(),
            organizationName: organizationName.trim(),
            organizationSlug: nextOrganizationSlug,
            venueName: venueName.trim(),
            venueSlug: nextVenueSlug,
            timezone
          })
        });
      } catch {
        throw createApiUnreachableError();
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || body?.error || "Setup failed");
      }

      safeReplace(router, "/command");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed. Please try again.");
      setStep("venue");
    } finally {
      setLoading(false);
    }
  }

  if (session === undefined) {
    return <main aria-busy="true" className="auth-screen" />;
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel setup-panel" aria-label="Workspace setup">
        {step === "welcome" && (
          <>
            <div className="auth-hero compact">
              <span className="status-orbit">
                <Building2 size={24} />
              </span>
              <h1>Welcome to Madupe</h1>
              <p>Let&apos;s set up your organization. You&apos;ll be the first owner.</p>
            </div>

            <form className="auth-form" onSubmit={handleStartWorkspace}>
              <label>
                <span>Your name</span>
                <small className="field-hint">Shown to your team as the first owner of the organization.</small>
                <span className="input-shell">
                  <User size={16} />
                  <input
                    autoComplete="name"
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Alex Johnson"
                    required
                    type="text"
                    value={displayName}
                  />
                </span>
              </label>

              {error ? <div className="form-error">{error}</div> : null}

              <button className="command-button primary" type="submit">
                Get started
                <ChevronRight size={16} />
              </button>
            </form>
          </>
        )}

        {step === "organization" && (
          <>
            <div className="auth-hero compact">
              <span className="status-orbit">
                <Users size={24} />
              </span>
              <h1>Create your organization</h1>
              <p>An organization is your group. All venues and staff live inside it.</p>
            </div>

            <form className="auth-form" onSubmit={handleCreateWorkspace}>
              <label>
                <span>Organization name</span>
                <small className="field-hint">The business or organization that owns the venues.</small>
                <span className="input-shell">
                  <Building2 size={16} />
                  <input
                    onChange={(e) => {
                      setOrganizationName(e.target.value);
                      if (!organizationSlug || organizationSlug === toSlug(organizationName)) {
                        setOrganizationSlug(toSlug(e.target.value));
                      }
                    }}
                    placeholder="e.g. ACME Group"
                    required
                    type="text"
                    value={organizationName}
                  />
                </span>
              </label>

              <label>
                <span>Organization URL slug</span>
                <small className="field-hint">A unique lowercase identifier for the organization, like lost-mary.</small>
                <span className="input-shell">
                  <Hash size={16} />
                  <input
                    onBlur={() => setOrganizationSlug((current) => normalizeSignupSlug(current))}
                    onChange={(e) => setOrganizationSlug(normalizeSignupSlug(e.target.value))}
                    placeholder="e.g. acme-group"
                    required
                    type="text"
                    value={organizationSlug}
                  />
                </span>
              </label>

              {error ? <div className="form-error">{error}</div> : null}

              <div className="form-actions">
                <button className="command-button" onClick={() => setStep("welcome")} type="button">
                  Back
                </button>
                <button className="command-button primary" type="submit">
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </form>
          </>
        )}

        {step === "venue" && (
          <>
            <div className="auth-hero compact">
              <span className="status-orbit">
                <MapPinned size={24} />
              </span>
              <h1>Add your first venue</h1>
              <p>A venue is a physical location like a restaurant, bar, or club.</p>
            </div>

            <form className="auth-form" onSubmit={handleCompleteSetup}>
              <label>
                <span>Venue name</span>
                <small className="field-hint">The first physical location guests and staff will use.</small>
                <span className="input-shell">
                  <MapPinned size={16} />
                  <input
                    onChange={(e) => {
                      setVenueName(e.target.value);
                      if (!venueSlug || venueSlug === toSlug(venueName)) {
                        setVenueSlug(toSlug(e.target.value));
                      }
                    }}
                    placeholder="e.g. The Grand Lounge"
                    required
                    type="text"
                    value={venueName}
                  />
                </span>
              </label>

              <label>
                <span>Venue URL slug</span>
                <small className="field-hint">A unique lowercase identifier for this location, like soho-main-room.</small>
                <span className="input-shell">
                  <Hash size={16} />
                  <input
                    onBlur={() => setVenueSlug((current) => normalizeSignupSlug(current))}
                    onChange={(e) => setVenueSlug(normalizeSignupSlug(e.target.value))}
                    placeholder="e.g. the-grand-lounge"
                    required
                    type="text"
                    value={venueSlug}
                  />
                </span>
              </label>

              <label>
                <span>Timezone</span>
                <small className="field-hint">Used for opening hours, request timestamps, and reporting.</small>
                <span className="input-shell">
                  <Globe size={16} />
                  <select onChange={(e) => setTimezone(e.target.value)} value={timezone}>
                    <option value="Europe/London">London (GMT/BST)</option>
                    <option value="Europe/Paris">Paris (CET/CEST)</option>
                    <option value="America/New_York">New York (EST/EDT)</option>
                    <option value="America/Chicago">Chicago (CST/CDT)</option>
                    <option value="America/Los_Angeles">Los Angeles (PST/PDT)</option>
                    <option value="Asia/Dubai">Dubai (GST)</option>
                    <option value="Asia/Singapore">Singapore (SGT)</option>
                    <option value="Australia/Sydney">Sydney (AEST/AEDT)</option>
                    <option value="Pacific/Auckland">Auckland (NZST/NZDT)</option>
                  </select>
                </span>
              </label>

              {error ? <div className="form-error">{error}</div> : null}

              <div className="form-actions">
                <button className="command-button" disabled={loading} onClick={() => setStep("organization")} type="button">
                  Back
                </button>
                <button className="command-button primary" disabled={loading} type="submit">
                  {loading ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      Complete setup
                      <ChevronRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}

        {step === "creating" && (
          <div className="setup-creating">
            <Loader2 size={32} className="spin" />
            <h2>Setting up your organization</h2>
            <p>Creating organization, your profile, and venue...</p>
          </div>
        )}
      </section>
    </main>
  );
}
