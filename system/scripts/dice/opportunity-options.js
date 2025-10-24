const OPPORTUNITY_CATALOGUE = [
    {
        id: "calmingBreath",
        cost: 1,
        filters: {
            stances: ["water", "earth", "void", "any"],
        },
        localization: {
            title: "l5r5e.opportunities.calmingBreath.title",
            description: "l5r5e.opportunities.calmingBreath.description",
        },
        summaryKeys: ["l5r5e.opportunities.calmingBreath.effect"],
        effects: [
            { type: "strife", amount: -1 },
            { type: "note", noteKey: "l5r5e.opportunities.calmingBreath.note" },
        ],
    },
    {
        id: "pressTheAttack",
        cost: 2,
        filters: {
            testTypes: ["attack", "technique"],
            stances: ["fire", "air"],
            weaponQualities: ["deadly", "razor-edged", "razored", "sharp"],
        },
        localization: {
            title: "l5r5e.opportunities.pressTheAttack.title",
            description: "l5r5e.opportunities.pressTheAttack.description",
        },
        summaryKeys: ["l5r5e.opportunities.pressTheAttack.effect"],
        effects: [
            { type: "damage", amount: 2 },
            {
                type: "note",
                noteKey: "l5r5e.opportunities.pressTheAttack.note",
                values: { amount: 2 },
                format: true,
            },
        ],
    },
    {
        id: "seizeTheMoment",
        cost: 1,
        filters: {
            goalIncludes: ["finish", "critical", "decisive"],
            targetStances: ["any"],
        },
        localization: {
            title: "l5r5e.opportunities.seizeTheMoment.title",
            description: "l5r5e.opportunities.seizeTheMoment.description",
        },
        summaryKeys: ["l5r5e.opportunities.seizeTheMoment.effect"],
        effects: [
            { type: "critical", amount: 1 },
            {
                type: "note",
                noteKey: "l5r5e.opportunities.seizeTheMoment.note",
            },
        ],
    },
];

function normalizeArray(values) {
    if (!values) {
        return [];
    }
    if (Array.isArray(values)) {
        return values.filter((value) => value !== undefined && value !== null);
    }
    return [values];
}

function normalizeStringArray(values) {
    return normalizeArray(values).map((value) => String(value).toLowerCase());
}

function normalizeGoal(goal) {
    return String(goal ?? "").trim().toLowerCase();
}

function determineTestType(item, rollData) {
    if (!item) {
        return rollData?.skillId ? "skill" : "general";
    }
    const itemType = String(item.type ?? item?.system?.type ?? "").toLowerCase();
    if (itemType === "weapon") {
        return "attack";
    }
    if (itemType) {
        return itemType;
    }
    return "general";
}

function determineTechniqueType(item) {
    if (!item) {
        return null;
    }
    const candidates = normalizeArray([
        item.system?.techniqueType,
        item.system?.subtype,
        item.system?.type,
    ]);
    const found = candidates.find((value) => value !== undefined && value !== null);
    return found ? String(found).toLowerCase() : null;
}

function extractWeaponQualities(item) {
    const qualities = item?.system?.qualities;
    const normalized = [];
    if (!qualities) {
        return normalized;
    }

    if (Array.isArray(qualities)) {
        qualities.forEach((entry) => {
            if (typeof entry === "string") {
                normalized.push(entry.toLowerCase());
            } else if (entry && typeof entry === "object") {
                if (entry.id) {
                    normalized.push(String(entry.id).toLowerCase());
                } else if (entry.name) {
                    normalized.push(String(entry.name).toLowerCase());
                }
            }
        });
        return normalized;
    }

    if (typeof qualities === "string") {
        qualities
            .split(/[,;\s]+/)
            .map((entry) => entry.trim().toLowerCase())
            .filter((entry) => entry.length > 0)
            .forEach((entry) => normalized.push(entry));
        return normalized;
    }

    if (typeof qualities === "object") {
        Object.values(qualities).forEach((value) => {
            if (!value) {
                return;
            }
            if (typeof value === "string") {
                normalized.push(value.toLowerCase());
                return;
            }
            if (value.id) {
                normalized.push(String(value.id).toLowerCase());
                return;
            }
            if (value.name) {
                normalized.push(String(value.name).toLowerCase());
            }
        });
    }

    return normalized;
}

function determineActorStatus(actor) {
    if (!actor) {
        return null;
    }

    const strife = Number(actor.system?.strife?.value ?? 0);
    const composure = Number(actor.system?.strife?.max ?? 0);
    if (Number.isFinite(strife) && Number.isFinite(composure) && composure > 0 && strife >= composure) {
        return "compromised";
    }

    const status = actor.system?.social?.status;
    if (status === undefined || status === null) {
        return null;
    }
    return String(status).toLowerCase();
}

function determineTargetStance(targetActor) {
    if (!targetActor) {
        return null;
    }
    const stance = targetActor.system?.stance ?? targetActor.system?.stances?.current;
    if (!stance) {
        return null;
    }
    return String(stance).toLowerCase();
}

export function createOpportunityContext(roll) {
    const rollData = roll?.l5r5e ?? {};
    const actor = rollData.actor ?? null;
    const item = rollData.item ?? null;
    const targetActor = rollData.target?.actor ?? null;

    return {
        testType: determineTestType(item, rollData),
        techniqueType: determineTechniqueType(item),
        stance: String(rollData.stance ?? "").toLowerCase(),
        weaponQualities: extractWeaponQualities(item),
        actorStatus: determineActorStatus(actor),
        targetStance: determineTargetStance(targetActor),
        goal: normalizeGoal(rollData.goal ?? ""),
    };
}

function matchesOption(option, context) {
    const filters = option.filters ?? {};

    if (filters.stances?.length) {
        const allowed = normalizeStringArray(filters.stances);
        if (context.stance && !allowed.includes(context.stance) && !allowed.includes("any")) {
            return false;
        }
        if (!context.stance && !allowed.includes("none") && !allowed.includes("any")) {
            return false;
        }
    }

    if (filters.testTypes?.length) {
        const allowed = normalizeStringArray(filters.testTypes);
        if (!allowed.includes(context.testType)) {
            return false;
        }
    }

    if (filters.techniqueTypes?.length) {
        const allowed = normalizeStringArray(filters.techniqueTypes);
        if (!context.techniqueType || !allowed.includes(context.techniqueType)) {
            return false;
        }
    }

    if (filters.weaponQualities?.length) {
        const allowed = normalizeStringArray(filters.weaponQualities);
        const matchesQuality = (context.weaponQualities ?? []).some((quality) => allowed.includes(quality));
        if (!matchesQuality) {
            return false;
        }
    }

    if (filters.actorStatuses?.length) {
        const allowed = normalizeStringArray(filters.actorStatuses);
        if (!context.actorStatus || !allowed.includes(context.actorStatus)) {
            return false;
        }
    }

    if (filters.targetStances?.length) {
        const allowed = normalizeStringArray(filters.targetStances);
        if (context.targetStance) {
            if (!allowed.includes(context.targetStance) && !allowed.includes("any")) {
                return false;
            }
        } else if (!allowed.includes("none") && !allowed.includes("any")) {
            return false;
        }
    }

    if (filters.goalIncludes?.length) {
        const fragments = normalizeStringArray(filters.goalIncludes);
        const goal = context.goal ?? "";
        const hasFragment = fragments.some((fragment) => goal.includes(fragment));
        if (!hasFragment) {
            return false;
        }
    }

    return true;
}

function localizeEffectSummaries(option) {
    return (option.summaryKeys ?? []).map((key) => game.i18n.localize(key));
}

function getOptionById(optionId) {
    return OPPORTUNITY_CATALOGUE.find((option) => option.id === optionId) ?? null;
}

export function getOpportunityOptionsForContext(context) {
    if (!context) {
        return [];
    }

    return OPPORTUNITY_CATALOGUE.filter((option) => matchesOption(option, context)).map((option) => ({
        id: option.id,
        cost: option.cost ?? 1,
        title: game.i18n.localize(option.localization?.title ?? option.id),
        description: game.i18n.localize(option.localization?.description ?? option.id),
        effectSummaries: localizeEffectSummaries(option),
    }));
}

export function createOpportunitySelection(optionId, context) {
    if (!context) {
        return null;
    }

    const option = getOptionById(optionId);
    if (!option || !matchesOption(option, context)) {
        return null;
    }

    const selection = {
        id: option.id,
        cost: option.cost ?? 1,
        title: game.i18n.localize(option.localization?.title ?? option.id),
        description: game.i18n.localize(option.localization?.description ?? option.id),
        effectSummaries: localizeEffectSummaries(option),
        preview: { strife: 0, fatigue: 0 },
        apply: { damage: 0, critical: 0, notes: [] },
    };

    (option.effects ?? []).forEach((effect) => {
        const amount = Number(effect.amount ?? 0);
        switch (effect.type) {
            case "strife":
                if (Number.isFinite(amount)) {
                    selection.preview.strife += amount;
                }
                break;
            case "fatigue":
                if (Number.isFinite(amount)) {
                    selection.preview.fatigue += amount;
                }
                break;
            case "damage":
                if (Number.isFinite(amount)) {
                    selection.apply.damage += amount;
                }
                break;
            case "critical":
                if (Number.isFinite(amount)) {
                    selection.apply.critical += amount;
                }
                break;
            case "note": {
                const noteKey = effect.noteKey;
                if (!noteKey) {
                    break;
                }
                const values = { ...(effect.values ?? {}), goal: context.goal ?? "" };
                const localized = effect.format
                    ? game.i18n.format(noteKey, values)
                    : game.i18n.localize(noteKey);
                selection.apply.notes.push(localized);
                break;
            }
            default:
                break;
        }
    });

    selection.apply.notes = selection.apply.notes.filter((note) => note && note.length > 0);
    selection.notes = [...selection.apply.notes];

    return selection;
}

export function aggregateOpportunityEffects(selections = []) {
    return selections.reduce(
        (accumulator, selection) => {
            const apply = selection.apply ?? {};
            if (Number.isFinite(apply.damage)) {
                accumulator.damageBonus += apply.damage;
            }
            if (Number.isFinite(apply.critical)) {
                accumulator.criticalBonus += apply.critical;
            }
            if (Array.isArray(apply.notes)) {
                accumulator.notes.push(...apply.notes.filter((note) => note && note.length > 0));
            }
            return accumulator;
        },
        { damageBonus: 0, criticalBonus: 0, notes: [] }
    );
}

export function sanitizeOpportunitySelections(selections = []) {
    return selections.map((selection) => ({
        id: selection.id,
        cost: selection.cost,
        title: selection.title,
        description: selection.description,
        effectSummaries: [...(selection.effectSummaries ?? [])],
        preview: { ...(selection.preview ?? {}) },
        apply: { ...(selection.apply ?? {}) },
        notes: Array.isArray(selection.notes) ? [...selection.notes] : [],
    }));
}
