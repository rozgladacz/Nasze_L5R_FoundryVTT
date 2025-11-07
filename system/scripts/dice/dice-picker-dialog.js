import { defaultActionsState, getRollActionTypes, normalizeActions } from "./action-types.js";

const RING_IDS = ["fire", "air", "water", "earth", "void"];

function normalizeRollEffects(effects) {
    if (!effects) {
        return [];
    }

    const sanitizeParameterValueMap = (values) => {
        if (!values || typeof values !== "object" || Array.isArray(values)) {
            return {};
        }
        return Object.entries(values).reduce((acc, [key, value]) => {
            if (key) {
                acc[key] = value;
            }
            return acc;
        }, {});
    };

    const normalizeParameterDefs = (rawParameters) => {
        if (!Array.isArray(rawParameters)) {
            return [];
        }

        const coerceBoolean = (value) => {
            if (typeof value === "string") {
                return ["1", "true", "on", "yes"].includes(value.trim().toLowerCase());
            }
            return Boolean(value);
        };

        return rawParameters
            .map((param, index) => {
                if (param === undefined || param === null) {
                    return null;
                }

                if (typeof param === "string") {
                    const trimmed = param.trim();
                    if (!trimmed) {
                        return null;
                    }
                    return {
                        name: trimmed,
                        label: trimmed,
                        type: "string",
                        description: "",
                        defaultValue: "",
                        userValue: "",
                        order: index,
                    };
                }

                if (typeof param === "number") {
                    const numeric = Number(param);
                    if (Number.isNaN(numeric)) {
                        return null;
                    }
                    return {
                        name: `param${index + 1}`,
                        label: `param${index + 1}`,
                        type: "number",
                        description: "",
                        defaultValue: numeric,
                        userValue: numeric,
                        includeInTotal: true,
                        order: index,
                    };
                }

                if (typeof param === "object") {
                    const clone = foundry.utils.deepClone(param);
                    const nameCandidate =
                        typeof clone.name === "string"
                            ? clone.name
                            : typeof clone.key === "string"
                                ? clone.key
                                : typeof clone.id === "string"
                                    ? clone.id
                                    : typeof clone.slug === "string"
                                        ? clone.slug
                                        : null;
                    clone.name = nameCandidate && nameCandidate.length > 0 ? nameCandidate : `param${index + 1}`;

                    const typeCandidate = clone.type ?? clone.input ?? clone.inputType ?? clone.control;
                    if (typeof typeCandidate === "string") {
                        clone.type = typeCandidate.toLowerCase();
                    } else if (typeof clone.defaultValue === "number" || typeof clone.value === "number") {
                        clone.type = "number";
                    } else if (typeof clone.defaultValue === "boolean" || typeof clone.value === "boolean") {
                        clone.type = "boolean";
                    } else {
                        clone.type = "string";
                    }

                    const labelCandidate =
                        clone.label ?? clone.title ?? clone.caption ?? clone.description ?? clone.name ?? "";
                    clone.label = typeof labelCandidate === "string" ? labelCandidate : clone.name;

                    const descriptionCandidate =
                        clone.description ?? clone.hint ?? clone.help ?? clone.tooltip ?? "";
                    clone.description = typeof descriptionCandidate === "string" ? descriptionCandidate : "";

                    const defaultCandidate =
                        clone.defaultValue ??
                        clone.default ??
                        clone.initial ??
                        clone.initialValue ??
                        clone.baseValue ??
                        clone.startValue ??
                        clone.value;

                    if (clone.type === "number") {
                        const numeric = Number(defaultCandidate);
                        clone.defaultValue = Number.isFinite(numeric) ? numeric : 0;
                    } else if (clone.type === "boolean") {
                        clone.defaultValue = coerceBoolean(defaultCandidate);
                    } else {
                        clone.defaultValue =
                            defaultCandidate !== undefined && defaultCandidate !== null ? defaultCandidate : "";
                    }

                    const userCandidate =
                        clone.userValue ?? clone.current ?? clone.value ?? clone.initialValue ?? clone.defaultValue;
                    if (clone.type === "number") {
                        const numeric = Number(userCandidate);
                        clone.userValue = Number.isFinite(numeric) ? numeric : clone.defaultValue;
                    } else if (clone.type === "boolean") {
                        clone.userValue = coerceBoolean(userCandidate);
                    } else {
                        clone.userValue = userCandidate ?? clone.defaultValue ?? "";
                    }

                    const minCandidate = clone.min ?? clone.minimum;
                    const maxCandidate = clone.max ?? clone.maximum;
                    const stepCandidate = clone.step ?? clone.increment;
                    clone.min = Number.isFinite(Number(minCandidate)) ? Number(minCandidate) : null;
                    clone.max = Number.isFinite(Number(maxCandidate)) ? Number(maxCandidate) : null;
                    clone.step = Number.isFinite(Number(stepCandidate)) ? Number(stepCandidate) : null;

                    const optionsCandidate = clone.options ?? clone.choices ?? clone.values ?? clone.items;
                    if (Array.isArray(optionsCandidate)) {
                        clone.options = optionsCandidate
                            .map((option) => {
                                if (option === undefined || option === null) {
                                    return null;
                                }
                                if (typeof option === "object") {
                                    const optClone = foundry.utils.deepClone(option);
                                    if (optClone.value === undefined && optClone.id !== undefined) {
                                        optClone.value = optClone.id;
                                    }
                                    if (optClone.label === undefined && optClone.name !== undefined) {
                                        optClone.label = optClone.name;
                                    }
                                    return optClone;
                                }
                                return {
                                    value: option,
                                    label: String(option),
                                };
                            })
                            .filter((option) => option !== null);
                    }

                    if (!Array.isArray(clone.options)) {
                        clone.options = [];
                    }

                    const editableCandidate =
                        clone.editable ?? clone.userEditable ?? clone.allowUserInput ?? clone.canEdit ?? clone.adjustable;
                    clone.editable =
                        editableCandidate !== undefined ? coerceBoolean(editableCandidate) : clone.type !== "info";

                    const includeCandidate = clone.includeInTotal ?? clone.contributes ?? clone.addToTotal;
                    clone.includeInTotal =
                        includeCandidate !== undefined ? coerceBoolean(includeCandidate) : clone.type === "number";

                    clone.multiple = coerceBoolean(clone.multiple ?? clone.allowMultiple ?? false);
                    clone.required = coerceBoolean(clone.required ?? clone.mandatory ?? false);

                    const placeholderCandidate = clone.placeholder ?? clone.hint ?? null;
                    if (placeholderCandidate !== null && placeholderCandidate !== undefined) {
                        clone.placeholder = placeholderCandidate;
                    }

                    const orderCandidate = Number(clone.order ?? clone.position ?? clone.index);
                    clone.order = Number.isFinite(orderCandidate) ? orderCandidate : index;

                    return clone;
                }

                return null;
            })
            .filter((param) => param !== null)
            .map((param, idx) => ({
                ...param,
                order: Number.isFinite(param.order) ? Number(param.order) : idx,
            }));
    };

    const array = Array.isArray(effects) ? effects : [effects];
    const normalized = array
        .filter((effect) => effect !== undefined && effect !== null)
        .map((effect, index) => {
            if (typeof effect === "string") {
                return {
                    macro: effect,
                    params: {},
                    order: index,
                    parameterDefs: [],
                    parameterValues: {},
                    parameterModifiers: {},
                };
            }

            if (typeof effect === "object") {
                const parsedOrder = Number(effect.order);
                const order = Number.isFinite(parsedOrder) ? parsedOrder : index;

                const rawParameters = Array.isArray(effect.parameterDefs)
                    ? effect.parameterDefs
                    : Array.isArray(effect.parameterDefinitions)
                        ? effect.parameterDefinitions
                        : Array.isArray(effect.parameters)
                            ? effect.parameters
                            : Array.isArray(effect.paramDefs)
                                ? effect.paramDefs
                                : null;

                const paramsSource =
                    rawParameters && typeof rawParameters === "object" && !Array.isArray(rawParameters)
                        ? {}
                        : effect.params ?? (Array.isArray(effect.parameters) ? null : effect.parameters) ?? {};

                const parameterValuesSource =
                    effect.parameterValues ?? effect.values ?? effect.userValues ?? effect.inputs ?? null;
                const parameterModifiersSource =
                    effect.parameterModifiers ?? effect.modifiers ?? effect.adjustments ?? null;

                const params = paramsSource && typeof paramsSource === "object" && !Array.isArray(paramsSource)
                    ? foundry.utils.deepClone(paramsSource)
                    : {};

                return {
                    macro: effect.macro ?? effect.name ?? null,
                    params,
                    order,
                    parameterDefs: normalizeParameterDefs(rawParameters ?? []),
                    parameterValues: sanitizeParameterValueMap(parameterValuesSource),
                    parameterModifiers: sanitizeParameterValueMap(parameterModifiersSource),
                };
            }

            return {
                macro: null,
                params: {},
                order: index,
                parameterDefs: [],
                parameterValues: {},
                parameterModifiers: {},
            };
        });

    return normalized
        .map((effect, idx) => ({
            ...effect,
            order: Number.isFinite(effect.order) ? Number(effect.order) : idx,
        }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * L5R Dice picker dialog
 * @extends {FormApplication}
 */
export class DicePickerDialog extends FormApplication {
    /**
     * Current Actor
     * @type {ActorL5r5e}
     * @private
     */
    _actor = null;

    /**
     * Current used Item (Technique, Weapon)
     * @type {ItemL5r5e}
     * @private
     */
    _item = null;

    /**
     * Current Target (Token)
     * @type {TokenDocument}
     * @private
     */
    _target = null;

    /**
     * If GM or Constructor set to hidden, lock the player choice, so he cannot look the TN
     * @type {{gm: boolean, option: boolean}}
     * @private
     */
    _difficultyHiddenIsLock = {
        gm: false,
        option: false,
    };

    /**
     * Base difficulty before automatic modifiers are applied.
     * @type {number}
     * @private
     */
    _baseDifficulty = 2;

    /**
     * Payload Object
     */
    object = {
        ring: {
            id: "void",
            value: 1,
        },
        skill: {
            id: "",
            value: 0,
            defaultValue: 0,
            cat: "",
            list: [],
            name: "",
            assistance: 0,
        },
        difficulty: {
            value: 2,
            base: 2,
            modifier: 0,
            hidden: false,
            addVoidPoint: false,
            baseModifiers: {
                fire: 0,
                air: 0,
                water: 0,
                earth: 0,
                void: 0,
            },
        },
        useVoidPoint: false,
        isInitiativeRoll: false,
        actions: {},
        rollEffects: [],
        effectParameterDefs: {},
        effectParameterValues: {},
        effectParameterModifiers: {},
    };

    /**
     * Assign the default options
     * @override
     */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "l5r5e-dice-picker-dialog",
            classes: ["l5r5e", "dice-picker-dialog"],
            template: CONFIG.l5r5e.paths.templates + "dice/dice-picker-dialog.html",
            title: game.i18n.localize("l5r5e.dice.dicepicker.title"),
            actor: null,
            ringId: null,
            skillId: "",
            difficulty: 2,
            difficultyHidden: false,
            rollEffects: [],
        });
    }

    /**
     * Normalize any supported representation of ring modifiers into a map keyed by ring id.
     * @param {number[]|Record<string, number>|null|undefined} modifiers
     * @returns {Record<string, number>}
     */
    static normalizeBaseTNModifiers(modifiers) {
        const defaults = {};
        RING_IDS.forEach((ring) => {
            defaults[ring] = 0;
        });

        if (Array.isArray(modifiers)) {
            return RING_IDS.reduce((acc, ring, index) => {
                const value = Number(modifiers[index]);
                acc[ring] = Number.isFinite(value) ? value : 0;
                return acc;
            }, defaults);
        }

        if (Number.isFinite(Number(modifiers))) {
            const numeric = Number(modifiers);
            return RING_IDS.reduce((acc, ring) => {
                acc[ring] = numeric;
                return acc;
            }, defaults);
        }

        if (modifiers && typeof modifiers === "object") {
            return RING_IDS.reduce((acc, ring, index) => {
                const candidates = [modifiers[ring], modifiers[index], modifiers[String(index)]];
                const numericCandidate = candidates.find((candidate) => Number.isFinite(Number(candidate)));
                const value = Number(numericCandidate);
                acc[ring] = Number.isFinite(value) ? value : 0;
                return acc;
            }, defaults);
        }

        return defaults;
    }

    /**
     * Serialize the ring modifier map into an array ordered by Fire → Air → Water → Earth → Void.
     * @param {Record<string, number>|null|undefined} modifiers
     * @returns {number[]}
     */
    static serializeBaseTNModifiers(modifiers) {
        return RING_IDS.map((ring) => {
            const value = Number(modifiers?.[ring]);
            return Number.isFinite(value) ? value : 0;
        });
    }

    /**
     * Define a unique and dynamic element ID for the rendered application
     */
    get id() {
        return `l5r5e-dice-picker-dialog-${this._actor?.id ?? "no-actor"}`;
    }

    /**
     * Add a create macro button on top of sheet
     * @override
     */
    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();

        buttons.unshift({
            label: game.i18n.localize("l5r5e.dice.dicepicker.bt_add_macro"),
            class: "bt-add-macro",
            icon: "fas fa-star",
            onclick: async () => {
                await this._createMacro();
            },
        });

        return buttons;
    }

    /**
     * Create dialog
     *
     * ex: new game.l5r5e.DicePickerDialog({skillId: 'aesthetics', ringId: 'water', actor: game.user.character}).render(true);
     *
     * Options :
     *   actor             {Actor}         Any `Actor` object instance. Ex : `game.user.character`, `canvas.tokens.controlled[0].actor`
     *   actorId           {string}        This is the `id` not the `uuid` of an actor. Ex : "AbYgKrNwWeAxa9jT"
     *   actorName         {string}        Careful this is case-sensitive. Ex : "Isawa Aki"
     *   difficulty        {number}        `1` to `9`
     *   baseTNModifiers   {number[]|Object<string, number>} Optional ring-based TN modifiers applied before automatic adjustments (Fire → Air → Water → Earth → Void)
     *   difficultyHidden  {boolean}       If `true`, hide the difficulty and lock the view for the player.
     *   isInitiativeRoll  {boolean}       `true` if this is an initiative roll
     *   item              {Item}          The object of technique or weapon used for this roll.
     *   itemUuid          {string}        The `uuid` of technique or weapon used for this roll. Can be anything retrieved by `fromUuid()` or `fromUuidSync()`
     *   ringId            {string}        If not provided, take the current stance of the actor if any. Ex : "fire", "water"
     *   skillId           {string}        Skill `id`. Ex : "design", "aesthetics", "courtesy"
     *   skillCatId        {string}        Skill category `id`. Ex : "artisan", "scholar"
     *   skillsList        {string[]}      `skillId`/`skillCatId` list coma separated. Allow the player to select the skill used in a select. Ex : "artisan,design"
     *   target            {TokenDocument} The targeted Token
     *
     * @param options actor, actorId, actorName, difficulty, difficultyHidden, isInitiativeRoll, item, itemUuid, ringId, skillId, skillCatId, skillsList, target
     */
    constructor(options = {}) {
        super({}, options);

        const optionBaseTNModifiers =
            options.baseTNModifiers ?? options.base_TN_modifiers ?? options.base_TN_modifier ?? null;
        this.object.difficulty.baseModifiers = DicePickerDialog.normalizeBaseTNModifiers(optionBaseTNModifiers);

        // Try to get Actor from: options, first selected token or player's selected character
        [
            options?.actor,
            game.actors.get(options?.actorId),
            game.actors.getName(options?.actorName),
            canvas.tokens.controlled[0]?.actor,
            game.user.character,
        ].forEach((actor) => {
            if (!this._actor) {
                this.actor = actor;
            }
        });

        // Ring
        if (options.ringId) {
            this.ringId = options.ringId;
        }

        // SkillList
        if (options.skillsList) {
            this.skillList = options.skillsList;
        }

        // Skill
        if (options.skillId) {
            this.skillId = options.skillId;
        }

        // SkillCategory skillCatId
        if (options.skillCatId) {
            this.skillCatId = options.skillCatId;
        }

        // Target Infos
        if (options.target) {
            this.target = options.target;
        }
        if (!this._target) {
            // Get the 1st selected target
            const targetToken = Array.from(game.user.targets).values().next()?.value?.document;
            if (targetToken) {
                this.target = targetToken;
            }
        }

        const rollEffects = normalizeRollEffects(options.rollEffects);
        this.object.rollEffects = rollEffects;
        this.options.rollEffects = foundry.utils.deepClone(rollEffects);
        this.object.effectParameterDefs = rollEffects.reduce((acc, effect, index) => {
            if (Array.isArray(effect.parameterDefs) && effect.parameterDefs.length > 0) {
                acc[index] = foundry.utils.deepClone(effect.parameterDefs);
            }
            return acc;
        }, {});
        this.object.effectParameterValues = rollEffects.reduce((acc, effect, index) => {
            const values = effect.parameterValues && typeof effect.parameterValues === "object" ? effect.parameterValues : null;
            if (values && Object.keys(values).length > 0) {
                acc[index] = foundry.utils.deepClone(values);
            }
            return acc;
        }, {});
        this.object.effectParameterModifiers = rollEffects.reduce((acc, effect, index) => {
            const modifiers =
                effect.parameterModifiers && typeof effect.parameterModifiers === "object"
                    ? effect.parameterModifiers
                    : null;
            if (modifiers && Object.keys(modifiers).length > 0) {
                acc[index] = foundry.utils.deepClone(modifiers);
            }
            return acc;
        }, {});

        // Difficulty
        if (!options.difficulty || !this.parseDifficulty(options.difficulty)) {
            this.difficulty = game.settings.get(CONFIG.l5r5e.namespace, "initiative-difficulty-value");
        }

        // DifficultyHidden
        if (options.difficultyHidden) {
            this._difficultyHiddenIsLock.option = true;
        }
        this.difficultyHidden = !!options.difficultyHidden;

        // InitiativeRoll
        this.object.isInitiativeRoll = !!options.isInitiativeRoll;

        // Item (weapon/technique)
        if (options.item) {
            this.item = options.item;
        } else if (options.itemUuid) {
            this.item = fromUuidSync(options.itemUuid);
        }

        if (optionBaseTNModifiers !== null && optionBaseTNModifiers !== undefined) {
            this.baseTNModifiers = optionBaseTNModifiers;
        }

        const actionDefaults = options.actions ?? options.actionTypes ?? options.actionTypeTags;
        this.object.actions = defaultActionsState(actionDefaults === undefined && !this.object.isInitiativeRoll );
        if (actionDefaults !== undefined) {
            this.actions = actionDefaults;
        } else {
            this._recalculateDifficulty();
        }
    }

    /**
     * Refresh data (used from socket)
     */
    async refresh() {
        if (this._difficultyHiddenIsLock.option) {
            this.difficulty = game.settings.get(CONFIG.l5r5e.namespace, "initiative-difficulty-value");
            this.difficultyHidden = false;
        }
        this.render(false);
    }

    /**
     * Set actor
     * @param {ActorL5r5e} actor
     */
    set actor(actor) {
        if (!actor) {
            return;
        }
        if (!(actor instanceof Actor) || !actor.isOwner) {
            console.warn("L5R5E | DP | Actor rejected : Not a valid Actor instance or permission was denied", actor);
            return;
        }
        this._actor = actor;
        this.ringId = this._actor.system.stance;
    }

    /**
     * Set used item
     * @param {ItemL5r5e} item
     */
    set item(item) {
        if (!item) {
            return;
        }
        if (!(item instanceof Item) || !item.isOwner) {
            console.warn("L5R5E | DP | Item rejected : Not a valid Item instance or permission was denied", item);
            return;
        }
        this._item = item;
        if (item?.system?.base_tn_modifiers !== undefined) {
            this.baseTNModifiers = item.system.base_tn_modifiers;
        }
    }

    /**
     * Set Target Infos object
     * @param {TokenDocument} targetToken
     */
    set target(targetToken) {
        if (!targetToken) {
            return;
        }
        if (!(targetToken instanceof TokenDocument)) {
            console.warn("L5R5E | DP | target rejected : Not a valid TokenDocument instance", targetToken);
            return;
        }
        this._target = targetToken;
        this._recalculateDifficulty();
    }

    set actions(actions) {
        this.object.actions = normalizeActions(actions);
        this._recalculateDifficulty();
    }

    get actions() {
        return this.object.actions;
    }

    /**
     * Set ring-based modifiers applied before automatic TN adjustments.
     * @param {number[]|Record<string, number>} modifiers
     */
    set baseTNModifiers(modifiers) {
        this.object.difficulty.baseModifiers = DicePickerDialog.normalizeBaseTNModifiers(modifiers);
        this._recalculateDifficulty();
    }

    /**
     * Get a clone of the current ring modifier map.
     * @returns {Record<string, number>}
     */
    get baseTNModifiers() {
        return foundry.utils.deepClone(
            DicePickerDialog.normalizeBaseTNModifiers(this.object.difficulty.baseModifiers)
        );
    }

    /**
     * Set ring preset
     * @param ringId
     */
    set ringId(ringId) {
        this.object.ring.id = CONFIG.l5r5e.stances.includes(ringId) ? ringId : "void";
        this.object.ring.value = this._actor?.system.rings?.[this.object.ring.id] || 1;
        this._recalculateDifficulty();
    }

    /**
     * Set the list of allowed skill to choose.
     * Coma separated, can be a category names or skill names.
     * @param {string} skillsList
     */
    set skillList(skillsList) {
        if (!skillsList) {
            return;
        }
        this.object.skill.list = this.parseSkillsList(skillsList);
        if (this.object.skill.list.length > 0) {
            // Set 1st skill
            if (this.useCategory) {
                this.skillCatId = this.object.skill.list[0].id;
            } else {
                this.skillId = this.object.skill.list[0].id;
            }
            // Remove the list if only one item
            if (this.object.skill.list.length === 1) {
                this.object.skill.list = null;
            }
        }
    }

    /**
     * Set and load skill's required data from actor and skillId
     * @param skillId
     */
    set skillId(skillId) {
        if (!skillId) {
            return;
        }

        this.object.skill = {
            ...this.object.skill,
            id: skillId.toLowerCase().trim(),
            value: 0,
            cat: "",
            name: "",
        };

        this.skillCatId = CONFIG.l5r5e.skills.get(skillId);
    }

    /**
     * Set and load skill's required data from actor and skillCatId
     * @param skillCatId
     */
    set skillCatId(skillCatId) {
        if (!skillCatId) {
            return;
        }

        this.object.skill = {
            ...this.object.skill,
            value: 0,
            cat: skillCatId.toLowerCase().trim(),
            name: game.i18n.localize("l5r5e.skills." + skillCatId + "." + (this.object.skill.id || "title")),
        };

        if (!this._actor) {
            return;
        }
        switch (this._actor.type) {
            case "character":
                this.object.skill.value = this._actor.system.skills[skillCatId]?.[this.object.skill.id] || 0;
                this.object.skill.defaultValue = this.object.skill.value;
                break;

            case "npc":
                // Skill value is in categories for npc
                this.object.skill.value = this._actor.system.skills[skillCatId] || 0;
                this.object.skill.defaultValue = this.object.skill.value;
                break;
        }
    }

    /**
     * Set Difficulty level (default 2)
     * @param difficulty
     */
    set difficulty(difficulty) {
        if (this._difficultyHiddenIsLock.option) {
            return;
        }
        let parsed = Number(difficulty);
        if (!Number.isFinite(parsed) || parsed < 0) {
            parsed = this.object.isInitiativeRoll ? 1 : 2;
        }
        this._baseDifficulty = Math.max(Math.min(parsed, 9), 0);
        this._recalculateDifficulty();
    }

    /**
     * Set if Difficulty is Hidden or not (default)
     * @param isHidden
     */
    set difficultyHidden(isHidden) {
        // If GM hide, then player choice don't matter
        this._difficultyHiddenIsLock.gm = game.settings.get(CONFIG.l5r5e.namespace, "initiative-difficulty-hidden");
        if (this._difficultyHiddenIsLock.gm || this._difficultyHiddenIsLock.option) {
            isHidden = true;
        }
        this.object.difficulty.hidden = !!isHidden;
        this.object.difficulty.addVoidPoint = this.object.difficulty.hidden;
        this._updateVoidPointUsage();
    }

    /**
     * Add the Entity name into the window title
     * @type {String}
     */
    get title() {
        return game.i18n.localize("l5r5e.dice.dicepicker.title") + (this._actor ? " - " + this._actor.name : "");
    }

    /**
     * Return true if an actor is loaded and is a NPC
     * @return {boolean}
     */
    get useCategory() {
        return !!this._actor && this._actor.type === "npc";
    }

    /**
     * Construct and return the data object used to render the HTML template for this form application.
     * @param options
     * @return {Object}
     */
    async getData(options = null) {
        return {
            ...(await super.getData(options)),
            ringsList: game.l5r5e.HelpersL5r5e.getRingsList(this._actor),
            data: this.object,
            actor: this._actor,
            useCategory: this.useCategory,
            canUseVoidPoint:
                this.object.difficulty.addVoidPoint ||
                !this._actor ||
                (this._actor.isCharacterType && this._actor.system.void_points.value > 0),
            disableSubmit: this.object.skill.value < 1 && this.object.ring.value < 1,
            difficultyHiddenIsLock: this._difficultyHiddenIsLock.gm || this._difficultyHiddenIsLock.option,
        };
    }

    /**
     * Render the dialog
     * @param force
     * @param options
     * @returns {Application}
     */
    render(force, options) {
        options = {
            ...options,
        };

        if (force === undefined) {
            force = true;
        }

        return super.render(force, options);
    }

    /**
     * Listen to html elements
     * @param {jQuery} html HTML content of the sheet.
     * @override
     */
    activateListeners(html) {
        super.activateListeners(html);

        // Skill Selection from list
        html.find("select[name=skill]").on("change", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.useCategory) {
                this.skillCatId = event.target.value;
            } else {
                this.skillId = event.target.value;
            }
            this.render(false);
        });

        // Select Ring
        html.find('input[name="approach"]').on("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.ringId = event.target.dataset.ringid;
            this.object.ring.value = parseInt(event.target.value) + (this.object.useVoidPoint ? 1 : 0);
            this.render(false);
        });

        // Quantity change for difficulty, ring and skill
        html.find(".quantity").on("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const data = $(event.currentTarget);
            this._quantityChange(data.data("item"), data.data("value"));
            this.render(false);
        });

        // Skill assistance
        html.find(".assistance").on("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const assistanceAdd = $(event.currentTarget).data("value");
            if (this.object.skill.assistance > 0 || assistanceAdd > 0) {
                this._quantityChange("skill", assistanceAdd);
            }
            this.object.skill.assistance = Math.max(
                Math.min(parseInt(this.object.skill.assistance) + assistanceAdd, 9),
                0
            );
            this.render(false);
        });

        // Click on the Default Skill Dice
        html.find("#skill_default_value").on("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.object.skill.value = this.object.skill.defaultValue;
            this.object.skill.assistance = 0;
            this.render(false);
        });

        // Spend a Void point checkbox
        html.find("#use_void_point").on("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.object.useVoidPoint = event.target.checked;
            this._quantityChange("ring", this.object.useVoidPoint ? 1 : -1);
            this.render(false);
        });

        // Difficulty Hidden
        html.find("#diff_hidden").on("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.object.difficulty.hidden = !this.object.difficulty.hidden;
            this.object.difficulty.addVoidPoint = this.object.difficulty.hidden;
            this._updateVoidPointUsage();
            this.render(false);
        });

        // Difficulty Add a void point
        html.find("#diff_add_void_point").on("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.object.difficulty.addVoidPoint = !this.object.difficulty.addVoidPoint;
            this._updateVoidPointUsage();
            this.render(false);
        });

        html.find(".action-type-option").on("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const action = event.currentTarget.dataset.action;
            if (!action || !Object.prototype.hasOwnProperty.call(this.object.actions, action)) {
                return;
            }
            this.object.actions[action] = !this.object.actions[action];
            this._recalculateDifficulty();
            this.render(false);
        });
    }

    /**
     * This method is called upon form submission after form data is validated
     * @param event    The initial triggering submission event
     * @param formData The object of validated form data with which to update the object
     * @returns        A Promise which resolves once the update operation has completed
     * @override
     */
    async _updateObject(event, formData) {
        if (this.object.skill.value < 1 && this.object.ring.value < 1) {
            return false;
        }

        // If initiative roll, check if player already have
        if (this.object.isInitiativeRoll) {
            if (!game.combat) {
                ui.notifications.warn("COMBAT.NoneActive", {localize: true});
                return this.close();
            }

            if (!this._actor.canDoInitiativeRoll) {
                ui.notifications.error(
                    game.i18n.localize("l5r5e.conflict.initiative.already_set") + ` [${this._actor.name}]`
                );
                return this.close();
            }
        }

        // Update Actor
        if (this._actor) {
            const actorData = foundry.utils.duplicate(this._actor.system);

            // Synchronize the actor stance with the test being rolled
            if (typeof this.object?.ring?.id === "string" && this.object.ring.id.length > 0) {
                actorData.stance = this.object.ring.id;
            }

            // If hidden add 1 void pt
            if (this.object.difficulty.addVoidPoint) {
                actorData.void_points.value = Math.min(actorData.void_points.value + 1, actorData.void_points.max);
            }

            // If Void point is used, minus the actor
            if (this.object.useVoidPoint) {
                actorData.void_points.value = Math.max(actorData.void_points.value - 1, 0);
            }

            // Update actor if needed
            const updateDiff = foundry.utils.diffObject(this._actor.system, actorData);
            if (Object.keys(updateDiff).length > 0) {
                await this._actor.update({
                    system: updateDiff,
                });
            }
        }

        // Build the formula
        let formula = [];
        if (this.object.ring.value > 0) {
            formula.push(`${this.object.ring.value}dr`);
        }
        if (this.object.skill.value > 0) {
            formula.push(`${this.object.skill.value}ds`);
        }

        let message;
        if (this.object.isInitiativeRoll) {
            // Initiative roll
            let msgOptions = {
                item: this._item,
                skillId: this.object.skill.id,
                rnkMessage: null,
                difficulty: this.object.difficulty.value,
                useVoidPoint: this.object.useVoidPoint,
                skillAssistance: this.object.skill.assistance,
                difficultyHidden: this.object.difficulty.hidden,
                actions: foundry.utils.deepClone(this.object.actions),
                rollEffects: foundry.utils.deepClone(this.object.rollEffects),
                effectParameterDefs: foundry.utils.deepClone(this.object.effectParameterDefs ?? {}),
                effectParameterValues: foundry.utils.deepClone(this.object.effectParameterValues ?? {}),
                effectParameterModifiers: foundry.utils.deepClone(this.object.effectParameterModifiers ?? {}),
            };

            await this._actor.rollInitiative({
                rerollInitiative: true,
                initiativeOptions: {
                    formula: formula.join("+"),
                    // updateTurn: true,
                    messageOptions: msgOptions,
                },
            });
            // Adhesive tape to get the messageId :/
            message = msgOptions.rnkMessage;
            delete msgOptions.rnkMessage;
        } else {
            // Regular roll, so let's roll !
            const roll = await new game.l5r5e.RollL5r5e(formula.join("+"));

            roll.actor = this._actor;
            roll.l5r5e.item = this._item;
            roll.l5r5e.target = this._target;
            roll.l5r5e.stance = this.object.ring.id;
            roll.l5r5e.skillId = this.object.skill.id;
            roll.l5r5e.skillCatId = this.object.skill.cat;
            roll.l5r5e.difficulty = this.object.difficulty.value;
            roll.l5r5e.voidPointUsed = this.object.useVoidPoint;
            roll.l5r5e.skillAssistance = this.object.skill.assistance;
            roll.l5r5e.difficultyHidden = this.object.difficulty.hidden;
            roll.l5r5e.actions = foundry.utils.deepClone(this.object.actions);
            roll.l5r5e.rollEffects = foundry.utils.deepClone(this.object.rollEffects);
            roll.l5r5e.effectResults = [];
            roll.l5r5e.effectStates = {};
            roll.l5r5e.effectParameterDefs = foundry.utils.deepClone(this.object.effectParameterDefs ?? {});
            roll.l5r5e.effectParameterValues = foundry.utils.deepClone(this.object.effectParameterValues ?? {});
            roll.l5r5e.effectParameterModifiers = foundry.utils.deepClone(this.object.effectParameterModifiers ?? {});

            await roll.roll();
            message = await roll.toMessage();
        }

        if (message) {
            // if DsN active, delay the popup for 2s
            new Promise((r) => setTimeout(r, !game.dice3d ? 0 : 2000)).then(() => {
                new game.l5r5e.RollnKeepDialog(message.id).render(true);
            });
        }

        return this.close();
    }

    /**
     * Change quantity between 0-9 on the element, and return the new value
     * @private
     */
    _quantityChange(element, add) {
        if (element === "difficulty") {
            const base = Number.isFinite(this._baseDifficulty)
                ? this._baseDifficulty
                : this.object.isInitiativeRoll
                    ? 1
                    : 2;
            this._baseDifficulty = Math.max(Math.min(base + add, 9), 0);
            this._recalculateDifficulty();
            return;
        }
        this.object[element].value = Math.max(Math.min(parseInt(this.object[element].value) + add, 9), 0);
    }

    /**
     * Compute and apply automatic modifiers to the difficulty value.
     * @private
     */
    _recalculateDifficulty() {
        const baseDifficulty = Number.isFinite(this._baseDifficulty)
            ? this._baseDifficulty
            : this.object.isInitiativeRoll
                ? 1
                : 2;
        const sanitizedBase = Math.max(Math.min(baseDifficulty, 9), 0);
        this._baseDifficulty = sanitizedBase;

        const baseModifiers = DicePickerDialog.normalizeBaseTNModifiers(this.object.difficulty.baseModifiers);
        this.object.difficulty.baseModifiers = baseModifiers;

        const ringModifier = this._getRingBaseTNModifier(this.object?.ring?.id);
        const base = Math.max(Math.min(sanitizedBase + ringModifier, 9), 0);
        this.object.difficulty.base = base;

        const modifier = this._computeDifficultyModifier();
        this.object.difficulty.modifier = modifier;

        const value = Math.max(Math.min(base + modifier, 9), 0);
        this.object.difficulty.value = value;
    }

    /**
     * Determine the current automatic difficulty modifier based on conditions and actions.
     * @returns {number}
     * @private
     */
    _computeDifficultyModifier() {
        let modifier = 0;
        const actor = this._actor;
        const ringId = this.object?.ring?.id;

        if (actor) {
            const statuses = actor.statuses ?? new Set();

            if (ringId) {
                if (statuses.has(`lightly_wounded_${ringId}`)) {
                    modifier += 1;
                }
                if (statuses.has(`severely_wounded_${ringId}`)) {
                    modifier += 3;
                }
            }

            if (this._isAnyActionSelected(["attack", "scheme"])) {
                if (statuses.has("dazed")) {
                    modifier += 2;
                }
            }

            if (this._isAnyActionSelected(["move", "support"])) {
                if (statuses.has("disoriented")) {
                    modifier += 2;
                }
            }

            if (this._isAnyActionSelected(["scheme"])) {
                if (statuses.has("silenced")) {
                    modifier += 3;
                }
            }
        }

        const targetActor = this._target?.actor;
        if (targetActor?.system?.stance === "air" && this._isAnyActionSelected(["attack", "scheme"])) {
            modifier += 1;
            const targetRank = Number(targetActor?.system?.identity?.school_rank ??
                                targetActor?.system?.conflict_rank?.martial ??
                targetActor?.martialRank ??
                0);
            if (Number.isFinite(targetRank) && targetRank > 3) {
                modifier += 1;
            }
        }

        const itemQualities = this._item?.system?.qualities;
        if (itemQualities?.damaged) {
            modifier += 1;
        }

        return modifier;
    }

    /**
     * Get the modifier for the provided ring id from the base modifier map.
     * @param {string|null|undefined} ringId
     * @returns {number}
     * @private
     */
    _getRingBaseTNModifier(ringId) {
        if (!ringId || !RING_IDS.includes(ringId)) {
            return 0;
        }
        const modifiers = this.object?.difficulty?.baseModifiers ?? {};
        const value = Number(modifiers[ringId]);
        return Number.isFinite(value) ? value : 0;
    }

    /**
     * Check whether any of the provided action types are currently selected.
     * @param {string[]} actions
     * @returns {boolean}
     * @private
     */
    _isAnyActionSelected(actions) {
        if (!Array.isArray(actions) || actions.length === 0) {
            return false;
        }
        return actions.some((action) => !!this.object.actions?.[action]);
    }

    /**
     * Remove the use of void point if actor don't have any and use of vp is un checked
     * @private
     */
    _updateVoidPointUsage() {
        if (
            this.object.useVoidPoint &&
            !this.object.difficulty.addVoidPoint &&
            !!this._actor &&
            this._actor.system.void_points.value < 1
        ) {
            this.object.useVoidPoint = false;
            this._quantityChange("ring", -1);
        }
    }

    /**
     * Create a macro on the first empty space in player's bar
     * @private
     */
    async _createMacro() {
        const params = {};
        let name = "DicePicker";

        if (this._actor?.id) {
            params.actorId = this._actor.id;
            name = this._actor.name;
        }

        if (this.object.skill.id) {
            params.skillId = this.object.skill.id;
        } else if (this.object.skill.cat) {
            params.skillCatId = this.object.skill.cat;
        }
        if (this.object.skill.name) {
            name = name + " - " + this.object.skill.name;
        }

        const selectedActions = getRollActionTypes().filter((action) => this.object.actions?.[action]);
        if (selectedActions.length > 0) {
            params.actions = selectedActions;
        }

        params.baseTNModifiers = DicePickerDialog.serializeBaseTNModifiers(this.baseTNModifiers);

        const command = `new game.l5r5e.DicePickerDialog(${JSON.stringify(params)}).render(true);`;

        let macro = game.macros.contents.find((m) => m.name === name && m.command === command && m.isAuthor);
        if (!macro) {
            macro = await Macro.create({
                name,
                type: "script",
                scope: "actor",
                command,
                img: this._actor?.img || "systems/l5r5e/assets/dices/default/ring_et.svg",
            });
        }

        // Search if already in player hotbar
        if (Object.values(game.user.hotbar).includes(macro.id)) {
            return;
        }

        return game.user.assignHotbarMacro(macro, "auto"); // 1st available
    }

    /**
     * Return the token actor who have the min/max value for this property
     * @param  {string}       property Property name (vigilance, strife.value)
     * @param  {boolean|null} isMin    Null: single target, Min/Max: get the actor who have the max value
     * @return {TokenDocument|null}
     * @private
     */
    static _getTargetTokenFromSelection(property, isMin = null) {
        if (game.user.targets.size < 1) {
            return null;
        }

        let targetToken;
        if (isMin === null) {
            // only one target, get the first element
            targetToken = Array.from(game.user.targets).values().next()?.value?.document;
        } else {
            // Group (Min/Max)
            const targetGrp = Array.from(game.user.targets).reduce(
                (acc, tgt) => {
                    const targetActor = tgt.document.actor;
                    if (!targetActor.isCharacterType) {
                        return acc;
                    }

                    const targetData = targetActor.system;
                    const value = targetActor[property] || targetData[property] || null;
                    if (!value) {
                        return acc;
                    }

                    if ((isMin && value < acc.value) || (!isMin && value > acc.value)) {
                        acc.actor = tgt.document;
                        acc.value = value;
                    }
                    return acc;
                },
                { actor: null, value: 0 }
            );
            targetToken = targetGrp.actor;
        }
        return targetToken;
    }

    /**
     * Parse the difficulty from technique
     *
     * Examples :
     * "@S:vigilance"
     * "@T:vigilance"
     * "@T:vigilance|min"
     * "@T:vigilance|max"
     * "@T:vigilance|max(statusRank)"
     * "@T:intrigueRank"
     * "@T:martialRank"
     * "@T:statusRank|max"
     * "@T:strife.value|max"
     *
     * @param {string|number} difficulty
     * @return {boolean}
     */
    parseDifficulty(difficulty) {
        // Macro style
        if (!Number.isNumeric(difficulty) && difficulty.startsWith("@")) {
            // 0: "@T:vigilance|max(statusRank)"
            // 1: "T" // Meaning : S(elf), T(arget)
            // 2: "vigilance"
            // 3: "max"
            // 4: "statusRank"
            const infos = difficulty.match(CONFIG.l5r5e.regex.techniqueDifficulty);
            if (!infos) {
                console.log("L5R5E | DP | Fail to parse difficulty", difficulty);
                return false;
            }

            // Define which actor is needed for the difficulty
            let targetActor = null;
            let targetToken = null;
            if (infos[1] === "S") {
                targetActor = this._actor;
            } else if (game.user.targets.size > 0) {
                // Between the targets
                targetToken = DicePickerDialog._getTargetTokenFromSelection(
                    infos[4] || infos[2],
                    !infos[3] ? null : infos[3] === "min"
                );
                if (targetToken) {
                    targetActor = targetToken.actor;
                }
            }
            // Wrong syntax or no target set, do manual TN
            if (!targetActor) {
                console.log("L5R5E | DP | Fail to get actor from target selection, or no target selected");
                return false;
            }

            // Check in actor.<prop> or actor.system.<prop>
            difficulty = targetActor[infos[2]] || targetActor.system[infos[2]] || null;
            if (difficulty < 1) {
                console.log("L5R5E | DP | Fail to parse difficulty from target");
                return false;
            }

            // Before difficultyHiddenIsLock
            this.difficulty = difficulty;

            // Hide npc stats on target
            if (infos[1] === "T") {
                this.difficultyHidden = true;
                this._difficultyHiddenIsLock.option = true;
                this.target = targetToken;
            }
            return true;
        }

        // finally
        difficulty = parseInt(difficulty);
        if (isNaN(difficulty) || difficulty < 0) {
            return false;
        }
        this.difficulty = difficulty;
        return true;
    }

    /**
     * Parse Skills from technique
     *
     * Character : expand category (social) to it's skillname (command,courtesy...)
     * NPC : shrink to category names
     *
     * @param {string} skillList
     * @return {string[]}
     */
    parseSkillsList(skillList) {
        const categories = game.l5r5e.HelpersL5r5e.getCategoriesSkillsList();

        // Sanitize and uniques values
        const unqSkillList = new Set();
        skillList.split(",").forEach((s) => {
            s = s.trim();

            if (CONFIG.l5r5e.skills.has(s)) {
                unqSkillList.add(this.useCategory ? CONFIG.l5r5e.skills.get(s) : s);
            } else if (categories.has(s)) {
                if (this.useCategory) {
                    unqSkillList.add(s);
                } else {
                    categories.get(s).forEach((e) => unqSkillList.add(e));
                }
            }
        });

        // Sort by the translated label
        const array = [...unqSkillList].map((id) => {
            return {
                id: id,
                label: this.useCategory
                    ? game.i18n.localize(`l5r5e.skills.${id}.title`)
                    : game.i18n.localize(`l5r5e.skills.${CONFIG.l5r5e.skills.get(id)}.${id}`),
            };
        });
        array.sort((a, b) => a.label.localeCompare(b.label));

        return array;
    }
}
