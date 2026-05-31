"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, Globe, Hash, Loader2, MapPinned, User, Users } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { useSupabaseSession } from "@/lib/supabase/use-session";
import { mustChangePassword } from "@/lib/auth/session-route-policy";
import { safeReplace } from "@/lib/navigation";

type Step = "welcome" | "workspace" | "venue" | "creating";

export default function SetupPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const session = useSupabaseSession();
  const [step, setStep] = useState<Step>("welcome");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
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

    // Check if user already has a staff profile by calling /me
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000"}/me`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    })
      .then((res) => {
        if (res.ok) {
          // Already has a profile, redirect to admin
          safeReplace(router, "/admin");
        }
        // If 401/403, proceed with setup
      })
      .catch(() => {
        // API might not be reachable, stay on setup
      });
  }, [session, router]);

  // Auto-generate slugs from names
  function toSlug(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function handleStartWorkspace(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError("Please enter your name.");
      return;
    }

    setStep("workspace");
  }

  async function handleCreateWorkspace(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!workspaceName.trim()) {
      setError("Please enter a workspace name.");
      return;
    }

    setStep("venue");
  }

  async function handleCompleteSetup(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!venueName.trim()) {
      setError("Please enter a venue name.");
      return;
    }

    if (!session || !supabase) {
      setError("Session expired. Please sign in again.");
      return;
    }

    setLoading(true);
    setStep("creating");

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
      const response = await fetch(`${apiUrl}/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          email: session.user.email,
          displayName: displayName.trim(),
          workspaceName: workspaceName.trim(),
          workspaceSlug: workspaceSlug || toSlug(workspaceName),
          venueName: venueName.trim(),
          venueSlug: venueSlug || toSlug(venueName),
          timezone
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || body?.error || "Setup failed");
      }

      // Redirect to admin page
      safeReplace(router, "/admin");
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
              <h1>Welcome to GuestOS</h1>
              <p>Let&apos;s set up your workspace. You&apos;ll be the first owner.</p>
            </div>

            <form className="auth-form" onSubmit={handleStartWorkspace}>
              <label>
                <span>Your name</span>
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

        {step === "workspace" && (
          <>
            <div className="auth-hero compact">
              <span className="status-orbit">
                <Users size={24} />
              </span>
              <h1>Create your workspace</h1>
              <p>A workspace is your organisation or group. All venues and staff live inside it.</p>
            </div>

            <form className="auth-form" onSubmit={handleCreateWorkspace}>
              <label>
                <span>Workspace name</span>
                <span className="input-shell">
                  <Building2 size={16} />
                  <input
                    onChange={(e) => {
                      setWorkspaceName(e.target.value);
                      if (!workspaceSlug || workspaceSlug === toSlug(workspaceName)) {
                        setWorkspaceSlug(toSlug(e.target.value));
                      }
                    }}
                    placeholder="e.g. ACME Group"
                    required
                    type="text"
                    value={workspaceName}
                  />
                </span>
              </label>

              <label>
                <span>Workspace URL slug</span>
                <span className="input-shell">
                  <Hash size={16} />
                  <input
                    onChange={(e) => setWorkspaceSlug(e.target.value)}
                    placeholder="e.g. acme-group"
                    required
                    type="text"
                    value={workspaceSlug}
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
                <span className="input-shell">
                  <Hash size={16} />
                  <input
                    onChange={(e) => setVenueSlug(e.target.value)}
                    placeholder="e.g. the-grand-lounge"
                    required
                    type="text"
                    value={venueSlug}
                  />
                </span>
              </label>

              <label>
                <span>Timezone</span>
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
                <button className="command-button" disabled={loading} onClick={() => setStep("workspace")} type="button">
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
            <h2>Setting up your workspace</h2>
            <p>Creating workspace, your profile, and venue...</p>
          </div>
        )}
      </section>
    </main>
  );
}
