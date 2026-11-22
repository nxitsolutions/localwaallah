// NX Control Tower sign-up helper, plain JavaScript (ES module).
// Generated from nxTower.ts by `npm run build:forwarders` in nx-control-tower/functions: edit the .ts, not this file.
// Usage: ctx.waitUntil(reportSignup(env.NX_PROJECT_KEY, { userId, provider: "google" })) right after inserting a NEW user.
export const INGEST_URL = "https://us-central1-nx-control-tower.cloudfunctions.net/ingest";
export function projectFromKey(key) {
    const m = /^nxk_([a-z0-9][a-z0-9-]{0,62})_[A-Za-z0-9_-]+$/.exec(key.trim());
    return m ? m[1] : null;
}
export function buildSignupEvent(project, info) {
    const t = info.createdAt instanceof Date ? info.createdAt.getTime() : typeof info.createdAt === "string" ? Date.parse(info.createdAt) : info.createdAt;
    return {
        project,
        type: "signup",
        source: "app",
        userId: info.userId,
        eventId: `signup:${info.userId}`,
        timestamp: typeof t === "number" && Number.isFinite(t) ? t : Date.now(),
        ...info.plan ? {
            plan: info.plan
        } : {},
        meta: {
            provider: info.provider ?? "unknown"
        }
    };
}
export async function reportSignup(key, info, opts = {}) {
    const log = opts.log ?? console;
    if (!key) return "skipped";
    const project = projectFromKey(key);
    if (!project) {
        log.warn("nx-tower: NX_PROJECT_KEY is not a project key; sign-up not reported");
        return "failed";
    }
    const body = JSON.stringify(buildSignupEvent(project, info));
    const delay = opts.retryDelayMs ?? 500;
    for(let attempt = 0; attempt < 3; attempt++){
        if (attempt > 0) await new Promise((r)=>setTimeout(r, delay * attempt));
        try {
            const res = await (opts.fetchFn ?? fetch)(opts.url ?? INGEST_URL, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${key.trim()}`,
                    "Content-Type": "application/json"
                },
                body
            });
            if (res.ok) return "ok";
            if (res.status !== 429 && res.status < 500) {
                log.warn(`nx-tower: sign-up rejected (${res.status}) ${await res.text().catch(()=>"")}`);
                return "failed";
            }
        } catch  {}
    }
    log.warn("nx-tower: sign-up not reported after 3 tries");
    return "failed";
}
