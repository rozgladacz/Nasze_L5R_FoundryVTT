// Shared helpers exposed on game.l5r5e.macros for use inside roll-effect macros.
// Macro authors can pull what they need: const { fail, resolveActor } = game.l5r5e.macros;

function fail(message) {
    ui.notifications?.error?.(message);
    throw new Error(message);
}

function coerceNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function coerceBoolean(value, fallback = false) {
    if (value === undefined || value === null) {
        return Boolean(fallback);
    }
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        return value !== 0;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
        if (["false", "0", "no", "n", "off", ""].includes(normalized)) return false;
    }
    return Boolean(value);
}

async function resolveActor(...sources) {
    for (const source of sources) {
        if (!source || typeof source !== "object") continue;
        if (source.actor && typeof source.actor === "object") {
            return source.actor;
        }
        const uuid = source.actorUuid ?? source.actor_uuid ?? null;
        if (typeof uuid === "string" && uuid) {
            const resolved = await fromUuid(uuid).catch(() => null);
            if (resolved) {
                return resolved.actor ?? resolved;
            }
        }
    }
    return null;
}

async function resolveItem(...sources) {
    for (const source of sources) {
        if (!source || typeof source !== "object") continue;
        if (source.item && typeof source.item === "object") {
            return source.item;
        }
        const uuid = source.itemUuid ?? source.item_uuid ?? null;
        if (typeof uuid === "string" && uuid) {
            const resolved = await fromUuid(uuid).catch(() => null);
            if (resolved) return resolved;
        }
    }
    return null;
}

function escapeHtml(unsafe) {
    return String(unsafe ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export const MacroHelpersL5r5e = {
    fail,
    coerceNumber,
    coerceBoolean,
    resolveActor,
    resolveItem,
    escapeHtml,
};
