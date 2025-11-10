/**
 * L5R Dice Roll n Keep dialog
 * @extends {FormApplication}
 */
export class RollnKeepDialog extends FormApplication {
    /**
     * Player choice list
     */
    static CHOICES = {
        discard: "discard",
        keep: "keep",
        nothing: null,
        reroll: "reroll",
        // reserve: "reserve",
        swap: "swap",
    };

    /**
     * The current ChatMessage where we come from
     * @param {ChatMessage} message
     */
    _message = null;

    /**
     * The current Roll
     * @param {RollL5r5e} roll
     */
    roll = null;

    /**
     * Payload Object
     */
    object = {
        currentStep: 0,
        strifeApplied: 0,
        submitDisabled: false,
        swapDiceFaces: {
            rings: [],
            skills: [],
        },
        dicesList: [[]],
        rollEffects: [],
        effectResults: [],
        effectEntries: [],
        effectParameterDefs: {},
        effectParameterValues: {},
        effectParameterModifiers: {},
        effectsPreparedForStep: null,
    };

    /**
     * Supported effect entry statuses.
     * @enum {string}
     */
    static EFFECT_ENTRY_STATUS = {
        active: "active",
        inactive: "inactive",
        rejected: "rejected",
        triggered: "triggered",
        completed: "completed",
    };

    /**
     * Assign the default options
     * @override
     */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "l5r5e-roll-n-keep-dialog",
            classes: ["l5r5e", "roll-n-keep-dialog"],
            template: CONFIG.l5r5e.paths.templates + "dice/roll-n-keep-dialog.html",
            title: game.i18n.localize("l5r5e.dice.roll_n_keep.title"),
            closeOnSubmit: false,
        });
    }

    /**
     * Define a unique and dynamic element ID for the rendered application
     */
    get id() {
        return `l5r5e-roll-n-keep-dialog-${this._message.id}`;
    }

    /**
     * ChatMessage
     * @param {ChatMessage} msg
     */
    set message(msg) {
        this._message = msg instanceof ChatMessage ? msg : null;
    }

    /**
     * ChatMessage
     * @returns {ChatMessage}
     */
    get message() {
        return this._message;
    }

    /**
     * Current (first) Roll in ChatMessage
     * @returns {RollL5r5e}
     */
    get messageRoll() {
        return this._message?.rolls?.[0] || null;
    }

    /**
     * Return true if this actor has right on this roll
     * @return {boolean}
     */
    get isOwner() {
        return this._message?.isAuthor || this.messageRoll?.l5r5e.actor?.isOwner || this._message?.isOwner || false;
    }

    /**
     * Create the Roll n Keep dialog
     * @param {number} messageId
     * @param {FormApplicationOptions} options
     */
    constructor(messageId, options = {}) {
        super({}, options);
        this.message = game.messages.get(messageId);
        this.options.editable = this.isOwner;

        this._syncEffectsFromRoll();
        this._initializeDiceFaces();
        this._initializeHistory();
    }

    /**
     * Refresh data (used from socket)
     */
    async refresh() {
        if (!this._message) {
            return;
        }
        this._syncEffectsFromRoll();
        this._initializeHistory();
        this.render(false);
    }

    /**
     * Render
     * @param {boolean} force
     * @param  {{left?: number, top?: number, width?: number, height?: number, scale?: number, focus?: boolean, renderContext?: string, renderData?: Object}} options
     * @returns {Application}
     * @override
     */
    render(force = false, options = {}) {
        if (!this._message) {
            return;
        }
        this.position.width = "auto";
        this.position.height = "auto";
        return super.render(force, options);
    }

    /**
     * Synchronize local effect tracking data with the provided roll or the currently tracked roll.
     * @param {RollL5r5e|null} roll
     * @private
     */
    _syncEffectsFromRoll(roll = null) {
        const sourceRoll = roll ?? this.roll ?? this.messageRoll;
        if (!sourceRoll) {
            this.object.rollEffects = [];
            this.object.effectResults = [];
            return;
        }

        this.object.rollEffects = foundry.utils.deepClone(sourceRoll.l5r5e?.rollEffects ?? []);
        this.object.effectResults = foundry.utils.deepClone(sourceRoll.l5r5e?.effectResults ?? []);
        this.object.effectParameterDefs = foundry.utils.deepClone(
            sourceRoll.l5r5e?.effectParameterDefs && typeof sourceRoll.l5r5e.effectParameterDefs === "object"
                ? sourceRoll.l5r5e.effectParameterDefs
                : {}
        );
        this.object.effectParameterValues = foundry.utils.deepClone(
            sourceRoll.l5r5e?.effectParameterValues && typeof sourceRoll.l5r5e.effectParameterValues === "object"
                ? sourceRoll.l5r5e.effectParameterValues
                : {}
        );
        this.object.effectParameterModifiers = foundry.utils.deepClone(
            sourceRoll.l5r5e?.effectParameterModifiers && typeof sourceRoll.l5r5e.effectParameterModifiers === "object"
                ? sourceRoll.l5r5e.effectParameterModifiers
                : {}
        );
        this.object.effectEntries = [];
        this.object.effectsPreparedForStep = null;
    }

    /**
     * Initialize the dice history list
     * @private
     */
    _initializeHistory() {
        if (!this._message) {
            return;
        }

        // Get the roll
        this.roll = this.messageRoll;
        this._syncEffectsFromRoll(this.roll);

        // Already history
        if (Array.isArray(this.roll.l5r5e.history)) {
            this.object.dicesList = this.roll.l5r5e.history;

            let currentStep = this.roll.l5r5e.history.length - 1;
            if (!this._haveChoice(currentStep, RollnKeepDialog.CHOICES.nothing)) {
                currentStep += 1;
            }
            this.object.currentStep = currentStep;
            this._updateSummaryFromChoices();
            return;
        }

        // New
        this.object.dicesList = [[]];
        this.roll.terms.forEach((term) => {
            if (!(term instanceof game.l5r5e.L5rBaseDie)) {
                return;
            }
            term.results.forEach((res) => {
                this.object.dicesList[0].push({
                    type: term.constructor.name,
                    face: res.result,
                    choice: this._getDefaultChoiceForDie(term.constructor.name, res.result),
                });
            });
        });

        this._updateSummaryFromChoices();
    }

    /**
     * Fill the dices faces
     * @private
     */
    _initializeDiceFaces() {
        // All faces are unique for rings
        this.object.swapDiceFaces.rings = Object.keys(game.l5r5e.RingDie.FACES);

        // Only unique for Skills
        this.object.swapDiceFaces.skills = [1, 3, 6, 8, 10, 11, 12];
    }

    /**
     * Create a unique key for an effect entry based on the effect index and entry order.
     * @param {number} effectIndex
     * @param {number} order
     * @returns {string}
     * @private
     */
    _getEffectEntryKey(effectIndex, order) {
        const normalizedIndex = Number.isFinite(effectIndex) ? Number(effectIndex) : 0;
        const normalizedOrder = Number.isFinite(order) ? Number(order) : 0;
        return `${normalizedIndex}:${normalizedOrder}`;
    }

    /**
     * Resolve a macro identifier (id, name or UUID) to a Macro document.
     * @param {string|null} identifier
     * @returns {Promise<Macro|null>}
     * @private
     */
    async _resolveMacro(identifier) {
        if (!identifier || typeof identifier !== "string") {
            return null;
        }

        const trimmed = identifier.trim();
        if (!trimmed) {
            return null;
        }

        const byId = game.macros?.get?.(trimmed) ?? null;
        if (byId) {
            return byId;
        }

        if (trimmed.startsWith("Compendium") || trimmed.includes(".")) {
            try {
                const document = await fromUuid(trimmed);
                if (document instanceof Macro) {
                    return document;
                }
            } catch (error) {
                console.error(`Failed to resolve macro from UUID ${trimmed}`, error);
            }
        }

        const byName = game.macros?.find?.((macro) => macro?.name === trimmed) ?? null;
        if (byName) {
            return byName;
        }

        return null;
    }

    /**
     * Normalize a single effect entry definition returned by a macro.
     * @param {number} effectIndex
     * @param {unknown} entryData
     * @param {number} entryIdx
     * @param {object} effect
     * @returns {Promise<object|null>}
     * @private
     */
    async _normalizeEffectEntry(effectIndex, entryData, entryIdx, effect) {
        if (entryData === undefined || entryData === null) {
            return null;
        }

        const normalizedIndex = Number.isFinite(effectIndex) ? Number(effectIndex) : 0;
        const fallbackPrefix = `effect${normalizedIndex + 1}`;

        const baseEntry = {
            effectIndex: normalizedIndex,
            order: Number.isFinite(entryIdx) ? Number(entryIdx) : 0,
            description: "",
            priority: Number.isFinite(effect?.priority) ? Number(effect.priority) : 0,
            status: RollnKeepDialog.EFFECT_ENTRY_STATUS.active,
            finalMacro: null,
            params: {},
            details: null,
            parameters: [],
        };

        const entryDataKey =
            typeof entryData === "object" && entryData !== null && typeof entryData.key === "string" && entryData.key.length > 0
                ? entryData.key
                : null;

        if (typeof entryData === "string") {
            baseEntry.description = entryData;
        } else if (Array.isArray(entryData)) {
            baseEntry.description = entryData.join(" ");
        } else if (typeof entryData === "object") {
            const orderCandidate = Number(entryData.order ?? entryData.index ?? entryData.position);
            if (Number.isFinite(orderCandidate)) {
                baseEntry.order = Number(orderCandidate);
            }

            const priorityCandidate = Number(entryData.priority ?? entryData.weight);
            if (Number.isFinite(priorityCandidate)) {
                baseEntry.priority = Number(priorityCandidate);
            }

            const statusCandidate = entryData.status ?? entryData.state;
            if (typeof statusCandidate === "string" && RollnKeepDialog.EFFECT_ENTRY_STATUS[statusCandidate]) {
                baseEntry.status = statusCandidate;
            }

            const paramsData = entryData.params ?? entryData.parameters ?? entryData.data ?? null;
            if (paramsData && typeof paramsData === "object" && !Array.isArray(paramsData)) {
                baseEntry.params = foundry.utils.deepClone(paramsData);
            }

            const descriptionCandidate =
                entryData.description ?? entryData.label ?? entryData.text ?? entryData.title ?? entryData.name ?? null;
            if (typeof descriptionCandidate === "string") {
                baseEntry.description = descriptionCandidate;
            }

            const detailsCandidate = entryData.details ?? entryData.note ?? entryData.tooltip ?? null;
            if (detailsCandidate !== null && detailsCandidate !== undefined) {
                baseEntry.details = detailsCandidate;
            }

            const macroCandidate =
                entryData.finalMacro ??
                entryData.executeMacro ??
                entryData.execute ??
                entryData.resultMacro ??
                entryData.out_macro ??
                entryData.outMacro ??
                null;
            if (typeof macroCandidate === "string" && macroCandidate.trim().length > 0) {
                baseEntry.finalMacro = macroCandidate.trim();
            } else if (typeof entryData.macro === "string" && entryData.macro.trim().length > 0) {
                baseEntry.finalMacro = entryData.macro.trim();
            }

            const rawParameters = Array.isArray(entryData.parameters)
                ? entryData.parameters
                : Array.isArray(entryData.parameterDefs)
                    ? entryData.parameterDefs
                    : Array.isArray(entryData.inputs)
                        ? entryData.inputs
                        : Array.isArray(effect?.parameterDefs)
                            ? effect.parameterDefs
                            : [];

            let normalizedParameters = this._normalizeEffectParameters(rawParameters, {
                fallbackNamePrefix: fallbackPrefix,
            });

            const baseValueCandidate = Number(entryData.baseValue ?? entryData.base ?? entryData.value ?? entryData.amount);
            const modifierCandidate = Number(entryData.modifier ?? entryData.adjustment ?? entryData.delta);
            const hasLegacyNumeric =
                Number.isFinite(baseValueCandidate) ||
                Number.isFinite(modifierCandidate) ||
                entryData.hasValue !== undefined;

            if (normalizedParameters.length === 0 && hasLegacyNumeric) {
                const baseParam = this._normalizeEffectParameter(
                    {
                        name: "base",
                        label: game.i18n.localize("l5r5e.dice.roll_n_keep.effects.baseLabel"),
                        type: "number",
                        defaultValue: Number.isFinite(baseValueCandidate) ? Number(baseValueCandidate) : 0,
                        userValue: Number.isFinite(baseValueCandidate) ? Number(baseValueCandidate) : 0,
                        includeInTotal: true,
                        editable: false,
                    },
                    normalizedParameters.length,
                    { fallbackNamePrefix: fallbackPrefix }
                );
                if (baseParam) {
                    normalizedParameters.push(baseParam);
                }

                if (Number.isFinite(modifierCandidate) || entryData.hasValue === true) {
                    const modifierParam = this._normalizeEffectParameter(
                        {
                            name: "modifier",
                            label: game.i18n.localize("l5r5e.dice.roll_n_keep.effects.modifierLabel"),
                            type: "number",
                            defaultValue: Number.isFinite(modifierCandidate) ? Number(modifierCandidate) : 0,
                            userValue: Number.isFinite(modifierCandidate) ? Number(modifierCandidate) : 0,
                            includeInTotal: true,
                            editable: true,
                        },
                        normalizedParameters.length,
                        { fallbackNamePrefix: fallbackPrefix }
                    );
                    if (modifierParam) {
                        normalizedParameters.push(modifierParam);
                    }
                }
            }

            const entryValueOverrides =
                entryData.parameterValues ?? entryData.values ?? entryData.userValues ?? entryData.inputs ?? null;
            const entryModifierOverrides =
                entryData.parameterModifiers ?? entryData.modifiers ?? entryData.adjustments ?? null;

            const historyOrder = Number.isFinite(baseEntry.order)
                ? Number(baseEntry.order)
                : Number.isFinite(entryIdx)
                    ? Number(entryIdx)
                    : 0;
            const entryKey = this._getEffectEntryKey(normalizedIndex, historyOrder);

            const effectValueOverrides =
                this.object.effectParameterValues && typeof this.object.effectParameterValues === "object"
                    ? this.object.effectParameterValues[normalizedIndex]
                    : null;
            const effectModifierOverrides =
                this.object.effectParameterModifiers && typeof this.object.effectParameterModifiers === "object"
                    ? this.object.effectParameterModifiers[normalizedIndex]
                    : null;

            const storedEntryValues = this._collectParameterOverrides(this.object.effectParameterValues, [
                entryDataKey,
                entryKey,
            ]);
            const storedEntryModifiers = this._collectParameterOverrides(this.object.effectParameterModifiers, [
                entryDataKey,
                entryKey,
            ]);

            let combinedValues = this._mergeParameterMaps(effectValueOverrides, storedEntryValues);
            combinedValues = this._mergeParameterMaps(combinedValues, entryValueOverrides);
            let combinedModifiers = this._mergeParameterMaps(effectModifierOverrides, storedEntryModifiers);
            combinedModifiers = this._mergeParameterMaps(combinedModifiers, entryModifierOverrides);

            const historyKeys = [];
            if (entryDataKey) {
                historyKeys.push(entryDataKey);
            }
            if (entryKey && !historyKeys.includes(entryKey)) {
                historyKeys.push(entryKey);
            }

            const historyContext = {
                effectIndex: normalizedIndex,
                entryOrder: historyOrder,
                entryKey,
                historyKeys,
            };

            this._applyParameterValueOverrides(normalizedParameters, combinedValues, combinedModifiers, historyContext);

            baseEntry.parameters = normalizedParameters;
        } else {
            const normalizedParameters = this._normalizeEffectParameters(
                Array.isArray(effect?.parameterDefs) ? effect.parameterDefs : [],
                { fallbackNamePrefix: fallbackPrefix }
            );
            const historyOrder = Number.isFinite(baseEntry.order)
                ? Number(baseEntry.order)
                : Number.isFinite(entryIdx)
                    ? Number(entryIdx)
                    : 0;
            const entryKey = this._getEffectEntryKey(normalizedIndex, historyOrder);

            const effectValueOverrides =
                this.object.effectParameterValues && typeof this.object.effectParameterValues === "object"
                    ? this.object.effectParameterValues[normalizedIndex]
                    : null;
            const effectModifierOverrides =
                this.object.effectParameterModifiers && typeof this.object.effectParameterModifiers === "object"
                    ? this.object.effectParameterModifiers[normalizedIndex]
                    : null;

            const storedEntryValues = this._collectParameterOverrides(this.object.effectParameterValues, [
                entryDataKey,
                entryKey,
            ]);
            const storedEntryModifiers = this._collectParameterOverrides(this.object.effectParameterModifiers, [
                entryDataKey,
                entryKey,
            ]);

            const combinedValues = this._mergeParameterMaps(effectValueOverrides, storedEntryValues);
            const combinedModifiers = this._mergeParameterMaps(effectModifierOverrides, storedEntryModifiers);

            const historyKeys = [];
            if (entryDataKey) {
                historyKeys.push(entryDataKey);
            }
            if (entryKey && !historyKeys.includes(entryKey)) {
                historyKeys.push(entryKey);
            }

            const historyContext = {
                effectIndex: normalizedIndex,
                entryOrder: historyOrder,
                entryKey,
                historyKeys,
            };

            this._applyParameterValueOverrides(normalizedParameters, combinedValues, combinedModifiers, historyContext);
            baseEntry.parameters = normalizedParameters;
        }

        baseEntry.order = Number.isFinite(baseEntry.order) ? Number(baseEntry.order) : entryIdx;
        baseEntry.key = this._getEffectEntryKey(baseEntry.effectIndex, baseEntry.order);

        if (
            !baseEntry.description &&
            typeof baseEntry.finalMacro === "string" &&
            baseEntry.finalMacro.trim().length > 0
        ) {
            const finalMacroIdentifier = baseEntry.finalMacro.trim();
            baseEntry.finalMacro = finalMacroIdentifier;
            let resolvedMacro = null;
            try {
                resolvedMacro = await this._resolveMacro(finalMacroIdentifier);
            } catch (error) {
                console.error(
                    `RollnKeepDialog | Failed to resolve macro '${finalMacroIdentifier}' while deriving description`,
                    error
                );
            }

            if (resolvedMacro) {
                let derivedLabel = "";
                if (typeof resolvedMacro.name === "string" && resolvedMacro.name.trim().length > 0) {
                    derivedLabel = resolvedMacro.name.trim();
                }

                if (!derivedLabel) {
                    const macroUuid =
                        typeof resolvedMacro.uuid === "string" && resolvedMacro.uuid.trim().length > 0
                            ? resolvedMacro.uuid.trim()
                            : finalMacroIdentifier;
                    const uuidSegments = macroUuid.split(/[./:]/);
                    derivedLabel = uuidSegments[uuidSegments.length - 1] ?? macroUuid;
                }

                derivedLabel = typeof derivedLabel === "string" ? derivedLabel.trim() : "";

                if (derivedLabel) {
                    baseEntry.description = derivedLabel;
                }
            }
        }

        if (!baseEntry.description) {
            baseEntry.description = game.i18n.localize("l5r5e.dice.roll_n_keep.effects.unknownLabel");
        }

        this._recalculateEffectEntryParameterState(baseEntry);

        return baseEntry;
    }

    _normalizeEffectParameters(rawParameters, { fallbackNamePrefix = "param" } = {}) {
        if (!Array.isArray(rawParameters)) {
            return [];
        }

        return rawParameters
            .map((parameter, index) => this._normalizeEffectParameter(parameter, index, { fallbackNamePrefix }))
            .filter((parameter) => parameter !== null)
            .map((parameter, index) => ({
                ...parameter,
                order: Number.isFinite(parameter.order) ? Number(parameter.order) : index,
            }));
    }

    _normalizeEffectParameter(parameterData, index, { fallbackNamePrefix = "param" } = {}) {
        if (parameterData === undefined || parameterData === null) {
            return null;
        }

        const fallbackName = `${fallbackNamePrefix}_${index + 1}`;

        if (typeof parameterData === "string") {
            const trimmed = parameterData.trim();
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
                includeInTotal: false,
                editable: false,
                options: [],
                multiple: false,
                required: false,
                order: index,
            };
        }

        if (typeof parameterData === "number") {
            if (Number.isNaN(parameterData)) {
                return null;
            }
            const numericValue = Number(parameterData);
            return {
                name: fallbackName,
                label: fallbackName,
                type: "number",
                description: "",
                defaultValue: numericValue,
                userValue: numericValue,
                includeInTotal: true,
                editable: false,
                options: [],
                multiple: false,
                required: false,
                order: index,
            };
        }

        const clone = foundry.utils.deepClone(parameterData);
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
        clone.name = nameCandidate && nameCandidate.length > 0 ? nameCandidate : fallbackName;

        const typeCandidate = clone.type ?? clone.input ?? clone.inputType ?? clone.control ?? clone.kind;
        clone.type = typeof typeCandidate === "string" ? typeCandidate.toLowerCase() : undefined;
        if (!clone.type) {
            if (typeof clone.defaultValue === "number" || typeof clone.value === "number") {
                clone.type = "number";
            } else if (typeof clone.defaultValue === "boolean" || typeof clone.value === "boolean") {
                clone.type = "boolean";
            } else {
                clone.type = "string";
            }
        }

        clone.originalType = clone.type;

        if (["bool", "checkbox"].includes(clone.type)) {
            clone.type = "boolean";
        }
        if (["select", "choice", "dropdown"].includes(clone.type)) {
            clone.type = "select";
        }

        const labelCandidate = clone.label ?? clone.title ?? clone.caption ?? clone.description ?? clone.name ?? fallbackName;
        clone.label = typeof labelCandidate === "string" ? labelCandidate : fallbackName;

        const descriptionCandidate = clone.description ?? clone.hint ?? clone.help ?? clone.tooltip ?? "";
        clone.description = typeof descriptionCandidate === "string" ? descriptionCandidate : "";

        clone.multiple = Boolean(clone.multiple ?? clone.allowMultiple ?? clone.multi ?? false);
        clone.required = Boolean(clone.required ?? clone.mandatory ?? false);

        const minCandidate = clone.min ?? clone.minimum ?? clone.minValue;
        const maxCandidate = clone.max ?? clone.maximum ?? clone.maxValue;
        const stepCandidate = clone.step ?? clone.increment ?? clone.stepSize;
        clone.min = Number.isFinite(Number(minCandidate)) ? Number(minCandidate) : null;
        clone.max = Number.isFinite(Number(maxCandidate)) ? Number(maxCandidate) : null;
        clone.step = Number.isFinite(Number(stepCandidate)) ? Number(stepCandidate) : null;

        const normalizedType = typeof clone.type === "string" ? clone.type.toLowerCase() : "string";
        const optionsCandidate = clone.options ?? clone.choices ?? clone.values ?? clone.items ?? null;
        if (Array.isArray(optionsCandidate)) {
            clone.options = optionsCandidate
                .map((option) => {
                    if (option === undefined || option === null) {
                        return null;
                    }
                    if (typeof option === "object") {
                        const optClone = foundry.utils.deepClone(option);
                        const valueCandidate =
                            optClone.value ?? optClone.id ?? optClone.key ?? optClone.slug ?? optClone.name ?? null;
                        if (valueCandidate === null) {
                            return null;
                        }
                        optClone.value = valueCandidate;
                        if (optClone.label === undefined && optClone.name !== undefined) {
                            optClone.label = optClone.name;
                        }
                        if (optClone.label === undefined && optClone.text !== undefined) {
                            optClone.label = optClone.text;
                        }
                        if (optClone.label === undefined) {
                            optClone.label = String(optClone.value);
                        }
                        return optClone;
                    }
                    return {
                        value: option,
                        label: String(option),
                    };
                })
                .filter((option) => option !== null);
        } else {
            clone.options = [];
        }

        const editableCandidate =
            clone.editable ?? clone.userEditable ?? clone.allowUserInput ?? clone.canEdit ?? clone.adjustable ?? clone.edit;
        if (editableCandidate !== undefined) {
            clone.editable = Boolean(editableCandidate);
        } else {
            clone.editable = normalizedType !== "info";
        }

        const includeCandidate = clone.includeInTotal ?? clone.contributes ?? clone.addToTotal ?? clone.sum ?? clone.counts;
        if (includeCandidate !== undefined) {
            clone.includeInTotal = Boolean(includeCandidate);
        } else {
            const numericTypes = ["number", "int", "integer", "float", "decimal"];
            clone.includeInTotal = numericTypes.includes(normalizedType);
        }

        const placeholderCandidate = clone.placeholder ?? clone.hint ?? null;
        if (placeholderCandidate !== null && placeholderCandidate !== undefined) {
            clone.placeholder = placeholderCandidate;
        }

        const defaultCandidate =
            clone.defaultValue ??
            clone.default ??
            clone.initial ??
            clone.initialValue ??
            clone.baseValue ??
            clone.startValue ??
            clone.value ??
            (normalizedType === "boolean" || normalizedType === "bool" ? false : ["number", "int", "integer", "float", "decimal"].includes(normalizedType) ? 0 : "");
        const numericFallback = ["number", "int", "integer", "float", "decimal"].includes(normalizedType) ? 0 : "";
        clone.defaultValue = this._coerceParameterValue(clone, defaultCandidate, numericFallback);

        const initialCandidate = clone.initialValue ?? clone.startValue ?? clone.defaultValue;
        clone.initialValue = this._coerceParameterValue(clone, initialCandidate, clone.defaultValue);

        const userCandidate = clone.userValue ?? clone.current ?? clone.value ?? clone.initialValue ?? clone.defaultValue;
        clone.userValue = this._coerceParameterValue(clone, userCandidate, clone.defaultValue);

        const orderCandidate = Number(clone.order ?? clone.position ?? clone.index);
        clone.order = Number.isFinite(orderCandidate) ? Number(orderCandidate) : index;

        return clone;
    }

    _mergeParameterMaps(baseMap, overrideMap) {
        const base = baseMap && typeof baseMap === "object" && !Array.isArray(baseMap) ? baseMap : {};
        const override = overrideMap && typeof overrideMap === "object" && !Array.isArray(overrideMap) ? overrideMap : {};
        if (Object.keys(base).length === 0) {
            return foundry.utils.deepClone(override);
        }
        if (Object.keys(override).length === 0) {
            return foundry.utils.deepClone(base);
        }
        return foundry.utils.mergeObject(foundry.utils.deepClone(base), override, { inplace: false });
    }

    _collectParameterOverrides(store, keys = []) {
        if (!store || typeof store !== "object" || Array.isArray(store)) {
            return {};
        }

        const sanitizedKeys = [];
        keys.forEach((key) => {
            if (key === undefined || key === null) {
                return;
            }
            if (!sanitizedKeys.includes(key)) {
                sanitizedKeys.push(key);
            }
        });

        return sanitizedKeys.reduce((accumulator, key) => {
            const candidateKeys = [];
            candidateKeys.push(key);
            if (typeof key === "number") {
                candidateKeys.push(String(key));
            } else if (typeof key === "string") {
                const numericKey = Number(key);
                if (Number.isFinite(numericKey)) {
                    candidateKeys.push(numericKey);
                }
            }

            candidateKeys.forEach((candidateKey) => {
                if (candidateKey === undefined || candidateKey === null) {
                    return;
                }
                const candidate = store[candidateKey];
                if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
                    accumulator = this._mergeParameterMaps(accumulator, candidate);
                }
            });

            return accumulator;
        }, {});
    }

    _applyParameterValueOverrides(parameters, valuesMap, modifiersMap, context = {}) {
        if (!Array.isArray(parameters)) {
            return;
        }

        const values = valuesMap && typeof valuesMap === "object" && !Array.isArray(valuesMap) ? valuesMap : {};
        const modifiers = modifiersMap && typeof modifiersMap === "object" && !Array.isArray(modifiersMap) ? modifiersMap : {};

        const definitionStore =
            this.object?.effectParameterDefs && typeof this.object.effectParameterDefs === "object"
                ? this.object.effectParameterDefs
                : {};

        const normalizedEffectIndex = Number.isFinite(context.effectIndex) ? Number(context.effectIndex) : null;
        const normalizedEntryOrder = Number.isFinite(context.entryOrder) ? Number(context.entryOrder) : null;
        const explicitEntryKey =
            typeof context.entryKey === "string" && context.entryKey.length > 0 ? context.entryKey : null;

        const historyKeys = [];

        if (Array.isArray(context.historyKeys)) {
            context.historyKeys.forEach((key) => {
                if (key === undefined || key === null) {
                    return;
                }
                if (typeof key === "string" && key.length > 0) {
                    historyKeys.push(key);
                } else if (Number.isFinite(key)) {
                    historyKeys.push(Number(key));
                    historyKeys.push(String(key));
                }
            });
        }

        if (explicitEntryKey) {
            historyKeys.unshift(explicitEntryKey);
        }

        if (normalizedEffectIndex !== null && normalizedEntryOrder !== null) {
            const derivedKey = this._getEffectEntryKey(normalizedEffectIndex, normalizedEntryOrder);
            if (!historyKeys.includes(derivedKey)) {
                historyKeys.push(derivedKey);
            }
        }

        if (normalizedEffectIndex !== null) {
            if (!historyKeys.includes(normalizedEffectIndex)) {
                historyKeys.push(normalizedEffectIndex);
            }
            const stringIndex = String(normalizedEffectIndex);
            if (!historyKeys.includes(stringIndex)) {
                historyKeys.push(stringIndex);
            }
        }

        let historicalDefinitions = null;
        for (const candidateKey of historyKeys) {
            if (candidateKey === undefined || candidateKey === null) {
                continue;
            }

            let candidate = definitionStore[candidateKey];
            if (candidate === undefined && typeof candidateKey === "number") {
                candidate = definitionStore[String(candidateKey)];
            }
            if (candidate === undefined && typeof candidateKey === "string") {
                const numericKey = Number(candidateKey);
                if (Number.isFinite(numericKey)) {
                    candidate = definitionStore[numericKey];
                }
            }

            if (candidate !== undefined) {
                historicalDefinitions = candidate;
                break;
            }
        }

        const findHistoricalDefinition = (defs, name, index) => {
            if (!defs) {
                return null;
            }

            if (Array.isArray(defs)) {
                const byName = defs.find((entry) => entry?.name === name);
                if (byName) {
                    return byName;
                }
                return defs[index] ?? defs[String(index)] ?? null;
            }

            if (typeof defs === "object") {
                if (Array.isArray(defs.parameters)) {
                    return findHistoricalDefinition(defs.parameters, name, index);
                }
                if (defs[name] !== undefined) {
                    return defs[name];
                }
                if (defs[index] !== undefined) {
                    return defs[index];
                }
                if (defs[String(index)] !== undefined) {
                    return defs[String(index)];
                }
            }

            return null;
        };

        const numericTypes = ["number", "int", "integer", "float", "decimal"];

        parameters.forEach((parameter, index) => {
            if (!parameter) {
                return;
            }

            const name = typeof parameter.name === "string" && parameter.name.length > 0 ? parameter.name : `param${index + 1}`;
            const modifier =
                modifiers[name] ??
                modifiers[index] ??
                modifiers[String(index)] ??
                (Array.isArray(modifiers) ? modifiers[index] : undefined);
            const historicalDefinition = findHistoricalDefinition(historicalDefinitions, name, index);
            const parameterType =
                typeof parameter.originalType === "string"
                    ? parameter.originalType.toLowerCase()
                    : typeof parameter.type === "string"
                        ? parameter.type.toLowerCase()
                        : "";
            const isNumericParameter = numericTypes.includes(parameterType);

            const previousDefault =
                historicalDefinition && Number.isFinite(Number(historicalDefinition.defaultValue))
                    ? Number(historicalDefinition.defaultValue)
                    : null;
            const currentDefault = Number.isFinite(Number(parameter.defaultValue))
                ? Number(parameter.defaultValue)
                : null;
            const modifierNumeric = Number.isFinite(Number(modifier)) ? Number(modifier) : null;

            if (
                parameter.editable &&
                isNumericParameter &&
                modifierNumeric !== null &&
                previousDefault !== null &&
                currentDefault !== null &&
                !Object.is(previousDefault, currentDefault)
            ) {
                const adjusted = currentDefault + modifierNumeric;
                parameter.userValue = this._coerceParameterValue(parameter, adjusted, parameter.defaultValue);
                return;
            }

            const override =
                values[name] ??
                values[index] ??
                values[String(index)] ??
                (Array.isArray(values) ? values[index] : undefined);
            if (override !== undefined) {
                parameter.userValue = this._coerceParameterValue(parameter, override, parameter.defaultValue);
                return;
            }

            if (modifier !== undefined && typeof parameter.defaultValue === "number") {
                const numeric = Number(parameter.defaultValue) + Number(modifier);
                parameter.userValue = this._coerceParameterValue(parameter, numeric, parameter.defaultValue);
            }
        });
    }

    _coerceParameterValue(parameter, value, fallback = null) {
        const originalType = typeof parameter?.originalType === "string" ? parameter.originalType.toLowerCase() : null;
        const type = originalType ?? (typeof parameter?.type === "string" ? parameter.type.toLowerCase() : "string");
        const multiple = Boolean(parameter?.multiple);

        if (multiple) {
            const source =
                value === undefined || value === null
                    ? []
                    : Array.isArray(value)
                        ? value
                        : [value];
            return source.map((entry) => this._coerceParameterValue({ ...parameter, multiple: false }, entry, null));
        }

        switch (type) {
            case "number":
            case "int":
            case "integer":
            case "float":
            case "decimal": {
                const numeric = Number(value);
                let sanitized;
                if (Number.isFinite(numeric)) {
                    sanitized = numeric;
                } else if (Number.isFinite(Number(fallback))) {
                    sanitized = Number(fallback);
                } else {
                    sanitized = 0;
                }

                if (["int", "integer"].includes(type)) {
                    sanitized = Math.round(sanitized);
                }

                if (Number.isFinite(Number(parameter?.min))) {
                    sanitized = Math.max(Number(parameter.min), sanitized);
                }
                if (Number.isFinite(Number(parameter?.max))) {
                    sanitized = Math.min(Number(parameter.max), sanitized);
                }
                return sanitized;
            }
            case "boolean":
            case "bool":
            case "checkbox": {
                if (typeof value === "string") {
                    return ["1", "true", "on", "yes"].includes(value.toLowerCase());
                }
                if (value === undefined || value === null) {
                    if (typeof fallback === "string") {
                        return ["1", "true", "on", "yes"].includes(fallback.toLowerCase());
                    }
                    return Boolean(fallback);
                }
                return Boolean(value);
            }
            default: {
                if (value === undefined || value === null) {
                    return fallback ?? "";
                }
                return value;
            }
        }
    }

    _mergeEffectEntryParameters(previousParameters, currentParameters, { lockValues = false } = {}) {
        if (!Array.isArray(currentParameters)) {
            return [];
        }

        if (!Array.isArray(previousParameters)) {
            return currentParameters.map((parameter) => foundry.utils.deepClone(parameter));
        }

        return currentParameters.map((parameter, index) => {
            const clone = foundry.utils.deepClone(parameter);
            const name = typeof clone.name === "string" && clone.name.length > 0 ? clone.name : null;
            let previous = null;
            if (name) {
                previous =
                    previousParameters.find(
                        (candidate) => candidate && typeof candidate.name === "string" && candidate.name === name
                    ) ?? null;
            }
            if (!previous && previousParameters.length > index) {
                previous = previousParameters[index];
            }
            if (previous) {
                const previousValue = previous.userValue ?? previous.value ?? previous.defaultValue;
                const normalizedPrevious = this._coerceParameterValue(clone, previousValue, clone.defaultValue);
                const currentValue = clone.userValue ?? clone.value ?? clone.defaultValue;
                const normalizedCurrent = this._coerceParameterValue(clone, currentValue, clone.defaultValue);

                const valuesMatch = (() => {
                    if (typeof foundry?.utils?.deepEqual === "function") {
                        return foundry.utils.deepEqual(normalizedCurrent, normalizedPrevious);
                    }
                    if (typeof foundry?.utils?.deepEquals === "function") {
                        return foundry.utils.deepEquals(normalizedCurrent, normalizedPrevious);
                    }
                    try {
                        return JSON.stringify(normalizedCurrent) === JSON.stringify(normalizedPrevious);
                    } catch (error) {
                        console.warn("RollnKeepDialog | Failed to compare parameter values", error);
                        return Object.is(normalizedCurrent, normalizedPrevious);
                    }
                })();

                const shouldAdoptPreviousValue = lockValues || valuesMatch;

                if (shouldAdoptPreviousValue) {
                    clone.userValue = foundry.utils.deepClone(normalizedPrevious);
                }
            }
            return clone;
        });
    }

    _recalculateEffectEntryParameterState(entry) {
        if (!entry) {
            return;
        }

        const parameters = Array.isArray(entry.parameters) ? entry.parameters : [];
        const parameterMap = {};
        let total = 0;
        let hasEditable = false;

        parameters.forEach((parameter, index) => {
            if (!parameter) {
                return;
            }
            parameter.order = Number.isFinite(parameter.order) ? Number(parameter.order) : index;
            parameter.name = typeof parameter.name === "string" && parameter.name.length > 0 ? parameter.name : `param${index + 1}`;
            parameter.userValue = this._coerceParameterValue(
                parameter,
                parameter.userValue ?? parameter.value ?? parameter.defaultValue,
                parameter.defaultValue
            );
            parameterMap[parameter.name] = parameter.userValue;
            if (parameter.includeInTotal !== false && typeof parameter.userValue === "number" && Number.isFinite(parameter.userValue)) {
                total += parameter.userValue;
            }
            hasEditable = hasEditable || Boolean(parameter.editable);
        });

        entry.parameters = parameters;
        entry.parameterMap = parameterMap;
        entry.totalValue = total;
        entry.hasEditableParameters = hasEditable;
    }

    _getEffectEntryParameterMap(entry) {
        if (!entry) {
            return {};
        }
        if (!entry.parameterMap) {
            this._recalculateEffectEntryParameterState(entry);
        }
        return entry.parameterMap ?? {};
    }

    _formatEffectParameterValue(parameter) {
        if (!parameter) {
            return "";
        }

        const originalType = typeof parameter.originalType === "string" ? parameter.originalType.toLowerCase() : null;
        const type = originalType ?? (typeof parameter.type === "string" ? parameter.type.toLowerCase() : "string");
        const value = parameter.userValue;

        if (Array.isArray(parameter.options) && parameter.options.length > 0) {
            if (parameter.multiple) {
                const values = Array.isArray(value) ? value : [];
                const labels = parameter.options
                    .filter((option) => values.includes(option.value))
                    .map((option) => option.label ?? option.value ?? "");
                return labels.join(", ");
            }
            const selected = parameter.options.find((option) => option.value === value);
            if (selected) {
                return selected.label ?? selected.value ?? "";
            }
        }

        switch (type) {
            case "number":
            case "int":
            case "integer":
            case "float":
            case "decimal":
                return Number.isFinite(Number(value)) ? Number(value) : 0;
            case "boolean":
            case "bool":
            case "checkbox":
                return value ? game.i18n.localize("Yes") : game.i18n.localize("No");
            default:
                if (Array.isArray(value)) {
                    return value.join(", ");
                }
                return value ?? "";
        }
    }

    _serializeEffectParameter(parameter, index) {
        if (!parameter) {
            return null;
        }

        const name = typeof parameter.name === "string" && parameter.name.length > 0 ? parameter.name : `param${(index ?? 0) + 1}`;
        const typeNormalized = typeof parameter.type === "string" ? parameter.type.toLowerCase() : "string";
        const numericTypes = ["number", "int", "integer", "float", "decimal"];
        const serialized = {
            name,
            label: parameter.label ?? name,
            type: parameter.type ?? "string",
            originalType: parameter.originalType ?? null,
            description: parameter.description ?? "",
            defaultValue: foundry.utils.deepClone(parameter.defaultValue ?? null),
            userValue: foundry.utils.deepClone(parameter.userValue ?? null),
            initialValue: foundry.utils.deepClone(
                parameter.initialValue !== undefined ? parameter.initialValue : parameter.defaultValue ?? null
            ),
            includeInTotal: parameter.includeInTotal ?? numericTypes.includes(typeNormalized),
            editable: Boolean(parameter.editable),
            min: parameter.min ?? null,
            max: parameter.max ?? null,
            step: parameter.step ?? null,
            multiple: Boolean(parameter.multiple),
            required: Boolean(parameter.required),
            placeholder: parameter.placeholder ?? null,
            options: Array.isArray(parameter.options) ? foundry.utils.deepClone(parameter.options) : [],
            allowedValues: Array.isArray(parameter.allowedValues)
                ? foundry.utils.deepClone(parameter.allowedValues)
                : [],
            order: Number.isFinite(parameter.order) ? Number(parameter.order) : index ?? 0,
        };

        return serialized;
    }

    _decorateEffectParameter(parameter, index) {
        const clone = foundry.utils.deepClone(parameter ?? {});
        clone.name = typeof clone.name === "string" && clone.name.length > 0 ? clone.name : `param${index + 1}`;
        clone.order = Number.isFinite(clone.order) ? Number(clone.order) : index;

        const selectSource = (() => {
            const normalizedOptions = Array.isArray(clone.options) ? clone.options : [];
            if (normalizedOptions.length > 0) {
                return normalizedOptions;
            }
            return Array.isArray(clone.allowedValues) ? clone.allowedValues : [];
        })();

        const currentValue = clone.userValue;
        clone.selectOptions = selectSource
            .map((option) => {
                if (option === undefined || option === null) {
                    return option;
                }

                if (typeof option === "object") {
                const optClone = foundry.utils.deepClone(option);
                const optionValue = optClone.value ?? optClone.id ?? optClone.key ?? optClone.name ?? optClone.title;
                const optionLabel = optClone.label ?? optClone.title ?? optClone.name ?? optionValue;
                optClone.value = optionValue;
                optClone.label = optionLabel !== undefined ? String(optionLabel) : "";
                if (clone.multiple) {
                    const values = Array.isArray(currentValue) ? currentValue : [];
                    optClone.selected = values.includes(optionValue);
                } else {
                    optClone.selected = currentValue === optionValue;
                }
                return optClone;
            }

            const value = option;
                const isSelected = clone.multiple
                    ? Array.isArray(currentValue) && currentValue.includes(value)
                    : currentValue === value;
                return {
                    value,
                    label: String(value),
                    selected: isSelected,
                };
            })
            .filter((option) => option !== undefined && option !== null);

        const normalizedType = (clone.originalType ?? clone.type ?? "").toLowerCase();
        clone.isBoolean = ["boolean", "bool", "checkbox"].includes(normalizedType);
        clone.isInteger = ["int", "integer"].includes(normalizedType);
        clone.hasAllowedValues = Array.isArray(clone.selectOptions) && clone.selectOptions.length > 0;
        clone.isEditable = Boolean(clone.editable);
        clone.min = Number.isFinite(Number(clone.min)) ? Number(clone.min) : null;
        clone.max = Number.isFinite(Number(clone.max)) ? Number(clone.max) : null;
        clone.hasMin = clone.min !== null;
        clone.hasMax = clone.max !== null;
        clone.multiple = Boolean(clone.multiple);
        clone.step = Number.isFinite(Number(clone.step)) ? Number(clone.step) : null;
        clone.options = clone.selectOptions;
        clone.displayValue = this._formatEffectParameterValue(clone);

        return clone;
    }

    /**
     * Create a normalized effect entry from persisted results.
     * @param {object} stored
     * @returns {object}
     * @private
     */
    _createEffectEntryFromStored(stored) {
        if (stored === undefined || stored === null) {
            return {
                effectIndex: 0,
                order: 0,
                key: this._getEffectEntryKey(0, 0),
                description: game.i18n.localize("l5r5e.dice.roll_n_keep.effects.unknownLabel"),
                priority: 0,
                status: RollnKeepDialog.EFFECT_ENTRY_STATUS.active,
                finalMacro: null,
                params: {},
                details: null,
                parameters: [],
            };
        }

        if (typeof stored === "number") {
            stored = { baseValue: stored };
        }

        if (typeof stored === "string") {
            stored = { description: stored };
        }

        if (Array.isArray(stored)) {
            stored = { parameters: stored };
        }

        const entry = foundry.utils.deepClone(stored ?? {});
        entry.effectIndex = Number.isFinite(entry.effectIndex) ? Number(entry.effectIndex) : 0;
        entry.order = Number.isFinite(entry.order) ? Number(entry.order) : 0;
        entry.key = entry.key ?? this._getEffectEntryKey(entry.effectIndex, entry.order);
        entry.description = entry.description ?? entry.label ?? "";
        entry.priority = Number.isFinite(entry.priority) ? Number(entry.priority) : 0;
        entry.status = RollnKeepDialog.EFFECT_ENTRY_STATUS[entry.status]
            ? entry.status
            : RollnKeepDialog.EFFECT_ENTRY_STATUS.active;
        entry.finalMacro = typeof entry.finalMacro === "string" ? entry.finalMacro : null;
        if (!entry.finalMacro && typeof entry.executeMacro === "string") {
            entry.finalMacro = entry.executeMacro;
        }
        if (!entry.finalMacro && typeof entry.execute === "string") {
            entry.finalMacro = entry.execute;
        }
        entry.params = entry.params && typeof entry.params === "object" && !Array.isArray(entry.params) ? entry.params : {};
        entry.details = entry.details ?? entry.note ?? null;

        const rawParameters = Array.isArray(entry.parameters)
            ? entry.parameters
            : Array.isArray(entry.parameterDefs)
                ? entry.parameterDefs
                : [];
        const normalizedParameters = this._normalizeEffectParameters(rawParameters, {
            fallbackNamePrefix: `effect${entry.effectIndex + 1}`,
        });

        const baseValueCandidate = Number(entry.baseValue ?? entry.base ?? entry.value ?? entry.amount);
        const modifierCandidate = Number(entry.modifier ?? entry.adjustment ?? entry.delta);
        const hasLegacyNumeric =
            Number.isFinite(baseValueCandidate) ||
            Number.isFinite(modifierCandidate) ||
            entry.hasValue === true ||
            entry.allowModifier === true;

        if (normalizedParameters.length === 0 && hasLegacyNumeric) {
            const baseParam = this._normalizeEffectParameter(
                {
                    name: "base",
                    label: game.i18n.localize("l5r5e.dice.roll_n_keep.effects.baseLabel"),
                    type: "number",
                    defaultValue: Number.isFinite(baseValueCandidate) ? Number(baseValueCandidate) : 0,
                    userValue: Number.isFinite(baseValueCandidate) ? Number(baseValueCandidate) : 0,
                    includeInTotal: true,
                    editable: false,
                },
                normalizedParameters.length,
                { fallbackNamePrefix: `effect${entry.effectIndex + 1}` }
            );
            if (baseParam) {
                normalizedParameters.push(baseParam);
            }

            if (Number.isFinite(modifierCandidate) || entry.hasValue === true || entry.allowModifier === true) {
                const modifierParam = this._normalizeEffectParameter(
                    {
                        name: "modifier",
                        label: game.i18n.localize("l5r5e.dice.roll_n_keep.effects.modifierLabel"),
                        type: "number",
                        defaultValue: Number.isFinite(modifierCandidate) ? Number(modifierCandidate) : 0,
                        userValue: Number.isFinite(modifierCandidate) ? Number(modifierCandidate) : 0,
                        includeInTotal: true,
                        editable: true,
                    },
                    normalizedParameters.length,
                    { fallbackNamePrefix: `effect${entry.effectIndex + 1}` }
                );
                if (modifierParam) {
                    normalizedParameters.push(modifierParam);
                }
            }
        }

        const valueOverrides = entry.parameterValues ?? entry.values ?? null;
        const modifierOverrides = entry.parameterModifiers ?? entry.modifiers ?? null;
        const historyOrder = Number.isFinite(entry.order)
            ? Number(entry.order)
            : Number.isFinite(entry.index)
                ? Number(entry.index)
                : 0;
        const historyContext = {
            effectIndex: Number.isFinite(entry.effectIndex) ? Number(entry.effectIndex) : 0,
            entryOrder: historyOrder,
            entryKey:
                typeof entry.key === "string" && entry.key.length > 0
                    ? entry.key
                    : this._getEffectEntryKey(
                          Number.isFinite(entry.effectIndex) ? Number(entry.effectIndex) : 0,
                          historyOrder
                      ),
            historyKeys:
                typeof entry.key === "string" && entry.key.length > 0
                    ? [entry.key]
                    : [],
        };
        this._applyParameterValueOverrides(normalizedParameters, valueOverrides, modifierOverrides, historyContext);

        entry.parameters = normalizedParameters;
        this._recalculateEffectEntryParameterState(entry);

        if (!entry.description) {
            entry.description = game.i18n.localize("l5r5e.dice.roll_n_keep.effects.unknownLabel");
        }

        return entry;
    }

    /**
     * Execute a roll effect input macro and normalize its result.
     * @param {object} effect
     * @param {number} effectIndex
     * @returns {Promise<unknown[]>}
     * @private
     */
    async _executeEffectInputMacro(effect, effectIndex) {
        const macroIdentifier = effect?.macro ?? effect?.inputMacro ?? null;
        if (!macroIdentifier || !this.roll) {
            return [];
        }

        const macro = await this._resolveMacro(macroIdentifier);
        if (!macro) {
            console.warn(`RollnKeepDialog | Unable to resolve input macro '${macroIdentifier}' for effect index ${effectIndex}.`);
            return [];
        }

        let macroResult;
        try {
            const clonedParams = foundry.utils.deepClone(effect?.params ?? {});
            const context = { effectIndex, effect, roll: this.roll };
            macroResult = await macro.execute({ roll: this.roll }, [clonedParams, context]);
        } catch (error) {
            console.error(`RollnKeepDialog | Error while executing macro '${macroIdentifier}'`, error);
            ui.notifications?.error?.(game.i18n.localize("l5r5e.dice.roll_n_keep.effects.macroError"));
            return [];
        }

        if (!Array.isArray(macroResult)) {
            return [];
        }

        return macroResult;
    }

    /**
     * Prepare effect entries for rendering.
     * @returns {Promise<void>}
     * @private
     */
    async _prepareEffectEntries() {
        const existingEntries = Array.isArray(this.object.effectResults) ? this.object.effectResults : [];
        const existingMap = new Map();
        existingEntries.forEach((stored) => {
            const entry = this._createEffectEntryFromStored(stored);
            existingMap.set(entry.key, entry);
        });

        const updatedEntries = new Map();
        const staleKeys = new Set(existingMap.keys());
        const frozenStatuses = new Set([
            RollnKeepDialog.EFFECT_ENTRY_STATUS.rejected,
            RollnKeepDialog.EFFECT_ENTRY_STATUS.triggered,
            RollnKeepDialog.EFFECT_ENTRY_STATUS.completed,
        ]);

        const canGenerate = Boolean(this.roll) && (this.isOwner || game.user.isGM);
        if (canGenerate && Array.isArray(this.object.rollEffects) && this.object.rollEffects.length > 0) {
            for (let effectIndex = 0; effectIndex < this.object.rollEffects.length; effectIndex += 1) {
                const effect = this.object.rollEffects[effectIndex];
                const macroEntries = await this._executeEffectInputMacro(effect, effectIndex);

                const normalizedEntries = Array.isArray(macroEntries) ? macroEntries : [];
                for (let entryIdx = 0; entryIdx < normalizedEntries.length; entryIdx += 1) {
                    const macroEntry = normalizedEntries[entryIdx];
                    const normalized = await this._normalizeEffectEntry(effectIndex, macroEntry, entryIdx, effect);
                    if (!normalized) {
                        continue;
                    }

                    const previous = existingMap.get(normalized.key);
                    if (previous) {
                        const shouldPreserveStatus = frozenStatuses.has(previous.status);
                        if (shouldPreserveStatus) {
                            normalized.status = previous.status;
                        } else {
                            normalized.status =
                                normalized.status ?? RollnKeepDialog.EFFECT_ENTRY_STATUS.active;
                        }
                        const shouldReuseResolvedState =
                            previous.status === RollnKeepDialog.EFFECT_ENTRY_STATUS.triggered ||
                            previous.status === RollnKeepDialog.EFFECT_ENTRY_STATUS.completed;
                        if (shouldReuseResolvedState && Number.isFinite(previous.priority)) {
                            normalized.priority = Number(previous.priority);
                        }
                        if (shouldReuseResolvedState) {
                            normalized.finalMacro = previous.finalMacro ?? normalized.finalMacro;
                        }
                        normalized.params = foundry.utils.mergeObject(previous.params ?? {}, normalized.params ?? {}, {
                            inplace: false,
                        });
                        normalized.details = normalized.details ?? previous.details ?? null;
                        normalized.parameters = this._mergeEffectEntryParameters(
                            previous.parameters ?? [],
                            normalized.parameters ?? [],
                            { lockValues: shouldReuseResolvedState }
                        );
                        normalized.isNew = false;
                        staleKeys.delete(normalized.key);
                    } else {
                        normalized.isNew = true;
                    }

                    this._recalculateEffectEntryParameterState(normalized);
                    updatedEntries.set(normalized.key, normalized);
                }
            }
        }

        if (canGenerate) {
            staleKeys.forEach((key) => {
                const previous = existingMap.get(key);
                if (!previous) {
                    return;
                }
                const clone = foundry.utils.deepClone(previous);
                clone.isNew = false;
                if (clone.status === RollnKeepDialog.EFFECT_ENTRY_STATUS.active) {
                    clone.status = RollnKeepDialog.EFFECT_ENTRY_STATUS.inactive;
                }
                this._recalculateEffectEntryParameterState(clone);
                updatedEntries.set(key, clone);
            });
        }

        if (updatedEntries.size === 0 && existingMap.size > 0) {
            existingMap.forEach((entry, key) => {
                const clone = foundry.utils.deepClone(entry);
                clone.isNew = false;
                this._recalculateEffectEntryParameterState(clone);
                updatedEntries.set(key, clone);
            });
        }

        const entries = Array.from(updatedEntries.values());
        entries.sort((a, b) => {
            const priorityA = Number.isFinite(a.priority) ? a.priority : Number.NEGATIVE_INFINITY;
            const priorityB = Number.isFinite(b.priority) ? b.priority : Number.NEGATIVE_INFINITY;
            const priorityDiff = priorityB - priorityA;
            if (priorityDiff !== 0) {
                return priorityDiff;
            }
            const effectDiff = (a.effectIndex ?? 0) - (b.effectIndex ?? 0);
            if (effectDiff !== 0) {
                return effectDiff;
            }
            return (a.order ?? 0) - (b.order ?? 0);
        });

        this.object.effectEntries = entries;

        const resultsChanged = this._persistEffectEntries();

        if (resultsChanged && canGenerate) {
            await this._toChatMessage();
        }
    }

    /**
     * Persist effect entries to the roll data structure.
     * @returns {boolean} True if the serialized results changed.
     * @private
     */
    _persistEffectEntries() {
        const entries = Array.isArray(this.object.effectEntries) ? this.object.effectEntries : [];
        const serialized = entries.map((entry) => ({
            key: entry.key,
            effectIndex: entry.effectIndex,
            order: entry.order,
            description: entry.description,
            priority: entry.priority,
            status: entry.status,
            finalMacro: entry.finalMacro,
            params: entry.params,
            details: entry.details,
            totalValue: entry.totalValue,
            parameters: Array.isArray(entry.parameters)
                ? entry.parameters.map((parameter, index) => this._serializeEffectParameter(parameter, index))
                : [],
        }));

        const previous = JSON.stringify(this.object.effectResults ?? []);
        const next = JSON.stringify(serialized);
        const changed = previous !== next;

        this.object.effectResults = serialized;

        const defs = {};
        const values = {};
        const modifiers = {};

        entries.forEach((entry) => {
            const entryParameters = Array.isArray(entry.parameters) ? entry.parameters : [];
            if (entryParameters.length === 0) {
                return;
            }

            defs[entry.key] = entryParameters.map((parameter, index) => this._serializeEffectParameter(parameter, index));
            const parameterMap = this._getEffectEntryParameterMap(entry);
            if (Object.keys(parameterMap).length > 0) {
                values[entry.key] = foundry.utils.deepClone(parameterMap);
            }

            const entryModifiers = {};
            entryParameters.forEach((parameter, index) => {
                if (!parameter) {
                    return;
                }
                const name = typeof parameter.name === "string" && parameter.name.length > 0 ? parameter.name : `param${index + 1}`;
                const defaultValue = parameter.defaultValue ?? null;
                const userValue = parameter.userValue;

                if (typeof defaultValue === "number" && typeof userValue === "number") {
                    const delta = userValue - Number(defaultValue);
                    if (Math.abs(delta) > 0) {
                        entryModifiers[name] = delta;
                    }
                } else if (parameter.editable && parameter.multiple) {
                    const defaultArray = Array.isArray(defaultValue) ? defaultValue : [];
                    const userArray = Array.isArray(userValue) ? userValue : [];
                    if (JSON.stringify(defaultArray) !== JSON.stringify(userArray)) {
                        entryModifiers[name] = foundry.utils.deepClone(userArray);
                    }
                } else if (parameter.editable) {
                    const typeNormalized =
                        typeof parameter.originalType === "string"
                            ? parameter.originalType.toLowerCase()
                            : typeof parameter.type === "string"
                                ? parameter.type.toLowerCase()
                                : "";
                    if (["boolean", "bool", "checkbox"].includes(typeNormalized)) {
                        if (Boolean(userValue) !== Boolean(defaultValue)) {
                            entryModifiers[name] = Boolean(userValue);
                        }
                    } else if (userValue !== defaultValue) {
                        entryModifiers[name] = foundry.utils.deepClone(userValue);
                    }
                }
            });

            if (Object.keys(entryModifiers).length > 0) {
                modifiers[entry.key] = entryModifiers;
            }
        });

        this.object.effectParameterDefs = defs;
        this.object.effectParameterValues = values;
        this.object.effectParameterModifiers = modifiers;

        if (this.roll?.l5r5e) {
            this.roll.l5r5e.effectResults = foundry.utils.deepClone(serialized);
            this.roll.l5r5e.effectParameterDefs = foundry.utils.deepClone(defs);
            this.roll.l5r5e.effectParameterValues = foundry.utils.deepClone(values);
            this.roll.l5r5e.effectParameterModifiers = foundry.utils.deepClone(modifiers);
        }

        return changed;
    }

    /**
     * Locate an effect entry by its key.
     * @param {string} effectKey
     * @returns {object|null}
     * @private
     */
    _findEffectEntry(effectKey) {
        if (!effectKey || !Array.isArray(this.object.effectEntries)) {
            return null;
        }
        return this.object.effectEntries.find((entry) => entry.key === effectKey) ?? null;
    }

    /**
     * Determine if an effect entry is locked from further user modification.
     * @param {object|null} entry
     * @returns {boolean}
     * @private
     */
    _isEffectEntryLocked(entry) {
        if (!entry) {
            return false;
        }

        const status = entry.status;
        const { triggered, completed } = RollnKeepDialog.EFFECT_ENTRY_STATUS;
        return status === triggered || status === completed;
    }

    /**
     * Locate a parameter within an effect entry.
     * @param {object} entry
     * @param {string|null} parameterName
     * @param {number|null} parameterIndex
     * @returns {object|null}
     * @private
     */
    _findEffectEntryParameter(entry, parameterName, parameterIndex) {
        if (!entry || !Array.isArray(entry.parameters)) {
            return null;
        }

        if (typeof parameterName === "string" && parameterName.length > 0) {
            const byName = entry.parameters.find((parameter) => parameter?.name === parameterName);
            if (byName) {
                return byName;
            }
        }

        if (Number.isFinite(parameterIndex) && parameterIndex >= 0 && parameterIndex < entry.parameters.length) {
            return entry.parameters[parameterIndex];
        }

        return null;
    }

    /**
     * Update a parameter value applied to an effect entry.
     * @param {string} effectKey
     * @param {string|null} parameterName
     * @param {number|null} parameterIndex
     * @param {unknown} value
     * @returns {Promise<void>}
     * @private
     */
    async _setEffectParameterValue(effectKey, parameterName, parameterIndex, value) {
        const entry = this._findEffectEntry(effectKey);
        if (!entry) {
            return;
        }

        if (this._isEffectEntryLocked(entry)) {
            return;
        }

        const parameter = this._findEffectEntryParameter(entry, parameterName, parameterIndex);
        if (!parameter || !parameter.editable) {
            return;
        }

        const sanitized = this._coerceParameterValue(parameter, value, parameter.defaultValue);
        parameter.userValue = sanitized;
        this._recalculateEffectEntryParameterState(entry);

        const changed = this._persistEffectEntries();
        if (changed) {
            await this._toChatMessage();
        }

        this.render(false);
    }

    /**
     * Update the status of an effect entry and synchronize the roll.
     * @param {string} effectKey
     * @param {string} status
     * @returns {Promise<void>}
     * @private
     */
    async _setEffectStatus(effectKey, status) {
        if (!RollnKeepDialog.EFFECT_ENTRY_STATUS[status]) {
            return;
        }

        const entry = this._findEffectEntry(effectKey);
        if (!entry) {
            return;
        }

        if (this._isEffectEntryLocked(entry) && entry.status !== status) {
            return;
        }

        entry.status = status;
        const changed = this._persistEffectEntries();
        if (changed) {
            await this._toChatMessage();
        }

        this.render(false);
    }

    /**
     * Restore all rejected effect entries back to the active state.
     * @returns {Promise<void>}
     * @private
     */
    async _restoreRejectedEffects() {
        let hasChange = false;
        (this.object.effectEntries ?? []).forEach((entry) => {
            if (entry.status === RollnKeepDialog.EFFECT_ENTRY_STATUS.rejected) {
                entry.status = RollnKeepDialog.EFFECT_ENTRY_STATUS.active;
                hasChange = true;
            }
        });

        if (!hasChange) {
            return;
        }

        const changed = this._persistEffectEntries();
        if (changed) {
            await this._toChatMessage();
        }

        this.render(false);
    }

    /**
     * Execute the final macro for a specific effect entry immediately.
     * @param {string} effectKey
     * @returns {Promise<void>}
     * @private
     */
    async _executeEffectEntryNow(effectKey) {
        const entry = this._findEffectEntry(effectKey);
        if (!entry) {
            return;
        }

        if (this._isEffectEntryLocked(entry)) {
            return;
        }

        const previousStatus =
            entry.status ?? RollnKeepDialog.EFFECT_ENTRY_STATUS.active;

        entry.status = RollnKeepDialog.EFFECT_ENTRY_STATUS.triggered;
        let changed = this._persistEffectEntries();
        if (changed) {
            await this._toChatMessage();
        }

        const executed = await this._executeEffectEntryMacro(entry);
        if (executed) {
            entry.status = RollnKeepDialog.EFFECT_ENTRY_STATUS.completed;
        } else {
            entry.status = previousStatus;
        }

        changed = this._persistEffectEntries();
        if (changed) {
            await this._toChatMessage();
        }

        if (!executed) {
            ui.notifications?.warn?.(
                game.i18n.localize("l5r5e.dice.roll_n_keep.effects.macroNotExecuted")
            );
        }

        this.render(false);
    }

    /**
     * Execute the macro associated with an effect entry.
     * @param {object} entry
     * @returns {Promise<boolean>} True if the macro executed successfully.
     * @private
     */
    async _executeEffectEntryMacro(entry) {
        if (!entry?.finalMacro || !this.roll) {
            return false;
        }

        const macro = await this._resolveMacro(entry.finalMacro);
        if (!macro) {
            console.warn(`RollnKeepDialog | Unable to resolve final macro '${entry.finalMacro}' for effect entry ${entry.key}.`);
            return false;
        }

        const parameterMap = this._getEffectEntryParameterMap(entry);
        const totalValue = Number.isFinite(entry.totalValue) ? Number(entry.totalValue) : 0;

        const macroParameters = foundry.utils.deepClone(parameterMap);
        if (!Object.prototype.hasOwnProperty.call(macroParameters, "_total")) {
            macroParameters._total = totalValue;
        }

        try {
            const clonedState = foundry.utils.deepClone(entry.params ?? {});
            const clonedParameterMap = foundry.utils.deepClone(parameterMap);
            const context = {
                effectIndex: entry.effectIndex,
                effectKey: entry.key,
                entry: foundry.utils.deepClone(entry),
                effect: this.object.rollEffects?.[entry.effectIndex] ?? null,
                parameterMap: clonedParameterMap,
                totalValue,
                roll: this.roll,
            };
            await macro.execute({ roll: this.roll }, [macroParameters, clonedState, context]);
            return true;
        } catch (error) {
            console.error(`RollnKeepDialog | Error while executing final macro '${entry.finalMacro}'`, error);
            ui.notifications?.error?.(game.i18n.localize("l5r5e.dice.roll_n_keep.effects.macroError"));
            return false;
        }
    }

    /**
     * Execute all pending effect entries in priority order.
     * @returns {Promise<void>}
     * @private
     */
    async _finalizeEffectEntries() {
        const entries = (this.object.effectEntries ?? []).filter(
            (entry) =>
                !this._isEffectEntryLocked(entry) &&
                [RollnKeepDialog.EFFECT_ENTRY_STATUS.active, RollnKeepDialog.EFFECT_ENTRY_STATUS.triggered].includes(
                    entry.status
                )
        );

        entries.sort((a, b) => {
            const priorityA = Number.isFinite(a.priority) ? a.priority : Number.NEGATIVE_INFINITY;
            const priorityB = Number.isFinite(b.priority) ? b.priority : Number.NEGATIVE_INFINITY;
            const priorityDiff = priorityB - priorityA;
            if (priorityDiff !== 0) {
                return priorityDiff;
            }
            const effectDiff = (a.effectIndex ?? 0) - (b.effectIndex ?? 0);
            if (effectDiff !== 0) {
                return effectDiff;
            }
            return (a.order ?? 0) - (b.order ?? 0);
        });

        for (const entry of entries) {
            if (this._isEffectEntryLocked(entry)) {
                continue;
            }

            const previousStatus =
                entry.status ?? RollnKeepDialog.EFFECT_ENTRY_STATUS.active;

            entry.status = RollnKeepDialog.EFFECT_ENTRY_STATUS.triggered;
            let changed = this._persistEffectEntries();
            if (changed) {
                await this._toChatMessage();
            }

            const executed = await this._executeEffectEntryMacro(entry);
            if (executed) {
                entry.status = RollnKeepDialog.EFFECT_ENTRY_STATUS.completed;
            } else {
                entry.status = previousStatus;
            }

            changed = this._persistEffectEntries();
            if (changed) {
                await this._toChatMessage();
            }

            if (!executed) {
                ui.notifications?.warn?.(
                    game.i18n.localize("l5r5e.dice.roll_n_keep.effects.macroNotExecuted")
                );
                this.render(false);
            }
        }
    }

    /**
     * Create drag-and-drop workflow handlers for this Application
     * @return An array of DragDrop handlers
     */
    _createDragDropHandlers() {
        return [
            new foundry.applications.ux.DragDrop.implementation({
                dragSelector: ".dice.draggable",
                dropSelector: ".dropbox",
                permissions: { dragstart: this.isEditable, drop: this.isEditable },
                callbacks: { dragstart: this._onDragStart.bind(this), drop: this._onDropItem.bind(this) },
            }),
            new foundry.applications.ux.DragDrop.implementation({
                dragSelector: ".faces-change",
                dropSelector: ".dice.draggable",
                permissions: { dragstart: this.isEditable, drop: this.isEditable },
                callbacks: {
                    dragstart: this._onSwapDragStart.bind(this),
                    drop: this._onSwapDrop.bind(this),
                },
            }),
        ];
    }

    /**
     * Callback actions which occur at the beginning of a drag start workflow.
     * @param {DragEvent} event	The originating DragEvent
     */
    _onDragStart(event) {
        const target = $(event.currentTarget);
        event.dataTransfer.setData(
            "text/plain",
            JSON.stringify({
                step: target.data("step"),
                die: target.data("die"),
            })
        );
    }

    /**
     * Callback for swap drag start actions.
     * @param {DragEvent} event The originating DragEvent
     * @private
     */
    _onSwapDragStart(event) {
        const target = event.currentTarget;
        if (!target) {
            return;
        }

        const { die: dieType, face } = target.dataset ?? {};
        if (!dieType || !face) {
            return;
        }

        event.dataTransfer.setData(
            "text/plain",
            JSON.stringify({
                choice: RollnKeepDialog.CHOICES.swap,
                dieType,
                face,
            })
        );
    }

    /**
     * Construct and return the data object used to render the HTML template for this form application.
     * @param options
     * @return {Object}
     */
    async getData(options = null) {
        this._updateSummaryFromChoices();
        const rollData = this.roll.l5r5e;

        // Disable submit / edition
        this.options.classes = this.options.classes.filter((e) => e !== "finalized");
        this.object.submitDisabled = false;

        const applyFlags = foundry.utils.mergeObject(
            {
                strifeToCharacter: false,
                fatigueToCharacter: false,
                strifeToTarget: false,
                fatigueToTarget: false,
            },
            rollData.applyFlags || {},
            { inplace: false }
        );
        rollData.applyFlags = applyFlags;

        const actor = rollData.actor || null;
        const targetActor = rollData.target?.actor || null;
        const actorHasBleeding = typeof actor?.statuses?.has === "function" ? actor.statuses.has("bleeding") : false;
        const canApplyStrifeToCharacter = applyFlags.strifeToCharacter && rollData.actor?.isCharacterType;
        const bleedingCanApplyFatigue = actorHasBleeding && !!actor;
        if (bleedingCanApplyFatigue && !applyFlags.fatigueToCharacter) {
            applyFlags.fatigueToCharacter = true;
        }
        const canApplyFatigueToCharacter = (applyFlags.fatigueToCharacter && !!actor) || bleedingCanApplyFatigue;
        const canApplyStrifeToTarget = applyFlags.strifeToTarget && !!targetActor;
        const canApplyFatigueToTarget = applyFlags.fatigueToTarget && !!targetActor;
        const hasApplyOptions =
            canApplyStrifeToCharacter || canApplyFatigueToCharacter || canApplyStrifeToTarget || canApplyFatigueToTarget;

        const currentStepIndex = Number.isInteger(this.object.currentStep) ? this.object.currentStep : 0;
        const isSummaryStep = !this.object.dicesList?.[currentStepIndex];
        if (isSummaryStep) {
            const alreadyPrepared =
                Number.isInteger(this.object.effectsPreparedForStep) &&
                this.object.effectsPreparedForStep === currentStepIndex;
            if (!alreadyPrepared) {
                await this._prepareEffectEntries();
                this.object.effectsPreparedForStep = currentStepIndex;
            }
        } else {
            this.object.effectsPreparedForStep = null;
        }

        rollData.hasAppliedResults =
            (rollData.strifeApplied || 0) > 0 ||
            (rollData.fatigueApplied || 0) > 0 ||
            (rollData.targetStrifeApplied || 0) > 0 ||
            (rollData.targetFatigueApplied || 0) > 0;

        if (this._checkKeepCount(this.object.currentStep)) {
            const kept = this._getKeepCount(this.object.currentStep);
            this.object.submitDisabled = kept < 1 || kept > rollData.keepLimit;
        } else if (!this.object.dicesList[this.object.currentStep]) {
            const stance = String(rollData?.stance ?? "").toLowerCase();
            if (stance !== "void" && this.roll.l5r5e.strifeApplied === undefined) {
                this.roll.l5r5e.strifeApplied = rollData.summary.strife;
                if (typeof rollData.actor?.statuses?.has === "function" && rollData.actor.statuses.has("intoxicated")) {
                    this.roll.l5r5e.strifeApplied += rollData.summary.strife;
                }
            }

            if (bleedingCanApplyFatigue) {
                const bleedingDefault = this.roll.l5r5e._bleedingFatigueDefault;
                const currentFatigue = this.roll.l5r5e.fatigueApplied;
                const summaryStrife = rollData.summary.strife;
                if (
                    currentFatigue === undefined ||
                    bleedingDefault === undefined ||
                    currentFatigue === bleedingDefault
                ) {
                    this.roll.l5r5e.fatigueApplied = summaryStrife;
                }
                this.roll.l5r5e._bleedingFatigueDefault = summaryStrife;
            } else {
                delete this.roll.l5r5e._bleedingFatigueDefault;
            }

            const canEditResults =
                (rollData.summary.strife > 0 && rollData.actor?.isCharacterType) || hasApplyOptions;
            this.options.editable = this.isOwner && canEditResults;
            this.options.classes.push("finalized");
        }

        const isEditable = options?.editable ?? this.options.editable;
        const effectStatusLabels = Object.values(RollnKeepDialog.EFFECT_ENTRY_STATUS).reduce((acc, statusKey) => {
            acc[statusKey] = `l5r5e.dice.roll_n_keep.effects.status.${statusKey}`;
            return acc;
        }, {});

        const effectEntries = Array.isArray(this.object.effectEntries) ? this.object.effectEntries : [];
        const decoratedEffectEntries = effectEntries.map((entry) => {
            const clone = foundry.utils.deepClone(entry);
            const isLocked = this._isEffectEntryLocked(clone);
            clone.isLocked = isLocked;
            if (isLocked && Array.isArray(clone.parameters)) {
                clone.parameters.forEach((parameter) => {
                    if (!parameter) {
                        return;
                    }
                    parameter.editable = false;
                    parameter.isEditable = false;
                });
            }
            this._recalculateEffectEntryParameterState(clone);

            const parameters = Array.isArray(clone.parameters) ? clone.parameters : [];
            clone.parameters = parameters.map((parameter, idx) => {
                if (isLocked && parameter) {
                    parameter.editable = false;
                    parameter.isEditable = false;
                }

                const decorated = this._decorateEffectParameter(parameter, idx);
                if (isLocked) {
                    decorated.isEditable = false;
                }

                if (parameter) {
                    parameter.editable = Boolean(parameter.editable) && isEditable;
                    parameter.isEditable = Boolean(parameter.isEditable) && isEditable;
                }

                if (decorated) {
                    decorated.editable = Boolean(decorated.editable) && isEditable;
                    decorated.isEditable = Boolean(decorated.isEditable) && isEditable;
                }

                return decorated;
            });

            clone.parameterMap = this._getEffectEntryParameterMap(clone);
            clone.totalValue = Number.isFinite(clone.totalValue) ? Number(clone.totalValue) : 0;
            clone.hasParameters = clone.parameters.length > 0;
            clone.hasFinalMacro = typeof clone.finalMacro === "string" && clone.finalMacro.trim().length > 0;
            return clone;
        });
        const rejectedEffectEntries = decoratedEffectEntries.filter(
            (entry) => entry.status === RollnKeepDialog.EFFECT_ENTRY_STATUS.rejected
        );
        const visibleEffectEntries = decoratedEffectEntries.filter(
            (entry) => entry.status !== RollnKeepDialog.EFFECT_ENTRY_STATUS.rejected
        );
        const hasRejectedEffects = rejectedEffectEntries.length > 0;
        const hasVisibleEffectEntries = visibleEffectEntries.length > 0;
        const hasAnyEffectEntries = hasVisibleEffectEntries || hasRejectedEffects;

        return {
            ...(await super.getData(options)),
            isGM: game.user.isGM,
            showChoices: isEditable && !rollData.rnkEnded,
            showApplyResults: isEditable && hasApplyOptions,
            applyOptions: {
                strifeToCharacter: canApplyStrifeToCharacter,
                fatigueToCharacter: canApplyFatigueToCharacter,
                strifeToTarget: canApplyStrifeToTarget,
                fatigueToTarget: canApplyFatigueToTarget,
            },
            cssClass: this.options.classes.join(" "),
            data: this.object,
            l5r5e: rollData,
            effectEntries: visibleEffectEntries,
            visibleEffectEntries,
            rejectedEffectEntries,
            effectStatuses: RollnKeepDialog.EFFECT_ENTRY_STATUS,
            effectStatusLabels,
            isEditable,
            hasRejectedEffects,
            hasVisibleEffectEntries,
            hasAnyEffectEntries,
        };
    }

    /**
     * Recompute the current summary based on the selected dice.
     * @private
     */
    _updateSummaryFromChoices() {
        const rollData = this.roll?.l5r5e;
        if (!rollData || !Array.isArray(this.object?.dicesList)) {
            return;
        }

        const summary = rollData.summary ?? {};
        summary.success = 0;
        summary.explosive = 0;
        summary.opportunity = 0;
        summary.strife = 0;
        summary.totalSuccess = 0;

        this.object.dicesList.forEach((step, stepIdx) => {
            if (!Array.isArray(step)) {
                return;
            }

            const haveReroll =
                stepIdx > 0 &&
                this._haveChoice(stepIdx - 1, [RollnKeepDialog.CHOICES.reroll, RollnKeepDialog.CHOICES.swap]);

            step.forEach((die) => {
                if (!die) {
                    return;
                }

                const includeDie =
                    die.choice === RollnKeepDialog.CHOICES.keep ||
                    (haveReroll && die.choice === RollnKeepDialog.CHOICES.nothing);
                if (!includeDie) {
                    return;
                }

                const faceValue = die.newFace ?? die.face;
                const dieFaces = game.l5r5e?.[die.type]?.FACES;
                const faceData = dieFaces?.[faceValue];
                if (!faceData) {
                    return;
                }

                summary.success += Number(faceData.success) || 0;
                summary.explosive += Number(faceData.explosive) || 0;
                summary.opportunity += Number(faceData.opportunity) || 0;
                summary.strife += Number(faceData.strife) || 0;
            });
        });

        summary.totalSuccess = summary.success + summary.explosive;
        summary.baseTotalSuccess = summary.totalSuccess;

        const difficulty = Number(rollData.difficulty ?? 0);
        let totalBonus = Math.max(0, summary.totalSuccess - difficulty);
        if (rollData.stance === "fire" && summary.baseTotalSuccess >= difficulty) {
            totalBonus += summary.strife;
        }
        summary.totalBonus = totalBonus;
    }

    /**
     * Listen to html elements
     * @param {jQuery} html HTML content of the sheet.
     * @override
     */
    activateListeners(html) {
        super.activateListeners(html);

        // Owner only, need to be before the editable check
        if (this.isOwner && this.object.currentStep > 0) {
            // Add Context menu to rollback choices
            new foundry.applications.ux.ContextMenu.implementation(html[0], ".l5r5e.profil", [
                {
                    name: game.i18n.localize("l5r5e.dice.roll_n_keep.undo"),
                    icon: '<i class="fas fa-undo"></i>',
                    callback: () => this._undoLastStepChoices(),
                },
            ], { jQuery: false });
        }

        const undoStepButton = html.find("#undo-step");
        const canUseUndoButton = this.isOwner && this.object.currentStep > 0;
        if (undoStepButton.length) {
            undoStepButton.prop("disabled", !canUseUndoButton);
            if (canUseUndoButton) {
                undoStepButton.on("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this._undoLastStepChoices();
                });
            }
        }

        // *** Everything below here is only needed if the sheet is editable ***
        if (!this.isEditable) {
            return;
        }

        // Finalize Button
        html.find("#finalize").on("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!this.object.submitDisabled) {
                this.submit();
            }
        });

        const registerValuePicker = (field) => {
            const group = html.find(`.apply-value[data-field="${field}"]`);
            if (!group.length) {
                return;
            }

            const input = group.find(`input[name="${field}"]`);
            if (!input.length) {
                return;
            }

            const minAttr = group.data("min");
            const maxAttr = group.data("max");
            const min = Number.isNaN(Number(minAttr)) ? 0 : Number(minAttr);
            const max = maxAttr !== undefined && !Number.isNaN(Number(maxAttr)) ? Number(maxAttr) : undefined;

            const clamp = (value) => {
                let sanitized = Number.isNaN(value) ? min : Math.round(value);
                sanitized = Math.max(min, sanitized);
                if (max !== undefined) {
                    sanitized = Math.min(max, sanitized);
                }
                return sanitized;
            };

            const applyValue = (value) => {
                const sanitized = clamp(value);
                input.val(sanitized);
            };

            input.on("change", (event) => {
                const target = event.currentTarget ?? event.target ?? input[0];
                applyValue(Number(target?.value));
            });

            html.find(`.apply-adjust[data-field="${field}"]`).on("click", (event) => {
                event.preventDefault();
                const delta = Number(event.currentTarget.dataset.delta) || 0;
                const current = Number(input.val()) || 0;
                applyValue(current + delta);
                input.trigger("change");
            });

            applyValue(Number(input.val()));
        };

        ["strifeApplied", "fatigueApplied", "targetStrifeApplied", "targetFatigueApplied"].forEach((field) =>
            registerValuePicker(field)
        );

        // Effect entry parameter inputs
        html.find(".effect-parameter-input").on("change", (event) => {
            event.preventDefault();
            const target = event.currentTarget ?? event.target;
            const effectKey = target?.dataset?.effectKey;
            const parameterName = target?.dataset?.parameterName ?? null;
            const parameterIndexRaw = target?.dataset?.parameterIndex;
            const parameterIndex = Number.isNaN(Number(parameterIndexRaw)) ? null : Number(parameterIndexRaw);
            if (!effectKey) {
                return;
            }

            const parentEntry = target?.closest?.(".effect-entry");
            if (parentEntry?.dataset?.statusLocked === "true") {
                return;
            }

            let value;
            if (target.type === "checkbox") {
                value = target.checked;
            } else if (target.multiple) {
                value = Array.from(target.selectedOptions ?? []).map((option) => option.value);
            } else if (target.dataset?.dtype === "Number") {
                value = Number(target.value ?? 0);
            } else {
                value = target.value;
            }

            void this._setEffectParameterValue(effectKey, parameterName, parameterIndex, value);
        });

        html.find(".effect-parameter-adjust").on("click", (event) => {
            event.preventDefault();
            const button = event.currentTarget ?? event.target;
            const effectKey = button?.dataset?.effectKey;
            if (!effectKey) {
                return;
            }

            const parentEntry = button?.closest?.(".effect-entry");
            if (parentEntry?.dataset?.statusLocked === "true") {
                return;
            }

            const parameterName = button?.dataset?.parameterName ?? null;
            const parameterIndexRaw = button?.dataset?.parameterIndex;
            const parameterIndex = Number.isNaN(Number(parameterIndexRaw)) ? null : Number(parameterIndexRaw);
            const selectorIndex = parameterIndexRaw ?? "";
            const delta = Number(button?.dataset?.delta ?? 0);
            if (Number.isNaN(delta)) {
                return;
            }

            let input = $(button)
                .closest(`.effect-entry[data-effect-key="${effectKey}"]`)
                .find(`.effect-parameter-input[data-parameter-index="${selectorIndex}"]`)
                .first();
            if (!input.length) {
                input = html
                    .find(
                        `.effect-entry[data-effect-key="${effectKey}"] .effect-parameter-input[data-parameter-index="${selectorIndex}"]`
                    )
                    .first();
            }
            if (!input.length) {
                return;
            }

            if (input.attr("type") === "checkbox") {
                const current = input.prop("checked") ?? false;
                input.prop("checked", !current);
            } else {
                const currentValue = Number(input.val()) || 0;
                input.val(currentValue + delta);
            }
            input.trigger("change");
        });

        html.find(".restore-rejected").on("click", (event) => {
            event.preventDefault();
            void this._restoreRejectedEffects();
        });

        if ((this.object.effectEntries ?? []).length > 0) {
            const selector = '.effect-entry[data-status-locked="false"]';
            const isLockedElement = (element) => element?.dataset?.statusLocked === "true";
            new foundry.applications.ux.ContextMenu.implementation(
                html[0],
                selector,
                [
                    {
                        name: game.i18n.localize("l5r5e.dice.roll_n_keep.effects.menu.reject"),
                        icon: '<i class="fas fa-ban"></i>',
                        callback: (element) => {
                            if (isLockedElement(element)) {
                                return;
                            }
                            const key = element.dataset.effectKey;
                            void this._setEffectStatus(key, RollnKeepDialog.EFFECT_ENTRY_STATUS.rejected);
                        },
                    },
                    {
                        name: game.i18n.localize("l5r5e.dice.roll_n_keep.effects.menu.executeNow"),
                        icon: '<i class="fas fa-play"></i>',
                        callback: (element) => {
                            if (isLockedElement(element)) {
                                return;
                            }
                            const key = element.dataset.effectKey;
                            void this._executeEffectEntryNow(key);
                        },
                    },
                    {
                        name: game.i18n.localize("l5r5e.dice.roll_n_keep.effects.menu.restore"),
                        icon: '<i class="fas fa-undo"></i>',
                        callback: () => {
                            void this._restoreRejectedEffects();
                        },
                    },
                ],
                { jQuery: false }
            );
        }

        const diceSelector = ".dice.draggable";
        html.find(diceSelector).on("click", this._onDiceKeep.bind(this));
        html.find(diceSelector).on("contextmenu", this._onDiceDiscard.bind(this));
    }

    /**
     * Handle dropped items
     */
    async _onDropItem(event) {
        // *** Everything below here is only needed if the sheet is editable ***
        if (!this.isEditable) {
            return;
        }

        const dropType = $(event.currentTarget).data("type");
        const json = event.dataTransfer.getData("text/plain");
        if (!json || !Object.values(RollnKeepDialog.CHOICES).some((choice) => !!choice && choice === dropType)) {
            return;
        }

        let data = null;
        try {
            data = JSON.parse(json);
        } catch (err) {
            return false;
        }

        if (!data) {
            return false;
        }

        const stepIndex = Number(data.step);
        const dieIndex = Number(data.die);
        const hasDieReference = Number.isInteger(stepIndex) && Number.isInteger(dieIndex);
        const isSwapPayload = data.choice === RollnKeepDialog.CHOICES.swap;
        const isKeepOrRerollDrop =
            dropType === RollnKeepDialog.CHOICES.keep || dropType === RollnKeepDialog.CHOICES.reroll;

        if (isSwapPayload && isKeepOrRerollDrop && !hasDieReference) {
            const dieType = data.dieType;
            const faceValue = data.face;
            if (!dieType || faceValue === undefined || faceValue === null) {
                return false;
            }

            const currentStepIndex = this.object.currentStep;
            if (!Array.isArray(this.object.dicesList[currentStepIndex])) {
                this.object.dicesList[currentStepIndex] = [];
            }

            const normalizedFace = Number.isNaN(Number(faceValue)) ? faceValue : Number(faceValue);
            this.object.dicesList[currentStepIndex].push({
                type: dieType,
                face: normalizedFace,
                choice: dropType,
            });

            this._synchronizeDicesListColumns(currentStepIndex);

            if (dropType === RollnKeepDialog.CHOICES.reroll) {
                // If reroll, we need to keep all the line by default
                this._forceChoiceForDiceWithoutOne(RollnKeepDialog.CHOICES.keep);
            }

            if (
                this._checkKeepCount(currentStepIndex) &&
                this._getKeepCount(currentStepIndex) === this.roll.l5r5e.keepLimit
            ) {
                this._forceChoiceForDiceWithoutOne(RollnKeepDialog.CHOICES.discard);
            }

            this.render(false);
            return false;
        }

        if (isSwapPayload) {
            return false;
        }

        if (!hasDieReference) {
            return false;
        }

        const current = this.object.dicesList?.[stepIndex]?.[dieIndex];
        if (!current) {
            return false;
        }

        delete current.newFace;

        switch (dropType) {
            case RollnKeepDialog.CHOICES.swap: {
                // Dice Type Ring/Skill
                const diceType = $(event.currentTarget).data("die");
                const diceNewFace = $(event.currentTarget).data("face");

                if (current.type !== diceType || current.face === diceNewFace) {
                    current.choice = RollnKeepDialog.CHOICES.nothing;
                    this.render(false);
                    return false;
                }

                current.newFace = diceNewFace;
                this._forceChoiceForDiceWithoutOne(RollnKeepDialog.CHOICES.keep);
                break;
            }

            case RollnKeepDialog.CHOICES.reroll:
                // If reroll, we need to keep all the line by default
                this._forceChoiceForDiceWithoutOne(RollnKeepDialog.CHOICES.keep);
                break;
        }

        current.choice = dropType;

        // Little time saving : if we reach the max kept dices, discard all dices without a choice
        if (
            this._checkKeepCount(this.object.currentStep) &&
            this._getKeepCount(this.object.currentStep) === this.roll.l5r5e.keepLimit
        ) {
            this._forceChoiceForDiceWithoutOne(RollnKeepDialog.CHOICES.discard);
        }

        this.render(false);
        return false;
    }

    /**
     * Handle dropping a swap face directly on a die result.
     * @param {DragEvent} event
     * @returns {boolean}
     * @private
     */
    _onSwapDrop(event) {
        event.preventDefault();
        event.stopPropagation();

        if (!this.isEditable) {
            return false;
        }

        const json = event.dataTransfer.getData("text/plain");
        if (!json) {
            return false;
        }

        let data = null;
        try {
            data = JSON.parse(json);
        } catch (err) {
            return false;
        }

        if (!data || data.choice !== RollnKeepDialog.CHOICES.swap) {
            return false;
        }

        const { step, die } = event.currentTarget.dataset ?? {};
        const stepIndex = Number(step);
        const dieIndex = Number(die);

        if (!Number.isInteger(stepIndex) || !Number.isInteger(dieIndex)) {
            return false;
        }

        if (stepIndex !== this.object.currentStep) {
            return false;
        }

        const current = this.object.dicesList?.[stepIndex]?.[dieIndex];
        if (!current) {
            return false;
        }

        delete current.newFace;

        let normalizedFace = data.face;
        if (typeof normalizedFace === "string") {
            const trimmedFace = normalizedFace.trim();
            if (trimmedFace !== "") {
                const numericFace = Number(trimmedFace);
                normalizedFace = Number.isNaN(numericFace) ? trimmedFace : numericFace;
            } else {
                normalizedFace = trimmedFace;
            }
        }

        if (current.type !== data.dieType || current.face === normalizedFace) {
            current.choice = RollnKeepDialog.CHOICES.nothing;
            this.render(false);
            return false;
        }

        current.newFace = normalizedFace;
        current.choice = RollnKeepDialog.CHOICES.swap;
        this._forceChoiceForDiceWithoutOne(RollnKeepDialog.CHOICES.keep);

        if (
            this._checkKeepCount(this.object.currentStep) &&
            this._getKeepCount(this.object.currentStep) === this.roll.l5r5e.keepLimit
        ) {
            this._forceChoiceForDiceWithoutOne(RollnKeepDialog.CHOICES.discard);
        }

        this.render(false);
        return false;
    }

    /**
     * Handle a direct dice selection to keep it
     * @param {MouseEvent} event
     * @returns {boolean}
     * @private
     */
    _onDiceKeep(event) {
        return this._onDiceDirectSelection(event, RollnKeepDialog.CHOICES.keep);
    }

    /**
     * Handle a direct dice selection to discard it
     * @param {MouseEvent} event
     * @returns {boolean}
     * @private
     */
    _onDiceDiscard(event) {
        return this._onDiceDirectSelection(event, RollnKeepDialog.CHOICES.discard);
    }

    /**
     * Apply a direct dice selection choice
     * @param {MouseEvent} event
     * @param {string} choice
     * @returns {boolean}
     * @private
     */
    _onDiceDirectSelection(event, choice) {
        event.preventDefault();
        event.stopPropagation();

        const target = event.currentTarget;
        const step = Number(target.dataset.step);
        const dieIndex = Number(target.dataset.die);

        if (!Number.isInteger(step) || !Number.isInteger(dieIndex)) {
            return false;
        }

        if (step !== this.object.currentStep) {
            return false;
        }

        const die = this.object.dicesList?.[step]?.[dieIndex];
        if (!die) {
            return false;
        }

        delete die.newFace;
        die.choice = choice;

        if (
            choice === RollnKeepDialog.CHOICES.keep &&
            this._checkKeepCount(step) &&
            this._getKeepCount(step) === this.roll.l5r5e.keepLimit
        ) {
            this._forceChoiceForDiceWithoutOne(RollnKeepDialog.CHOICES.discard);
        }

        this.render(false);
        return false;
    }

    /**
     * Return the current number of dices kept
     * @private
     */
    _getKeepCount(step) {
        return this.object.dicesList[step].reduce((acc, die) => {
            if (
                !!die &&
                [RollnKeepDialog.CHOICES.keep, RollnKeepDialog.CHOICES.reroll, RollnKeepDialog.CHOICES.swap].includes(
                    die.choice
                )
            ) {
                acc = acc + 1;
            }
            return acc;
        }, 0);
    }

    /**
     * Return true if a "_getKeepCount" is needed
     * @param {number} step
     * @returns {boolean}
     * @private
     */
    _checkKeepCount(step) {
        return (
            !this._haveChoice(step, [RollnKeepDialog.CHOICES.reroll, RollnKeepDialog.CHOICES.swap]) &&
            (step === 0 || this._haveChoice(step - 1, [RollnKeepDialog.CHOICES.reroll, RollnKeepDialog.CHOICES.swap]))
        );
    }

    /**
     * Return true if this choice exist in the current step
     * @param {number}          currentStep
     * @param {string|string[]} choices
     * @return {boolean}
     * @private
     */
    _haveChoice(currentStep, choices) {
        if (!Array.isArray(choices)) {
            choices = [choices];
        }
        return (
            this.object.dicesList[currentStep] &&
            this.object.dicesList[currentStep].some((e) => !!e && choices.includes(e.choice))
        );
    }

    /**
     * Discard all dices without a choice for the current step
     * @param {string} newChoice
     * @private
     */
    _forceChoiceForDiceWithoutOne(newChoice) {
        this.object.dicesList[this.object.currentStep]
            .filter((e) => !!e)
            .map((e) => {
                if (e.choice === RollnKeepDialog.CHOICES.nothing) {
                    e.choice = newChoice;
                }
                return e;
            });
    }

    /**
     * Return the current maximum number of dice columns across all steps.
     * @returns {number}
     * @private
     */
    _getDicesListColumnCount() {
        return this.object.dicesList.reduce((max, step) => {
            if (!Array.isArray(step)) {
                return max;
            }
            return Math.max(max, step.length);
        }, 0);
    }

    /**
     * Ensure the specified step has at least the provided length, filling missing entries with null.
     * @param {number} step
     * @param {number} length
     * @private
     */
    _ensureDicesListStepLength(step, length) {
        if (!Array.isArray(this.object.dicesList[step])) {
            this.object.dicesList[step] = [];
        }

        const stepArray = this.object.dicesList[step];
        while (stepArray.length < length) {
            stepArray.push(null);
        }
    }

    /**
     * Synchronize the length of every step with the provided source step.
     * @param {number} sourceStep
     * @private
     */
    _synchronizeDicesListColumns(sourceStep) {
        const targetLength = Array.isArray(this.object.dicesList?.[sourceStep])
            ? this.object.dicesList[sourceStep].length
            : 0;

        if (targetLength === 0) {
            return;
        }

        for (let index = 0; index < this.object.dicesList.length; index += 1) {
            if (index === sourceStep) {
                continue;
            }
            this._ensureDicesListStepLength(index, targetLength);
        }
    }

    /**
     * Initialize dice array for "step" if needed
     * @param {number} step
     * @private
     */
    _initializeDicesListStep(step) {
        const columnCount = this._getDicesListColumnCount();
        this._ensureDicesListStepLength(step, columnCount);
    }

    /**
     * Apply all choices to build the next step
     * @returns {Promise<void>}
     * @private
     */
    async _applyChoices() {
        let nextStep = this.object.currentStep + 1;
        const haveReroll = this._haveChoice(this.object.currentStep, [
            RollnKeepDialog.CHOICES.reroll,
            RollnKeepDialog.CHOICES.swap,
        ]);

        // Foreach kept dices, apply choices
        const newRolls = {};
        this.object.dicesList[this.object.currentStep].forEach((die, idx) => {
            if (!die) {
                return;
            }

            const currentRow = this.object.dicesList[this.object.currentStep][idx];

            switch (die.choice) {
                case RollnKeepDialog.CHOICES.keep:
                    if (haveReroll) {
                        // Reroll line add all kept into a new line
                        this._initializeDicesListStep(nextStep);
                        this.object.dicesList[nextStep][idx] = foundry.utils.duplicate(currentRow);
                        this.object.dicesList[nextStep][idx].choice = RollnKeepDialog.CHOICES.nothing;
                        currentRow.choice = RollnKeepDialog.CHOICES.discard;
                    } else if (game.l5r5e[die.type].FACES[die.face].explosive) {
                        // Exploding dice : add a new dice in the next step
                        if (!newRolls[die.type]) {
                            newRolls[die.type] = 0;
                        }
                        newRolls[die.type] += 1;
                    }
                    break;

                case RollnKeepDialog.CHOICES.reroll:
                    // Reroll : add a new dice in the next step
                    if (!newRolls[die.type]) {
                        newRolls[die.type] = 0;
                    }
                    newRolls[die.type] += 1;
                    break;

                case RollnKeepDialog.CHOICES.swap:
                    // FaceSwap : add a new dice with selected face in next step
                    this._initializeDicesListStep(nextStep);
                    this.object.dicesList[nextStep][idx] = {
                        type: currentRow.type,
                        face: currentRow.newFace,
                        choice: RollnKeepDialog.CHOICES.nothing,
                    };
                    delete currentRow.newFace;
                    break;
            }
        });

        // If new rolls, roll and add them
        if (Object.keys(newRolls).length > 0) {
            const newRollsResults = await this._newRoll(newRolls);
            this._initializeDicesListStep(nextStep);

            this.object.dicesList[this.object.currentStep].forEach((die, idx) => {
                if (!die) {
                    return;
                }
                if (
                    die.choice === RollnKeepDialog.CHOICES.reroll ||
                    (!haveReroll &&
                        die.choice === RollnKeepDialog.CHOICES.keep &&
                        game.l5r5e[die.type].FACES[die.face].explosive)
                ) {
                    this.object.dicesList[nextStep][idx] = newRollsResults[die.type].shift();
                }
            });
        }
    }

    /**
     * Transform a array (of int or object) into a formula ring/skill
     * @param rolls
     * @returns {string}
     * @private
     */
    _arrayToFormula(rolls) {
        const formula = [];
        if (rolls["RingDie"]) {
            const rings = Array.isArray(rolls["RingDie"]) ? rolls["RingDie"].length : rolls["RingDie"];
            formula.push(rings + "dr");
        }
        if (rolls["AbilityDie"]) {
            const skills = Array.isArray(rolls["AbilityDie"]) ? rolls["AbilityDie"].length : rolls["AbilityDie"];
            formula.push(skills + "ds");
        }
        if (formula.length < 1) {
            return "";
        }
        return formula.join("+");
    }

    /**
     * Roll all new dice at once (better performance) and return the result
     * @private
     */
    async _newRoll(newRolls) {
        const out = {
            RingDie: [],
            AbilityDie: [],
        };

        const roll = await new game.l5r5e.RollL5r5e(
            this._arrayToFormula(newRolls),
            {},
            {
                l5r5e: {
                    rollEffects: foundry.utils.deepClone(this.object.rollEffects),
                    effectResults: foundry.utils.deepClone(this.object.effectResults),
                    effectParameterDefs: foundry.utils.deepClone(this.object.effectParameterDefs ?? {}),
                    effectParameterValues: foundry.utils.deepClone(this.object.effectParameterValues ?? {}),
                    effectParameterModifiers: foundry.utils.deepClone(this.object.effectParameterModifiers ?? {}),
                },
            }
        );
        await roll.roll();

        // Show DsN dice for the new roll
        if (game.dice3d !== undefined) {
            await game.dice3d.showForRoll(
                roll,
                game.user,
                true,
                this._message.whisper.length === 0 ? null : this._message.whisper,
                this._message.blind
            );
        }

        roll.terms.forEach((term) => {
            if (!(term instanceof game.l5r5e.L5rBaseDie)) {
                return;
            }
            term.results.forEach((res) => {
                out[term.constructor.name].push({
                    type: term.constructor.name,
                    face: res.result,
                    choice: this._getDefaultChoiceForDie(term.constructor.name, res.result),
                });
            });
        });

        return out;
    }

    /**
     * Return the default choice for a die face based on the actor state.
     * @param {string} dieType
     * @param {number} dieFace
     * @returns {string|null}
     * @private
     */
    _getDefaultChoiceForDie(dieType, dieFace) {
        if (!this._isActorCompromised()) {
            return RollnKeepDialog.CHOICES.nothing;
        }

        const dieFaces = game.l5r5e?.[dieType]?.FACES;
        if (!dieFaces) {
            return RollnKeepDialog.CHOICES.nothing;
        }

        const hasStrife = Boolean(dieFaces?.[dieFace]?.strife);
        return hasStrife ? RollnKeepDialog.CHOICES.discard : RollnKeepDialog.CHOICES.nothing;
    }

    /**
     * Check if the actor linked to the roll is compromised.
     * @returns {boolean}
     * @private
     */
    _isActorCompromised() {
        const actor = this.roll?.l5r5e?.actor;
        if (!actor) {
            return false;
        }

        const statuses = actor.statuses;
        return typeof statuses?.has === "function" ? statuses.has("compromised") : false;
    }

    /**
     * Rebuild the message roll
     * @param {boolean} forceKeep If true keep all dice regardless their choice
     * @returns {Promise<void>}
     * @private
     */
    async _rebuildRoll(forceKeep = false) {
        // Get all kept dices + new (choice null)
        const diceList = this.object.dicesList.reduce((acc, step, stepIdx) => {
            const haveReroll =
                stepIdx > 0 &&
                this._haveChoice(stepIdx - 1, [RollnKeepDialog.CHOICES.reroll, RollnKeepDialog.CHOICES.swap]);
            step.forEach((die, idx) => {
                if (
                    !!die &&
                    (forceKeep ||
                        die.choice === RollnKeepDialog.CHOICES.keep ||
                        (haveReroll && die.choice === RollnKeepDialog.CHOICES.nothing))
                ) {
                    if (!acc[die.type]) {
                        acc[die.type] = [];
                    }
                    // Check previous dice, to add html classes in chat
                    if (stepIdx > 0 && this.object.dicesList[stepIdx - 1][idx]) {
                        switch (this.object.dicesList[stepIdx - 1][idx].choice) {
                            case RollnKeepDialog.CHOICES.reroll:
                                die.class = "rerolled";
                                break;
                            case RollnKeepDialog.CHOICES.swap:
                                die.class = "swapped";
                                break;
                        }
                    }
                    acc[die.type].push(die);
                }
            });
            return acc;
        }, {});

        // Re create a new roll
        const roll = await new game.l5r5e.RollL5r5e(this._arrayToFormula(diceList));
        roll.l5r5e = {
            ...this.roll.l5r5e,
            summary: roll.l5r5e.summary,
            history: this.object.dicesList,
        };
        roll.l5r5e.rollEffects = foundry.utils.deepClone(this.object.rollEffects);
        roll.l5r5e.effectResults = foundry.utils.deepClone(this.object.effectResults);
        roll.l5r5e.effectParameterDefs = foundry.utils.deepClone(this.object.effectParameterDefs ?? {});
        roll.l5r5e.effectParameterValues = foundry.utils.deepClone(this.object.effectParameterValues ?? {});
        roll.l5r5e.effectParameterModifiers = foundry.utils.deepClone(this.object.effectParameterModifiers ?? {});

        // Fill the data
        await roll.evaluate();

        // Modify results
        roll.terms.map((term) => {
            if (term instanceof game.l5r5e.L5rBaseDie) {
                term.results.map((res) => {
                    const die = diceList[term.constructor.name].shift();
                    res.result = die.face;

                    // add class to term result
                    if (die.class) {
                        res[die.class] = true;
                    }
                    return res;
                });
                term.l5rSummary();
            }
            return term;
        });

        // Recompute summary
        roll.l5rSummary();

        // Add roll & history to message
        this.roll = roll;
        this._syncEffectsFromRoll(roll);
    }

    /**
     * Send the new roll in chat and delete the old message
     * @returns {Promise<void>}
     * @private
     */
    async _toChatMessage() {
        // Keep old Ids
        const appOldId = this.id;
        const msgOldId = this._message.id;

        if (this.roll.l5r5e.isInitiativeRoll) {
            let msgOptions = {
                rnkRoll: this.roll,
                rollMode: game.l5r5e.HelpersL5r5e.getRollMode(this._message),
            };

            await this.roll.l5r5e.actor.rollInitiative({
                rerollInitiative: true,
                initiativeOptions: {
                    messageOptions: msgOptions,
                },
            });
            // Adhesive tape to get the message :/
            this.message = msgOptions.rnkMessage;
            delete msgOptions.rnkMessage;
        } else {
            // Send it to chat, switch to new message
            this.message = await this.roll.toMessage(
                {},
                { rollMode: game.l5r5e.HelpersL5r5e.getRollMode(this._message) }
            );
        }

        // Refresh viewers
        if (this._message) {
            game.l5r5e.sockets.updateMessageIdAndRefresh(appOldId, this._message.id);
        }

        // Delete old chat message related to this series
        if (game.settings.get(CONFIG.l5r5e.namespace, "rnk-deleteOldMessage")) {
            if (game.user.isFirstGM) {
                const message = game.messages.get(msgOldId);
                if (message) {
                    message.delete();
                }
            } else {
                game.l5r5e.sockets.deleteChatMessage(msgOldId);
            }
        }
    }

    /**
     * This method is called upon form submission after form data is validated
     * @param event    The initial triggering submission event
     * @param formData The object of validated form data with which to update the object
     * @returns        A Promise which resolves once the update operation has completed
     * @override
     */
    async _updateObject(event, formData) {
        // *** Everything below here is only needed if the sheet is editable ***
        if (!this.isEditable) {
            return;
        }

        // Last step strife choice
        if (this.roll?.l5r5e?.rnkEnded) {
            const rollData = this.roll.l5r5e;
            const summary = rollData.summary;
            const actor = rollData.actor;
            const targetActor = rollData.target?.actor || null;
            let updated = false;

            if (formData.strifeApplied !== undefined && rollData.applyFlags?.strifeToCharacter && actor?.isCharacterType) {
                const parsed = Number(formData.strifeApplied);
                const strifeApplied = Math.max(0, Number.isNaN(parsed) ? 0 : Math.round(parsed));
                const previousApplied = Number.isNaN(Number(rollData._strifeAppliedToActor))
                    ? 0
                    : Number(rollData._strifeAppliedToActor);
                const actorMod = strifeApplied - previousApplied;
                if (actorMod !== 0) {
                    await actor.update({
                        system: {
                            strife: {
                                value: Math.max(0, actor.system.strife.value + actorMod),
                            },
                        },
                    });
                    rollData.strifeApplied = strifeApplied;
                    rollData._strifeAppliedToActor = strifeApplied;
                    updated = true;
                } else {
                    rollData.strifeApplied = strifeApplied;
                }
            }

            if (formData.fatigueApplied !== undefined && rollData.applyFlags?.fatigueToCharacter && actor) {
                const parsed = Number(formData.fatigueApplied);
                const fatigueApplied = Math.max(0, Number.isNaN(parsed) ? 0 : Math.round(parsed));
                const previousApplied = Number.isNaN(Number(rollData._fatigueAppliedToActor))
                    ? 0
                    : Number(rollData._fatigueAppliedToActor);
                const actorMod = fatigueApplied - previousApplied;
                if (actorMod !== 0) {
                    await actor.update({
                        system: {
                            fatigue: {
                                value: Math.max(0, actor.system.fatigue.value + actorMod),
                            },
                        },
                    });
                    rollData.fatigueApplied = fatigueApplied;
                    rollData._fatigueAppliedToActor = fatigueApplied;
                    updated = true;
                } else {
                    rollData.fatigueApplied = fatigueApplied;
                }
            }

            const canModifyTarget = targetActor && (targetActor.isOwner || game.user.isGM);

            if (
                formData.targetStrifeApplied !== undefined &&
                rollData.applyFlags?.strifeToTarget &&
                canModifyTarget
            ) {
                const parsed = Number(formData.targetStrifeApplied);
                const targetStrifeApplied = Math.max(0, Number.isNaN(parsed) ? 0 : Math.round(parsed));
                const previous = rollData.targetStrifeApplied || 0;
                const targetMod = targetStrifeApplied - previous;
                if (targetMod !== 0) {
                    await targetActor.update({
                        system: {
                            strife: {
                                value: Math.max(0, targetActor.system.strife.value + targetMod),
                            },
                        },
                    });
                    rollData.targetStrifeApplied = targetStrifeApplied;
                    updated = true;
                }
            }

            if (
                formData.targetFatigueApplied !== undefined &&
                rollData.applyFlags?.fatigueToTarget &&
                canModifyTarget
            ) {
                const parsed = Number(formData.targetFatigueApplied);
                const targetFatigueApplied = Math.max(0, Number.isNaN(parsed) ? 0 : Math.round(parsed));
                const previous = rollData.targetFatigueApplied || 0;
                const targetMod = targetFatigueApplied - previous;
                if (targetMod !== 0) {
                    await targetActor.update({
                        system: {
                            fatigue: {
                                value: Math.max(0, targetActor.system.fatigue.value + targetMod),
                            },
                        },
                    });
                    rollData.targetFatigueApplied = targetFatigueApplied;
                    updated = true;
                }
            }

            rollData.hasAppliedResults =
                (rollData.strifeApplied || 0) > 0 ||
                (rollData.fatigueApplied || 0) > 0 ||
                (rollData.targetStrifeApplied || 0) > 0 ||
                (rollData.targetFatigueApplied || 0) > 0;

            await this._finalizeEffectEntries();

            if (updated) {
                await this._toChatMessage();
            }
            return this.close();
        }

        // Discard all dices without a choice for the current step
        this._forceChoiceForDiceWithoutOne(RollnKeepDialog.CHOICES.discard);

        // Apply all choices to build the next step
        await this._applyChoices();

        // *** Below this the current step become the next step ***
        this.object.currentStep++;

        // Rebuild the roll
        await this._rebuildRoll(false);

        // Send the new roll in chat and delete the old message
        await this._toChatMessage();

        // If a next step exist or strife, rerender, else close
        if (this.object.dicesList[this.object.currentStep] || this.roll.l5r5e.summary.strife > 0) {
            return this.render(false);
        }
        return this.close();
    }

    /**
     * Undo the last step choice
     * @returns {Promise<Application|any>}
     * @private
     */
    async _undoLastStepChoices() {
        // Find the step to work to
        this.object.currentStep = this.object.dicesList[this.object.currentStep]
            ? this.object.currentStep
            : Math.max(0, this.object.currentStep - 1);

        // If all clear, delete this step
        if (this._haveChoice(this.object.currentStep, RollnKeepDialog.CHOICES.nothing)) {
            if (this.object.currentStep === 0) {
                return;
            }
            this.object.dicesList.pop();
            this.object.dicesList = this.object.dicesList.filter((e) => !!e);
            this.object.currentStep--;
        }

        // Clear choices
        this.object.dicesList[this.object.currentStep]
            .filter((e) => !!e)
            .map((e) => {
                e.choice = RollnKeepDialog.CHOICES.nothing;
                return e;
            });

        // Restore any active effect entries to the inactive state so they can be re-applied.
        let effectEntries = Array.isArray(this.object.effectEntries) ? this.object.effectEntries : [];
        if (effectEntries.length === 0 && Array.isArray(this.object.effectResults) && this.object.effectResults.length > 0) {
            effectEntries = this.object.effectResults.map((stored) => this._createEffectEntryFromStored(stored));
            this.object.effectEntries = effectEntries;
        }

        effectEntries.forEach((entry) => {
            if (!entry) {
                return;
            }
            if (entry.status === RollnKeepDialog.EFFECT_ENTRY_STATUS.active) {
                entry.status = RollnKeepDialog.EFFECT_ENTRY_STATUS.inactive;
            }
        });

        this._persistEffectEntries();

        this.options.editable = this.isOwner;
        await this._rebuildRoll(true);
        await this._toChatMessage();
        return this.render(false);
    }

    /**
     * Handle execution of a chat card action via a click event on the RnK button
     * @param {Event} event The originating click event
     * @returns {Promise}   A promise which resolves once the handler workflow is complete
     */
    static async onChatAction(event) {
        event.preventDefault();
        event.stopPropagation();

        // Extract card data
        const button = $(event.currentTarget);
        button.attr("disabled", true);
        const card = button.parents(".l5r5e.item-display.dices-l5r");
        const messageId = card.parents(".chat-message").data("message-id");

        // Already open ? close it
        const app = game.l5r5e.HelpersL5r5e.getApplication(`l5r5e-roll-n-keep-dialog-${messageId}`);
        if (app) {
            app.close();
        } else {
            new RollnKeepDialog(messageId).render(true);
        }

        // Re-enable the button
        button.attr("disabled", false);
    }
}
