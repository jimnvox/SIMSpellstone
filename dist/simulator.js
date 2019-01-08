"use strict";

var DATA_UPDATER = (function () {

    var baseUrl = "https://spellstone.synapse-games.com";

    var newCards = {};
    var newBGEs = {};
    var newFusions = {};
    var lastUpdate = null;

    function updateData(callback, forceUpdate) {

        $("body").addClass("loading");
        $("#loadingSplash").html("Checking for New Cards...");
        // Don't update more than once per minute
        var now = Date.now();
        if (!lastUpdate || lastUpdate - now > 60000 || forceUpdate) {
            lastUpdate = now;
            newCards = {};
            var promises = [];
            promises.push(updateCards());
            //promises.push(updateBGEs());
            //promises.push(updateCampaignData());
            var finishedLoading = function finishedLoading() {
                saveCardCache();
                doneLoading();
                callback && callback();
            }
            $.when.apply($, promises).then(finishedLoading, finishedLoading);
        } else {
            if (callback) callback();
        }
    }

    function updateBGEs() {
        newBGEs = {};
        return jQuery.ajax({
            url: baseUrl + "/assets/battleground_effects.xml",
            success: function (doc) {
                var battlegrounds = doc.getElementsByTagName("battleground");
                for (var i = 0; i < battlegrounds.length; i++) {
                    var battleground = battlegrounds[i];
                    var id = getValue(battleground, "id");
                    var battlegroundData = getBattlegroundFromXML(battleground);

                    if (JSON.stringify(BATTLEGROUNDS[id]) !== JSON.stringify(battlegroundData)) {
                        newBGEs[id] = battlegroundData;
                        BATTLEGROUNDS[id] = battlegroundData;
                    }
                }
            },
            async: true,
            cache: false,
        });
    }

    function doneLoading() {
        $("body").removeClass("loading");
    }

    var cardFiles = [
        //"cards.xml"
        "cards_heroes.xml",
        "cards_premium_aether.xml",
        "cards_premium_chaos.xml",
        "cards_premium_wyld.xml",
        "cards_reward.xml",
        "cards_shard.xml",
        "cards_special.xml",
        "cards_standard.xml",
        "cards_story.xml",
        "fusion_recipes_cj2.xml"
    ];
    function updateCards() {
        var promises = [];
        for (var file = 0; file < cardFiles.length; file++) {
            var promise = jQuery.ajax({
                url: baseUrl + "/assets/" + cardFiles[file],
                success: function (doc) {
                    var trackNewCards = (typeof spoilers !== "undefined");
                    var units = doc.getElementsByTagName("unit");
                    for (var i = 0; i < units.length; i++) {
                        var unit = units[i];
                        var id = getValue(units[i], "id");
                        var cardData = getUnitFromXML(units[i]);
                        var newInfo = false;
                        if (!CARDS[id]) {
                            newInfo = true;
                        } else if (JSON.stringify(CARDS[id]) !== JSON.stringify(cardData)) {
                            newInfo = true;
                        }
                        if (newInfo) {
                            if (trackNewCards) {
                                spoilers[id] = true;
                            }
                            newCards[id] = cardData;
                        }
                        CARDS[id] = cardData
                    }
                    var fusions = doc.getElementsByTagName("fusion_recipe");
                    for (var i = 0; i < fusions.length; i++) {
                        var node = fusions[i];
                        var fusion = getValue(node, "card_id", false);
                        var resource = node.getElementsByTagName("resource")[0];
                        if (resource) {
                            var base = getValue(resource, "card_id", true);
                            if (!FUSIONS[base] || FUSIONS[base] != fusion) {
                                newFusions[base] = fusion;
                                FUSIONS[base] = fusion;
                            }
                        }
                    }
                },
                async: true,
                cache: false,
            });
            promises.push(promise);
        }

        return $.when.apply($, promises);
    }

    function saveCardCache() {
        if (typeof storageAPI !== "undefined") {
            var cardData = storageAPI.getField("GameData", "CardCache");

            if (cardData) {
                cardData.newCards = (cardData.newCards || {});
                cardData.newFusions = (cardData.newFusions || {});
                $.extend(cardData.newCards, newCards);
                $.extend(cardData.newFusions, newFusions);
            } else {
                cardData = {
                    newCards: newCards,
                    newFusions: newFusions
                };
            }
            cardData.lastUpdated = Date.now();

            storageAPI.setField("GameData", "CardCache", cardData);
        }
    }

    function getUnitFromXML(node) {
        var unit = {};
        unit.id = getValue(node, "id");
        unit.name = getValue(node, "name");
        addField(unit, node, "desc");
        unit.picture = getValue(node, "picture") || prefix(getValue(node, "asset_prefab"), "prefab_");
        if (!unit.picture) {
            var portrait = getValue(node, "portrait");
            if (portrait) {
                unit.picture = "portrait_" + portrait.toLowerCase().replace("portrait_", "");
            } else {
                unit.picture = "NotFound";
            }
        }
        var hidden_until = (getValue(node, "hidden_until") || getValue(node, "hidden_until_time"));
        if (hidden_until) unit.hidden_until = hidden_until + "000";
        unit.rarity = getValue(node, "rarity");
        unit.set = getValue(node, "set");
        unit.card_type = getValue(node, "card_type");
        addNumericField(unit, node, "shard_card");
        unit.type = getValue(node, "type") || 0;
        unit.sub_type = (getValues(node, "sub_type") || []);

        addNumericField(unit, node, "health");
        if (unit.card_type != "1") {
            addNumericField(unit, node, "attack");
            addNumericField(unit, node, "cost");
        }
        var upgrades = getUpgradesFromXML(node);
        unit.maxLevel = 1 + Object.keys(upgrades).length;

        unit.skill = getSkillsFromXML(node);
        unit.upgrades = upgrades;

        return unit;
    }

    function getSkillsFromXML(node) {
        var children = node.childNodes;
        var skills = [];
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (child.nodeName === "skill") {
                skills.push(getSkillFromXML(child));
            }
        }
        return skills;
    }

    function getSkillFromXML(node) {
        var skill = {
            id: getValue(node, "id", true)
        };
        addNumericField(skill, node, "x", true);
        addNumericField(skill, node, "mult", true);
        addNumericField(skill, node, "on_delay_mult", true);
        addField(skill, node, "y", true);
        addNumericField(skill, node, "z", true);
        addNumericField(skill, node, "c", true);
        addField(skill, node, "s", true);
        addField(skill, node, "all", true);
        return skill;
    }

    function getUpgradesFromXML(node) {
        var nodes = node.getElementsByTagName("upgrade");
        var upgrades = {};
        for (var i = 0; i < nodes.length; i++) {
            upgrades[i+2] = getUpgradeFromXML(nodes[i]);
        }
        return upgrades;
    }

    function getUpgradeFromXML(node) {
        var upgrade = {};
        addNumericField(upgrade, node, "attack");
        addNumericField(upgrade, node, "health");
        addNumericField(upgrade, node, "cost");
        addField(upgrade, node, "desc");
        upgrade.skill = getSkillsFromXML(node);
        return upgrade;
    }

    function getBattlegroundFromXML(node) {
        var battleground = {};
        battleground.id = getValue(node, "id");
        battleground.name = getValue(node, "name");
        battleground.desc = getValue(node, "desc");
        battleground.desc = getBool(node, "enemy_only");
        addField(battleground, node, "scale_with_level");
        addField(battleground, node, "starting_level");

        return battleground;
    }

    function addField(object, node, field, isAtt) {
        var value = getValue(node, field, isAtt);
        if (value != null && value.length > 0) {
            object[field] = value;
        }
    }
    
    function addNumericField(object, node, field, isAtt) {
        var value = getNumeric(node, field, isAtt);
        if (value >= 0) {
            object[field] = value;
        }
    }

    function getValue(node, name, isAtt) {
        if (isAtt) {
            return node.getAttribute(name);
        } else {
            var values = getValues(node, name);
            return (values ? values[0] : null);
        }
    }

    function getBool(node, name, isAtt) {
        var val;
        if (isAtt) {
            val = node.getAttribute(name);
        } else {
            var values = getValues(node, name);
            val = (values ? values[0] : null);
        }
        return (val == 1);
    }

    function prefix(value, prefix) {
        if (value) {
            return prefix + value;
        } else {
            return value;
        }
    }

    function getValues(node, name) {
        var values = null;
        var tags = $(node).children(name);
        if (tags.length > 0) {
            values = [];
            for (var i = 0; i < tags.length; i++) {
                values.push(tags[i].textContent);
            }
        }
        return values;
    }

    function getNumeric(node, tagName, isAtt) {
        var value = getValue(node, tagName, isAtt);
        if (value != null) {
            return Number(value);
        } else {
            return -1;
        }
    }

    function updateCampaignData() {
        var promises = [];
        promises.push(updateCampaigns());
        promises.push(updateMissions("/assets/missions.xml"));
        promises.push(updateMissions("/assets/missions_event.xml"));
        return $.when.apply($, promises);
    }

    function updateCampaigns() {
        jQuery.ajax({
            url: baseUrl + "/assets/campaigns.xml",
            success: function (doc) {
                var campaigns = doc.getElementsByTagName("campaign");
                for (var i = 0; i < campaigns.length; i++) {
                    var campaign = campaigns[i];
                    var id = getValue(campaign, "id");
                    if (!CAMPAIGNS[id]) {
                        CAMPAIGNS[id] = getCampaignFromXML(campaign);
                    }
                }
            },
            async: false,
            cache: false,
        });
    }

    function getCampaignFromXML(node) {
        var campaign = {
            id: getValue(node, "id"),
            name: getValue(node, "name"),
            missions: getCampaignMissionsFromXML(node)
        };
        return campaign;
    }

    function getCampaignMissionsFromXML(node) {
        var nodes = node.getElementsByTagName("mission_id");
        var missions = [];
        for (var i = 0; i < nodes.length; i++) {
            missions.push(nodes[i].innerHTML);
        }
        return missions;
    }

    function updateMissions(fileURL) {
        jQuery.ajax({
            url: baseUrl + fileURL,
            success: function (doc) {
                var missions = doc.getElementsByTagName("mission");
                for (var i = 0; i < missions.length; i++) {
                    var mission = missions[i];
                    var id = getValue(mission, "id");
                    if (!MISSIONS[id]) {
                        MISSIONS[id] = {
                            id: id,
                            name: getValue(mission, "name")
                        };
                    }
                }
            },
            async: false,
            cache: false,
        });
    }

    return {
        updateData: updateData
    };
})();;"use strict";

function loadCardCache() {
    var cardData = storageAPI.getField("GameData", "CardCache");
    if (cardData && cardData.lastUpdated > DataUpdated) {
        if (cardData.newCards) {
            $.extend(CARDS, cardData.newCards);
            $.extend(FUSIONS, cardData.newFusions);
        } else {
            CARDS = cardData.cards;
        }
        DataUpdated = cardData.lastUpdated;
    } else {
        // Clear cached info to reduce storage used
        var CARDS_cache = {
            newCards: {},
            newFusions: {},
            lastUpdated: Date.now()
        }
        storageAPI.setField("GameData", "CardCache", CARDS_cache);
    }
}

if (typeof String.prototype.format !== 'function') {
    String.prototype.format = function () {
        var args = arguments;
        return this.replace(/{(\d+)}/g, function (match, number) {
            return typeof args[number] != 'undefined'
              ? args[number]
              : match
            ;
        });
    };
}

if (typeof Object.assign !== 'function') {
    Object.assign = function (target) {
        'use strict';
        if (target == null) {
            throw new TypeError('Cannot convert undefined or null to object');
        }

        target = Object(target);
        for (var index = 1; index < arguments.length; index++) {
            var source = arguments[index];
            if (source != null) {
                for (var key in source) {
                    if (Object.prototype.hasOwnProperty.call(source, key)) {
                        target[key] = source[key];
                    }
                }
            }
        }
        return target;
    };
}

function parseInt(value) {
    return value >> 0;
}

var curry = function (uncurried) {
    var parameters = Array.prototype.slice.call(arguments, 1);
    return function () {
        return uncurried.apply(this, parameters.concat(
          Array.prototype.slice.call(arguments, 0)
        ));
    };
};


/* Inspired by https://davidwalsh.name/javascript-debounce-function */
Function.prototype.debounce = function (wait) {
    var func = this;
    var timeout;
    return function () {
        var context = this, args = arguments;
        var later = function () {
            timeout = null;
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};
Function.prototype.throttle = (function () {

    var _emptyFunc = function () { };

    return function (wait) {
        var func = this;
        var timeout;
        var fired = false;
        return function () {
            var context = this, args = arguments;
            if (timeout) {
                fired = false;
            } else {
                func.apply(context, args);
                fired = true;
                var later = function () {
                    timeout = null;
                    func.apply(context, args);
                };
                timeout = setTimeout(later, 250);
            }
        };
    };
}());

// GET variables
function _GET(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) == variable) {
            return decodeURIComponent(pair[1] ? pair[1] : '');
        }
    }
    return undefined;
}

function _DEFINED(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) == variable) {
            return true;
        }
    }
    return false;
}

// Time elapsed
function time_elapsed() {
    var t = (time_stop || Date.now());
    var v = (t - time_start) / 1000;
    v = v.toFixed(3);
    return v;
}

// Time elapsed for one batch
function batch_time_elapsed(time_started) {
    if (!time_started) time_started = time_start_batch;
    return timeSince(time_started);
}

function timeSince(start) {
    return ((Date.now() - start) / 1000).toFixed(3);
}

function shuffle(this_array) {
    var i = this_array.length, j, tempi, tempj;
    if (i == 0) return false;
    while (--i) {
        j = ~~(Math.random() * (i + 1));
        tempi = this_array[i];
        tempj = this_array[j];
        this_array[i] = tempj;
        this_array[j] = tempi;
    }
}

function initializeCard(card, p, newKey) {
    card.owner = p;
    card.timer = card.cost;
    card.health_left = card.health;
    // Setup status effects
    applyDefaultStatuses(card);
    card.key = newKey;
    if (!card.reusableSkills) card.resetTimers();
}

function copy_deck(original_deck) {
    var new_deck = {};
    new_deck.commander = original_deck.commander;
    new_deck.deck = copy_card_list(original_deck.deck);
    return new_deck;
}

function getDeckCards(original_deck, owner) {
    var new_deck = {};
    new_deck.commander = get_card_by_id(original_deck.commander);
    new_deck.deck = [];
    var list = original_deck.deck;
    var battlegrounds = SIMULATOR.battlegrounds.onCreate.filter(function (bge) {
        return !((owner === 'player' && bge.enemy_only) || (owner === 'cpu' && bge.ally_only));
    });
    for (var i = 0, len = list.length; i < len; i++) {
        new_deck.deck.push(get_card_apply_battlegrounds(list[i], battlegrounds));
    }
    return new_deck;
}

function copy_card_list(original_card_list) {
    var new_card_list = [];
    for (var key = 0, len = original_card_list.length; key < len; key++) {
        new_card_list[key] = original_card_list[key];
    }
    return new_card_list;
}

function cloneCard(original) {
    var copy = Object.create(original.__proto__);
    copy.id = original.id;
    copy.name = original.name;
    copy.attack = original.attack;
    copy.health = original.health;
    copy.maxLevel = original.maxLevel;
    copy.level = original.level;
    copy.cost = original.cost;
    copy.rarity = original.rarity;
    copy.card_type = original.card_type;
    copy.type = original.type;
    copy.sub_type = original.sub_type || [];
    copy.set = original.set;
    // Passives
    for (var id in SKILL_DATA) {
        var type = SKILL_DATA[id].type
        if (type === "passive" || type === "toggle") {
            copy[id] = original[id];
        }
    }
    if (original.flurry) {
        copy.skillTimers = [];
        copy.flurry = { id: original.flurry.id, c: original.flurry.c };
        copy.skillTimers.push(copy.flurry);
    }
    // Other skills
    copy.reusableSkills = original.reusableSkills;
    if (original.reusableSkills) {
        copy.skill = original.skill;
        copy.earlyActivationSkills = original.earlyActivationSkills;
        copy.onDeathSkills = original.onDeathSkills;
    } else {
        copy_skills(copy, original.skill, original.earlyActivationSkills, original.onDeathSkills);
    }
    copy.highlighted = original.highlighted;
    copy.runes = original.runes;
    if (!copy.runes) copy.runes = [];
    return copy;
}

var defaultStatusValues = {
    // Attack Modifiers
    attack_berserk: 0,
    attack_valor: 0,
    attack_rally: 0,
    attack_weaken: 0,
    attack_corroded: 0,
    corrosion_timer: 0,
    // Mark
    mark_target: 0,
    // Other Statuses
    // Numeric-Statuses
    barrier_ice: 0,
    corroded: 0,
    enfeebled: 0,
    enraged: 0,
    envenomed: 0,
	heartseeker: 0,
    imbued: 0,
	invisible: 0,
    nullified: 0,
    poisoned: 0,
    protected: 0,
    scorched: 0,
	warded: 0,
    // Boolean-Status
	jammed: false,
	jammedSelf: false,
    silenced: false,
    valor_triggered: false,
    dualstrike_triggered: false,
    ondeath_triggered: false,
	reanimated: false
}
function applyDefaultStatuses(card) {
	card.removeImbue();
	card.enhanced = {};
    for (var status in defaultStatusValues) {
        card[status] = defaultStatusValues[status];
    }
}

var CardPrototype;
var makeUnit = (function () {
    function modifySkillsPreRune(new_card, original_skills, skillModifiers, isToken) {
        new_card.highlighted = [];
        for (var i = 0; i < skillModifiers.length; i++) {
            var skillModifier = skillModifiers[i];
            if (skillModifier.modifierType == "statChange" && !isToken) {
            	for (var j = 0; j < skillModifier.effects.length; j++) {
            		var statChange = skillModifier.effects[j];
            		if (new_card.isInFaction(statChange.y)) {
                        Object.keys(statChange).forEach(function(stat) {
                            new_card[stat] = statChange[stat];
                        });
            		}
            	}
            }
        }
    }
    function modifySkillsPostRune(new_card, original_skills, skillModifiers, isToken) {
        new_card.highlighted = [];
        for (var i = 0; i < skillModifiers.length; i++) {
            var skillModifier = skillModifiers[i];
            if (skillModifier.modifierType == "evolve_skill") {
                for (var j = 0; j < skillModifier.effects.length; j++) {
                    var evolution = skillModifier.effects[j];
                    for (var key in original_skills) {
                        var skill = original_skills[key];
                        if (skill.id == evolution.id && skill.all == evolution.all) {
                            skill = copy_skill(skill);
                            skill.id = evolution.s;
                            skill.boosted = true;
                            original_skills[key] = skill;
                            new_card.highlighted.push(skill.id);
                        }
                    }
                }
            } else if (skillModifier.modifierType == "add_skill") {
                for (var j = 0; j < skillModifier.effects.length; j++) {
                    var addedSkill = skillModifier.effects[j];
                    if (new_card.isInFaction(addedSkill.y)) {
                        if (addedSkill.rarity && new_card.rarity != addedSkill.rarity) continue;

                        var new_skill = {};
                        new_skill.id = addedSkill.id;
                        new_skill.x = addedSkill.x || 0;
                        if (addedSkill.mult) {
                            if (addedSkill.base) {
                            	var base = getStatBeforeRunes(new_card, addedSkill.base);
                                new_skill.x += Math.ceil(addedSkill.mult * base);
                            } else {
                                new_skill.mult = addedSkill.mult;
                            }
                        }
                        new_skill.z = addedSkill.z;
                        new_skill.c = addedSkill.c;
                        new_skill.s = addedSkill.s;
                        new_skill.all = addedSkill.all;
                        if (addedSkill.card) new_skill.card = addedSkill.card;
                        if (addedSkill.level) new_skill.level = addedSkill.level;
                        new_skill.boosted = true;
                        if (addedSkill.mult && addedSkill.base && new_skill.x == 0) continue;
                        original_skills.push(new_skill);
                        new_card.highlighted.push(new_skill.id);
                    }
                }
            } else if (skillModifier.modifierType == "scale_attributes" && !isToken) {
            	for (var j = 0; j < skillModifier.effects.length; j++) {
            		var scaling = skillModifier.effects[j];
            		if (new_card.isInFaction(scaling.y)) {
            			var mult = scaling.mult;
            			var plusAttack = Math.ceil(new_card.attack * mult);
            			new_card.attack += plusAttack;
            			var plusHealth = Math.ceil(new_card.health * mult);
            			new_card.health += plusHealth;
            			scaleSkills(new_card, original_skills, mult);
            		}
              }
            } else if (skillModifier.modifierType == "scale_stat" && !isToken) {
            	for (var j = 0; j < skillModifier.effects.length; j++) {
            		var scaling = skillModifier.effects[j];
            		if (new_card.isInFaction(scaling.y)) {
            			new_card[skillModifier.scaledStat] += Math.ceil(getStatBeforeRunes(new_card, scaling.base) * scaling.mult);
            		}
            	}
            }
        }
    }

    function getStatBeforeRunes(card, statBase) {
    	return get_card_by_id({ id: card.id, level: card.level })[statBase];
    }

    function scaleSkills(new_card, skillList, mult) {
        for (var key in skillList) {
            var skill = skillList[key];
            if (skill.x) {
                skill = copy_skill(skill);
                skill.x += Math.ceil(skill.x * mult);;
                skill.boosted = true;
                skillList[key] = skill;
                new_card.highlighted.push(skill.id);
            }
        }
    }

    CardPrototype = {
        p: null,
        health_left: 0,
        timer: 0,
        key: undefined,

        initialize: function (position) {
            this.health_left = this.health;
            if (!this.isCommander()) {
                this.timer = this.cost;
                applyDefaultStatuses(this);
            }
            if (!this.reusableSkills) this.resetTimers();
        },

        // Handle timer and status effects that wear off at start of turn
        upkeep: function () {

            if (this.timer > 0) {
                this.timer--;
                if (debug) echo += debug_name(this) + ' reduces its timer<br>';

                // Check valor
                if (this.valor && this.isActive()) {
                    var enemy = field_o_assaults[i];
                    if (enemy && this.adjustedAttack() < enemy.adjustedAttack()) {
                        this.attack_valor = this.valor;
                        if (debug) echo += debug_name(this) + ' activates valor, boosting its attack by ' + this.valor + '<br/>';
                    } else if (debug) {
                        echo += debug_name(this) + ' activates valor but ';
                        if (!enemy) {
                            echo += 'there is no opposing enemy.<br/>'
                        } else {
                            echo += 'enemy is not strong enough.<br/>'
                        }
                    }
                }
            }

            this.enfeebled = this.envenomed + this.heartseeker;
            this.enraged = 0;
            this.protected = 0;
            this.barrier_ice = 0;
            this.enhanced = {};
            this.removeImbue();
        },

        // Handle status effects that trigger/wear off at end of turn
        endTurn: function () {
            this.attack_rally = 0;
            this.attack_weaken = 0;
            this.nullified = 0;
            this.silenced = false;
            this.jammed = false;
            this.jammedSelf = false;
            this.dualstrike_triggered = false;

            var poison = this.poisoned;
            if (poison) {
                do_damage(null, this, poison, null, function (source, target, amount) {
                    echo += debug_name(target) + ' takes ' + amount + ' poison damage';
                    if (!target.isAlive()) echo += ' and it dies';
                    echo += '<br>';
                });
            }

            var scorch = this.scorched;
            if (scorch) {
                amount = scorch.amount;
                if (scorch.timer > 1) {
                    scorch.timer--;
                } else {
                    this.scorched = 0;
                }

                do_damage(null, this, amount, null, function (source, target, amount) {
                    echo += debug_name(target) + ' takes ' + amount + ' scorch damage';
                    if (!target.isAlive()) echo += ' and it dies';
                    else if (!target.scorched) echo += ' and scorch wears off';
                    echo += '<br>';
                });
            }

            var corroded = this.corroded;
            if (corroded) {
                if (corroded.timer > 1) {
                    corroded.timer--;
                    var amount = Math.min(corroded.amount, this.permanentAttack());
                    this.attack_corroded = amount
                    echo += debug_name(this) + ' is corroded by ' + amount + '<br/>';
                } else {
                    this.corroded = 0;
                    this.attack_corroded = 0;
                    if (debug) {
                        echo += 'corrosion on ' + debug_name(this) + ' wears off<br/>';
                    }
                }
            }
        },

        countdownSkillTimers: function () {
            var timers = this.skillTimers;
            for (var i = 0, len = timers.length; i < len; i++) {
                var skill = timers[i];
                if (skill.countdown) {
                    skill.countdown--;
                    if (debug) {
                        if (skill.countdown) {
                            echo += debug_name(this) + ' charges ' + convertName(skill.id) + ' (ready in ' + skill.countdown + ' turns)<br/>';
                        } else {
                            echo += debug_name(this) + ' readies ' + convertName(skill.id) + '<br/>';
                        }
                    }
                }
            }
        },

        //Card ID is ...
        isCommander: function () {
            return (this.card_type == "1");
        },

        isAssault: function () {
            return (this.card_type == "2");
        },

        isTrap: function () {
            return (this.card_type == "3");
        },

        isBattleground: function () {
            return false;
        },

        // Alive
        // -.health_left > 0
        isAlive: function () {
            return (this.health_left > 0);
        },

        // Alive
        // -.health_left > 0
        isDamaged: function () {
            return (this.health_left < this.health);
        },

        // Active
        // - timer = 0
        isActive: function () {
            return (this.timer == 0);
        },

        // Active Next Turn
        // - timer <=1
        isActiveNextTurn: function () {
            return (this.timer <= 1);
        },

        // Inactive
        // - timer >=1
        isInactive: function () {
            return this.timer >= 1;
        },

        // Unjammed
        isUnjammed: function () {
            return !(this.jammed);
        },

        // Unsilenced
        isUnsilenced: function () {
            return !(this.silenced);
        },

        imbue: function (skill) {
            if (!this.imbued) {
                this.imbued = {};
            }
            var imbued = this.imbued;

            var imbueSkillsKey;
            var skillID = skill.id;
            var skillType = SKILL_DATA[skillID].type;
            switch (skillType) {
                case 'toggle':
                    this[skillID] = true;
                    this.imbued[skillID] = 1;
                    return;

                case 'passive':
                    this[skillID] += parseInt(skill.x);
                    this.imbued[skillID] = (this.imbued[skillID] || 0) + skill.x;
                    return;

                case 'flurry':
                    if (!this.flurry) {
                        this.flurry = skill;
                        this.flurry.countdown = 0;
                        this.imbued.flurry = true;
                    }
                    return;

                case 'onDeath':
                    imbueSkillsKey = 'onDeathSkills';
                    break;

                case 'earlyActivation':
                    imbueSkillsKey = 'earlyActivationSkills';
                    break;

                case 'activation':
                default:
                    imbueSkillsKey = 'skill';
                    break;
            }

            // Mark the first added skill index
            if (imbued[imbueSkillsKey] === undefined) {
                var original = this[imbueSkillsKey];
                imbued[imbueSkillsKey] = original.length;
                this[imbueSkillsKey] = original.slice();
            }
            this[imbueSkillsKey].push(skill);
        },

        scorch: function (amount) {
            var scorched = this.scorched;
            if (!scorched) {
                this.scorched = {
                    amount: amount,
                    timer: 2
                };
            } else {
                scorched.amount += amount;
                scorched.timer = 2;
            }
        },

        removeImbue: function () {
            var imbue = this.imbued;
            if (imbue) {
                for (var key in imbue) {
                    var imbuement = imbue[key];
                    if (key === "skill" || key === "earlyActivationSkills" || key === "onDeathSkills") {
                        this[key] = this[key].slice(0, imbuement);
                    } else {
                        this[key] -= imbuement;
                    }
                }
                this.imbued = 0;
            }
        },

        // Has at least one Enhanceable Activation Skill
        // - strike, protect, enfeeble, rally, repair, supply, siege, heal, weaken (unless they have on play/death/attacked/kill)
        hasSkill: function (s, all) {
            var target_skills;
            var skillType = SKILL_DATA[s].type;
            switch (skillType) {
                case 'toggle':
                case 'passive':
                case 'flurry':
                    return this[s];
                    break;

                case 'onDeath':
                    target_skills = this.onDeathSkills;
                    break;

                case 'earlyActivation':
                    target_skills = this.earlyActivationSkills;
                    break;

                case 'activation':
                default:
                    target_skills = this.skill
                    break;
            }
            for (var key in target_skills) {
                var skill = target_skills[key];
                if (skill.id !== s) continue;
                if (typeof all !== "undefined" && (skill.all||0) != all) continue;
                return true;
            }
            return false;
        },

        // Has Attack power
        // - attack > 0
        hasAttack: function () {
            return (this.adjustedAttack() > 0);
        },

        attackPlusBuffs: function () {
            return (this.attack + this.attack_rally + this.attack_berserk + this.attack_valor);
        },

        adjustedAttack: function () {
        	return (this.attack + this.attack_rally + this.attack_berserk + this.attack_valor - this.attack_weaken - this.attack_corroded);
        },

        permanentAttack: function () {
            return (this.attack + this.attack_berserk + this.attack_valor);
        },

        // Filters by faction
        isInFaction: function (faction) {
        	if (faction === undefined) return 1;
        	var factions = faction.split(',');
        	if (factions.length <= 1) {
        		if (this.type == faction) return 1;
        		if (this.sub_type.indexOf(faction.toString()) >= 0) return 1;
        		return 0;
        	} else {
        		for (var i = 0; i < factions.length; i++) {
        			if (!this.isInFaction(factions[i])) {
        				return 0;
        			}
        		}
        		return 1;
        	}
        },

        resetTimers: function () {
            for (var i = 0, len = this.skillTimers.length; i < len; i++) {
                this.skillTimers[i].countdown = 0;
            }
        },

        addRunes: function (runes) {
            addRunes(this, runes);
        },
    }
    for (var id in SKILL_DATA) {
        var type = SKILL_DATA[id].type
        if (type === "passive") {
            CardPrototype[id] = 0;
        } else if (type === "toggle") {
            CardPrototype[id] = false;
        }
    }
    applyDefaultStatuses(CardPrototype);

    return (function (original_card, unit_level, runes, skillModifiers, skillMult, isToken) {
        if (!unit_level) unit_level = 1;
        var card = Object.create(CardPrototype);

        card.id = original_card.id;
        card.name = original_card.name;
        card.attack = original_card.attack;
        card.health = original_card.health;
        card.maxLevel = original_card.maxLevel;
        card.level = ((unit_level > card.maxLevel) ? card.maxLevel : unit_level);
        card.cost = original_card.cost;
        card.rarity = original_card.rarity;
        card.card_type = original_card.card_type;
        card.type = original_card.type;
        card.sub_type = original_card.sub_type || [];
        card.set = original_card.set;
        var original_skills = original_card.skill;
        if (card.level > 1) {
            var upgrade;
            for (var key in original_card.upgrades) {
                upgrade = original_card.upgrades[key];
                // Upgrade levels only contain attack/health/delay if they changed at that level.
                if (upgrade.cost !== undefined) card.cost = upgrade.cost;
                if (upgrade.health !== undefined) card.health = upgrade.health;
                if (upgrade.attack !== undefined) card.attack = upgrade.attack;
                if (upgrade.desc !== undefined) card.desc = upgrade.desc;
                if (upgrade.skill.length > 0) original_skills = upgrade.skill;
                if (key == card.level) break;
            }
        }

        original_skills = original_skills.slice();

        if (skillModifiers && skillModifiers.length) {
            modifySkillsPreRune(card, original_skills, skillModifiers, isToken);
        }

        if (runes) {
            card.addRunes(runes);
            var runeMult = 1;
            if (skillModifiers) {
                skillModifiers.forEach(function(skillModifier) {
                    if (skillModifier.modifierType == "runeMultiplier") {
                        skillModifier.effects.forEach(function(effect) {
                            if (card.isInFaction(effect.y)) {
                                runeMult = parseInt(effect.mult);
                            }
                        });
                    }
                });
            }
            addRunesToSkills(original_skills, runes, runeMult);
        } else {
            card.runes = [];
        }

        // Apply BGEs
        if (skillModifiers && skillModifiers.length) {
            modifySkillsPostRune(card, original_skills, skillModifiers, isToken);
        }

        if (skillMult) {
            scaleSkills(card, original_skills, skillMult);
        }

        copy_skills_2(card, original_skills);

        return card;
    });
}());


var getEnhancement = function (card, s, base) {
    var enhancements = card.enhanced;
    var enhanced = (enhancements ? (enhancements[s] || 0) : 0);
    if (enhanced < 0) {
        enhanced = Math.ceil(base * -enhanced);
    }
    return enhanced;
};

var isImbued = function (card, skillID, i) {
    var activation = false;
    var imbueSkillsKey;
    var skillType = SKILL_DATA[skillID].type;
    switch (skillType) {
        case 'flurry':
        case 'toggle':
            return card.imbued[skillID];

        case 'passive':
            return (card[skillID] === card.imbued[skillID])

        case 'onDeath':
            imbueSkillsKey = 'onDeathSkills';
            break;

        case 'earlyActivation':
            imbueSkillsKey = 'earlyActivationSkills';
            break;

        case 'activation':
        default:
            imbueSkillsKey = 'skill';
            break;
    }


    // Mark the first added skill index
    if (card.imbued[imbueSkillsKey] !== undefined) {
        return (i >= card.imbued[imbueSkillsKey]);
    } else {
        return false;
    }
}

var addRunes = function (card, runes) {
    if (!card.runes) card.runes = [];
    for (var i = 0, len = runes.length; i < len; i++) {
        var runeID = runes[i].id;
        var statBoost = getRune(runeID).stat_boost;
        card.runes.push({
            id: runeID,
            stat_boost: statBoost,
        });

        for (var key in statBoost) {
            var boost = statBoost[key];
            if (key == "skill") {
                // Will be handled later
            } else {
                if (isNaN(boost)) {
                    boost = Math.max(Math.ceil(card[key] * boost.mult), (boost.min_bonus || 1));
                }
                card[key] += parseInt(boost);
            }
        }
    }
};

function addRunesToSkills(skills, runes, runeMult) {
    if (!runes) return;
    for (var i = 0, len = runes.length; i < len; i++) {
        var runeID = runes[i].id;
        var statBoost = RUNES[runeID].stat_boost;
        for (var key in statBoost) {
            var boost = statBoost[key];
            if (key == "skill") {
                var skillID = boost.id;
                var amount = boost.x;
                var mult = boost.mult;
                for (var s = 0; s < skills.length; s++) {
                    var skill = skills[s];
                    if (skill.id == skillID && (skill.all || 0) == (boost.all || 0)) {
                        skill = copy_skill(skill);
                        if (!amount && mult) amount = Math.ceil(skill.x * mult);
                        if (boost.min_bonus) amount = Math.max(amount, boost.min_bonus);
                        if (amount) skill.x += (parseInt(amount) * runeMult);
                        if (boost.c) skill.c -= Math.min(skill.c, (parseInt(boost.c) * runeMult));
                        skill.boosted = true;
                        skills[s] = skill;
                        break;
                    }
                }
            }
        }
    }
}

var getRune = function (rune_id) {
    return RUNES[rune_id];
};

var canUseRune = function (card, runeID) {
    var rune = getRune(runeID);

    var statBoost = rune.stat_boost;
    if (rune.faction_req) {
        if (!card.isInFaction(rune.faction_req)) {
            return false;
        }
    }
    for (var key in statBoost) {
        if (key == "skill") {
        	var skill = statBoost[key]
        	var all = (skill.all ? 1 : 0);
            if (!card.hasSkill(skill.id, all)) return false;
        }
    }
    return true;
}

function MakeSkillModifier(name, effect) {
  return {
    name: name,
    modifierType: effect.effect_type,
    effects: [effect]
  };
}

function MakeStatScaler(name, effect) {
  return {
    name: name,
    modifierType: "scale_stat",
    scaledStat: effect.effect_type.replace("scale_", ""),
    effects: [effect]
  };
}

var MakeOnPlayBGE = (function () {
    var OnPlayBGE = function (name, effect) {
        this.p = null;
        this.name = name;
        this.effect = effect;
        this.runes = [];
    }

    OnPlayBGE.prototype = {
        onCardPlayed: function (card) {
            SIMULATOR.onPlaySkills[this.effect.id](this, card, this.effect);
        },

        //Card ID is ...
        isCommander: function () {
            return false;
        },

        isAssault: function () {
            return false;
        },

        isBattleground: function () {
            return true;
        },
    };

    return (function (name, effects) {
        return new OnPlayBGE(name, effects);
    })
}());

var MakeTrap = (function () {
    var Trap = function (name, trap_card) {
        this.name = name;
        this.id = trap_card.id;
        this.base = trap_card.base;
        this.mult = trap_card.mult;
        this.target_deck = trap_card.target_deck;
        this.y = trap_card.y;
    }

    Trap.prototype = {
        onCardPlayed: function (card, p_deck, o_deck) {
            var deck = (this.target_deck === "opponent" ? o_deck : p_deck);
            if (card.isInFaction(this.y)) {

                var targets = [];
                for (var t = 0; t < deck.length; t++) {
                    var card = deck[t];
                    if (!card.trap) {
                        targets.push(card);
                    }
                }

                if (targets.length) {
                    // Create a trap card
                    var trapLevel = Math.ceil(card[this.base] * this.mult);
                    var trapInfo = makeUnitInfo(this.id, trapLevel);
                    var trap = get_card_by_id(trapInfo);

                    // Shuffle the trap into opponent's deck
                    var index = (~~(Math.random() * targets.length));
                    targets[index].trap = trap;

                    if (debug) {
                        echo += this.name + ' inserts ' + debug_name(trap) + ' into the opposing deck.<br/>';
                    }
                }
            }
        }
    };

    return (function (name, effects) {
        return new Trap(name, effects);
    })
}());

var getBattlegrounds = function (getbattleground, selfbges, enemybges, mapbges, campaignID, missionlevel, raidID, raidlevel) {

    // Set up battleground effects, if any
    var battlegrounds = {
        onCreate: [],
        onTurn: [],
        onCardPlayed: []
    };

    addBgesFromList(battlegrounds, getbattleground);
    addBgesFromList(battlegrounds, selfbges, 'player');
    addBgesFromList(battlegrounds, enemybges, 'cpu');
    addMapBGEs(battlegrounds, mapbges, 'player');

    if (campaignID) {
        addMissionBGE(battlegrounds, campaignID, missionlevel);
    } else if (raidID) {
        addRaidBGE(battlegrounds, raidID, raidlevel);
    }
    return battlegrounds;
}

function addBgesFromList(battlegrounds, getbattleground, player) {
    if (!getbattleground) return null;
    var selected = getbattleground.split(",");
    for (var i = 0; i < selected.length; i++) {
        var id = selected[i];
        var battleground = BATTLEGROUNDS[id];
        addBgeFromList(battlegrounds, battleground, player);
    }
}

function addMissionBGE(battlegrounds, campaignID, missionLevel) {
    var campaign = CAMPAIGNS[campaignID];
    if (campaign) {
        var id = campaign.battleground_id;
        if (id) {
            var battleground = BATTLEGROUNDS[id];
            missionLevel = Number(missionLevel) - 1; // Convert to 0-based
            if (!battleground.starting_level || Number(battleground.starting_level) <= missionLevel) {
                if (battleground.scale_with_level) {
                    battleground = JSON.parse(JSON.stringify(battleground));
                    var levelsToScale = missionLevel - Number(battleground.starting_level);
                    for (var i = 0; i < battleground.effect.length; i++) {
                        var effect = battleground.effect[i];
                        effect.mult = effect.base_mult + effect.mult * levelsToScale;
                    }
                }
                addBgeFromList(battlegrounds, battleground, 'cpu');
            }
        }
    }
}

function addRaidBGE(battlegrounds, raidID, raidLevel) {
    var bge_id = RAIDS[raidID].bge;
    if (bge_id) {
        var battleground = BATTLEGROUNDS[bge_id];
        if (battleground && Number(raidLevel) >= Number(battleground.starting_level)) {
            var enemy_only = battleground.enemy_only;

            for (var j = 0; j < battleground.effect.length; j++) {
                var effect = battleground.effect[j];
                var effect_type = effect.effect_type;
                if (effect_type === "skill") {
                    if (battleground.scale_with_level) {
                        var mult = battleground.scale_with_level * (raidLevel - battleground.starting_level + 1);
                    } else {
                        var mult = 1;
                    }
                    var bge = MakeBattleground(battleground.name, effect, mult);
                    bge.enemy_only = enemy_only;
                    battlegrounds.onTurn.push(bge);
                } else if (["evolve_skill", "add_skill", "scale_attributes", "statChange", "runeMultiplier"].indexOf(effect_Type) >= 0) {
                    var bge = MakeSkillModifier(battleground.name, effect);
                    bge.enemy_only = enemy_only;
                    battlegrounds.onCreate.push(bge);
                } else if (["scale_attack", "scale_health"].indexOf(effect_Type) >= 0) {
                  var bge = MakeStatScaler(battleground.name, effect);
                  bge.enemy_only = enemy_only;
                  battlegrounds.onCreate.push(bge);
                } else if (effect_type === "trap_card") {
                    var bge = MakeTrap(battleground.name, effect);
                    bge.enemy_only = enemy_only;
                    battlegrounds.onCardPlayed.push(bge);
                }
            }
        }
    }
}

function addMapBGEs(battlegrounds, mapbges, player) {
    if (!mapbges) return null;
    var selected = mapbges.split(",");
    for (var i = 0; i < selected.length; i++) {
        var parts = selected[i].split("-");
        var location = parts[0];
        var index = parts[1];
        var value = parts[2];
        var mapBGE = Object.keys(MAP_BATTLEGROUNDS).filter(function (id) {
            return MAP_BATTLEGROUNDS[id].location_id == location;
        })[0];
        mapBGE = MAP_BATTLEGROUNDS[mapBGE];
        var battleground = mapBGE.effects[index].upgrades[value];
        addBgeFromList(battlegrounds, battleground, player);
    }
}

function addBgeFromList(battlegrounds, battleground, player) {
    for (var j = 0; j < battleground.effect.length; j++) {
        var effect = battleground.effect[j];
        var effect_type = effect.effect_type;
        if (effect_type === "skill") {
            var bge = MakeBattleground(battleground.name, effect);
            if (player === 'player') bge.ally_only = true
            if (player === 'cpu') bge.enemy_only = true
            battlegrounds.onTurn.push(bge);
        } else if (["evolve_skill", "add_skill", "scale_attributes", "statChange", "runeMultiplier"].indexOf(effect_type) >= 0) {
            var bge = MakeSkillModifier(battleground.name, effect);
            if (player === 'player') bge.ally_only = true
            if (player === 'cpu') bge.enemy_only = true
            battlegrounds.onCreate.push(bge);
        } else if (["scale_attack", "scale_health"].indexOf(effect_type) >= 0) {
          var bge = MakeStatScaler(battleground.name, effect);
          if (player === 'player') bge.ally_only = true
          if (player === 'cpu') bge.enemy_only = true
          battlegrounds.onCreate.push(bge);
      } else if (effect_type === "trap_card") {
            var bge = MakeTrap(battleground.name, effect);
            if (player === 'player') bge.ally_only = true
            if (player === 'cpu') bge.enemy_only = true
            battlegrounds.onCardPlayed.push(bge);
        } else if (effect_type === "on_play") {
            var bge = MakeOnPlayBGE(battleground.name, effect.effect);
            bge.attacker = effect.attacker;
            bge.defender = effect.defender;
            bge.first_play = effect.first_play;
            if (player === 'player') bge.ally_only = true
            if (player === 'cpu') bge.enemy_only = true
            battlegrounds.onCardPlayed.push(bge);
        }
    }
}

var MakeBattleground = (function () {
    var Battleground = function (name, original_skills, mult) {
        this.name = name;
        copy_skills_2(this, [original_skills], mult);
    }

    Battleground.prototype = {
        p: null,
        name: null,
        runes: [],

        //Card ID is ...
        isCommander: function () {
            return false;
        },

        isAssault: function () {
            return false;
        },

        isBattleground: function () {
            return true;
        },

        resetTimers: function () {
            for (var i = 0, len = this.skillTimers.length; i < len; i++) {
                this.skillTimers[i].countdown = 0;
            }
        },
    }

    return (function (name, skill, mult) {
        return new Battleground(name, skill, mult);
    })
}());

function copy_skills_2(new_card, original_skills, mult) {
    new_card.skill = [];
    new_card.earlyActivationSkills = [];
    new_card.onDeathSkills = [];
    var skillTimers = [];
    var reusable = true;
    for (var key in original_skills) {
        var newSkill = original_skills[key];
        if (newSkill.c) {   // If skill has a timer, we need to clone it
            var copySkill = copy_skill(newSkill);
            setSkill_2(new_card, copySkill);
            skillTimers.push(copySkill);
            reusable = false;
        } else if (mult) {
            var copySkill = copy_skill(newSkill);
            //copySkill.x = ~~(copySkill.x * mult);   // Floor the results
            copySkill.x = Math.ceil(copySkill.x * mult);
            setSkill_2(new_card, copySkill);
        } else {            // If skill has no timer, we can use the same instance
            setSkill_2(new_card, newSkill);
        }
    }
    new_card.reusableSkills = reusable;
    new_card.skillTimers = skillTimers;
}

function setSkill_2(new_card, skill) {
    // These skills could have multiple instances
    var skillID = skill.id;
    var skillType = SKILL_DATA[skillID].type;
    switch (skillType) {
        case 'toggle':
            new_card[skillID] = true;
            return;

        case 'passive':
            new_card[skill.id] = (new_card[skill.id] | 0) + skill.x;
            break;

        case 'flurry':
            new_card[skill.id] = skill;
            break;

        case 'onDeath':
            new_card.onDeathSkills.push(skill);
            break;

        case 'earlyActivation':
            new_card.earlyActivationSkills.push(skill);
            break;

        case 'activation':
        default:
            new_card.skill.push(skill);
            break;
    }
}

function copy_skills(new_card, original_skills, original_earlyActivation_Skills, original_onDeathSkills) {
    new_card.skill = [];
    new_card.earlyActivationSkills = [];
    new_card.onDeathSkills = [];
    if (!new_card.skillTimers) new_card.skillTimers = [];

    copy_Skill_lists(new_card, new_card.skill, original_skills);
    copy_Skill_lists(new_card, new_card.earlyActivationSkills, original_earlyActivation_Skills);
    copy_Skill_lists(new_card, new_card.onDeathSkills, original_onDeathSkills);
}

function copy_Skill_lists(new_card, new_skills, original_skills) {
    for (var i = 0; i < original_skills.length; i++) {
        var originalSkill = original_skills[i];
        if (originalSkill.c) {   // If skill has a timer, we need to clone it
            var newSkill = copy_skill(originalSkill);
            new_skills.push(newSkill);
            new_card.skillTimers.push(newSkill);
        } else {            // If skill has no timer, we can use the same instance
            new_skills.push(originalSkill);
        }
    }
}

function copy_skill(original_skill) {
    var new_skill = {};
    new_skill.id = original_skill.id;
    new_skill.x = original_skill.x;
    new_skill.mult = original_skill.mult;
    new_skill.on_delay_mult = original_skill.on_delay_mult;
    new_skill.all = original_skill.all;
    new_skill.y = original_skill.y;
    new_skill.z = original_skill.z;
    new_skill.c = original_skill.c;
    new_skill.s = original_skill.s;
    return new_skill;
}

//Debug functions

// Dump deck contents
function debug_dump_decks() {
    //	if (!debug) return;
    /*
    echo += '<br><hr><br>';
    echo += '<b>Deck Hash:</b>';
    echo += '<br>';
    echo += '<input type="text" value="';
    echo += hash_encode(cache_player_deck);
    echo += '" onclick="this.select()" size="100">';
    echo += '<br><br>';
    echo += '<b>Card List:</b>';
    echo += '<br>';
    echo += '<input type="text" value="';
    echo += generate_card_list(cache_player_deck);
    echo += '" onclick="this.select()" size="100">';
    echo += '<br><br>';
    */
    echo += '<br>';
    echo += '<h1>Attacker</h1>';
    var current_card = get_card_by_id(cache_player_deck.commander);
    current_card.owner = 'player';
    current_card.health_left = current_card.health;
    echo += debug_name(current_card) + debug_skills(current_card) + '<br>';

    debug_dump_cards(cache_player_deck, 'player');

    var debug_cpu_deck;
    if (cache_cpu_deck) {
        debug_cpu_deck = cache_cpu_deck;
    }

    echo += '<br>';
    echo += '<h1>Defender</h1>';
    /*
    echo += '<i>Deck Hash:</i>';
    echo += '<br>';
    echo += '<input type="text" value="';
    echo += hash_encode(debug_cpu_deck);
    echo += '" onclick="this.select()" size="100">';
    echo += '<br>';
    echo += '<i>Card List:</i>';
    echo += '<br>';
    echo += '<input type="text" value="';
    echo += generate_card_list(debug_cpu_deck);
    echo += '" onclick="this.select()" size="100">';
    echo += '<br>';
    echo += '<u>Please note that Raid and Quest simulations randomize the enemy deck for each battle. Only one example enemy deck hash is generated.</u><br>';
    echo += '<br>';
    */
    var current_card = get_card_by_id(debug_cpu_deck.commander, true);
    current_card.owner = 'cpu';
    current_card.health_left = current_card.health;
    echo += debug_name(current_card) + debug_skills(current_card) + '<br>';
    debug_dump_cards(debug_cpu_deck, 'cpu');
    echo += '<br><hr><br>';
}

function debug_dump_cards(deck, player) {
    for (var key in deck.deck) {
        // Get cardID
        var unit_info = deck.deck[key];
        // Setup card for printing
        var current_card = get_card_by_id(unit_info, true);
        current_card.owner = player;
        current_card.key = undefined;
        current_card.health_left = current_card.health;
        current_card.timer = current_card.cost;
        // Echo card info
        echo += debug_name(current_card) + debug_skills(current_card);
        if (current_card.type) echo += ' <u>' + factions.names[current_card.type] + '</u>';
        var subFactions = current_card.sub_type;
        if (subFactions.length) {
            for (var i = 0; i < subFactions.length; i++) {
                echo += ' <u>' + factions.names[subFactions[i]] + '</u>';
            }
        }
        echo += '<br>';
    }
}

// Dump field contents
function debug_dump_field(field) {
    if (!debug) return;

    echo += '<font color="#666666">';

    var players = ['player', 'cpu'];

    for (var player_key = 0, p_len = players.length; player_key < p_len; player_key++) {
        var player_val = players[player_key];
        echo += '<br>';
        echo += player_val + '\'s assaults:<br>';
        var field_x_units = field[player_val].assaults;
        for (var card_key = 0, unit_len = field_x_units.length; card_key < unit_len; card_key++) {
            var current_card = field_x_units[card_key];
            echo += debug_name(current_card);
            echo += '(' + key + ')';
            echo += '<br>';
        }
        if (!field[player_val].assaults.length) echo += 'None<br>';
    }
    echo += '</font>';
    echo += '<br>';
}

// Output formatted name of card
function debug_name(card, hideStats) {
    if (card.owner == 'cpu') {
        var tag = 'i';
    } else {
        var tag = 'b';
    }
    var output = '<' + tag + '>';
    output += card.name;
    if (card.runes.length) output += "*";
    if (card.maxLevel > 1) output += '{' + card.level + '/' + card.maxLevel + '}';
    if (card.key !== undefined) output += ' (' + card.key + ')';
    output += '</' + tag + '>';
    if (!hideStats) {
        output += '<u>';
        if (card.isCommander()) {
            output += ' [';
            if (card.health_left !== undefined) output += debug_fraction(card.health_left);
            else output += card.health;
            output += ' HP]';
        } else if (card.isAssault()) {
            output += ' [';
            var atk = card.adjustedAttack();
            if (isNaN(atk) || atk == undefined) atk = card.attack;
            output += atk;
            output += '/';
            if (card.health_left !== undefined) output += debug_fraction(card.health_left);
            else output += card.health;
            output += '/';
            if (card.timer !== undefined) output += card.timer;
            else output += card.cost;
            output += ']';
        }
        output += '</u>';
    }

    return output;
}

function debug_fraction(value) {
    if (value > Math.floor(value)) {
        value = value.toFixed(1);
    }
    return value;
}

// Dump whatever card or array
function dump(card) {
    echo += '<pre>';
    print_r(card);
    echo += '</pre>';
}

//Returns written card list built from deck array
function generate_card_list(deck) {

    var cardlist = [];
    var copies = [];
    var priorities = [];

    var commander = get_card_by_id(deck.commander);
    cardlist.push(commander.name + "(" + commander.level + ")");
    copies.push(1);
    priorities.push(0);
    var lastidx = 0;
    for (var key in deck.deck) {
        var unit = deck.deck[key];
        var card = get_card_by_id(unit);

        if (!card) continue;

        var card_name = card.name + "(" + card.level + ")";
        if (card.runes.length) card_name += "*";

        if (cardlist[lastidx] == card_name) {
            copies[lastidx]++;
        } else {
            cardlist.push(card_name);
            copies.push(1);
            priorities.push(unit.priority);
            lastidx++;
        }
    }

    for (var i = copies.length - 1; i >= 0; i--) {
        var numCopies = copies[i];
        var priority = priorities[i];
        if (numCopies > 1) {
            cardlist[i] += "x" + numCopies;
        }
        if (priority > 0) {
            cardlist[i] += "=" + priority;
        }
    }

    cardlist = cardlist.join("; ");

    return cardlist;
}

function generate_play_list(cards) {
    var cardlist = [];
    for (var i = 0; i < cards.length; i++) {
        var unit = cards[i];
        var card = get_card_by_id(unit);

        if (!card) continue;
        var o = (i % 2 == 0 ? 'b' : 'i');
        var card_name = "<" + o + ">" + card.name + "(" + card.level + ")";
        if (card.runes.length) card_name += "*";
        card_name += "</" + o + ">";

        cardlist.push(card_name);
    }

    return "<td>" + cardlist.join("</td><td>") + "</td>";
}

//return skills in readable format
function debug_skills(card) {
    var skillText = [];

    for (var key in card.earlyActivationSkills) {
        skillText.push(debug_skill(card.earlyActivationSkills[key]));
    }
    for (var key in card.skill) {
        skillText.push(debug_skill(card.skill[key]));
    }
    for (var key in card.onDeathSkills) {
        skillText.push(debug_skill(card.onDeathSkills[key]));
    }
    debug_passive_skills(card, skillText);

    if (skillText.length > 0) {
        return ' <u>( ' + skillText.join(" | ") + ' )</u>';
    } else {
        return '';
    }
}

function debug_skill(skill) {
    var output = convertName(skill.id);
    if (skill.all) output += ' all';
    if (skill.y) output += ' ' + factions.names[skill.y];
    if (skill.s) output += ' ' + convertName(skill.s);
    if (skill.c) output += ' every ' + skill.c + ' turns';
    else if (skill.x) output += ' ' + skill.x;
    return output;
}

function debug_passive_skills(card, skillText) {
    var passiveSkills = Object.getOwnPropertyNames(SKILL_DATA).filter(function (skillID) {
        return ["passive", "toggle", "flurry"].indexOf(SKILL_DATA[skillID].type) >= 0;
    }).forEach(function (skill) {
        debugNonActivatedSkill(card, skill, skillText);
    });
}

function debugNonActivatedSkill(card, skillName, skillText) {
    var value = card[skillName];
    if (value) {
        skillText.push(convertName(skillName) + ' ' + value);
    }
}

function convertName(skillID) {
    var skillData = SKILL_DATA[skillID];
    return (skillData ? skillData.name : skillID);
}

var base64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!~";
var multiplierChars = "_*.'";
var runeDelimiter = "/";
var indexDelimiter = '-';
var priorityDelimiter = '|';

var noFusionInHash = {};
for (var id in CARDS) {
	if (id < 10000) {
		var fusion = FUSIONS[id];
		if (!fusion || Number(fusion) < 10000) {
			noFusionInHash[id] = true;
		}
    }
}

// Used to determine how to hash runeIDs
var maxRuneID = 1000;
function unitInfo_to_base64(unit_info) {

    var baseID = parseInt(unit_info.id);
    var level = (parseInt(unit_info.level) - 1);

    if (noFusionInHash[baseID]) {
    	var fusion = Math.floor(level / 7);
    	var level = level % 7;
    } else {
        var fusion = Math.floor(baseID / 10000);
        baseID %= 10000;
    }

    var runeID = 0;
    if (unit_info.runes.length) {
        runeID = parseInt(unit_info.runes[0].id);
        runeID %= 5000; // Runes IDs are all in the range of 5001 - 5500
    }

    var priority = (unit_info.priority || 0);

    var dec = baseID;
    dec = dec * 3 + fusion;
    dec = dec * 7 + level;
    dec = dec * maxRuneID + runeID;

    return decimal_to_base64(dec, 5);
}

function base64_to_unitInfo(base64) {

    var dec = base64_to_decimal(base64);

    var runeID = dec % maxRuneID;
    dec = (dec - runeID) / maxRuneID;

    var level = dec % 7;
    dec = (dec - level++) / 7;
    var fusion = dec % 3;
    dec = (dec - fusion) / 3;
    var unitID = dec;

    if (noFusionInHash[unitID]) {
    	level += fusion * 7;
    } else if (fusion > 0) {
        unitID = Number(fusion + '' + unitID);
    }

    var unit_info = makeUnitInfo(unitID, level);
    if (runeID > 0) {
        unit_info.runes.push({
            id: runeID + 5000
        });
    }

    return unit_info;
}

function decimal_to_base64(dec, len) {
    var base64 = '';
    //while (dec > 0) {
    for (var i = 0; i < len; i++) {
        var part = dec % 64;
        base64 += base64chars[part];// + base64;
        dec = (dec - part) / 64;
    }
    return base64;
}

function base64_to_decimal(base64) {
    var dec = 0;
    var orig = dec;
    for (var i = base64.length - 1; i >= 0; i--) {
        dec *= 64;
        var part = base64chars.indexOf(base64[i]);
        dec += part;
    }
    return dec;
}

function runeID_to_decimal(runeID) {
    if (runeID == 0) return 0;
    runeID = parseInt(runeID) % 5000;
    var runeLevel = runeID % 10;
    var runeType = (runeID - runeLevel) / 10;
    runeID = (runeType * 5) + runeLevel - 1;    // Make level 0-based
    runeID = (runeType * 5) + runeLevel - 1;    // Make level 0-based
    return runeID;
}

function base64_to_runeID(base64) {
    var dec1 = base64chars.indexOf(base64[0]);
    var dec2 = base64chars.indexOf(base64[1]) * 64;
    var runeID = dec1 + dec2;
    return decimal_to_runeID(runeID);
}

function decimal_to_runeID(decimal) {
    var runeLevel = decimal % 5;
    var runeType = (decimal - runeLevel) / 5;
    if (runeType == 0) return 0;
    var runeID = (runeType * 10) + runeLevel + 5001;    // Make level 0-based
    return runeID;
}

function numberToBase64(decimal) {
    var char1 = base64chars[Math.floor(decimal / 64)];
    var char2 = base64chars[decimal % 64];
    return char1 + char2;
}

function base64ToNumber(base64) {
    var dec1 = base64chars.indexOf(base64[0]) * 64;
    var dec2 = base64chars.indexOf(base64[1]);
    return dec1 + dec2;
}

function encode_multiplier(copies) {
    copies = copies - 2;    // Encoded as "2 + value"
    if (copies > 256) {
        return "";
    }
    var char1 = multiplierChars[Math.floor(copies / 64)];
    var char2 = base64chars[copies % 64];
    return char1 + char2;
}

function decode_multiplier(encoded) {
    var dec1 = multiplierChars.indexOf(encoded[0]) * 64;
    var dec2 = base64chars.indexOf(encoded[1]);
    return dec1 + dec2;
}

//Returns hash built from deck array
function hash_encode(deck) {

    var current_hash = [];
    var has_priorities = false;
    var has_indexes = false;
    var indexes = [];

    if (deck.commander) {
        current_hash.push(unitInfo_to_base64(deck.commander));
    }
    var copies = [1];
    var lastIndex = 0;
    for (var k in deck.deck) {
        var current_card = deck.deck[k];
        if (current_card.priority) {
            has_priorities = true;
        }
        if (current_card.index) {
            indexes.push(numberToBase64(current_card.index));
            has_indexes = true;
        }
        var tripvar = unitInfo_to_base64(current_card);
        // Short-circuit encoding of multiples for now
        if (false && tripvar == current_hash[lastIndex]) {
            copies[lastIndex]++;
        } else {
            current_hash.push(tripvar);
            copies.push(1);
            lastIndex++;
        }
    }

    if (has_priorities) {
        var priorities = priorityDelimiter;
        for (var k in deck.deck) {
            var current_card = deck.deck[k];
            if (current_card.priority) {
                priorities += current_card.priority;
            } else {
                priorities += '0';
            }
        }
        current_hash.push(priorities);
    }

    if (has_indexes) {
        indexes = indexDelimiter + indexes.join('');
        current_hash.push(indexes);
    }

    for (var i = 0; i < copies.length; i++) {
        var num = copies[i];
        if (num > 1) {
            current_hash[i] += encode_multiplier(num);
        }
    }
    current_hash = current_hash.join("");

    return current_hash;
}

function areEqual(unitInfo1, unitInfo2) {
    if ((!unitInfo1) != (!unitInfo2)) return false; // Silly null-check
    var hash1 = unitInfo_to_base64(unitInfo1);
    var hash2 = unitInfo_to_base64(unitInfo2);
    return (hash1 == hash2);
}

//Returns deck array built from hash
function hash_decode(hash) {

    var current_deck = { deck: [] };
    var unitInfo;
    var indexes;
    var entryLength = 5;
    if (hash.indexOf(indexDelimiter) > 0) {
        // Ignore indices for now
        indexes = hash.substr(hash.indexOf(indexDelimiter) + 1).match(/.{1,2}/g);
        hash = hash.substr(0, hash.indexOf(indexDelimiter));
    }
    var unitidx = 0;
    for (var i = 0; i < hash.length; i += entryLength) {
        if (multiplierChars.indexOf(hash[i]) == -1) {
            // Make sure we have valid characters
            var unitHash = hash.substr(i, entryLength);
            unitInfo = base64_to_unitInfo(unitHash);
            if (unitidx > 0 && indexes) unitInfo.index = base64ToNumber(indexes[unitidx - 1]); // Skip commander

            if (unitInfo) {
                if (loadCard(unitInfo.id)) {
                    // Repeat previous card multiple times
                    if (!current_deck.commander && is_commander(unitInfo.id)) {
                        current_deck.commander = unitInfo;
                        unitidx++;
                        // Add to deck
                    } else {
                        current_deck.deck.push(unitInfo);
                        unitidx++;
                    }
                } else {
                    console.log("Could not decode '" + unitHash + "' (" + unitInfo.id + ")");
                }
            }
        } else {
            var multiplier = decode_multiplier(hash.substr(i, 2)) + 1;
            for (var n = 0; n < multiplier; n++) {
                var duplicate = makeUnitInfo(unitInfo.id, unitInfo.level, unitInfo.runes);
                if (indexes) {
                    duplicate.index = base64ToNumber(indexes[unitidx - 1]); // Skip commander
                }
                current_deck.deck.push(duplicate);
                unitidx++;
            }
            i -= (entryLength - 2); // Offset i so that the += unitLength in the loop sets it to the correct next index
        }
    }

    // Default commander to Elaria Captain if none found
    if (!current_deck.commander) {
        current_deck.commander = elariaCaptain;
    }

    return current_deck;
}

// Convert card list into an actual deck
// - assume that first card is always commander
// - possible delimiters include ; , :
// - sometimes name is not compvare
// - include common abbreviations, such as EMP, BoD, EQG, etc.
// - case-insensitive
// - recognize multiple copies of cards
// - if can't figure out what card it is, ignore it and move on
// - support raid-only and mission-only cards by using Dracorex[1042] notation
function load_deck_from_cardlist(list) {

    var current_deck = [];
    current_deck.deck = [];

    if (list) {
        //var delimiters = ';,:';
        var abbreviations = [];
        // Safety mechanism to prevent long loops
        if (list.length > 300) list = list.substr(0, 300);

        list = list.toString().toLowerCase();
        list = list.replace(/[\&\/\.\!\?\'-]/g, ''); // Replace random punctuation characters
        list = list.replace(/\s/g, '');              // Remove all whitespace
        list = list.split(/[,;:]/);

        var unit_definitions = CARDS;

        for (var i in list) {
            var current_card = list[i].toString();
            var unit = makeUnitInfo(1, 7);// Default all cards to max level if none is specified
            unit.priority = 0;
            var card_found = false;
            var current_card_upgraded = false;

            // Detect advanced prioritization
            if (current_card.toString().length > 3 && current_card.toString().match(/=[1-9][0-9]*$/)) {
                unit.priority = parseInt(current_card.substr(current_card.length - 1, 1));
                current_card = current_card.substr(0, current_card.length - 2);
            }

            var copies = 1;
            // Detect multiple copies
            var match;
            // Look for Nx at the beginning of the card name
            if (match = current_card.toString().match(/^[1-9]+x/)) {
                copies = parseInt(match[0]);
                current_card = current_card.substr(match[0].length);
                // Look for Nx at the end of the card name
            } else if (match = current_card.toString().match(/x[1-9]+$/)) {
                copies = parseInt(match[0].substr(1));
                current_card = current_card.substr(0, current_card.length - match[0].length);
            }

            // Look for (N) at the end to denote level
            if (match = current_card.toString().match(/\(([1-9]+)\).*/)) {
                unit.level = match[1];
                current_card = current_card.substr(0, current_card.length - match[0].length);
            }

            current_card = current_card.trim();

            // Use unit_id notation if available
            if (match = current_card.toString().match(/\[[1-9]+\]/)) {
                unit.id = match[0];
                if (is_commander(unit.id)) {
                    current_deck.commander = unit;
                } else {
                    while (copies > 0) {
                        current_deck.deck.push(unit);
                        copies--;
                    }
                }
                continue;
            }

            // Use abbreviation if available
            current_card = clean_name_for_matching(current_card);
            if (abbreviations[current_card]) current_card = abbreviations[current_card];
            current_card = clean_name_for_matching(current_card);

            // Match full name if available
            for (var k in unit_definitions) {
                var card = unit_definitions[k];
                unit.id = card.id;
                var current_name = clean_name_for_matching(card.name);

                if (current_name == current_card) {
                    if (is_commander(unit.id) && copies == 1) {
                        current_deck.commander = unit;
                    } else {
                        current_deck.deck.push(unit);
                        while (copies > 1) {
                            current_deck.deck.push(unit);
                            copies--;
                        }
                    }
                    card_found = true;
                    break;
                }
            }
            if (card_found) continue;

            // If no commanders yet, match partial name to commanders if available
            if (!current_deck.commander && copies == 1) {
                for (var k in unit_definitions) {
                    var card = unit_definitions[k];
                    unit.id = card.id;
                    if (!is_commander(unit.id)) continue;
                    var current_name = clean_name_for_matching(card.name);
                    if (current_name.indexOf(current_card) != -1) {
                        current_deck.commander = unit;
                        card_found = true;
                        break;
                    }
                }
            }
            if (card_found) continue;

            // Match partial name to non-commanders if available
            for (var k in unit_definitions) {
                var card = unit_definitions[k];
                unit.id = card.id;
                if (is_commander(unit.id)) continue;
                var current_name = clean_name_for_matching(card.name);
                if (current_name.indexOf(current_card) != -1) {
                    current_deck.deck.push(unit);
                    while (copies > 1) {
                        current_deck.deck.push(unit);
                        copies--;
                    }
                    card_found = true;
                    break;
                }
            }
            if (card_found) continue;
        }
    }

    // Default commander to Elaria Captain if none found
    if (!current_deck.commander) {
        current_deck.commander = elariaCaptain;
    }

    return current_deck;
}

function clean_name_for_matching(name) {
    name = name.toLowerCase();
    name = name.toString().replace(/[\&]/g, ',');
    name = name.toString().replace(/[\.\!\?]/g, '');
    name = name.toString().replace(/\s/g, '');
    name = name.toString().replace(/-/g, '');
    name = name.toString().replace(/\'/g, '');
    return name;
}

// Load mission deck
function load_deck_mission(id, level) {
    var missionInfo = MISSIONS[id];
    if (missionInfo) {
        return load_preset_deck(missionInfo, level, 6);
    } else {
        return 0;
    }
}

function load_deck_raid(id, level, maxedAt) {
    if (!maxedAt) maxedAt = 25;
    var raidInfo = RAIDS[id];
    if (raidInfo) {
        var newRaidInfo = {
            commander: raidInfo.commander,
            deck: raidInfo.deck.card
        }
        return load_preset_deck(newRaidInfo, level, Number(raidInfo.upgradeLevels));
    } else {
        return 0;
    }
}

var DoNotFuse = ["8005", "8006", "8007", "8008", "8009", "8010"];
function load_preset_deck(deckInfo, level, upgradeLevels) {

    var maxedAt = upgradeLevels + 1;
    if (!level) level = maxedAt;

    var current_deck = [];
    current_deck.deck = [];
    var commanderInfo = getPresetCommander(deckInfo, level);
    var commander = getPresetUnit(commanderInfo, level, maxedAt);   // Set commander to max level
    if (commanderInfo.possibilities) {
        commander.randomInfo = { possibilities: commanderInfo.possibilities, level: level, maxedAt: maxedAt };
    }
    current_deck.commander = commander;
    var presetDeck = deckInfo.deck;

    var deck = current_deck.deck;
    for (var current_key in presetDeck) {
        var unitInfo = presetDeck[current_key];
        var unit = getPresetUnit(unitInfo, level, maxedAt);
        if (unit) {
            deck.push(unit);
        }
    }

    var maxUpgradePoints = getMaxUpgradePoints(deck);
    var upgradePoints = getUpgradePoints(level, maxedAt, maxUpgradePoints);
    if (level > 1 && level < maxedAt) {
        var canFuse = deck.slice();
        while (upgradePoints > 0 && canFuse.length > 0) {
            var index = Math.floor(Math.random() * canFuse.length);
            if (upgradeCard(canFuse[index])) {
                upgradePoints--;
            } else {
                canFuse.splice(index, 1);
            }
        }
    }

    return current_deck;
}

function update_preset_deck(deck) {

    var randomizationInfo = deck.commander.randomInfo;
    if (randomizationInfo) {
        var possibilities = randomizationInfo.possibilities;
        var newCommander = ~~(Math.random() * possibilities.length);
        var unit = getPresetUnit(possibilities[newCommander], randomizationInfo.level, randomizationInfo.maxedAt);
        unit.randomInfo = randomizationInfo;
        deck.commander = unit;
    }

    var cpu_cards = deck.deck;
    for (var i = 0, len = cpu_cards.length; i < len; i++) {
        var unit = cpu_cards[i];
        var randomizationInfo = unit.randomInfo;
        if (randomizationInfo) {
            unit = getPresetUnit(randomizationInfo.unitInfo, randomizationInfo.level, randomizationInfo.maxedAt);
            unit.randomInfo = randomizationInfo;
            cpu_cards[i] = unit;
        }
    }
    return getDeckCards(deck, 'cpu');
}

function getPresetCommander(deckInfo, level) {
    level = parseInt(level);
    var commander = deckInfo.commander;
    if (commander.card) {
        var possibilities = [];
        for (var i = 0; i < commander.card.length; i++) {
            var card = commander.card[i];
            var minLevel = parseInt(card.min_mastery_level) || 0;
            var maxedAt = parseInt(card.max_mastery_level) || 999;
            if (level >= minLevel && level <= maxedAt) {
                possibilities.push(card);
            }
        }
        var chosen = ~~(Math.random() * possibilities.length)
        commander = possibilities[chosen];
        commander.possibilities = possibilities;
    }
    return commander;
}

function getUpgradePoints(level, maxedAt, maxUpgradePoints) {
    var percentCompvare;
    if (maxedAt == 7) {
        percentCompvare = (level - 1) / (maxedAt - 1);
    } else {
        percentCompvare = (level / maxedAt);
    }
    var points = Math.ceil(maxUpgradePoints * percentCompvare);
    return points;
}

function getMaxUpgradePoints(deck) {
    var maxUpgradePoints = 0;
    for (var i = 0; i < deck.length; i++) {
        var unit = deck[i];
        var card = get_card_by_id(unit);
        var maxFusions = getMaxFusions(card);
        var maxLevel = card.maxLevel;
        maxUpgradePoints += ((maxFusions + 1) * maxLevel - 1);
    }
    return maxUpgradePoints;
}

function getMaxFusions(unit) {
    var id = baseFusion(unit);
    var fusion = -1;
    while (typeof id !== "undefined") {
        fusion++;
        id = FUSIONS[id];
    }
    return fusion;
}

function baseFusion(unit) {
    var baseID = unit.id;
    var id;
    do {
        id = baseID;
        baseID = REVERSE_FUSIONS[id];
    } while (typeof baseID !== "undefined")
    return id;
}

function getPresetUnit(unitInfo, level, maxedAt) {
    level = parseInt(level);
    if (unitInfo.mastery_level && level < parseInt(unitInfo.mastery_level)) return null;
    if (unitInfo.remove_mastery_level && level >= parseInt(unitInfo.remove_mastery_level)) return null;

    var cardID = unitInfo.id;
    var random = false;
    if (!cardID) {
        cardID = getRandomCard(unitInfo);
        random = true;
    }
    var unitLevel = (unitInfo.level || 1);

    if (level >= maxedAt) {
        unitLevel = 7;
        if (canFuse(cardID)) {
            cardID = fuseCard(cardID);
        }
    } else if (level > 1 && is_commander(cardID)) {
    	var maxUpgrades = (Number(loadCard(cardID).rarity) + 1);
    	var upgradesPerLevel = maxUpgrades / (maxedAt - 1);
    	var levelsFromBase = level - 1;
    	unitLevel = Math.ceil(upgradesPerLevel * levelsFromBase);
    }

    var unit = makeUnitInfo(cardID, unitLevel);

    if (random) {
        unit.randomInfo = { unitInfo: unitInfo, level: level, maxedAt: maxedAt };
    }
    return unit;
}

function getRandomCard(unitInfo) {
    var possibilities = [];
    for (var id in CARDS) {
        if (REVERSE_FUSIONS[id]) continue;
        var card = CARDS[id];
        if (card.card_type == '1') {
            continue;
        }
        if (unitInfo.max_rarity && Number(unitInfo.max_rarity) < Number(card.rarity) ||
            unitInfo.min_rarity && Number(unitInfo.min_rarity) > Number(card.rarity)) {
            continue;
        }
        if (unitInfo.type && !(unitInfo.type == card.type || card.sub_type.indexOf(unitInfo.type.toString()) >= 0)) {
            continue;
        }
        if (unitInfo.set) {
            var sets = unitInfo.set.split(",");
            if (sets.indexOf(card.set) < 0) {
                continue;
            }
        }
        possibilities.push(id);
    }
    var chosen = ~~(Math.random() * possibilities.length)
    return possibilities[chosen];
}

function upgradeCard(unitInfo) {
    var maxLevel = (parseInt(loadCard(unitInfo.id).rarity) + 2);
    if (unitInfo.level == maxLevel) {
        if (canFuse(unitInfo.id)) {
            unitInfo.id = fuseCard(unitInfo.id, 1);
            unitInfo.level = 1;
        } else {
            return false;
        }
    } else {
        unitInfo.level++;
    }
    return true;
}

function canFuse(cardID) {
    if (DoNotFuse.indexOf(cardID) > -1) {
        return false;
    } else if (is_commander(cardID)) {
        return false;
    } else if (FUSIONS[cardID]) {
        return true;
    }
    return false;
}

function fuseCard(cardID, fusion) {
    if (DoNotFuse.indexOf(cardID) == -1) {
        // Fuse X number of times
        if (fusion) {
            for (var i = 0; i < fusion; i++) {
                cardID = doFuseCard(cardID);
            }
            // Max fusion
        } else {
            while (true) {
                var fused = doFuseCard(cardID);
                if (cardID === fused) {
                    break;
                }
                cardID = fused;
            }
        }
    }
    return cardID;
}

function doFuseCard(cardID) {
    var fused = FUSIONS[cardID];
    if (fused) {
        return fused;
    } else {
        return cardID;
    }
}

var reverseFusions;
function getFusion(cardID) {
    var fusion = 0,
        base;

    if (!reverseFusions) getReverseFusions();

    do {
        base = reverseFusions[cardID];
        fusion++;
    } while (base);
    return fusion;
}

function getReverseFusions() {
    reverseFusions = {};
    for (var key in FUSIONS) {
        reverseFusions[FUSIONS[key]] = key;
    }
}

// Output card array
var get_card_apply_battlegrounds = function (id, battlegrounds, isToken) {
    battlegrounds = battlegrounds || SIMULATOR.battlegrounds.onCreate;
    return get_card_by_id(id, battlegrounds, null, isToken);
}

function get_skills(id, level) {
    var card = loadCard(id);
    var skills = card.skill;
    if (level > 1) {
        var upgrade;
        for (var key in card.upgrades) {
            upgrade = card.upgrades[key];
            if (upgrade.skill.length > 0) skills = upgrade.skill;
            if (key == level) break;
        }
    }
    return skills;
}

function get_card_by_id(unit, skillModifiers, skillMult, isToken) {

    var current_card = loadCard(unit.id);

    // Not a valid card
    if (!current_card) {
        console.log(unit.id + " not found");
        current_card = {};
        current_card.id = unit.id;
        current_card.level = unit.level;
        current_card.name = undefined;
        current_card.health = undefined;
        current_card.skill = [];
        return current_card;
    } else {
        // Add empty skill array to prevent skill condition-checking errors
        if (!current_card.skill) {
            current_card.skill = [];
        }
        var card = makeUnit(current_card, unit.level, unit.runes, skillModifiers, skillMult, isToken);

        if (unit.priority) card.priority = unit.priority;
        return card
    }
}

function get_slim_card_by_id(unit, getDetails) {

    var current_card = loadCard(unit.id);
    var new_card = {};
    if (current_card.card_type == "1") {
        new_card.isCommander = function () { return true; };
        new_card.isAssault = function () { return false; };
    } else {
        new_card.isCommander = function () { return false; };
        new_card.isAssault = function () { return true; };
    }
    // Not a valid card
    if (!current_card) {
        new_card.id = undefined;
        new_card.name = undefined;
        new_card.card_type = undefined;
        new_card.set = undefined;
        new_card.type = undefined;
        new_card.sub_type = [];
        new_card.level = undefined;
        new_card.maxLevel = undefined;
        if (getSkills) new_card.skill = [];
    } else {
        new_card.id = current_card.id;
        new_card.name = current_card.name;
        new_card.rarity = current_card.rarity;
        new_card.maxLevel = current_card.maxLevel;
        if (unit.level) {
            new_card.level = unit.level;
            if (new_card.level > new_card.maxLevel) new_card.level = new_card.maxLevel;
        } else new_card.level = 1;
        if (getDetails) {
            new_card.attack = current_card.attack;
            new_card.health = current_card.health;
            new_card.cost = current_card.cost;
            new_card.set = current_card.set;
            new_card.card_type = current_card.card_type;
            new_card.type = current_card.type;
            new_card.sub_type = current_card.sub_type || [];
            new_card.skill = current_card.skill;
            if (new_card.level > 1) {
                for (var key in current_card.upgrades) {
                    var upgrade = current_card.upgrades[key];
                    if (upgrade.cost !== undefined) new_card.cost = upgrade.cost;
                    if (upgrade.health !== undefined) new_card.health = upgrade.health;
                    if (upgrade.attack !== undefined) new_card.attack = upgrade.attack;
                    if (upgrade.desc !== undefined) new_card.desc = upgrade.desc;
                    if (upgrade.skill.length > 0) new_card.skill = upgrade.skill;
                    if (key == new_card.level) break;
                }
            }

            var runes = unit.runes;
            if (runes) {
                new_card.skill = new_card.skill.slice();
                addRunes(new_card, runes);
                addRunesToSkills(new_card.skill, runes);
            }
        }
    }

    return new_card;
}

function loadCard(id) {
    var card = CARDS[id];
    return card;
}

function getCardInfo(unit) {
    var id = unit.id;
    var level = unit.level;

    var original = CARDS[id];

    var card = Object.assign({}, original);
    if (level > 1) {
        if (level > 1) {
            for (var key in original.upgrades) {
                var upgrade = original.upgrades[key];
                if (upgrade.cost !== undefined) card.cost = upgrade.cost;
                if (upgrade.health !== undefined) card.health = upgrade.health;
                if (upgrade.attack !== undefined) card.attack = upgrade.attack;
                if (upgrade.desc !== undefined) card.desc = upgrade.desc;
                if (upgrade.skill.length > 0) card.skill = upgrade.skill;
                if (key == level) break;
            }
        }
    }
    card.level = level;
    card.maxLevel = original.maxLevel;
    return card;
}

// Output card name
function get_card_name_by_id(id) {
    var card = loadCard(id);
    if (!card) return 0;
    else return card.name;
}

function is_commander(id) {
    var card = loadCard(id);
    return (card && card.card_type == '1');
}

function is_assault(id) {
    var card = loadCard(id);
    return (card && card.card_type == '2');
}

function is_trap(id) {
    var card = loadCard(id);
    return (card && card.card_type == '3');
}

var makeUnitKey = function (unit) {
    var unitKey = unit.id + "_" + unit.level;
    if (unit.runes && unit.runes.length) {
        unitKey += "_" + unit.runes[0].id;
    }
    return unitKey;
}

function makeUnitInfo(id, level, runes) {
    var unit = {
        id: Number(id),
        level: Number(level),
        runes: []
    };
    if (runes) unit.runes = runes;
    return unit;
}

var elariaCaptain = makeUnitInfo(202, 1);

function getRarity(rarity) {
    return rarityStrings[rarity];
}

function getCurrentPage() {
    var currentPage = window.location.href;
    var pageEnd = currentPage.indexOf(".html");
    currentPage = currentPage.substring(0, pageEnd);
    var pageStart = currentPage.lastIndexOf("/") + 1;
    currentPage = currentPage.substring(pageStart).toLowerCase();
    return currentPage;
}

// Global arrays
var rarityStrings = [
    "",
    "Common",
    "Rare",
    "Epic",
    "Legendary",
    "Mythic"
];

var factions = {
    names: {
        0: 'Factionless',
        1: 'Aether',
        2: 'Chaos',
        3: 'Wyld',
        4: 'Frog',
        5: 'Elemental',
        6: 'Angel',
        7: 'Undead',
        8: 'Void',
        9: 'Dragon',
        10: 'Avian',
        11: 'Goblin',
        12: 'Seafolk',
        13: 'Insect',
        14: 'Bear',
        15: 'Token',
        16: 'Mecha',
        17: 'Knight',

        999: 'Tower'
    },
    IDs: {
        Factionless: 0,
        Aether: 1,
        Chaos: 2,
        Wyld: 3,
        Frog: 4,
        Elemental: 5,
        Angel: 6,
        Undead: 7,
        Void: 8,
        Dragon: 9,
        Avian: 10,
        Goblin: 11,
        Seafolk: 12,
        Insect: 13,
        Bear: 14,
        Token: 15,
        Mecha: 16,
    	Knight: 17,

        Tower: 999
    }
};;"use strict";

var SIM_CONTROLLER = (function () {

    function getConfiguration() {
        getdeck = $('#deck1').val();
        getordered = $('#ordered').is(':checked');
        getexactorder = $('#exactorder').is(':checked');

        getdeck2 = $('#deck2').val();
        getcampaign = $('#campaign').val();
        getmission = $('#mission').val();
        missionlevel = $('#mission_level').val();
        getraid = $('#raid').val();
        raidlevel = $('#raid_level').val();
        getordered2 = $('#ordered2').is(':checked');
        getexactorder2 = $('#exactorder2').is(':checked');
        surge = $('#surge').is(':checked');

        getsiege = $('#siege').is(':checked');
        tower_level = $('#tower_level').val();
        tower_type = $('#tower_type').val();

        if (BATTLEGROUNDS) {
            getbattleground = getSelectedBattlegrounds();
            selfbges = getSelectedBattlegrounds("self-");
            enemybges = getSelectedBattlegrounds("enemy-");
            mapbges = (getmission ? getSelectedMapBattlegrounds() : "");
        }

        sims_left = $('#sims').val() || 1;

        debug = $('#debug').is(':checked');
        play_debug = debug && $('#play_debug').is(':checked');
        if (play_debug) debug = false;
        mass_debug = $('#mass_debug').is(':checked');
        win_debug = $('#win_debug').is(':checked');
        loss_debug = $('#loss_debug').is(':checked');
        showAnimations = $('#animations').is(':checked');

        if ($('#auto_mode').length) {
            auto_mode = $('#auto_mode').is(':checked');
            SIMULATOR.user_controlled = !auto_mode;
        }

        // Not currently in UI - attacker's first card has +1 delay
        tournament = $("#tournament").is(":checked");
    }

    // Loops through all simulations
    // - keeps track of number of simulations and outputs status
    function debug_end(result) {

        var result = SIM_CONTROLLER.processSimResult();

        sims_left = 0;
        time_stop = new Date();


        var msg;
        var points = "";
        if (getdeck2) {
            points = " (" + SIMULATOR.calculatePoints() + " points)";
        }
        if (result == 'draw') {
            msg = '<br><h1>DRAW' + points + '</h1><br>';
        } else if (result) {
            msg = '<br><h1>WIN' + points + '</h1><br>';
        } else {
            msg = '<br><h1>LOSS' + points + '</h1><br>';
        }

        if (echo) {
            outputTurns(echo);
        }
        setSimStatus(msg);

        showUI();

        if(SIMULATOR.sendBattleUpdate) SIMULATOR.sendBattleUpdate(SIMULATOR.simulation_turns);

        if (SIM_CONTROLLER.end_sims_callback) SIM_CONTROLLER.end_sims_callback();
    }

    return {
        getConfiguration: getConfiguration,
        debug_end: debug_end,

        end_sims_callback: null,
        stop_sims_callback: null
    };
})();;"use strict";

var SIMULATOR = {};
(function () {

	// Play card
	function play_card(card, p, turn, quiet) {
		var field_p_assaults = field[p]['assaults'];

		// Not a valid card
		if (!card.id) return 0;

		var newKey = field_p_assaults.length;
		initializeCard(card, p, newKey);
		card.played = true;

		if (card.isAssault()) {
			field_p_assaults[newKey] = card;
		}

		if ((debug || play_debug) && !quiet) echo += debug_name(field[p].commander) + ' plays ' + debug_name(card) + '<br>';

		if (card.isTrap()) {
			doEarlyActivationSkills(card);
			activation_skills(card);
		} else {
			// Activate trap/onPlay battlegrounds
			for (var i = 0; i < battlegrounds.onCardPlayed.length; i++) {
				var battleground = battlegrounds.onCardPlayed[i];
				var o = (p === 'player' ? 'cpu' : 'player');

				if (battleground.defender) {
					if (!surge && p != 'cpu') continue;
					if (surge && p != 'player') continue;
					battleground.owner = o;
				} else if (battleground.attacker) {
					if (!surge && p != 'player') continue;
					if (surge && p != 'cpu') continue;
					battleground.owner = p;
				} else {
					if (battleground.enemy_only && p != 'cpu') continue;
					if (battleground.ally_only && p != 'player') continue;
					battleground.owner = p;
				}

				if (turn > 1 && battleground.first_play) {
					continue;
				}

				battleground.onCardPlayed(card, deck[p].deck, deck[o].deck);
			}
		}
		if (showAnimations) {
			drawField(field, null, null, turn);
		}
	};

	// Dead cards are removed from both fields. Cards on both fields all shift over to the left if there are any gaps.
	function remove_dead() {
		remove_dead_cards('player');
		remove_dead_cards('cpu');
	};

	// Shift over to the left if there are any gaps.
	function remove_dead_cards(p) {
		var units = field[p].assaults
		// Find first dead unit (don't need to update the keys of any units before this one)
		for (var key = 0, len = units.length; key < len; key++) {
			var current_assault = units[key];
			// Starting at the first dead unit, start shifting.
			if (!current_assault.isAlive()) {
				if (debug) echo += debug_name(current_assault) + ' <strong>is removed from field</strong><br>';
				var newkey = key;	// Store the new key value for the next alive unit
				for (key++; key < len; key++) {
					current_assault = units[key];
					// If this unit is dead, don't update newkey, we still need to fill that slot
					if (!current_assault.isAlive()) {
						if (debug) echo += debug_name(current_assault) + ' <strong>is removed from field</strong><br>';
					}
						// If this unit is alive, set its key to newkey, and then update newkey to be the next slot
					else {
						current_assault['key'] = newkey;
						units[newkey] = current_assault;
						newkey++;
					}
				}
				// We are done shifting slots, so set the length of the array (to get rid of the extra indices on the end)
				// and break out of the for-loop.
				units.length = newkey;
				break;
			}
		}
	};

	// Picks one target by random
	function choose_random_target(targets) {
		var targetIndex = ~~(Math.random() * targets.length)
		return [targets[targetIndex]];
	};

	function get_p(card) {
		return card.owner;
	};

	function get_o(card) {
		if (card.owner == 'cpu') return 'player';
		if (card.owner == 'player') return 'cpu';
	};

	// Deal damage to card
	// and keep track of cards that have died this turn
	function do_damage(source, target, damage, shatter, logFn) {
		if (damage >= target.health_left) {
			target.health_left = 0;
		} else {
			target.health_left -= damage;
		   
		}

		if (debug) logFn(source, target, damage);

		if (shatter) {
			iceshatter(target);
		}
		if (!target.isAlive() && source) {
			doOnDeathSkills(target, source);
		}
	};

	function iceshatter(src_card) {
		// Bug 27391 - If Barrier is partially reduced before being completely depleted, Iceshatter still deals full damage
		var amount = src_card.barrier_ice;
		//if (amount > src_card.barrier_ice) amount = src_card.barrier_ice;
		var o = get_o(src_card);
		var field_o = field[o];
		var target = field_o.assaults[src_card.key];
		if (!target || !target.isAlive()) target = field_o.commander;

		do_damage(src_card, target, amount, null, function (source, target, amount) {
			echo += debug_name(source) + "'s barrier shatters and hits " + debug_name(target) + ' for ' + amount + ' damage';
			echo += (!target.isAlive() ? ' and it dies' : '') + '<br>';
		});
	};

	function getActivatedSkill(skillMap, skillId) {
		return (skillMap[skillId] || notImplemented);
	}

	function notImplemented(src_card, skill) {
		if (debug) {
			var skillName = (SKILL_DATA[skill.id] ? SKILL_DATA[skill.id].name : skill.id);
			echo += debug_name(src_card) + ' attempts to use ' + skillName + ', but it is not implemented.<br>';
		}

		return 0;
	}

	// Empower, Legion, and Fervor all activate at the beginning of the turn, after commander
	function doEarlyActivations(field_p) {
		var field_p_assaults = field_p.assaults;
		for (var unit_key = 0, unit_len = field_p_assaults.length; unit_key < unit_len; unit_key++) {
			var current_unit = field_p_assaults[unit_key];

			if (current_unit.isAlive() && current_unit.isActive() && current_unit.isUnjammed()) {

				// Check for Dualstrike
				var dualstrike = current_unit.flurry;
				if (dualstrike && dualstrike.countdown === 0) {
					// Dual-strike does not activate if unit has 0 attack
					if (current_unit.hasAttack()) {
						dualstrike.countdown = dualstrike.c;
						current_unit.dualstrike_triggered = true;
					}
				}

				doEarlyActivationSkills(current_unit);
			}
		}
	};

	function doEarlyActivationSkills(source_card) {

		var skills = source_card.earlyActivationSkills;
		var len = skills.length;
		if (len == 0) return;

		if (source_card.silenced) {
			if (debug) echo += debug_name(source_card) + " is silenced and cannot use skills</br>"
			return;
		}

		var dualstrike = source_card.dualstrike_triggered;
		if (debug && dualstrike) {
			// var main attack loop deal with resetting timer
			echo += debug_name(source_card) + ' activates dualstrike<br>';
		}

		var activations = (dualstrike ? 2 : 1);
		var isAlive = makeLivenessCheck(source_card);
		for (var a = 0; a < activations; a++) {
			for (var i = 0; i < len && isAlive(); i++) {
				var skill = skills[i];
				if (!skill.countdown) {
					var skillFn = getActivatedSkill(earlyActivationSkills, skill.id);
					var affected = skillFn(source_card, skill);
					if (skill.c && affected > 0) {
						skill.countdown = skill.c;
					}

					if (showAnimations) {
						drawField(field, null, null, turn, source_card);
					}
				}
			}
		}
	};

	function alwaysTrue() {
		return true;
	}
	function makeLivenessCheck(maybeUnit) {
		if(maybeUnit.isAlive) {
			return maybeUnit.isAlive.bind(maybeUnit);
		} else {
			return alwaysTrue;
		}
	}

	function doOnDeathSkills(dying, killer) {

		if (dying.ondeath_triggered) return; // Check to make sure we don't trigger this twice
		var skills = dying.onDeathSkills;
		var len = skills.length;
		if (len == 0) return;

		for (var i = 0; i < len; i++) {
			var skill = skills[i];
			onDeathSkills[skill.id](dying, killer, skill);

			if (showAnimations) {
				drawField(field, null, null, turn, dying);
			}
		}

		dying.ondeath_triggered = true;
	};

	var passiveSkills = ['backlash', 'counter', 'counterburn', 'counterpoison', 'armored', 'evade', 'stasis'];
	function requiresActiveTurn(skillName) {
		return passiveSkills.indexOf(skillName) === -1;
	}

	function backlash(attacker, defender) {
		if(attacker.isAssault() && defender.isAlive()) {
			var baseDamage = defender.backlash;
			var enhancement = getEnhancement(defender, 'backlash', baseDamage);
			doCounterDamage(attacker, defender, 'Backlash', baseDamage, enhancement);
		}
	}

	function checkShroud(unit) {
		if(unit.isActive() && unit.isUnjammed()) {
			return 0;
		} else {
			return (unit.stasis || 0);
		}
	}

	var activationSkills = {

		burnself: function burnself(src_card, skill) {
			var scorch = skill.x;

			if (!src_card.scorched) {
				src_card.scorched = {
					amount: scorch,
					timer: 2
				};
			} else {
				src_card.scorched.amount += scorch;
				src_card.scorched.timer = 2;
			}
			if (debug) echo += debug_name(src_card) + ' inflicts scorch(' + scorch + ') on itself<br>';

			return 1;
		},
		// Scorch
		// - cone-shaped scorch
		scorchbreath: function scorchbreath(src_card, skill) {
			return activationSkills.burn(src_card, skill);
		},
		// Scorch
		// - Target must be an assault
		burn: function burn(src_card, skill) {

			var o = get_o(src_card);

			var field_o_assaults = field[o].assaults;

			var targets;
			switch (skill.id) {
				case 'scorchbreath':
					var startKey = Math.max(0, src_card.key - 1);
					var endKey = Math.min(field_o_assaults.length, src_card.key + 2);
					targets = field_o_assaults.slice(startKey, endKey);
					break;
				case 'burnself':
					targets = [src_card];
					break;
				default:
					targets = field_o_assaults.slice(src_card.key, src_card.key + 1);
					break;
			}
			if (!targets.length) return 0;

			var scorch = skill.x;
			var enhanced = getEnhancement(src_card, 'burn', scorch);
			scorch += enhanced;

			var affected = 0;
			for (var i = 0; i < targets.length; i++) {
				var target = targets[i];

				if (!target.scorched) {
					target.scorched = {
						amount: scorch,
						timer: 2
					};
				} else {
					target.scorched.amount += scorch;
					target.scorched.timer = 2;
				}
				if (debug) echo += debug_name(src_card) + ' inflicts scorch(' + scorch + ') on ' + debug_name(target) + '<br>';

				affected++;
			}

			return affected;
		},

		// Protect (Barrier)
		// - Can target specific faction
		// - Targets allied assaults
		// - Can be enhanced
		protect_ice: function (src_card, skill) {
			return activationSkills.protect(src_card, skill, "barrier_ice");
		},
		protect_seafolk: function (src_card, skill) {
			return activationSkills.protect(src_card, skill, null, null, true);
		},
		evadebarrier: function (src_card, skill) {
			return activationSkills.protect(src_card, skill, "invisible", function (target, amount) {
				return ' and imbues it with invisible ' + amount;
			});
		},
		protect: function (src_card, skill, additional, additionalDebug, onlyOnDelay) {

			var faction = skill['y'];

			var p = get_p(src_card);

			var protect = skill.x;
			var all = skill.all;

			var field_p_assaults = field[p]['assaults'];

			var targets = [];
			for (var key = 0, len = field_p_assaults.length; key < len; key++) {
				var target = field_p_assaults[key];
				if (target.isAlive() && target.isInFaction(faction)
				&& (!onlyOnDelay || !target.isActive())) {
					targets.push(key);
				}
			}

			// No Targets
			if (!targets.length) return 0;

			// Check All
			if (!all) {
				targets = choose_random_target(targets);
			}
			var enhanced = getEnhancement(src_card, skill.id, protect);
			protect += enhanced;

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {
				var target = field_p_assaults[targets[key]];

				// Check Nullify
				if (target.nullified) {
					target.nullified--;
					if (debug) echo += debug_name(src_card) + ' protects ' + debug_name(target) + ' but it is nullified!<br>';
					continue;
				}

				affected++;

				var protect_amt = protect;
				if (!protect_amt) {
					var mult = skill.mult;
					if (!target.isActive()) {
						mult += (skill.on_delay_mult || 0);
					}
					protect_amt = Math.ceil(target.health * mult);
				}

				target.protected += protect_amt;
				if (additional) {
					target[additional] = (target[additional] || 0) + protect_amt;
				}
				if (debug) {
					if (enhanced) echo += '<u>(Enhance: +' + enhanced + ')</u><br>';
					echo += debug_name(src_card) + ' barriers ' + debug_name(target) + ' by ' + protect_amt;
					if (typeof additionalDebug === "function") {
						echo += additionalDebug(target, protect_amt);
					}
					echo += '<br>';
				}
			}

			return affected;
		},

		// Heal
		// - Can target specific faction
		// - Targets allied damaged assaults
		// - Can be enhanced
		heal: function (src_card, skill) {

			var p = get_p(src_card);

			var faction = skill.y;
			var heal = skill.x;
			var all = skill.all;

			var field_p_assaults = field[p]['assaults'];

			var targets = [];
			for (var key = 0, len = field_p_assaults.length; key < len; key++) {
				var target = field_p_assaults[key];
				if (target.isAlive() && target.isInFaction(faction)
				&& (all || target.isDamaged())) {
					targets.push(key);
				}
			}

			// No Targets
			if (!targets.length) return 0;

			// Check All
			if (!all) {
				targets = choose_random_target(targets);
			}
			var enhanced = getEnhancement(src_card, skill.id, heal);
			heal += enhanced;

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {
				var target = field_p_assaults[targets[key]];

				// Check Nullify
				if (target.nullified) {
					target.nullified--;
					if (debug) echo += debug_name(src_card) + ' heals ' + debug_name(target) + ' but it is nullified!<br>';
					continue;
				}

				affected++;

				var heal_amt = heal;
				if (!heal_amt) {
					var mult = skill.mult;
					heal_amt = Math.ceil(target.health * mult);
				}

				if (heal_amt > target['health'] - target['health_left']) heal_amt = target['health'] - target['health_left'];
				target['health_left'] += heal_amt;
				if (debug) {
					if (enhanced) echo += '<u>(Enhance: +' + enhanced + ')</u><br>';
					echo += debug_name(src_card) + ' heals ' + debug_name(target) + ' by ' + heal_amt + '<br>';
				}
			}

			return affected;
		},

		// Strike (Bolt)
		// - Can target specific faction
		// - Targets enemy assaults
		// - Can be evaded
		// - Must calculate enfeeble/protect
		// - Can be enhanced
		poisonstrike: function (src_card, skill, poison) {
			return activationSkills.strike(src_card, skill, true);
		},
		strike: function (src_card, skill, poison) {

			var o = get_o(src_card);

			var strike = skill.x;
			var faction = skill.y;
			var all = skill.all;

			var field_x_assaults = field[o].assaults;

			var targets = [];
			for (var key = 0, len = field_x_assaults.length; key < len; key++) {
				var target = field_x_assaults[key];
				if (target.isAlive() && target.isInFaction(faction)) {
					targets.push(key);
				}
			}

			// No Targets
			if (!targets.length) return 0;

			// Check All
			if (!all) {
				targets = choose_random_target(targets);
			}

			var enhanced = getEnhancement(src_card, skill.id, strike);
			strike += enhanced;

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {
				var target = field_x_assaults[targets[key]];

				// Check Evade
				if (target.invisible) {
					target.invisible--;
					if (debug) echo += debug_name(src_card) + ' bolts ' + debug_name(target) + ' but it is invisible!<br>';
					continue;
				}

				affected++;

				var strike_damage = strike;

				// Check Protect/Enfeeble
				var damageInfo = modifySkillDamage(target, strike_damage);
				strike_damage = damageInfo.damage;
				var shatter = damageInfo.shatter;

				var poisonDamage = 0;
				if (strike_damage > 0 && poison && target.isAlive()) {
					if (strike > target['poisoned']) {
						poisonDamage = strike;
						target['poisoned'] = poisonDamage;
					}
				}

				do_damage(src_card, target, strike_damage, shatter, function (source, target, amount) {
					echo += '<u>(Strike: +' + skill.x;
					if (enhanced) echo += ' Enhance: +' + enhanced;
					echo += damageInfo.echo;
					echo += ') = ' + amount + ' damage</u><br>';
					echo += debug_name(source) + ' bolts ' + debug_name(target) + ' for ' + amount + ' damage';
					if (!target.isAlive()) {
						echo += ' and it dies';
					} else if (poisonDamage) {
						echo += ' and inflicts poison(' + poisonDamage + ') on it';
					}
					echo += '<br>';
				});

				if(target.backlash) {
					backlash(src_card, target);
				}
			}

			return affected;
		},

		// Intensify
		// - Can target specific faction
		// - Targets poisoned/scorched enemy assaults
		// - Can be evaded
		// - Can be enhanced
		intensify: function (src_card, skill, poison) {

			var o = get_o(src_card);

			var intensify = skill.x
			var faction = skill.y;
			var all = skill.all;

			var field_x_assaults = field[o].assaults;

			var targets = [];
			for (var key = 0, len = field_x_assaults.length; key < len; key++) {
				var target = field_x_assaults[key];
				if (target.isAlive() && target.isInFaction(faction)
				&& (target.scorched || target.poisoned)) {
					targets.push(key);
				}
			}

			// No Targets
			if (!targets.length) return 0;

			// Check All
			if (!all) {
				targets = choose_random_target(targets);
			}

			var enhanced = getEnhancement(src_card, skill.id, intensify);
			intensify += enhanced;

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {
				var target = field_x_assaults[targets[key]];

				var intensifiedFields = (target.scorched ? "scorch" : "");
				intensifiedFields += (target.poisoned ? (intensifiedFields ? " and poison" : "poison") : "");

				// Check Evade
				if (target.invisible) {
					target.invisible--;
					if (debug) echo += debug_name(src_card) + ' intensifies ' + intensifiedFields + ' on ' + debug_name(target) + ' but it is invisible!<br>';
					continue;
				}

				affected++;

				if (target.scorched) {
					target.scorched.amount += intensify;
				}
				if (target.poisoned) {
					target.poisoned += intensify;
				}

				if (debug) echo += debug_name(src_card) + ' intensifies ' + intensifiedFields + ' on ' + debug_name(target) + ' by ' + intensify + '<br>';
				
				if(target.backlash) {
					backlash(src_card, target);
				}
			}

			return affected;
		},

		// Ignite
		// - Can target specific faction
		// - Targets enemy assaults
		// - Can be evaded
		// - Can be enhanced
		ignite: function (src_card, skill, poison) {

			var o = get_o(src_card);

			var ignite = skill.x
			var faction = skill.y;
			var all = skill.all;

			var field_x_assaults = field[o].assaults;

			var targets = [];
			for (var key = 0, len = field_x_assaults.length; key < len; key++) {
				var target = field_x_assaults[key];
				if (target.isAlive() && target.isInFaction(faction)) {
					targets.push(key);
				}
			}

			// No Targets
			if (!targets.length) return 0;

			// Check All
			if (!all) {
				targets = choose_random_target(targets);
			}

			var enhanced = getEnhancement(src_card, skill.id, ignite);
			ignite += enhanced;

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {
				var target = field_x_assaults[targets[key]];

				// Check Evade
				if (target.invisible) {
					target.invisible--;
					if (debug) echo += debug_name(src_card) + ' ignites ' + debug_name(target) + ' but it is invisible!<br>';
					continue;
				}

				affected++;

				target.scorch(ignite);
				if (debug) echo += debug_name(src_card) + ' ignites(' + ignite + ') ' + debug_name(target) + '<br>';

				if(target.backlash) {
					backlash(src_card, target);
				}
			}

			return affected;
		},

		// Jam (Freeze)
		// - Has cooldown timer (only fires every x turns)
		// - Can target specific faction
		// - Targets active_next_turn, unjammed enemy assaults
		// - Can be evaded
		// - If evaded, cooldown timer is not reset (tries again next turn)
		jamself: function jamself(src_card, skill) {

			src_card.jammed = true;
			src_card.jammedSelf = true;
			if (debug) echo += debug_name(src_card) + ' freezes itself<br>';

			return 1;
		},
		jam: function jam(src_card, skill) {

			var p = get_p(src_card);
			var o = get_o(src_card);

			var all = skill.all;

			var field_x_assaults = field[o].assaults;

			var targets = [];

			for (var key = 0, len = field_x_assaults.length; key < len; key++) {
				var target = field_x_assaults[key];
				if (target.isAlive()
				&& (all || (target.isActiveNextTurn() && target.isUnjammed()))) {
					targets.push(key);
				}
			}

			// No Targets
			if (!targets.length) {
				return 0;
			}

			// Check All
			if (!all) targets = choose_random_target(targets);

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {
				var target = field_x_assaults[targets[key]];

				// Check Evade
				if (target.invisible) {
					target.invisible--;
					// Missed - retry next turn
					skill.countdown = 0;
					if (debug) echo += debug_name(src_card) + ' freezes ' + debug_name(target) + ' but it is invisible!<br>';
					continue;
				}

				affected++;

				target.jammed = true;
				if (debug) echo += debug_name(src_card) + ' freezes ' + debug_name(target) + '<br>';

				if(target.backlash) {
					backlash(src_card, target);
				}
			}

			return affected;
		},

		// Frostbreath
		// - Targets opposing enemy unit and any adjacent enemy units
		// - Can be evaded
		// - Must calculate enfeeble/protect
		// - Can be enhanced
		frost: function (src_card, skill) {

			var p = get_p(src_card);
			var o = get_o(src_card);

			var frost = skill.x;
			var enhanced = getEnhancement(src_card, skill.id, frost);
			frost += enhanced;

			var all = skill.all;

			var field_x_assaults = field[o]['assaults'];

			var targets = [];

			var i = src_card['key'] - 1;
			var end = i + 2
			for (; i <= end; i++) {
				var target = field_x_assaults[i];
				if (target && target.isAlive()) {
					targets.push(i);
				}
			}

			// No Targets
			if (!targets.length) return 0;

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {
				var target = field_x_assaults[targets[key]];

				// Check Evade
				if (target.invisible) {
					target.invisible--;
					if (debug) echo += debug_name(src_card) + ' breathes frost at ' + debug_name(target) + ' but it is invisible!<br>';
					continue;
				}

				affected++;

				var frost_damage = frost;

				// Check Protect/Enfeeble
				// Check Protect/Enfeeble
				var damageInfo = modifySkillDamage(target, frost_damage);
				frost_damage = damageInfo.damage;
				var shatter = damageInfo.shatter;

				do_damage(src_card, target, frost_damage, shatter, function (source, target, amount) {
					echo += '<u>(Frostbreath: +' + skill.x;
					if (enhanced) echo += ' Enhance: +' + enhanced;
					echo += damageInfo.echo;
					echo += ') = ' + amount + ' damage</u><br>';
					echo += debug_name(source) + ' breathes frost at ' + debug_name(target) + ' for ' + amount + ' damage';
					echo += (!target.isAlive() ? ' and it dies' : '') + '<br>';
				});

				if(target.backlash) {
					backlash(src_card, target);
				}
			}

			return affected;
		},

		heartseeker: function (src_card, skill) {

			var faction = skill['y'];

			var o = get_o(src_card);

			var heartseeker = skill.x;

			var target = field[o].assaults[src_card.key];

			// No Targets
			if (!target) return 0;

			var enhanced = getEnhancement(src_card, skill.id, heartseeker);
			heartseeker += enhanced;

			target.heartseeker += heartseeker;
			target.enfeebled += heartseeker;
			if (debug) echo += debug_name(src_card) + ' inflicts heartseeker ' + heartseeker + ' on ' + debug_name(target) + '<br>';

			return 1;
		},
		// Enfeeble (Hex)
		// - Can target specific faction
		// - Targets enemy assaults
		// - Can be evaded
		// - Can be enhanced
		enfeeble: function (src_card, skill) {

			var faction = skill['y'];

			var p = get_p(src_card);
			var o = get_o(src_card);

			var enfeeble = skill.x;

			var all = skill.all;

			var field_x_assaults = field[o]['assaults'];

			var targets = [];
			for (var key = 0, len = field_x_assaults.length; key < len; key++) {
				var target = field_x_assaults[key];
				if (target.isAlive() && target.isInFaction(faction)) {
					targets.push(key);
				}
			}

			// No Targets
			if (!targets.length) return 0;

			// Check All
			if (!all) {
				targets = choose_random_target(targets);
			}
			var enhanced = getEnhancement(src_card, skill.id, enfeeble);
			enfeeble += enhanced;

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {
				var target = field_x_assaults[targets[key]];

				// Check Evade
				if (target.invisible) {
					target.invisible--;
					if (debug) echo += debug_name(src_card) + ' hexes ' + debug_name(target) + ' but it is invisible!<br>';
					continue;
				}

				affected++;

				target['enfeebled'] += enfeeble;
				if (debug) echo += debug_name(src_card) + ' hexes ' + debug_name(target) + ' by ' + enfeeble + '<br>';

				if(target.backlash) {
					backlash(src_card, target);
				}
			}

			return affected;
		},

		// Weaken
		// - Can target specific faction
		// - Targets active_next_turn, unjammed, enemy assaults with attack > 0
		// - Can be evaded
		// - Can be enhanced
		weakenself: function (src_card, skill) {
			return activationSkills.weaken(src_card, skill);
		},
		weaken: function (src_card, skill) {

			var faction = skill['y'];

			var o;
			switch (skill.id) {
				case 'weakenself':
					o = get_p(src_card);
					break;
				default:
					o = get_o(src_card);
					break;
			}

			var weaken = skill.x;

			var all = skill.all;

			var field_x_assaults = field[o]['assaults'];

			var targets = [];
			var getTargets = function (include0Strength) {
				for (var key = 0, len = field_x_assaults.length; key < len; key++) {
					var target = field_x_assaults[key];
					if (target.isAlive() && target.isInFaction(faction)
					&& (all || (target.isActiveNextTurn() && target.isUnjammed() && (include0Strength || target.hasAttack())))) {
						targets.push(key);
					}
				}
			}
			getTargets(false);
			// Only target 0-strength units if there are no 1+ strength units left
			if (!targets.length) {
				getTargets(true);
			}

			// No Targets
			if (!targets.length) return 0;

			// Check All
			if (!all) {
				targets = choose_random_target(targets);
			}
			var enhanced = getEnhancement(src_card, skill.id, weaken);
			weaken += enhanced;

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {
				var target = field_x_assaults[targets[key]];

				// Check Evade
				if (target.invisible) {
					target.invisible--;
					if (debug) echo += debug_name(src_card) + ' weakens ' + debug_name(target) + ' but it is invisible!<br>';
					continue;
				}

				affected++;

				target.attack_weaken += weaken;
				if (debug) {
					if (enhanced) echo += '<u>(Enhance: +' + enhanced + ')</u><br>';
					echo += debug_name(src_card) + ' weakens ' + debug_name(target) + ' by ' + weaken + '<br>';
				}

				if(target.backlash) {
					backlash(src_card, target);
				}
			}

			return affected;
		},
	};

	var earlyActivationSkills = {
		// Rally
		// - Targets self
		// - Can be enhanced
		// - Cannot be nullified
		enlarge: function (src_card, skill) {

			var faction = skill['y'];

			var p = get_p(src_card);

			var rally = skill.x;
			var enhanced = getEnhancement(src_card, skill.id, rally);
			rally += enhanced;
			var all = skill.all;

			var field_p_assaults = field[p]['assaults'];

			var targets = [];
			for (var key = 0, len = field_p_assaults.length; key < len; key++) {
				var target = field_p_assaults[key];
				if (target.isAlive() && target.isInFaction(faction)
				&& (all || (target.isUnjammed() && target.isActive()))) {
					targets.push(key);
				}
			}

			// No Targets
			if (!targets.length) return 0;

			// Check All
			if (!all) {
				targets = choose_random_target(targets);
			}

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {
				var target = field_p_assaults[targets[key]];

				var rally_amt = rally;
				if (!rally_amt) {
					var mult = skill.mult;
					rally_amt = Math.ceil(target.attack * mult);
				}

				target.attack_rally += rally_amt;
				if (debug) {
					if (enhanced) echo += '<u>(Enhance: +' + enhanced + ')</u><br>';
					echo += debug_name(src_card) + ' enlarges ' + debug_name(target) + ' by ' + rally_amt + '<br>';
				}

				affected++;
			}

			return affected;
		},

		// Rally
		// - Can target specific faction
		// - Targets allied unjammed, active assaults
		// - Can be enhanced
		rally: function (src_card, skill) {

			var faction = skill['y'];

			var p = get_p(src_card);

			var rally = skill.x;
			var all = skill.all;

			var field_p_assaults = field[p]['assaults'];

			var targets = [];
			for (var key = 0, len = field_p_assaults.length; key < len; key++) {
				var target = field_p_assaults[key];
				
				if (target.isAlive() && target.isInFaction(faction)
				&& (all || (target.isActive() && target.isUnjammed()))) {
					targets.push(key);
				}
			}

			// No Targets
			if (!targets.length) return 0;

			// Check All
			if (!all) {
				targets = choose_random_target(targets);
			}
			var enhanced = getEnhancement(src_card, skill.id, rally);
			rally += enhanced;

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {

				var target = field_p_assaults[targets[key]];

				// Check Nullify
				if (target.nullified) {
					target.nullified--;
					if (debug) echo += debug_name(src_card) + ' empowers ' + debug_name(target) + ' but it is nullified!<br>';
					continue;
				}

				affected++;

				var rally_amt = rally;
				if (!rally_amt) {
					var mult = skill.mult;
					rally_amt = Math.ceil(target.attack * mult);
				}

				target.attack_rally += rally_amt;
				if (debug) {
					if (enhanced) echo += '<u>(Enhance: +' + enhanced + ')</u><br>';
					echo += debug_name(src_card) + ' empowers ' + debug_name(target) + ' by ' + rally_amt + '<br>';
				}
			}

			return affected;
		},

		// Legion
		// - Targets specific faction
		// - Targets allied adjacent unjammed, active assaults
		// - Can be enhanced?
		legion: function (src_card, skill) {

			var p = get_p(src_card);
			var field_p_assaults = field[p]['assaults'];

			var rally = skill.x;
			var enhanced = getEnhancement(src_card, skill.id, rally);
			rally += enhanced;

			var faction = skill['y'];

			var target_key = src_card['key'] - 1;
			var len = target_key + 2;
			if (target_key < 0) target_key += 2;

			var affected = 0;

			while (target_key <= len) {
				// Check left
				var target = field_p_assaults[target_key];
				if (target && target.isActive() && target.isInFaction(faction)) {
					// Check Nullify
					if (target.nullified) {
						target.nullified--;
						if (debug) echo += debug_name(src_card) + ' activates legion and empowers ' + debug_name(target) + ' but it is nullified!<br>';
					} else {
						affected++;
						target.attack_rally += rally;
						if (debug) {
							if (enhanced) echo += '<u>(Enhance: +' + enhanced + ')</u><br>';
							echo += debug_name(src_card) + ' activates legion and empowers ' + debug_name(target) + ' by ' + rally + '<br>';
						}
					}
				}
				target_key += 2;
			}

			return affected;
		},

		// Fervor
		// - Targets self for each adjacent unjammed, active assault in specific faction
		// - Can be enhanced?
		fervor: function (src_card, skill) {

			var p = get_p(src_card);
			var field_p_assaults = field[p]['assaults'];

			var rally = skill.x;
			var enhanced = getEnhancement(src_card, skill.id, rally);
			rally += enhanced;

			var faction = skill['y'];

			var fervorAmount = 0;

			var target_key = src_card['key'] - 1;
			var len = target_key + 2;
			if (target_key < 0) target_key += 2;

			while (target_key <= len) {
				var target = field_p_assaults[target_key];
				if (target && target.isInFaction(faction)) {
					fervorAmount += rally;
				}
				target_key += 2
			}

			if (fervorAmount) {
				src_card['attack_rally'] += fervorAmount;
				if (debug) {
					if (enhanced) echo += '<u>(Enhance: +' + enhanced + ')</u><br>';
					echo += debug_name(src_card) + ' activates fervor for ' + fervorAmount + '<br>';
				}
				return 1;
			} else {
				return 0;
			}
		},

		// Barrage (Barrage X => X Bolt 1)
		// - Can target specific faction
		// - Targets enemy assaults
		// - Can be evaded
		// - Must calculate enfeeble/protect
		// - Can be enhanced
		barrage: function (src_card, skill) {

			var o = get_o(src_card);

			var barrages = skill.x
			var faction = skill.y;
			var all = skill.all;

			var field_x_assaults = field[o].assaults;

			var enhanced = getEnhancement(src_card, skill.id, barrages);
			barrages += enhanced;
			for (var i = 0; i < barrages; i++) {
				var targets = [];
				for (var key = 0, len = field_x_assaults.length; key < len; key++) {
					var target = field_x_assaults[key];
					if (target.isAlive() && target.isInFaction(faction)) {
						targets.push(key);
					}
				}

				// No Targets
				if (!targets.length) return 0;

				// Check All
				if (!all) {
					targets = choose_random_target(targets);
				}

				var affected = 0;

				var strike = 1;
				for (var key = 0, len = targets.length; key < len; key++) {
					var target = field_x_assaults[targets[key]];

					// Check Evade
					if (target.invisible) {
						target.invisible--;
						if (debug) echo += debug_name(src_card) + ' throws a bomb at ' + debug_name(target) + ' but it is invisible!<br>';
						continue;
					}

					affected++;

					var strike_damage = strike;

					// Check Protect/Enfeeble
					var damageInfo = modifySkillDamage(target, strike_damage, {enfeeble: true});
					strike_damage = damageInfo.damage;
					var shatter = damageInfo.shatter;

					do_damage(src_card, target, strike_damage, shatter, function (source, target, amount) {
						echo += '<u>(Barrage: +1';
						echo += damageInfo.echo;
						echo += ') = ' + amount + ' damage</u><br>';
						echo += debug_name(source) + ' throws a bomb at ' + debug_name(target) + ' for ' + amount + ' damage';
						echo += (!target.isAlive() ? ' and it dies' : '') + '<br>';
					});
				}
			}

			return affected;
		},

		// Enhance
		// - Can target specific faction
		// - Targets allied, units
		// - Target must be active this turn (for activation skills only)
		// - Target must not be frozen (for activation skills only)
		// - Target must have specific "enhanceable skill"
		enhance: function (src_card, skill) {

			var faction = skill['y'];

			var p = get_p(src_card);
			var o = get_o(src_card);

			var x = skill.x;
			var faction = skill.y;
			var s = skill.s;
			var mult = skill.mult;
			var all = skill.all;

			var field_p_assaults = field[p]['assaults'];
			var require_active_turn = requiresActiveTurn(s);
			var targets = [];
			for (var key = 0, len = field_p_assaults.length; key < len; key++) {
				var target = field_p_assaults[key];
				if (target.isAlive() && target.isInFaction(faction)
				&& (all || !require_active_turn || (target.isActive() && target.isUnjammed()))
				&& target.hasSkill(s)) {
					targets.push(key);
				}
			}

			// No Targets
			if (!targets.length) {
				return 0;
			}

			// Check All
			if (!all) {
				targets = choose_random_target(targets);
			}

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {
				var target = field_p_assaults[targets[key]];

				// Check Nullify
				if (target.nullified) {
					target.nullified--;
					if (debug) echo += debug_name(src_card) + ' enhances ' + debug_name(target) + ' but it is nullified!<br>';
					continue;
				}

				affected++;

				var enhancements = target.enhanced;
				if (x > 0) {
					enhancements[s] = (enhancements[s] || 0) + x;
					if (debug) echo += debug_name(src_card) + ' enhances ' + s + ' of ' + debug_name(target, false) + ' by ' + x + '<br>';
				} else if (mult > 0) {
					// temporarily use negatives for multiplier
					enhancements[s] = -mult;
					if (debug) echo += debug_name(src_card) + ' enhances ' + s + ' of ' + debug_name(target, false) + ' by ' + (mult * 100) + '%<br>';
				}
			}

			return affected;
		},

		// Enrage
		// - Can target specific faction
		// - Targets allied assaults
		// - Can be enhanced
		enrage: function (src_card, skill) {

			var p = get_p(src_card);

			var faction = skill.y;
			var enrage = skill.x;
			var all = skill.all;

			var field_p_assaults = field[p]['assaults'];

			var targets = [];
			for (var key = 0, len = field_p_assaults.length; key < len; key++) {
				var target = field_p_assaults[key];
				if (target.isAlive() && target.isInFaction(faction)) {
					targets.push(key);
				}
			}

			// No Targets
			if (!targets.length) return 0;

			// Check All
			if (!all) {
				targets = choose_random_target(targets);
			}
			var enhanced = getEnhancement(src_card, skill.id, enrage);
			enrage += enhanced;

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {
				var target = field_p_assaults[targets[key]];
				var amount = enrage;

				// Check Nullify
				if (target.nullified) {
					target.nullified--;
					if (debug) echo += debug_name(src_card) + ' enrages ' + debug_name(target) + ' but it is nullified!<br>';
					continue;
				}

				affected++;

				if (skill.mult) {
					amount = Math.ceil(skill.mult * target.health);
				}

				target['enraged'] += amount;
				if (debug) {
					if (enhanced) echo += '<u>(Enhance: +' + enhanced + ')</u><br>';
					echo += debug_name(src_card) + ' enrages ' + debug_name(target) + ' by ' + amount + '<br>';
				}
			}

			return affected;
		},

		// Enhance
		// - Can target specific faction
		// - Targets allied, units
		// - Target must be active this turn (for activation skills only)
		// - Target must not be frozen (for activation skills only)
		// - Target must have specific "enhanceable skill" ("all" versions aren't counted)
		imbue: function (src_card, skill) {

			var faction = skill['y'];

			var p = get_p(src_card);
			var o = get_o(src_card);

			var x = skill.x;
			var c = skill['c'];
			var s = skill['s'];
			var all = skill.all;

			var field_p_assaults = field[p]['assaults'];
			var require_active_turn = requiresActiveTurn(s);
			var targets = [];
			for (var key = 0, len = field_p_assaults.length; key < len; key++) {
				var target = field_p_assaults[key];
				if (target.isAlive() && target.isInFaction(faction)
				&& (all || !require_active_turn || (target.isActive() && target.isUnjammed()))) {
					targets.push(key);
				}
			}

			// No Targets
			if (!targets.length) {
				return 0;
			}

			var skill = {
				id: s,
				x: x
			}

			// Check All
			if (!all) {
				targets = choose_random_target(targets);
			}

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {
				var target = field_p_assaults[targets[key]];

				// Check Nullify
				if (target.nullified) {
					target.nullified--;
					if (debug) echo += debug_name(src_card) + ' enhances ' + debug_name(target) + ' but it is nullified!<br>';
					continue;
				}

				affected++;


				if (target.hasSkill(s)) {
					var enhancements = target.enhanced;
					enhancements[s] = (enhancements[s] || 0) + x;
					if (debug) echo += debug_name(src_card) + ' imbues ' + debug_name(target, false) + ' existing ' + debug_skill(skill) + ' by ' + x + '<br>';
				} else {
					target.imbue(skill);
					if (debug) echo += debug_name(src_card) + ' imbues ' + debug_name(target, false) + ' with ' + debug_skill(skill) + '<br>';
				}
			}

			return affected;
		},

		mark: function (src_card, skill) {

			var faction = skill['y'];

			var p = get_p(src_card);
			var o = get_o(src_card);

			var mark = skill.x;

			var all = skill.all;

			var field_x_assaults = field[o]['assaults'];

			var markTarget = src_card.mark_target;
			var targets = [];
			for (var key = 0, len = field_x_assaults.length; key < len; key++) {
				var target = field_x_assaults[key];
				if (target.isAlive() && target.isInFaction(faction)) {
					// Can only mark one target
					if (target.uid === markTarget) {
						targets = [key];
						break;
					}
					targets.push(key);
				}
			}

			// No Targets
			if (!targets.length) return 0;

			// Check All
			if (!all) {
				targets = choose_random_target(targets);
			}
			var enhanced = getEnhancement(src_card, skill.id, mark);
			mark += enhanced;

			var affected = 0;

			for (var key = 0, len = targets.length; key < len; key++) {
				var target = field_x_assaults[targets[key]];

				affected++;

				target.enfeebled += mark;
				src_card.mark_target = target.uid;

				if (debug) echo += debug_name(src_card) + ' marks ' + debug_name(target) + ' by ' + mark + '<br>';

				// Set countdown so Mark can't trigger twice on dual-strike turn
				skill.countdown = 1;
			}

			return affected;
		},

		snaretongue: function (src_card, skill) {

			var faction = skill['y'];

			var p = get_p(src_card);
			var o = get_o(src_card);

			var field_x_assaults = field[o]['assaults'];

			var markTarget = src_card.mark_target;
			var targets = [];
			for (var key = 0, len = field_x_assaults.length; key < len; key++) {
				var target = field_x_assaults[key];
				if (target.isAlive()
				&& target.isInFaction(faction)) {
					targets.push(key);
				}
			}

			// No Targets
			if (!targets.length) return 0;

			// Find weakest
			var target = field_x_assaults[targets.reduce(function (weakest, target) {
				return ((field_x_assaults[target].health_left < field_x_assaults[weakest].health_left) ? target : weakest);
			}, targets[0])];

			var toKey = src_card.key;
			var fromKey = target.key;
			if (toKey === toKey) {
				// No change in position
				if (debug) echo += debug_name(src_card) + ' activates snaretongue and keeps ' + debug_name(target) + ' in front of it<br>';
				return false;
			}

			field_x_assaults.splice(target.key, 1);
			if (field_x_assaults.length < toKey) {
				CARDS[0] = CARDS[0] || {
					"id": "0",
					"name": "Filler",
					"picture": "",
					"rarity": "0",
					"set": "9999",
					"card_type": "0",
					"type": "0",
					"sub_type": [],
					"health": 1,
					"attack": 0,
					"cost": 0,
					"maxLevel": 1,
					"skill": [],
				};
				var filler = get_card_by_id({ id: 0, level: 1 });
				filler.name = "filler";
				filler.health_left = 0;
				for (var i = field_x_assaults.length; i < toKey; i++) {
					field_x_assaults.push(filler);
				}
			}
			field_x_assaults.splice(toKey, 0, target);
			for (var i = Math.min(toKey, fromKey), end = Math.max(toKey, fromKey) ; i <= end; i++) {
				field_x_assaults[i].key = i;
			}

			if (debug) echo += debug_name(src_card) + ' activates snaretongue and pulls ' + debug_name(target) + ' in front of it<br>';

			// Set countdown so skill can't trigger twice on dual-strike turn
			skill.countdown = 1;

			return 1;
		}
	};

	var onPlaySkills = {

		ambush: function (src_card, target, skill) {

			var x = skill.x
			var base = skill.base;
			var mult = skill.mult;

			var damage = x;
			if (!damage) {
				var mult = skill.mult;
				damage = Math.ceil(target[base] * mult);
			}

			do_damage(src_card, target, damage, null, function (source, target, amount) {
				echo += debug_name(source) + ' ambushes ' + debug_name(target) + ' for ' + amount + ' damage';
				echo += (!target.isAlive() ? ' and it dies' : '') + '<br>';
			});

			return 1;
		},

		slow: function (src_card, target, skill) {

			var x = skill.x
			var base = skill.base;
			var mult = skill.mult;

			var slow = x;
			if (!slow) {
				var mult = skill.mult;
				slow = Math.ceil(target[base] * mult);
			}

			target.timer += slow;

			if (debug) {
				echo += debug_name(src_card) + ' slows ' + debug_name(target) + ' by ' + slow + '<br>';
			}

			return 1;
		},
	};

	var onDeathSkills = {
		unearth: function (dying, killer, skill) {

			// Only nontoken creatures can use unearth
			if (dying.isToken) {
				return;
			}

			// Get base card
			var unearthedUnit = makeUnitInfo((skill.card || dying.id), (skill.level || skill.x));
			var unearthedCard = get_card_apply_battlegrounds(unearthedUnit, null, true);
			unearthedCard.isToken = true;

			var mult = skill.mult;
			if (mult) {
				// Unearthed card has scaled stats based on original card
				unearthedCard.attack = Math.floor(dying.attack * mult);
				unearthedCard.health = Math.floor(dying.health * mult);
			}

			play_card(unearthedCard, dying.owner, true);

			if (debug) {
				echo += debug_name(unearthedCard) + ' is unearthed</br>';
			}

			return 1;
		},

		reanimate: function (dying, killer, skill) {

			// Only trigger once
			if (dying.reanimated) {
				return 0;
			}

			dying.health_left = skill.x;
			dying.reanimated = true;

			if (debug) {
				echo += ' and is reanimated</br>';
			}

			return 1;
		}
	};

	// Activation Skills
	// - Must traverse through skills from top to bottom
	function activation_skills(src_card) {

		if (src_card.silenced) {
			if (debug) echo += debug_name(src_card) + " is silenced and cannot use skills</br>"
			return;
		}

		var skills = src_card.skill;

		var isAlive = makeLivenessCheck(src_card);
		for (var i = 0, len = skills.length; i < len && isAlive(); i++) {
			var skill = skills[i];

			if (skill.countdown) {
				continue;
			}

			// Delegate to skill function
			var skillFn = getActivatedSkill(activationSkills, skill.id);
			var affected = skillFn(src_card, skill);

			if (skill.c && affected > 0) {
				skill.countdown = skill.c;
			}

			if (showAnimations) {
				drawField(field, null, null, turn, src_card);
			}
		}
	};

	function initializeBattle() {

		SIMULATOR.simulation_turns = 0;

		// Set up empty decks
		var deck = {
			cpu: {
				deck: []
			},
			player: {
				deck: []
			}
		}

		SIMULATOR.deck = deck;

		// Set up empty field
		var field = {
			cpu: {
				assaults: []
			},
			player: {
				assaults: []
			}
		};
		SIMULATOR.field = field;

		// Load player deck
		if (cache_player_deck_cards) {
			deck['player'] = copy_deck(cache_player_deck_cards);
		}

		// Load enemy deck
		if (getmission && missionlevel > 1 && missionlevel < 7) {
			cache_cpu_deck = load_deck_mission(getmission, missionlevel);
			cache_cpu_deck_cards = getDeckCards(cache_cpu_deck, 'cpu');
		} else if (getraid) {
			cache_cpu_deck = load_deck_raid(getraid, raidlevel);
			cache_cpu_deck_cards = getDeckCards(cache_cpu_deck, 'cpu');
		}
		if (cache_cpu_deck_cards) {
			deck['cpu'] = copy_deck(cache_cpu_deck_cards);
		}

		// Set up deck order priority reference
		if (getordered && !getexactorder) deck.player.ordered = copy_card_list(deck.player.deck);
		if (getordered2 && !getexactorder2) deck.cpu.ordered = copy_card_list(deck.cpu.deck);

		deck.player.chooseCard = (user_controlled ? chooseCardUserManually  // User_controlled mode has the player choose a card manually
								 : getordered ? chooseCardOrdered           // Ordered mode tries to pick the card closest to the specified ordering
								 : chooseCardRandomly);                     // Player AI falls back on picking a random card

		deck.cpu.chooseCard = (/*livePvP ? waitForOpponent                  // If this is "Live PvP" - wait for opponent to choose a card
								: */getordered2 ? chooseCardOrdered           // Ordered mode tries to pick the card closest to the specified ordering
								: pvpAI ? chooseCardByPoints                // PvP defenders have a special algorithm for determining which card to play
								: getexactorder2 ? chooseCardRandomly       // If deck is not shuffled, but we're not playing "ordered mode", pick a random card from hand
								: chooseFirstCard);                         // If none of the other options are true, this is the standard PvE AI and it just picks the first card in hand
	}

	// Simulate one game
	function simulate() {
		simulating = true;

		initializeBattle();

		// Shuffle decks
		if (getexactorder) {
			if (!getordered) {
				deck.player.shuffleHand = true;
			}
		} else {
			shuffle(deck.player.deck);
		}
		if (getexactorder2) {
			if (!getordered2) {
				deck.cpu.shuffleHand = true;
			}
		} else {
			shuffle(deck.cpu.deck);
		}

		setupField(field);

		if (getsiege) {
			var towerBGE = BATTLEGROUNDS[tower_type];
			var tower = towerBGE.effect[tower_level];
			if (tower) {
				tower = makeUnitInfo(tower.id, tower.level);
				var towerCard = get_card_apply_battlegrounds(tower);
				var uid = 150;
				towerCard.uid = uid;
				field.uids[uid] = towerCard;
				play_card(towerCard, 'cpu', -1, true);
			}
		}

		return performTurns(0);
	};

	function setupDecks() {
		// Cache decks where possible
		// Load player deck
		if (getdeck) {
			cache_player_deck = hash_decode(getdeck);
		} else if (getcardlist) {
			cache_player_deck = load_deck_from_cardlist(getcardlist);
		} else {
			cache_player_deck = load_deck_from_cardlist();
		}
		cache_player_deck_cards = getDeckCards(cache_player_deck, 'player');

		// Load enemy deck
		pvpAI = true;
		if (getdeck2) {
			cache_cpu_deck = hash_decode(getdeck2);
			if (getmission) pvpAI = false;
		} else if (getcardlist2) {
			cache_cpu_deck = load_deck_from_cardlist(getcardlist2);
		} else if (getmission) {
			cache_cpu_deck = load_deck_mission(getmission, missionlevel);
			pvpAI = false;    // PvE decks do not use "Smart AI"
		} else if (getraid) {
			cache_cpu_deck = load_deck_raid(getraid, raidlevel);
			pvpAI = false;    // PvE decks do not use "Smart AI"
		} else {
			cache_cpu_deck = load_deck_from_cardlist();
		}
		cache_cpu_deck_cards = getDeckCards(cache_cpu_deck, 'cpu');
	}

	function setupField(field) {
		// Initialize Commander on the fields and set uids
		var uids = field.uids = {};
		['player', 'cpu'].forEach(function (player) {
			var pDeck = deck[player];
			var cards = pDeck.deck;
			var uidBase = (player === 'player' ? 1 : 101);
			for (var i = 0; i < cards.length; i++) {
				var uid = uidBase + i;
				var card = cards[i];
				card.owner = player;
				card.played = false;
				card.uid = uid;
				uids[uid] = card;
			}

			var commander = pDeck.commander;
			commander.owner = player;
			commander.health_left = commander.health;
			if (!commander.reusableSkills) commander.resetTimers();

			var uid = (player === 'player' ? -1 : -2);
			commander.uid = uid;
			uids[uid] = commander;
			field[player].commander = commander;
		});
	}

	SIMULATOR.pause = false;

	function onCardChosen(turn, drawCards) {
		clearFrames();
		performTurns(turn, drawCards);
	}

	function performTurns(turn, drawCards) {
		if (SIMULATOR.pause) {
			SIMULATOR.pause = false;
			return false;
		}
		var done = performTurnsInner(turn, drawCards);
		if (done && user_controlled) {
			SIM_CONTROLLER.debug_end();
		}
		return done;
	}
	SIMULATOR.performTurns = performTurns;

	function performTurnsInner(turn, drawCards) {
		// Set up players
		var first_player, second_player;
		if (surge) {
			first_player = 'cpu';
			second_player = 'player';
		} else {
			first_player = 'player';
			second_player = 'cpu';
		}

		if (turn > 0) {
			if (livePvP) {
				if (!field.player.commander.isAlive() || !field.cpu.commander.isAlive()) {
					simulating = false;
					return true;
				}
			}
			// Retry this turn - don't bother doing setup all over again
			if (!performTurn(turn, field, first_player, second_player, drawCards)) {
				// Try this turn again
				return false;
			}
			if (!field.player.commander.isAlive() || !field.cpu.commander.isAlive()) {
				simulating = false;
				return true;
			}
		} else if (!surge && SIMULATOR.sendBattleUpdate) {
			SIMULATOR.sendBattleUpdate(turn);
		}

		turn++;
		// Continue simulation
		for (; turn <= max_turns + 1; turn++) {
			if (turn == max_turns + 1) {
				// Ended in draw
				simulating = false;
				return true;
			}

			var setup = setup_turn(turn, first_player, second_player, field);

			if (!performTurn(turn, field, first_player, second_player, true)) {
				// Try this turn again
				return false;
			} else if (!field.player.commander.isAlive() || !field.cpu.commander.isAlive()) {
				simulating = false;
				if (debug) echo += '<u>Turn ' + turn + ' ends</u><br><br></div>';
				return true;
			}
		}
		simulating = false;
		return true;
	}

	function performTurn(turn, field, first_player, second_player, drawCards) {
		if (turn % 2) {
			var p = first_player;
			var o = second_player;
		} else {
			var p = second_player;
			var o = first_player;
		}

		closeDiv = false;
		if (!choose_card(p, turn, drawCards)) {
			return false;
		} else {
			play_turn(p, o, field, turn);
			return true;
		}
	}

	function debugDraw(commander, deck, i) {
		var card = deck[i];
		if (card) {
			return commander + ' draws ' + debug_name(card, true) + '<br/>';
		} else {
			return '';
		}
	}

	function setup_turn(turn, first_player, second_player, field) {
		simulation_turns = turn;

		choice = undefined;

		if (turn % 2) {
			var p = first_player;
			var o = second_player;
		} else {
			var p = second_player;
			var o = first_player;
		}

		if (debug) {
			var commander_p = debug_name(field[p]['commander']);
			var deck_p = deck[p].deck;
			echo += '<div id="turn_"' + turn + ' class="turn-info"><hr/><br/><u>Turn ' + turn + ' begins for ' + commander_p + '</u><br>';

			if (turn <= 2) {
				echo += debugDraw(commander_p, deck_p, 0);
				echo += debugDraw(commander_p, deck_p, 1);
			}
			echo += debugDraw(commander_p, deck_p, 2);
		}

		var field_p = field[p];
		var field_o = field[o];
		var field_p_assaults = field_p.assaults;
		var field_o_assaults = field_o.assaults;

		// countdown any skills with timers
		doCountDowns(field_p.commander);

		// Count down timer on your field
		// Remove from your field: Enfeeble, Protect
		for (var i = 0, len = field_p_assaults.length; i < len; i++) {
			var current_assault = field_p_assaults[i];

			if (current_assault.timer > 0) {
				if (turn !== 3 || !tournament) {
					current_assault.timer--;
					if (debug) echo += debug_name(current_assault) + ' reduces its timer<br>';
				}
			}

			// Check valor
			if (current_assault.valor) {
				var enemy = field_o_assaults[i];
				if (enemy && current_assault.adjustedAttack() < enemy.adjustedAttack()) {
					current_assault.attack_valor += current_assault.valor;
					if (debug) echo += debug_name(current_assault) + ' activates valor, boosting its attack by ' + current_assault.valor + '<br/>';
				} else if (debug) {
					echo += debug_name(current_assault) + ' activates valor but ';
					if (!enemy) {
						echo += 'there is no opposing enemy.<br/>'
					} else {
						echo += 'enemy is not strong enough.<br/>'
					}
				}
			}

			current_assault.enfeebled = current_assault.envenomed + current_assault.heartseeker;
			current_assault.enraged = 0;
			current_assault.invisible = 0;
			current_assault.protected = 0;
			current_assault.barrier_ice = 0;
			current_assault.warded = 0;
			current_assault.enhanced = {};
			current_assault.removeImbue();

			// countdown any skills with timers
			doCountDowns(current_assault);
		}
	}

	function choose_card(p, turn, drawCards) {

		var deck_p = deck[p];
		var deck_p_deck = deck_p.deck;
		var deck_p_ordered = deck_p['ordered'];
		var isOrdered = (p == 'player' ? getordered : getordered2);

		if (livePvP && p === 'cpu' && drawCards) {
			waitForOpponent(p, deck_p_deck, deck_p_ordered, turn, drawCards);
			return false;
		} else if (deck_p_deck[0]) {
			// Deck not empty yet
			SIMULATOR.waiting = false;
			var card_picked = 0;

			if (deck_p_deck.length == 1) {
				card_picked = chooseFirstCard(p, deck_p_deck, deck_p_ordered, turn, drawCards);
			} else {
				for (var i = 0; i < deck_p_deck.length; i++) {
					var card = deck_p_deck[i];
					if (card.trap) {
						play_card(card.trap, p, turn);
						card.trap = false;
					}
					if (i === 2) break;
				}
				card_picked = deck_p.chooseCard(p, deck_p_deck, deck_p_ordered, turn, drawCards);
			}

			if (card_picked < 0) return false;

			play_card(deck_p_deck[card_picked], p, turn);

			removeFromDeck(deck_p_deck, card_picked);
		}
		return true;
	};

	function removeFromDeck(deck, index) {
		var key = index;
		var len = deck.length - 1;
		while (key < len) {
			deck[key] = deck[++key];
		}
		deck.length = key;

	}

	function waitForOpponent(p, shuffledDeck, orderedDeck, turn, drawCards) {

		SIMULATOR.waiting = true;
		closeDiv = true;

		if (drawCards) {
			hideTable();
			outputTurns(echo);
			drawField(field, null, performTurns, turn);
			SIMULATOR.sendBattleUpdate(turn);
		}

		return -1;
	}
	SIMULATOR.waitForOpponent = waitForOpponent;

	function chooseCardUserManually(p, shuffledDeck, orderedDeck, turn, drawCards) {
		// Prepare 3-card hand
		var hand = shuffledDeck.slice(0, 3);
		closeDiv = true;
		var cardsInHand = [];
		var drawableHand = [];
		for (var handIdx = 0, hand_len = hand.length; handIdx < hand_len; handIdx++) {
			var card = hand[handIdx];
			var text = handIdx + ": " + card['name'];
			if (card.maxLevel > 1) text += '{' + card.level + '/' + card.maxLevel + '}';
			cardsInHand.push(text);
			drawableHand.push(card);
		}
		if (drawCards) {
			hideTable();
			outputTurns(echo);
			drawField(field, drawableHand, onCardChosen, turn);
		}
		if (choice === undefined) {
			return -1;

		} else {
			var card_picked = choice;
			if (!card_picked) card_picked = 0;
			return card_picked;
		}
	}

	function chooseCardOrdered(p, shuffledDeck, orderedDeck, turn, drawCards) {
		// If deck isn't shuffled, just play the first card
		if (typeof orderedDeck === "undefined") {
			return 0;
		}

		// Prepare 3-card hand
		var hand = shuffledDeck.slice(0, 3);

		// Play highest priority card
		var played = false;
		for (var orderIdx = 0, deck_len = orderedDeck.length; orderIdx < deck_len; orderIdx++) {
			var desiredCard = orderedDeck[orderIdx];

			// Get advanced priority
			var priority_id = desiredCard.priority;

			var samePriority = -1;
			var cardInHand
			for (var handIdx = 0, hand_len = hand.length; handIdx < hand_len; handIdx++) {
				cardInHand = hand[handIdx];
				var b_priority = cardInHand.priority;

				// If this is the exact card at this spot
				if (areEqual(desiredCard, cardInHand)) {
					played = true;
					break;
				}
					// Compare advanced priority field
				else if (priority_id > 0) {
					if (priority_id == b_priority) {
						samePriority = handIdx;
					}
				}
			}
			// If we didnt' find exact card, but found one of the same priority, pick that one
			if (!played && samePriority >= 0) {
				played = true;
				handIdx = samePriority;
				cardInHand = hand[handIdx];
			}
			// If we found the desired card, play it, otherwise move on to the next desired card
			if (played) {
				for (var len = orderedDeck.length - 1; orderIdx < len; orderIdx++) {
					orderedDeck[orderIdx] = orderedDeck[orderIdx + 1];
				}
				orderedDeck.length = orderIdx;
				return handIdx;
			}
		}
		return -1;
	}

	function chooseCardRandomly(p, shuffledDeck, orderedDeck, turn, drawCards) {
		// Prepare 3-card hand
		var hand = shuffledDeck.slice(0, 3);

		var card_picked = (~~(Math.random() * hand.length));
		return card_picked;
	}

	function chooseCardByPoints(p, shuffledDeck, orderedDeck, turn, drawCards) {
		// Prepare 3-card hand
		var hand = shuffledDeck.slice(0, 3);

		// Play card in hand with most upgrade points (first card is picked in the case of ties)
		var card_picked = -1;
		var bestRank = -1;
		for (var i = 0; i < hand.length; i++) {
			var card = hand[i];
			var rank = getCardRanking(card);
			if (rank > bestRank) {
				bestRank = rank;
				card_picked = i;
			}
		}
		return card_picked;
	}

	function chooseFirstCard(p, shuffledDeck, orderedDeck, turn, drawCards) {
		return 0;
	}

	function getCardRanking(card) {
		var cardID = card.id.toString();
		// Each rarity level is worth 6 points
		var rarity = parseInt(card.rarity) * 6;
		// Each fusion is worth half of a rarity
		var fusion = (cardID.length > 4 ? parseInt(cardID[0]) : 0) * 3;
		// Subtract a point for every missing upgrade level
		var level = parseInt(card.level) - parseInt(card.maxLevel);

		var ranking = rarity + fusion + level;

		return ranking;
	}

	function play_turn(p, o, field, turn) {

		var field_p = field[p];
		var field_p_commander = field_p['commander'];
		var field_p_assaults = field_p['assaults'];

		var field_o = field[o];
		var field_o_commander = field_o['commander'];
		var field_o_assaults = field_o['assaults'];

		// Activate battleground effects
		for (var i = 0; i < battlegrounds.onTurn.length; i++) {
			var battleground = battlegrounds.onTurn[i];
			if (battleground.enemy_only && p !== 'cpu') continue;
			if (battleground.ally_only && p !== 'player') continue;
			battleground.owner = p;
			doEarlyActivationSkills(battleground);
			activation_skills(battleground);
		}

		// Do Commander Early Activation Skills
		doEarlyActivationSkills(field_p.commander);

		// Set invisibile/ward/shrouded after enhance has had a chance to fire
		for (var key = 0, len = field_p_assaults.length; key < len; key++) {
			var current_assault = field_p_assaults[key];
			setPassiveStatus(current_assault, 'evade', 'invisible');
			setPassiveStatus(current_assault, 'absorb', 'warded');
		}

		// Do Unit Early Activation Skills
		doEarlyActivations(field_p);

		// Commander
		// - activation skills after units do early activation skills
		activation_skills(field_p_commander);

		// Assaults
		for (var key = 0, len = field_p_assaults.length; key < len; key++) {

			var current_assault = field_p_assaults[key];

			if (!current_assault.isAlive()) {
				continue;
			}

			// Check Timer
			if (!current_assault.isActive()) {
				continue;
			}

			// Check jammed ("frozen")
			if (current_assault['jammed']) {
				if (debug) echo += debug_name(current_assault) + ' is frozen and cannot attack<br>';
				continue;
			}

			var activations = 1;
			if (current_assault.dualstrike_triggered) {
				activations++;
				if (debug) echo += debug_name(current_assault) + ' activates dualstrike<br>';
			}

			for (; activations > 0; activations--) {

				// Activation skills
				activation_skills(current_assault);

				// See if unit died from Backlash/Iceshatter
				if (!current_assault.isAlive()) {
					continue;
				}

				// Check attack
				// - check rally and weaken
				if (!current_assault.hasAttack()) {
					if (debug && current_assault.permanentAttack() > 0) echo += debug_name(current_assault) + ' is weakened and cannot attack<br>';
					continue;
				}

				doAttack(current_assault, field_o_assaults, field_o_commander);

				// WINNING CONDITION
				if (!field_o_commander.isAlive() || !field_p_commander.isAlive()) {
					return;
				}

				// If died from counter, make sure dualstrike doesn't do make it swing again!
				if (!current_assault.isAlive()) {
					// This assault is already dead and can't do anything!
					break;
				}

			} // -- END ACTIVATIONS --

			// -- END ATTACK SEQUENCE --
		}
		// End of Assaults

		// Remove from your field: Chaos, Jam, Enfeeble, Rally, Weaken, Enhance, Nullify
		// Process Scorch, Poison, and Corrosion
		processDOTs(field_p_assaults);

		// Dead cards are removed from both fields. Cards on both fields all shift over to the left if there are any gaps.
		remove_dead();

		//debug_dump_field(field);
		if (debug) echo += '<u>Turn ' + turn + ' ends</u><br><br></div>';
	};

	function setPassiveStatus(assault, skillName, statusName) {
		var statusValue = 0;

		if (assault[skillName]) {
			statusValue = assault[skillName];
			var enhanced = getEnhancement(assault, skillName, statusValue);
			statusValue += enhanced;
		}

		assault[statusName] = statusValue;
	}

	function modifySkillDamage(target, damage, exclusions) {
		// Check Protect/Enfeeble
		exclusions = (exclusions || {});
		var enfeeble = (exclusions.enfeeble ? 0 : (target.enfeebled || 0));
		var shrouded = (exclusions.stasis ? 0 : checkShroud(target));
		var protect = (exclusions.protect ? 0 : (target.protected || 0));
		var warded = (exclusions.ward ? 0 : (target.warded || 0));

		damage += enfeeble - shrouded;
		var shatter = false;
		if (warded) {
			damage -= applyDamageReduction(target, 'warded', damage);
		}
		if (protect) {
			damage -= applyDamageReduction(target, 'protected', damage);
			if (target.protected == 0) {
				shatter = target.barrier_ice;
			}
		}
		if (shrouded) {
			damage -= shrouded;
		}

		var echo = '';
		if(debug) {
			if (enfeeble) echo += ' Enfeeble: +' + enfeeble;
			if (shrouded) echo += ' Stasis: -' + shrouded;
			if (protect) echo += ' Barrier: -' + protect;
			if (warded) echo += ' Ward: -' + warded;
		}

		if (damage < 0) {
			damage = 0;
		}

		return {
			damage: damage,
			shatter : shatter,
			echo: echo
		};
	}

	function applyDamageReduction(target, statusName, damage) {
		var statusValue = target[statusName];
		if (damage >= statusValue) {
			target[statusName] = 0;
			return statusValue;
		} else {
			target[statusName] -= damage;
			return damage;
		}
	}

	function doCountDowns(unit) {
		doSkillCountDowns(unit, unit.skill);
		doSkillCountDowns(unit, unit.earlyActivationSkills);

		var dualStrike = unit.flurry;
		if (dualStrike && dualStrike.countdown) {
			dualStrike.countdown--;

			if (debug) {
				if (dualStrike.countdown) {
					echo += debug_name(unit) + ' charges  dualstrike (ready in ' + dualStrike.countdown + ' turns)<br/>';
				} else {
					echo += debug_name(unit) + ' readies dualstrike<br/>';
				}
			}
		}
	}

	function doSkillCountDowns(unit, skills) {
		for (var i = 0, len = skills.length; i < len; i++) {
			var skill = skills[i];
			if (skill.countdown) {
				skill.countdown--;
				if (debug) {
					if (skill.countdown) {
						echo += debug_name(unit) + ' charges ' + convertName(skill.id) + ' (ready in ' + skill.countdown + ' turns)<br/>';
					} else {
						echo += debug_name(unit) + ' readies ' + convertName(skill.id) + '<br/>';
					}
				}
			}
		}
	}

	function processDOTs(field_p_assaults) {

		for (var key = 0, len = field_p_assaults.length; key < len; key++) {
			var current_assault = field_p_assaults[key];

			// Make sure jam-self doesn't wear off at end of turn it was applied
			if (current_assault.jammedSelf) {
				current_assault.jammedSelf = false;
			} else {
				current_assault.jammed = false;
			}
			current_assault.attack_rally = 0;
			current_assault.attack_weaken = 0;
			current_assault.nullified = 0;
			current_assault.dualstrike_triggered = false;
			current_assault.silenced = false;

			// Regenerate
			if (current_assault.regenerate && current_assault.isDamaged()) {

				var regen_health = current_assault.regenerate;
				var enhanced = getEnhancement(current_assault, 'regenerate', regen_health);
				regen_health += enhanced;
				var healthMissing = current_assault.health - current_assault.health_left;
				if (regen_health >= healthMissing) {
					regen_health = healthMissing;
				}

				current_assault.health_left += regen_health;
				if (debug) echo += debug_name(current_assault) + ' regenerates ' + regen_health + ' health<br>';
			}

			// Poison
			var amount = current_assault.poisoned;
			if (amount) {
				var warded = current_assault.warded;
				if (warded) {
					amount -= applyDamageReduction(current_assault, 'warded', amount);
				}
				do_damage(null, current_assault, amount, null, function (source, target, amount) {
					echo += debug_name(target) + ' takes ' + amount;
					if (warded) echo += ' (Poison: +' + current_assault.poisoned + ' Ward: -' + warded + ')';
					echo += ' poison damage';
					echo += (!target.isAlive() ? ' and it dies' : '') + '<br>';
				});
			}

			// Venom
			var amount = current_assault.envenomed;
			if (amount) {
				var warded = current_assault.warded;
				if (warded) {
					amount -= applyDamageReduction(current_assault, 'warded', amount);
				}
				do_damage(null, current_assault, amount, null, function (source, target, amount) {
					echo += debug_name(target) + ' takes ' + amount;
					if(warded) echo += ' (Venom: +' + current_assault.envenomed + ' Ward: -' + warded + ')';
					echo += ' venom damage';
					echo += (!target.isAlive() ? ' and it dies' : '') + '<br>';
				});
			}

			// Scorch
			var scorch = current_assault.scorched;
			if (scorch) {
				amount = scorch.amount;
				var warded = current_assault.warded;
				if (warded) {
					amount -= applyDamageReduction(current_assault, 'warded', amount);
				}
				do_damage(null, current_assault, amount, null, function (source, target, amount) {
					echo += debug_name(target) + ' takes ' + amount;
					if (warded) echo += ' (Scorch: +' + scorch.amount + ' Ward: -' + warded + ')';
					echo += ' scorch damage';
					if (!target.isAlive()) echo += ' and it dies';
					else if (!target.scorched) echo += ' and scorch wears off';
					echo += '<br>';
				});

				if (scorch['timer'] > 1) {
					scorch['timer']--;
				} else {
					current_assault['scorched'] = 0;
				}
			}

			// Corrosion
			var corroded = current_assault.corroded;
			if (corroded) {
				corroded.timer--;
				// TODO: Is this a bug in the game?
				if (corroded.timer < 0) {
					current_assault.corroded = false;
					current_assault.attack_corroded = 0;
					if (debug) {
						echo += debug_name(current_assault) + ' recovers from corrosion<br>';
					}
				} else {
					var corrosion = corroded.amount;
					current_assault.attack_corroded = corrosion;
					if (debug) {
						echo += debug_name(current_assault) + ' loses ' + corrosion + ' attack to corrosion<br>';
					}
				}
			}

			if (!current_assault.isAlive()) {
				doOnDeathSkills(current_assault, null);
			}
		}
	};

	function doAttack(current_assault, field_o_assaults, field_o_commander) {

		// -- START ATTACK SEQUENCE --
		var target = field_o_assaults[current_assault.key];
		if (!target || !target.isAlive()) {
			target = field_o_commander;
		} else {
			// Check for taunt; if unit has taunt, attacks directed at it can't be "taunted" elsewhere
			var taunted = false;
			if (!target.taunt) {
				// Check left first, then right
				var adjacent = field_o_assaults[current_assault.key - 1];
				if (adjacent && adjacent.taunt) {
					target = adjacent;
					taunted = true;
				} else {
					var adjacent = field_o_assaults[current_assault.key + 1];
					if (adjacent && adjacent.taunt) {
						target = adjacent;
						taunted = true;
					}
				}
			}
			if (taunted && debug) echo += debug_name(target) + ' taunts ' + debug_name(current_assault);
		}

		// -- CALCULATE DAMAGE --
		var damage = current_assault.adjustedAttack(); // Get base damage + rally/weaken

		// Enfeeble
		var enfeeble = target.enfeebled;
		damage += enfeeble;

		if (debug) {
			echo += '<u>(Attack: +' + current_assault.attack;
			if (current_assault.attack_berserk) echo += ' Berserk: +' + current_assault.attack_berserk;
			if (current_assault.attack_valor) echo += ' Valor: +' + current_assault.attack_valor;
			if (current_assault.attack_rally) echo += ' Rally: +' + current_assault.attack_rally;
			if (current_assault.attack_weaken) echo += ' Weaken: -' + current_assault.attack_weaken;
			if (current_assault.attack_corroded) echo += ' Corrosion: -' + current_assault.attack_corroded;
			if (enfeeble) echo += ' Enfeeble: +' + enfeeble;
		}

		// Pierce
		// var pierce = current_assault['skill']['pierce'];
		var pierce = current_assault.pierce;
		if (pierce) {
			var enhanced = getEnhancement(current_assault, 'pierce', pierce);
			pierce += enhanced;
		} else {
			pierce = 0;
		}

		// Damage reduction
		var protect = target.protected;
		var shatter = false;
		var armor = target.armored;
		var shrouded = checkShroud(target);
		// Barrier is applied BEFORE Armor
		if (protect) {
			if (debug) {
				echo += ' Barrier: -' + protect;
			}
			// Remove pierce from Barrier
			if (pierce) {
				if (pierce >= protect) {
					if (debug) echo += ' Pierce: +' + protect;
					pierce -= protect;
					protect = 0;
					target.protected = 0;
				} else {
					if (debug) echo += ' Pierce: +' + pierce;
					protect -= pierce;
					target.protected -= pierce;
					// Bug 27415 - Pierce does NOT reduce potential Iceshatter damage unless protect is completely removed by it
					//target.barrier_ice -= pierce;
					pierce = 0;
				}
			}
			if (protect) {
				if (damage >= protect) {
					shatter = target.barrier_ice;
					damage -= protect;
					target.protected = 0;
				} else {
					target.protected -= damage;
					damage = 0;
				}
			}
		}
		if (shrouded) {
			shrouded += getEnhancement(target, 'stasis', shrouded);
			if (debug) {
				echo += ' Shroud: -' + shrouded;
			}
			// Remove pierce from Shroud
			if (pierce) {
				if (pierce > shrouded) {
					if (debug) echo += ' Pierce: +' + shrouded;
					shrouded = 0;
				} else {
					if (debug) echo += ' Pierce: +' + pierce;
					shrouded -= pierce;
				}
			}
			damage -= shrouded;
		}
		if (armor) {
			armor += getEnhancement(target, 'armored', armor);
			if (debug) {
				echo += ' Armor: -' + armor;
			}
			// Remove pierce from Armor
			if (pierce) {
				if (pierce > armor) {
					if (debug) echo += ' Pierce: +' + armor;
					armor = 0;
				} else {
					if (debug) echo += ' Pierce: +' + pierce;
					armor -= pierce;
				}
			}
			damage -= armor;
		}

		if (damage < 0) damage = 0;

		if (debug) echo += ') = ' + damage + ' damage</u><br>';

		// -- END OF CALCULATE DAMAGE --

		// Deal damage to target
		do_damage(current_assault, target, damage, null, function (source, target, amount) {
			echo += debug_name(source) + ' attacks ' + debug_name(target) + ' for ' + amount + ' damage';
			echo += (!target.isAlive() ? ' and it dies' : '') + '<br>';
		});

		if (showAnimations) {
			drawField(field, null, null, turn, current_assault);
		}

		// WINNING CONDITION
		if (!field_o_commander.isAlive()) {
			return;
		}

		// Damage-dependent Status Inflictions
		if (damage > 0 && target.isAssault() && target.isAlive()) {
			// Poison
			// - Target must have taken damage
			// - Target must be an assault
			// - Target must not be already poisoned of that level
			if (current_assault.poison) {
				var poison = current_assault.poison;
				var enhanced = getEnhancement(current_assault, 'poison', poison);
				poison += enhanced;
				if (poison > target.poisoned) {
					target.poisoned = poison;
					if (debug) echo += debug_name(current_assault) + ' inflicts poison(' + poison + ') on ' + debug_name(target) + '<br>';
				}
			}

			// Venom
			// - Target must have taken damage
			// - Target must be an assault
			// - Sets poisioned to greater of target's current poisioned or new poison
			// - Sets envenomed to greater of target's current envenomed or new venom
			if (current_assault.venom) {
				var venom = current_assault.venom;
				var enhanced = getEnhancement(current_assault, 'venom', venom);
				venom += enhanced;

				if (venom > target.envenomed) {
					var hexIncrease = venom - target.envenomed;
					target.envenomed = venom;
					target.enfeebled += hexIncrease;
					if (debug) echo += debug_name(current_assault) + ' inflicts venom(' + venom + ') on ' + debug_name(target) + '<br>';
				}
			}

			// Nullify
			// - Attacker must have taken damage
			// - Target must be an assault
			if (current_assault.nullify) {
				var nullify = current_assault.nullify;
				var enhanced = getEnhancement(current_assault, 'nullify', nullify);
				nullify += enhanced;
				target.nullified += nullify;
				if (debug) echo += debug_name(current_assault) + ' inflicts nullify(' + nullify + ') on ' + debug_name(target) + '<br>';
			}

			// Silence
			// - Attacker must have taken damage
			// - Target must be an assault
			if (current_assault.silence) {
				target.silenced = true;
				if (debug) echo += debug_name(current_assault) + ' inflicts silence on ' + debug_name(target) + '<br>';
			}

			// Daze
			// - Target must have taken damage
			// - Target must be an assault
			if (current_assault.daze) {

				var dazed = current_assault.daze;
				var enhanced = getEnhancement(current_assault, 'daze', dazed);
				dazed += enhanced;

				target.attack_weaken += dazed;
				if (debug) echo += debug_name(current_assault) + ' dazed ' + debug_name(target) + ' for ' + dazed + '<br>';
			}
		}

		if (shatter) {
			iceshatter(target);
		}

		if (damage > 0 && current_assault.isAlive()) {
			// Leech
			// - Must have dealt damage
			// - Cannot leech more than damage dealt
			// - Cannot leech more health than damage sustained
			// - Leecher must not be already dead
			// - Leecher must not be at full health
			// - Increases attack too during Invigorate battleground effect
			if (current_assault.leech && current_assault.isDamaged()) {

				var leech_health = current_assault.leech;
				var enhanced = getEnhancement(current_assault, 'leech', leech_health);
				leech_health += enhanced;
				var healthMissing = current_assault.health - current_assault.health_left;
				if (leech_health >= healthMissing) {
					leech_health = healthMissing;
				}

				current_assault.health_left += leech_health;
				if (debug) echo += debug_name(current_assault) + ' siphons ' + leech_health + ' health<br>';
			}

			if (current_assault.reinforce) {
				var reinforce = current_assault.reinforce;
				var enhanced = getEnhancement(current_assault, 'reinforce', reinforce);
				reinforce += enhanced;

				current_assault.protected += reinforce;
				if (debug) echo += debug_name(current_assault) + ' reinforces itself with barrier ' + reinforce + '<br>';
			}

			// Counter
			// - Target must have received some amount of damage
			// - Attacker must not be already dead
			if (target.counter) {

				var counterBase = 0 + target.counter;
				var counterEnhancement = getEnhancement(target, 'counter', counterBase);

				doCounterDamage(current_assault, target, 'Vengance', counterBase, counterEnhancement);
			}

			// Counterburn
			// - Target must have received some amount of damage
			if (target.counterburn) {
				var scorch = target.counterburn || 0;
				var enhanced = getEnhancement(target, 'counterburn', scorch);
				scorch += enhanced;
				if (!current_assault.scorched) {
					current_assault.scorched = { 'amount': scorch, 'timer': 2 };
				} else {
					current_assault.scorched.amount += scorch;
					current_assault.scorched.timer = 2;
				}
				if (debug) echo += debug_name(target) + ' inflicts counterburn(' + scorch + ') on ' + debug_name(current_assault) + '<br>';
			}

			// Counterpoison
			// - Target must have received some amount of damage
			if (target.counterpoison) {
				var poison = target.counterpoison || 0;
				var enhanced = getEnhancement(target, 'counterpoison', poison);
				poison += enhanced;
        
				if (poison > current_assault.poisoned) {
					current_assault.poisoned = poison;
          			if (debug) echo += debug_name(target) + ' inflicts counterpoison(' + poison + ') on ' + debug_name(current_assault) + '<br>';
				}
			}

			// Fury
			// - Target must have received some amount of damage
			if (target.fury) {
				var furyBase = target.fury;
				var furyEnhancement = getEnhancement(target, 'counter', furyBase);

				if (target.isAlive()) {
					var fury = furyBase + furyEnhancement;
					target.attack_berserk += fury;
					if (debug) {
						echo += debug_name(target) + ' activates fury and gains ' + fury + ' attack<br>';
					}
				}

				doCounterDamage(current_assault, target, 'Fury', furyBase, furyEnhancement);
			}

			if (target.enraged > 0) {
				target.attack_berserk += target.enraged;
				if (debug) echo += debug_name(target) + " is enraged and gains " + target.enraged + " attack!</br>";
			}

			// Berserk
			// - Must have done some damage to an assault unit
			if (current_assault.berserk) {

				var berserk = current_assault.berserk;
				var enhanced = getEnhancement(current_assault, 'berserk', berserk);
				berserk += enhanced;

				current_assault.attack_berserk += berserk;
				if (debug) echo += debug_name(current_assault) + ' activates berserk and gains ' + berserk + ' attack<br>';
			}
		}

		// -- CHECK STATUS INFLICTION --

		// Corrosion
		// - Target must have received some amount of damage
		if (target.corrosive) {
			var corrosion = target.corrosive || 0;
			var enhanced = getEnhancement(target, 'corrosive', corrosion);
			corrosion += enhanced;
			if (current_assault.corroded) {
				current_assault.corroded.amount += corrosion;
				current_assault.corroded.timer = 2;
			} else {
				current_assault.corroded = { amount: corrosion, timer: 2 };
			}
			if (debug) echo += debug_name(target) + ' inflicts corrosion(' + corrosion + ') on ' + debug_name(current_assault) + '<br>';
			current_assault.attack_corroded = corrosion;
			if (debug) {
				echo += debug_name(current_assault) + ' loses ' + corrosion + ' attack to corrosion<br>';
			}
		}

		if (!current_assault.isAlive()) {
			doOnDeathSkills(current_assault, target);
		}

		if (showAnimations) {
			drawField(field, null, null, turn, current_assault);
		}
		// -- END OF STATUS INFLICTION --
	};

	function doCounterDamage(attacker, defender, counterType, counterBase, counterEnhancement) {

		var counterDamage = counterBase + counterEnhancement;

		// Protect
		var damageInfo = modifySkillDamage(attacker, counterDamage, {enfeeble: true});
		counterDamage = damageInfo.damage;
		var shatter = damageInfo.shatter;

		if (debug) {
			echo += '<u>(' + counterType + ': +' + counterBase;
			if (counterEnhancement) echo += ' Enhance: +' + counterEnhancement;
			echo += damageInfo.echo;
			echo += ') = ' + counterDamage + ' damage</u><br>';
		}

		do_damage(defender, attacker, counterDamage, null, function (source, target, amount) {
			echo += debug_name(target) + ' takes ' + amount + ' ' + counterType.toLowerCase() + ' damage';
			echo += (!target.isAlive() ? ' and it dies' : '') + '<br>';
		});
	}

	function calculatePoints(forceWin) {
		var uids = field.uids;
		var healthStats = {
			player: {
				total: 0,
				taken: 0
			},
			cpu: {
				total: 0,
				taken: 0
			},
		};

		for (var i in uids) {
			var unit = uids[i];
			var stats = healthStats[unit.owner];
			if (stats) {
				stats.total += unit.health;
				if (unit.played || unit.isCommander()) {
					stats.taken += (unit.health - unit.health_left);
				}
			}
		}
		healthStats.player.percent = stats.taken / stats.total;
		healthStats.cpu.percent = stats.taken / stats.total;

		var commander_o = field.cpu.commander;
		if (getdeck2) {
			if (commander_o.isAlive() && !forceWin) {
				// 0-25 points, based on percentage of damage dealt to enemy
				var points = Math.floor(healthStats.cpu.percent * 25);
			} else {
				// 115-130 points, based on percentage of damage taken
				var points = 130 - Math.floor(healthStats.player.percent * 15);
			}
		} else {
			if (commander_o.isAlive() && !forceWin) {
				var points = Math.floor(healthStats.cpu.percent / 0.02);
				points = Math.max(5, points);
			} else {
				var points = 200 - Math.floor(healthStats.player.percent / 0.02);
			}
		}
		return points;
	}

	var deck = {};
	var field = {};
	var battlegrounds;
	var simulation_turns = 0;
	var simulating = false;
	var user_controlled = false;
	var livePvP = false;
	var turn = 0;
	var totalDeckHealth = 0;
	var totalCpuDeckHealth = 0;

	// public functions
	SIMULATOR.simulate = simulate;
	SIMULATOR.onPlaySkills = onPlaySkills;
	SIMULATOR.calculatePoints = calculatePoints;
	// public variables
	Object.defineProperties(SIMULATOR, {
		setupDecks: {
			get: function () {
				return setupDecks;
			},
			set: function (value) {
				setupDecks = value;
			}
		},
		setupField: {
			get: function () {
				return setupField;
			},
			set: function (value) {
				setupField = value;
			}
		},
		deck: {
			get: function () {
				return deck;
			},
			set: function (value) {
				deck = value;
			}
		},
		field: {
			get: function () {
				return field;
			},
			set: function (value) {
				field = value;
			}
		},
		battlegrounds: {
			get: function () {
				return battlegrounds;
			},
			set: function (value) {
				battlegrounds = value;
			}
		},
		simulation_turns: {
			get: function () {
				return simulation_turns;
			},
			set: function (value) {
				simulation_turns = value;
			}
		},
		simulating: {
			get: function () {
				return simulating;
			},
			set: function (value) {
				simulating = value;
			}
		},
		totalDeckHealth: {
			get: function () {
				return totalDeckHealth;
			},
			set: function (value) {
				totalDeckHealth = value;
			}
		},
		totalCpuDeckHealth: {
			get: function () {
				return totalCpuDeckHealth;
			},
			set: function (value) {
				totalCpuDeckHealth = value;
			}
		},
		user_controlled: {
			get: function () {
				return user_controlled;
			},
			set: function (value) {
				user_controlled = value;
			}
		},
		livePvP: {
			get: function () {
				return livePvP;
			},
			set: function (value) {
				livePvP = value;
			}
		},
	});
})();;"use strict";

(function () {

    // Initialize simulation loop - runs once per simulation session
    SIM_CONTROLLER.startsim = function () {
        total_turns = 0;
        time_start = Date.now();
        time_stop = 0;
        echo = '';
        games = 0;
        run_sims_batch = 0;

        SIM_CONTROLLER.getConfiguration();

        // Set up battleground effects, if any
        SIMULATOR.battlegrounds = getBattlegrounds(getbattleground, selfbges, enemybges, mapbges, getcampaign, missionlevel, getraid, raidlevel);

        hideUI();

        SIMULATOR.setupDecks();

        wins = 0;
        losses = 0;
        draws = 0;
        points = 0;

        outp(""); // Clear display
        if (!SIMULATOR.user_controlled) {
            hideTable();
            setSimStatus("Initializing simulations...");
        } else {
            setSimStatus("");
        }

        current_timeout = setTimeout(run_sims);

        return false;
    }

    // Interrupt simulations
    SIM_CONTROLLER.stopsim = function () {
        time_stop = new Date();
        var elapse = time_elapsed();
        var simpersec = games / elapse;
        simpersec = simpersec.toFixed(2);
        SIMULATOR.simulating = false;

        // Stop the recursion
        if (current_timeout) clearTimeout(current_timeout);
        if (!SIMULATOR.user_controlled) {
            setSimStatus("Simulations interrupted.", elapse, simpersec);
            showWinrate();
        }
        showUI();

        if (SIM_CONTROLLER.stop_sims_callback) SIM_CONTROLLER.stop_sims_callback()
    }

    function run_sims() {

        if (SIMULATOR.user_controlled) {
            if (run_sim(true)) {
                SIM_CONTROLLER.debug_end();
            }
        } else if ((debug ||play_debug) && !mass_debug && !loss_debug && !win_debug) {
            run_sim(true);
            SIM_CONTROLLER.debug_end();
        } else if (sims_left > 0) {
            // Interval output - speeds up simulations
            if (run_sims_count >= run_sims_batch) {
                var simpersecbatch = 0;
                if (run_sims_batch > 0) { // Use run_sims_batch == 0 to imply a fresh set of simulations
                    run_sims_count = 0;
                    var temp = games / (games + sims_left) * 100;
                    temp = temp.toFixed(2);

                    var elapse = time_elapsed();

                    var batch_elapse = batch_time_elapsed();
                    if (batch_elapse == 0) {
                        simpersecbatch = 0;
                    } else {
                        simpersecbatch = run_sims_batch / batch_elapse;
                    }

                    setSimStatus("Running simulations...", elapse, simpersecbatch.toFixed(1));
                    showWinrate();
                }
                run_sims_batch = 1;
                if (simpersecbatch > run_sims_batch) // If we can run more at one time, then var's try to
                    run_sims_batch = Math.ceil(simpersecbatch / 8);
                if (run_sims_batch > sims_left) // Also limit by how many sims are left
                    run_sims_batch = sims_left;

                // Batch messes up mass debug and loss debug! var's disable batch!
                if ((debug || play_debug) && (mass_debug || loss_debug || win_debug)) run_sims_batch = 1;

                time_start_batch = new Date();
                current_timeout = setTimeout(run_sims, 1);
                for (var i = 0; i < run_sims_batch; i++) {  // Start a new batch
                    run_sim();
                }
            }
        } else {
            run_sims_count = 0;
            run_sims_batch = 0;
            time_stop = new Date();

            var elapse = time_elapsed();
            var simpersec = games / elapse;
            simpersec = simpersec.toFixed(2);

            if (echo) {
                outp(echo);
            }
            setSimStatus("Simulations complete.", elapse, simpersec);
            showWinrate();

            showUI();

            if (SIM_CONTROLLER.end_sims_callback) SIM_CONTROLLER.end_sims_callback();
        }
    }

    // Initializes a single simulation - runs once before each individual simulation
    // - needs to reset the decks and fields before each simulation
    var seedtest = (_GET("seedtest") || 0);
    function run_sim(skipResults) {
        if (seedtest) {
            Math.seedrandom(seedtest++);
        }
        if (!SIMULATOR.simulate()) return false;
        if (!skipResults) SIM_CONTROLLER.processSimResult();
    }

    SIM_CONTROLLER.processSimResult = function () {

        var result;
        if (!SIMULATOR.field.player.commander.isAlive()) {
            result = false;
        }
        else if (!SIMULATOR.field.cpu.commander.isAlive()) {
            result = true;
        }
        else {
            result = 'draw';
        }

        if (run_sims_batch > 0) {
            if (sims_left > 0) sims_left--;
            run_sims_count++;
        }

        // Increment wins/losses/games
        if (result == 'draw') {
            draws++;
        } else if (result) {
            wins++;;
        } else {
            losses++;
        }
        points += SIMULATOR.calculatePoints();
        games++;

        // Increment total turn count
        total_turns += SIMULATOR.simulation_turns;

        if (debug || play_debug) {
            if (loss_debug) {
                if (result == 'draw') {
                    echo = 'Draw found after ' + games + ' games. Displaying debug output... <br><br>' + echo;
                    echo += '<br><h1>DRAW</h1><br>';
                    sims_left = 0;
                } else if (result) {
                    if (!sims_left) {
                        echo = 'No losses found after ' + games + ' games. No debug output to display.<br><br>';
                        sims_left = 0;
                    } else {
                        echo = '';
                    }
                } else {
                    echo = 'Loss found after ' + games + ' games. Displaying debug output... <br><br>' + echo;
                    echo += '<br><h1>LOSS</h1><br>';
                    sims_left = 0;
                }
            } else if (win_debug) {
                if (result && result != 'draw') {
                    echo = 'Win found after ' + games + ' games. Displaying debug output... <br><br>' + echo;
                    echo += '<br><h1>WIN</h1><br>';
                    sims_left = 0;
                } else {
                    if (!sims_left) {
                        echo = 'No wins found after ' + games + ' games. No debug output to display.<br><br>';
                        sims_left = 0;
                    } else {
                        echo = '';
                    }
                }
            } else if (mass_debug) {
                if (result == 'draw') {
                    echo += '<br><h1>DRAW</h1><br>';
                } else if (result) {
                    echo += '<br><h1>WIN</h1><br>';
                } else {
                    echo += '<br><h1>LOSS</h1><br>';
                }
            }

            if (mass_debug && sims_left) echo += '<br><hr>NEW BATTLE BEGINS<hr><br>';
        }

        return result;
    }

    // Global variables used by single-threaded simulator
    var run_sims_count = 0;
    var run_sims_batch = 0;
})();;(function (angular) {
    'use strict';

    var filterByParent = function (unfiltered, parentID, parentIDField) {
        return unfiltered.filter(function (entry) {
            return entry[parentIDField] == parentID;
        });
    };

    var filterChildren = function (unfiltered, parentID, parents, childrenField, childIDField) {
        var parent = parents.filter(function(parent) { return parent.id == parentID; })[0];
        if (parent) {
            var children = parent[childrenField];
            var filtered = unfiltered.filter(function (child) {
                var childID = child[childIDField];
                var isChildOfParent = children.indexOf(childID) >= 0
                return isChildOfParent;
            });
            return filtered;
        } else {
            return [];
        }
    };

    angular.module('core', [])
        .filter('forMissions', function () {
            return function (campaigns, missions) {
                if (!campaigns || !missions) return campaigns;

                var newCampaigns = [];;
                for (var i = 0, len = campaigns.length; i < len; i++) {
                    var campaign = campaigns[i];
                    var missionsInCampaign = campaign.missions;
                    var inCampaign = true;

                    for (var j = 0; j < missionsInCampaign.length; j++) {
                        var mission = missionsInCampaign[j];
                        if (!missions[mission]) {
                            inCampaign = false;
                            break;
                        }
                    }
                    if (inCampaign) {
                        newCampaigns.push(campaign);
                    }
                }
                return newCampaigns;
            };
        })
        .filter('filterByParent', function () {
            return filterByParent;
        })
        .filter('filterChildren', function () {
            return filterChildren;
        });

    angular.module('simulatorApp', ['core'])
        .controller('SimulatorCtrl', ['$scope', '$window', SimulatorCtrl]);

    function SimulatorCtrl($scope, $window) {
        $scope.locations = [];
        $scope.campaigns = [];
        $scope.missions = $window.TITANS;
        $scope.raids = $window.RAIDS;
        $scope.battlegrounds = $window.BATTLEGROUNDS;
        $scope.mapBattlegrounds = toArray($window.MAP_BATTLEGROUNDS);

        $scope.campaignBGEs = [];

        $scope.tower = false;
        $scope.auto = false;

        $scope.debugMode = false;

        $scope.selections = {
            location: '',
            campaign: '',
            mission: '',
            raid: ''
        };

        $scope.titans = function () {
            $scope.campaigns = toArray($window.CAMPAIGNS);
            $scope.missions = $window.TITANS;
        };

        $scope.campaignSections = function () {
            $scope.locations = ToArray($window.LOCATIONS).sort(function (locationA, locationB) {
                return Number(locationA.id) - Number(locationB.id);
            });
            $scope.missions = ToArray($window.MISSIONS);
            $scope.campaigns = ToArray($window.CAMPAIGNS);
        };

        function ToArray(table) {
            var IDs = Object.keys(table);
            IDs.sort(function (a, b) {
                return Number(a) - Number(b);
            });
            var list = [];
            for (var i = 0; i < IDs.length; i++) {
                var key = IDs[i];
                var entry = table[key];
                list.push(entry);
            }
            return list;
        }

        $scope.filteredRaids = function () {
            var filtered = {};
            toArray($scope.raids)
                .sort(function (raidA, raidB) {
                    return Number(raidB.id) - Number(raidA.id);
                })
            .forEach(function (raid) {
                if (!filtered[raid.name]) {
                    filtered[raid.name] = raid;
                }
            });
            return toArray(filtered)
                .sort(function (raidA, raidB) {
                    return Number(raidA.id) - Number(raidB.id);
                });
        }

        $scope.getLocationClass = function (location) {
            if (!location) {
                var selected = $scope.selections.location;
                location = $scope.locations.filter(function (location) {
                    return location.id == selected;
                })[0];
            }
            if (!location) {
                return "grey";
            } else {
                var id = Number(location.id);
                if (id === 0) {
                    return "heroUpgrade";
                } else if (id >= 100) {
                    return "event";
                } else {
                    return "black";
                }
            }
        };

        $scope.getCampaignClass = function (campaign) {
            if (!campaign) {
                var selected = $scope.selections.campaign;
                campaign = $scope.campaigns.filter(function (campaign) {
                    return campaign.id == selected;
                })[0];
            }
            if(!campaign) {
                return "grey";
            } else if (campaign.side_mission) {
                return (campaign.location_id == 0 ? "heroUpgrade" : "mythic");
            } else if (campaign.isLocation) {
                return "location";
            } else {
                return "black";
            }
        };

        $scope.$watch("selections.location", function (newValue, oldValue) {
            $scope.selections.campaign = '';
        });

        $scope.$watch("selections.campaign", function (newValue, oldValue) {
            $scope.selections.mission = '';
        });

        function toArray(object) {
            var ary = [];
            for (var key in object) {
                ary.push(object[key]);
            }
            return ary;
        }

        $scope.towerTypes = ["Castle Tower", "Cannon Tower", "Tree of Life"];
        
        $scope.selectableBattlegrounds = function () {
            var selectable = [];
            for(var id in $scope.battlegrounds) {
                var BGE = $scope.battlegrounds[id];
                if(!(BGE.hidden || BGE.isTower)) selectable.push(BGE);
            }
            selectable.sort(function (a, b) { return a.id - b.id; });
            return selectable;
        }

        $scope.personalBattlegrounds = function () {
            var selectable = [];
            for (var id in $scope.battlegrounds) {
                var BGE = $scope.battlegrounds[id];
                var bgeID = Number(BGE.id);
                if (bgeID > 1000 && bgeID < 2000) selectable.push(BGE);
            }
            selectable.sort(function (a, b) { return a.id - b.id; });
            return selectable;
        }

        $scope.towerTypes = function () {
            var towerTypes = [];
            for (var id in $scope.battlegrounds) {
                var BGE = $scope.battlegrounds[id];
                if (BGE.isTower) towerTypes.push(BGE);
            }
            towerTypes.sort(function (a, b) { return a.id - b.id; });
            return towerTypes;
        }

        $scope.$watch("debugMode", function (newValue, oldValue) {
        });
    }
    
}(angular));
;var storageAPI = {};

(function (angular) {
    'use strict';

    var DeckStorageCtrl = function ($scope, $window) {
        $scope.getSavedDecks = $window.storageAPI.getSavedDecks;

        $scope.keys = function (obj) {
            return (obj ? Object.keys(obj) : []);
        };
    };
    var module;
    try {
        module = angular.module('simulatorApp');
    }
    catch (loadError) {
        module = angular.module('simulatorApp', []);
    }

    module.controller('DeckStorageCtrl', ['$scope', '$window', DeckStorageCtrl]);

}(angular));

// Set up StorageAPI based on feature availability
if (function (type) {
    // LocalStorage Suppotr Check : https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API
    try {
        var storage = window[type],
            x = '__storage_test__';
        storage.setItem(x, x);
        storage.removeItem(x);
        return true;
} catch (e) {
        return false;
}
}('localStorage')) {
    (function () {
        var SaveFields = {
            decks: "SavedDecks",
            tutorial: "Tutorial"
        }

        storageAPI.initialize = function () {
            var currentPage = getCurrentPage();

            convertSavedDecks();

            storageAPI.getField(SaveFields.decks, "savedDecks", {});
            storageAPI.shouldShowTutorial = storageAPI.getField(SaveFields.tutorial, currentPage, true)[currentPage];

            var cachedOnUpdate = storageAPI.onUpdateDecks;
            storageAPI.onUpdateDecks = function (savedDecks) {
                cachedOnUpdate();
                storageAPI.setField(SaveFields.decks, "savedDecks", savedDecks);
            };

            var cachedSetShowTutorial = storageAPI.setShowTutorial;
            storageAPI.setShowTutorial = function (value) {
                cachedSetShowTutorial(value);
                storageAPI.setField(SaveFields.tutorial, currentPage, value);
            };
        };

        storageAPI.getField = function (storageName, fieldName, defaultValue) {

            var storage = getStorage(storageName);
    
            var value = storage[fieldName];
            if (typeof value === 'undefined') {
                value = defaultValue;
                storageAPI.setField(storageName, fieldName, value);
            }

            return value;
        }

        storageAPI.setField = function (storageName, fieldName, newValue) {
            var storage = getStorage(storageName);
            storage[fieldName] = newValue;
            localStorage.setItem(storageName, JSON.stringify(storage));
        }

        function getStorage(storageName) {
            var storage = localStorage.getItem(storageName);
            if (storage) {
                try {
                    storage = JSON.parse(storage);
                } catch (err) {
                    storage = {}
                }
            } else {
                storage = {};
            }
            storageAPI.data[storageName] = storage;
            return storage;
        }

        function convertSavedDecks() {
            var storage = getStorage(SaveFields.decks);
            if (typeof storage.savedDecks === 'undefined') {
                storageAPI.setField(SaveFields.decks, "savedDecks", storage);
            }
        }

        window.addEventListener('storage', function (e) {
        	if (e.key !== '__storage_test__') {
        		var oldValue = localStorage.getItem(e.key);
        		if (oldValue !== e.newValue) {
        			angular.element('#loadDeckDialog').scope().$apply(
						localStorage.setItem(e.key, e.newValue)
					);
        		}
        	}
        });
    }());
} else {
    (function () {
        storageAPI.initialize = function () {
            storageAPI.getSavedDecks = function () { return {} };
            storageAPI.loadDeck = notSupported;
            storageAPI.deleteDeck = notSupported;
            storageAPI.clearDecks = notSupported;
            storageAPI.getField = function (storageName, fieldName, defaultValue) {
                return defaultValue;
            }
            storageAPI.setField = function () { };

            storageAPI.savedDecks = {};
            storageAPI.shouldShowTutorial = true;
        };

        var notSupported = function (name, hash) {
            alert("Your browser does not support this feature.");
        };
    }());
}

(function () {
    var SaveFields = {
        decks: "SavedDecks"
    }

    storageAPI.data = {};

    storageAPI.getSavedDecks = function () {
        return storageAPI.getField(SaveFields.decks, "savedDecks", {});
    }

    storageAPI.saveDeck = function (name, hash) {
        var savedDecks = storageAPI.getSavedDecks();
        savedDecks[name] = hash;
        storageAPI.onUpdateDecks(savedDecks);
    };

    storageAPI.loadDeck = function (name) {
        return storageAPI.getSavedDecks()[name];
    };

    storageAPI.deleteDeck = function (name) {
        var savedDecks = storageAPI.getSavedDecks();
        delete savedDecks[name];
        storageAPI.onUpdateDecks(savedDecks);
    };

    storageAPI.clearDecks = function (name) {
        var savedDecks = storageAPI.getSavedDecks();
        for (var name in savedDecks) {
            delete savedDecks[name];
        }
        storageAPI.onUpdateDecks(savedDecks);
    };

    storageAPI.onUpdateDecks = function () {
        if (!$loadDialogScope) {
            $loadDialogScope = angular.element('#loadDeckDialog').scope();
        }
        $loadDialogScope.$apply();
    };

    storageAPI.setShowTutorial = function (value) {
        shouldShowTutorial = value;
    }

    storageAPI.initialize();

    var $loadDialogScope;
}());;'use strict';

var loadDeckDialog;
var mapBGEDialog;

$(function () {
    $("#deck1").change(function ()
    {
        this.value = this.value.trim();
        deckChanged("attack_deck", hash_decode(this.value), 'player');
    });

    $("#deck2").change(function ()
    {
        this.value = this.value.trim();
        deckChanged("defend_deck", hash_decode(this.value), 'cpu');
    });

    $("#battleground").change(function () {
        $("#deck1").change();
        if ($("#deck2").val()) {
            $("#deck2").change();
        } else if ($("#mission").val()) {
            $("#mission").change();
        } else if ($("#raid").val()) {
            $("#raid").change();
        }
    });

    var bges = $('label[bge-desc]');
    for (var i = 0; i < bges.length; i++) {
        var lblBge = $(bges[i]);
        lblBge.hover(showTooltip, hideTooltip);
        /*
        var tooltip = $('<div class="tooltip">' + lblBge.attr("bge-desc") + '</div>');
        var parent = lblBge.parent();
        parent.append($('<div></div>').append([lblBge.prev(), lblBge, tooltip]));
        */
    }

    function showTooltip(event) {
        var $container = $("#tooltip");
        var $text = $("#tooltip-text");

        $text.html($(event.target).attr('bge-desc'));
        $text.width(200);
        $container.show();

        $("#tooltip .arrow")
            .css("borderTopWidth", 0)
            .css("borderBottomWidth", 0);

        var offset = $(event.target).offset();
        offset.left -= 230;
        offset.top -= ($container.outerHeight() / 2) - 10;
        $container.offset(offset);

        var arrowHeight = $text.innerHeight() / 2 - 4;

        $("#tooltip .arrow")
            .css("borderTopWidth", arrowHeight)
            .css("borderBottomWidth", arrowHeight);
    }

    function hideTooltip(event) {
        $("#tooltip").hide();
    }

    function deckChanged(deckID, newDeck, owner) {
        var $deck = $("#" + deckID);
        $deck.children().remove();
        if (!_DEFINED("seedtest")) {
            SIM_CONTROLLER.getConfiguration();
            var battlegrounds = getBattlegrounds(getbattleground, selfbges, enemybges, mapbges, getcampaign, missionlevel, getraid, raidlevel);
            battlegrounds = battlegrounds.onCreate.filter(function (bge) {
                return !((owner === 'player' && bge.enemy_only) || (owner === 'cpu' && bge.ally_only));
            });

            $deck.append(CARD_GUI.makeDeckHTML(newDeck, false, battlegrounds));
        }
    }
    var accordions = $(".accordion").accordion({
        collapsible: true,
        active: false,
        heightStyle: "content",
    }).filter(".start-open").accordion('option', 'active' , 0);

    $("#raid, #raid_level").change(function () {
        var newDeck;
        var selectedRaid = $("#raid").val();
        var raidlevel = $('#raid_level');
        if (selectedRaid) {
            newDeck = load_deck_raid(selectedRaid, raidlevel.val());
            if (RAIDS[selectedRaid].type === "Dungeon") {
                raidlevel.attr("max", 150);
            } else {
                raidlevel.attr("max", 40);
            }
        } else {
            newDeck = hash_decode('');
            raidlevel.attr("max", 40);
        }

        deckChanged("defend_deck", newDeck, 'cpu');
    });

    $("#location, #campaign").change(function () {
        $("#mission").change();
    });

    $("#mission, #mission_level").change(function () {
        var newDeck;
        var missionID = $('#mission').val();
        if (missionID) {
            var missionLevel = $('#mission_level').val();
            newDeck = load_deck_mission(missionID, missionLevel);
        } else {
            newDeck = hash_decode('');
        }
        deckChanged("defend_deck", newDeck, 'cpu');
    });

    loadDeckDialog = $("#loadDeckDialog").dialog({
        autoOpen: false,
        minWidth: 320,
        /*
        minHeight: 20,
        */
        modal: true,
        resizable: false,
        buttons: {
            Delete: function () {
                var name = $("#loadDeckName").val();
                var newHash = storageAPI.deleteDeck(name);
            },
            Load: function () {
                var name = $("#loadDeckName").val();
                var newHash = storageAPI.loadDeck(name);
                onDeckLoaded(newHash, loadDeckDialog.hashField);
                loadDeckDialog.dialog("close");
            },
            Cancel: function () {
                loadDeckDialog.dialog("close");
            }
        }
    });
    mapBGEDialog = $("#bgeDialog").dialog({
        autoOpen: false,
        minWidth: 320,
        modal: true,
        resizable: false,
        buttons: {
            OK: function () {
                mapBGEDialog.dialog("close");
            },
            Cancel: function () {
                mapBGEDialog.dialog("close");
            }
        }
    });

    deckChanged("attack_deck", hash_decode(''));
    deckChanged("defend_deck", hash_decode(''));

    // Disable this as we now draw the full deck
    debug_dump_decks = function () { };

    setDeckSortable("#attack_deck", '#deck1');
    setDeckSortable("#defend_deck", '#deck2');

    if (_DEFINED("latestCards")) {
        var callback = null;
        if (_DEFINED("autostart")) {
            callback = function () {
                SIM_CONTROLLER.startsim(1);
            };
        }
        updateGameData(callback);
    } else {
        loadCardCache();
    }

    processQueryString();
});

function doneLoading() {
    $("body").removeClass("loading");
    checkTutorial();
}

function updateGameData(callback) {
    var done = doneLoading;
    if (callback) {
        done = function () {
            doneLoading();
            callback();
        }
    }
    DATA_UPDATER.updateData(done, true);
}

function setDeckSortable(deckField, associatedHashField)
{
    $(deckField).sortable({
        items: '.card:not(.commander):not(.blank)',
        tolerance: "intersect",
        helper: function (event, ui)
        {
            return ui.clone();
        },
        start: function (event, ui)
        {
            var origPos = ui.placeholder.index() - 1;
            ui.item.data('origPos', origPos);
            $(ui.item).hide();
        },
        stop: function (event, ui)
        {
            var origPos = ui.item.data('origPos') - 1;
            var newPos = ui.item.index() - 1;
            
            var hashField = $(associatedHashField);
            var deck = hash_decode(hashField.val());
            var array = deck.deck;
            array.splice(newPos, 0, array.splice(origPos, 1)[0]);
            var hash = hash_encode(deck);
            hashField.val(hash);
        }
    });
}

function showMapBGEs() {
    mapBGEDialog.dialog("open");
    mapBGEDialog.dialog("option", "position", { my: "center", at: "center", of: window });
}

function loadDeck(hashField) {
    $('label[for="loadDeckName"]').html('<strong>Deck:</strong>');
    loadDeckDialog.dialog("open");
    loadDeckDialog.dialog("option", "position", { my: "center", at: "center", of: window });

    loadDeckDialog.hashField = hashField;
}

function onDeckLoaded(newHash, hashField)
{
    $(hashField).val(newHash).change();
}

var dark = false;
function toggleTheme() {
    if (dark) {
        $("#theme").attr("href", "dist/light.min.css")
        $("#toggleTheme").val("Dark Theme");
    } else {
        $("#theme").attr("href", "dist/dark.min.css")
        $("#toggleTheme").val("Light Theme");
    }
    dark = !dark;
}

var frames = [];
var frameInterval = null;
function drawField(field, hand, callback, turn, activeUnit) {
    var newFrame = CARD_GUI.doDrawField(field, hand, callback, turn, activeUnit);
    frames.push(newFrame);
    if (!frameInterval) {
        drawFrames();
        frameInterval = setInterval(drawFrames, 500);
    }
}

function clearFrames() {
    frames = [];
    clearInterval(frameInterval);
    frameInterval = null;
}

var disabledInterval = false;
function drawFrames() {
    if (frames.length === 0) {
        if (disabledInterval) {
            clearInterval(frameInterval);
            frameInterval = null;
        } else {
            disabledInterval = true;
        }
    } else {
        var frame = frames.splice(0, 1)[0];
        $("#cardSpace").children().remove().end().append(frame);
        disabledInterval = false;
    }
};"use strict";

var deckPopupDialog;

window.onerror = function (message, url, linenumber) {
	if (linenumber == 0) {
		var msg = "<br><br><i>Error Message:</i><br><br>" +
			"<i>It appears you're having trouble loading SimSpellstone. " +
			"Thanks.</i><br><br>";
		if (outp) {
			outp(msg);
		} else {
			document.write(msg);
		}
		return 1;
	}
	var err_msg = "JavaScript error:\n " + message + "\n on line " + linenumber + "\n for " + url;
	var short_msg = err_msg;

	err_msg += "\n";
	err_msg += "Browser CodeName: " + navigator.appCodeName + "\n";
	err_msg += "Browser Name: " + navigator.appName + "\n";
	err_msg += "Browser Version: " + navigator.appVersion + "\n";
	err_msg += "Cookies Enabled: " + navigator.cookieEnabled + "\n";
	err_msg += "Platform: " + navigator.platform + "\n";
	err_msg += "User-agent header: " + navigator.userAgent + "\n";
	err_msg += "SimSpellstone version: " + text_version + "\n";

	if (getdeck) err_msg += "Deck hash: " + getdeck + "\n";
	if (getcardlist) err_msg += "Card list: " + getcardlist + "\n";
	if (getordered) err_msg += "Ordered: Yes\n";
	if (getexactorder) err_msg += "Exact-order: Yes\n";
	if (surge) err_msg += "Surge: Yes\n";
	if (getdeck2) err_msg += "Enemy deck hash: " + getdeck2 + "\n";
	if (getcardlist2) err_msg += "Enemy Card list: " + getcardlist2 + "\n";
	if (getordered2) err_msg += "Enemy Ordered: Yes\n";
	if (getexactorder2) err_msg += "Enemy Exact-order: Yes\n";
	if (getmission) err_msg += "Mission ID: " + getmission + "\n";
	if (getraid) err_msg += "Raid ID: " + getraid + "\n";
	if (getbattleground) err_msg += "Battleground ID: " + getbattleground + "\n";
	if (games) err_msg += "Sims run so far: " + games + "\n";

	outp("<br><br><i>Error Message:</i><br><textarea cols=50 rows=6 onclick=\"this.select()\"><blockquote>" + err_msg + "</blockquote></textarea>" + echo);

	// Stop the recursion if any
	if (current_timeout) clearTimeout(current_timeout);
}

// When Page Loads...
function processQueryString() {

	$("#header").load("templates/header.html", function () {
		if (typeof showTutorial !== "undefined") {
			$("#help").click(showTutorial);
		}
	});
	$.holdReady(true);
	$("#footer").load("templates/footer.html", function () {
		$.holdReady(false);
	});

	var ui = document.getElementById('ui');
	if (!ui) return 0;

	var $scope = angular.element(document.getElementById('ui')).scope();

	$("#generate_link").on("click", display_generated_link);

	$("#btn_simulate").on("click", SIM_CONTROLLER.startsim);
	$("#btnStop").on("click", SIM_CONTROLLER.stopsim);

	$("#display_history").on("click", display_history);

	$('#deck1').val(_GET('deck1')).change();
	$('#deck2').val(_GET('deck2')).change();

	$('#surge').prop("checked", _DEFINED("surge"));
	$('#siege').prop("checked", _DEFINED("siege"));
	var tower_level = Math.min(Math.max(_GET('tower_level') || 18, 0), 18);
	$('#tower_level').val(tower_level);

	var tower_type = (_GET('tower_type') || 501);
	$("#tower_type").val(tower_type);

	$('#auto_mode').prop("checked", _DEFINED("auto_mode"));
	$('#tournament').prop("checked", _DEFINED("tournament"));
	$('#ordered').prop("checked", _DEFINED("ordered"));
	$('#exactorder').prop("checked", _DEFINED("exactorder"));

	$('#ordered2').prop("checked", _DEFINED("ordered2"));
	$('#exactorder2').prop("checked", _DEFINED("exactorder2"));
	if (_DEFINED("randomAI")) {
		pvpAI = false;
	}

	var locationID = _GET('location');
	var campaignID = _GET('campaign');
	var missionID = _GET('mission');
	var raidID = _GET('raid');
	if (locationID) $('#location').val(locationID).change();
	if (campaignID) {
		if (!locationID) {
			locationID = CAMPAIGNS[campaignID].location_id;
			$('#location').val(locationID).change();
		}
		$('#campaign').val(campaignID).change();
	}
	if (missionID) {
		$('#mission_level').val(_GET('mission_level') || 7);
		$('#mission').val(missionID).change();
	}
	if (raidID) {
		$('#raid_level').val(_GET('raid_level') || 25);
		$('#raid').val(raidID).change();
	}

	if (_DEFINED("bges")) {
		var bges = _GET('bges');
		// Each BGE is a 2-character ID in Base64
		for (var i = 0; i < bges.length; i += 2) {
			var bge = base64_to_decimal(bges.substring(i, i + 2));
			$("#battleground_" + bge).prop('checked', true);
		}
	} else {
		// Load current battlegrounds
		var bgCheckBoxes = document.getElementsByName("battleground");
		for (var i = 0; i < current_bges.length; i++) {
			$("#battleground_" + current_bges[i]).prop('checked', true);
		}
	}
	var bges = _GET('selfbges');
	if (bges) {
		// Each BGE is a 2-character ID in Base64
		for (var i = 0; i < bges.length; i += 2) {
			var bge = base64_to_decimal(bges.substring(i, i + 2)) + 10000;
			$("#self-battleground_" + bge).prop('checked', true);
		}
	}
	var bges = _GET('enemybges');
	if (bges) {
		// Each BGE is a 2-character ID in Base64
		for (var i = 0; i < bges.length; i += 2) {
			var bge = base64_to_decimal(bges.substring(i, i + 2)) + 10000;
			$("#enemy-battleground_" + bge).prop('checked', true);
		}
	}

	var mapBges = _GET("mapBges");
	if (mapBges) {
		setSelectedMapBattlegrounds(mapBges);
	}

	$("#battleground").change();

	$('#sims').val(_GET('sims') || 10000);

	if (_DEFINED("debug")) $('#debug').click();
	if (_DEFINED("mass_debug")) $('#mass_debug').click();
	if (_DEFINED("loss_debug")) $('#loss_debug').click();
	if (_DEFINED("win_debug")) $('#win_debug').click();
	if (_DEFINED("play_debug")) $('#play_debug').click();
	
	document.title = "SimSpellstone " + text_version + " - The Spellstone Simulator that runs from your browser!";

	if (_DEFINED('autostart') && !_DEFINED("latestCards")) {
		SIM_CONTROLLER.startsim(1);
	} else if (_DEFINED('unit_tests')) {
		var body = document.getElementsByTagName("body")[0];
		var script = document.createElement("script");
		script.src = "scripts/unit_tests.js";
		body.appendChild(script);
		script.onload = function () {
			var script = document.createElement("script");
			script.src = "scripts/unit_test_runner.js";
			body.appendChild(script);
		};
	}

	if (document.getElementById("missionDeckDialog")) {
		deckPopupDialog = $("#missionDeckDialog").dialog({
			autoOpen: false,
			minWidth: 500,
			minHeight: 20,
			modal: true,
			resizable: false,
			draggable: false,
			buttons: {
				Close: function () {
					deckPopupDialog.dialog("close");
				}
			},
			open: function (event, ui) { $(".ui-dialog-titlebar-close", ui.dialog | ui).hide(); }
		});
	}
}

var style;
var u_black = false;
function toggle_u() {
	var append = false;
	if (typeof style == 'undefined') {
		append = true;
		style = document.createElement('style');
	} else {
		while (style.hasChildNodes()) {
			style.removeChild(style.firstChild);
		}
	}
	var head = document.getElementsByTagName('head')[0];
	var rules;
	if (!u_black) {
		u_black = true;
		rules = document.createTextNode(
			'u { text-decoration: none; font-style:normal; color: #000000; font-weight: normal; }'
		);
	} else {
		u_black = false;
		rules = document.createTextNode(
			'u { text-decoration: none; font-style:normal; color: #dddddd; font-weight: normal; }'
		);
	}

	style.type = 'text/css';
	if (style.styleSheet) {
		style.styleSheet.cssText = rules.nodeValue;
	} else {
		style.appendChild(rules);
	}
	if (append === true) head.appendChild(style);
}

function toggleUI(display) {
	if (display) {
		$("#ui").show();
	} else {
		$("#ui").hide();
	}
}

function showUI() {
	// Show interface
	toggleUI(true);
	// Hide stop button
	document.getElementById('stop').style.display = 'none';
}

function hideUI() {
	$(".accordion").accordion('option', 'active', null);
	// Hide interface
	toggleUI(false);
	// Display stop button
	document.getElementById('stop').style.display = 'block';
}

function getSelectedBattlegrounds(prefix) {
	prefix = (prefix || "");
	var getbattleground = [];
	var bgCheckBoxes = document.getElementsByName(prefix + "battleground");
	for (var i = 0; i < bgCheckBoxes.length; i++) {
		var checkbox = bgCheckBoxes[i];
		if (checkbox && checkbox.checked) {
			getbattleground.push(checkbox.value);
		}
	}
	getbattleground = getbattleground.join();
	return getbattleground;
}

function getSelectedMapBattlegrounds() {
	var getbattleground = [];
	var locationID = $("#location").val();
	var selects = document.getElementsByName("map-battleground");
	for (var i = 0; i < selects.length; i++) {
		var select = selects[i];
		if (select.value > 0) {
			getbattleground.push(locationID + "-" + i + "-" + select.value);
		}
	}
	getbattleground = getbattleground.join();
	return getbattleground;
}

function setSelectedMapBattlegrounds(mapBgeString) {
	var selects = document.getElementsByName("map-battleground");
	for (var i = 0; i < mapBgeString.length && i < selects.length; i++) {
		selects[i].value = mapBgeString[i];
	}
}

// Modify HTML to output simulation results
function outp(text) {
	$("#content").html(text);
}

function outputTurns(turnData) {
	if (closeDiv) {
		turnData += "</div>";
		closeDiv = false;
	}
	turnData = "<input id='show-turns' type='button' value='Show All' /> <div id='turn-container'>Turn: <select id='turn-picker'></select></div> <div>" + turnData + "</div>";
	outp(turnData);
	var numTurns = $(".turn-info").hide().length;
	var options = [];
	for (var i = 0; i < numTurns; i++) {
		var turn = i + 1;
		options.push("<option value='" + i + "'>" + turn + "</option>");
	}
	var lastTurn = i - 1;
	if (lastTurn && closeDiv) lastTurn--;
	$("#turn-picker").append(options).change(function (event) {
		var turn = event.target.selectedIndex;
		$(".turn-info").hide().eq(turn).show();
	}).val(lastTurn).change();
	var hidden = true;
	$("#show-turns").click(function () {
		hidden = !hidden;
		if (hidden) {
			var turn = $("#turn-picker").val();
			$(".turn-info").hide().eq(turn).show();
			$("#turn-container").show();
			this.value = "Show All";
		} else {
			$(".turn-info").show();
			$("#turn-container").hide();
			this.value = "Show One";
		}
	});
}

// Return table of simulation results
function showWinrate() {

	if (suppressOutput) {
	} else if (debug || sims_left == 0) {
		// Generate links
		var links = '';
		links += '<br>' +
		'<br>' +
		'<i>Non-autostart link</i>' +
		'<br>' +
		'<a href="' + generate_link() + '">' + generate_link() + '</a>' +
		'<br>' +
		'<br>' +
		'<i>Autostart link</i>' +
		'<br>' +
		'<a href="' + generate_link(1) + '">' + generate_link(1) + '</a>' +
		'<br>' +
		'<br>';
		if (debug) return links;
	}
	// Win/Loss ratios
	var winPercent = wins / games;
	var winrate = (winPercent * 100).toFixed(2) + "%";
	$("#wins").html(wins);
	$("#winrate").html(winrate);

	var lossrate = losses / games * 100;
	lossrate = lossrate.toFixed(2) + "%";
	$("#losses").html(losses);
	$("#lossrate").html(lossrate);

	var drawrate = draws / games * 100;
	drawrate = drawrate.toFixed(2) + "%";
	$("#draws").html(draws);
	$("#drawrate").html(drawrate);

	var mErr = marginOfError(wins, games);
	$("#marginGames").html((mErr * games).toFixed(0));
	mErr = mErr.toFixed(2) + "%";
	$("#marginPercent").html(mErr);

	var totalSims = games + sims_left;
	var percentComplete = (games * 100 / totalSims).toFixed("2") + "%";
	$(".battleCount").html(games);
	$("#percentComplete").html(percentComplete);

	// Calculate Average length of battle
	$("#avgLength").html((total_turns / games).toFixed(1));

	$("#avgPoints").html((points / games).toFixed(2));

	$("#winrateTable").show();
	// Final output
	var full_table = "";
	if (sims_left == 0) {
		// Add generated links to final output
		full_table += links;

		// Append results to history

		var current_deck = '';
		var deck = [];
		var deck1Hash = document.getElementById('deck1').value;
		var deck1List = $('#cardlist').val();
		if(deck1List) deck1List = deck1List.value;

		// Load player deck
		if (deck1Hash) {
			deck.player = hash_decode(deck1Hash);
		} else if (deck1List) {
			deck.player = load_deck_from_cardlist(deck1List);
		}
		if (deck.player) {
			current_deck = hash_encode(deck.player);
		}

		//battle_history += winrate + '% (+/- ' + stdDev + '%) &nbsp; &nbsp; ' + current_deck + '<br>';
		battle_history += winrate + ' (+/- ' + mErr + ') &nbsp; &nbsp; ' + current_deck + '<br>';
	}

	return full_table;
}

function hideTable() {
	$("#winrateTable").hide();
}

function setSimStatus(simStatusMsg, elapse, simsPerSec) {
	$("#simStatusMsg").html(simStatusMsg);
	if (elapse && simsPerSec) {
		var totalSims = games + sims_left;
		var percentComplete = (games * 100 / totalSims).toFixed("2") + "%";
		var progress = ('(' + games + '/' + totalSims + ') ' + percentComplete);
		$("#progress").html(progress);
		$("#speed").show();
		$("#elapsed").html(elapse);
		$("#simsPerSec").html(simsPerSec);
	} else {
		$("#progress").html("");
		$("#speed").hide();
	}
	$("#simulationStatus").show();
}

function winrateDev(wins, games) {
	if (games <= 1) return 1;

	var p = wins / games;
	var N = games;
	var dev = Math.sqrt(N * p * (1 - p));
	return dev;
}

// http://onlinestatbook.com/2/estimation/proportion_ci.html
function marginOfError(wins, games) {
	if (games <= 1) return 1;

	var p = wins / games;
	var N = games;
	var stdErr = Math.sqrt((p * (1 - p)) / N);
	var Z95 = 1.96;
	return ((stdErr * Z95)+0.5/N)*100;
}

// Generate a link from current settings and input
function generate_link(autostart) {

	var d = 0;
	var deck = [];

	var url_base = document.URL;
	var index_of_query = url_base.indexOf('?');
	if (index_of_query > 0) {
		url_base = url_base.substring(0, index_of_query)
	}

	var parameters = [];
	addValueParam(parameters, "deck1");
	addValueParam(parameters, "deck2");

	addValueParam(parameters, "location");
	addValueParam(parameters, "campaign");
	addValueParam(parameters, "mission");
	addValueParam(parameters, "mission_level");
	addValueParam(parameters, "raid");
	addValueParam(parameters, "raid_level");
	var mapBges = $('select[name=map-battleground]').toArray().reduce(function (acc, val) { return acc + val.value; }, "");
	if (mapBges.length) {
		parameters.push('mapBges=' + mapBges);
	}

	addBoolParam(parameters, "surge");

	if (addBoolParam(parameters, "siege")) {
		addValueParam(parameters, "tower_level");
		addValueParam(parameters, "tower_type");
	}

	addBoolParam(parameters, "auto_mode");
	addBoolParam(parameters, "tournament");
	addBoolParam(parameters, "ordered");
	addBoolParam(parameters, "exactorder");
	addBoolParam(parameters, "ordered2");
	addBoolParam(parameters, "exactorder2");

	var bges = '';
	var bgCheckBoxes = document.getElementsByName("battleground");
	for (var i = 0; i < bgCheckBoxes.length; i++) {
		d = bgCheckBoxes[i];
		if (d.checked) bges += decimal_to_base64(d.value, 2);
	}
	parameters.push('bges=' + bges);

	var bges = '';
	var bgCheckBoxes = document.getElementsByName("self-battleground");
	for (var i = 0; i < bgCheckBoxes.length; i++) {
		d = bgCheckBoxes[i];
		if (d.checked) bges += decimal_to_base64(d.value - 10000, 2);
	}
	if (bges) {
		parameters.push('selfbges=' + bges);
	}

	var bges = '';
	var bgCheckBoxes = document.getElementsByName("enemy-battleground");
	for (var i = 0; i < bgCheckBoxes.length; i++) {
		d = bgCheckBoxes[i];
		if (d.checked) bges += decimal_to_base64(d.value - 10000, 2);
	}
	if (bges) {
		parameters.push('enemybges=' + bges);
	}
	

	addValueParam(parameters, "sims");

	addBoolParam(parameters, "debug");
	addBoolParam(parameters, "mass_debug");
	addBoolParam(parameters, "loss_debug");
	addBoolParam(parameters, "win_debug");
	addBoolParam(parameters, "play_debug");
	
	if (autostart) {
		parameters.push('autostart');
	}

	if (parameters.length > 0) {
		return url_base + '?' + parameters.join('&');
	} else {
		return url_base;
	}
}

function addValueParam(params, paramName, fieldName) {
	var value = $("#" + (fieldName || paramName)).val();
	if (value) {
		params.push(paramName + "=" + value);
		return true;
	} else {
		return false;
	}
}

function addBoolParam(params, paramName) {
	var checked = $("#" + paramName).is(":checked");
	if (checked) {
		params.push(paramName);
		return true;
	} else {
		return false;
	}
}

function load_deck_builder_for_field(fieldID) {
	var field = $("#"+fieldID);
	var deck = {
		commander: elariaCaptain,
		deck: [],
	};
	var hash = field.val();
	if (!hash) {
		hash = hash_encode({
			commander: elariaCaptain,
			deck: [],
		});
	}
	open_deck_builder("Card Hash", hash, null, field);
}

var deckBuilders = {};
function load_deck_builder(player) {
	if (player == 'player') {
		var getdeck = $('#deck1').val();
		var getmission;
		var missionlevel;
		var getraid;
		var raidlevel;
	} else {
		var getdeck = $('#deck2').val();
		var getmission = $('#mission').val();
		var missionlevel = $('#mission_level').val();
		var getraid = $('#raid').val();
		var raidlevel = $('#raid_level').val();
	}

	// Load player deck
	var deck = {
		commander: elariaCaptain,
		deck: [],
	};
	if (getdeck) {
		deck = hash_decode(getdeck);
	} else if (getmission) {
		deck = load_deck_mission(getmission, missionlevel);
	} else if (getraid) {
		deck = load_deck_raid(getraid, raidlevel);
	}
	var hash;
	if (deck) {
		hash = hash_encode(deck);
	}

	var name = (player == 'player' ? 'Player Deck' : 'Enemy Deck');
	var deckHashField = (player ? $("#" + (player == 'player' ? 'deck1' : 'deck2')) : null);

	var currentDeckBuilder = deckBuilders[player];
	if (currentDeckBuilder == null || currentDeckBuilder.closed) {
		deckBuilders[player] = open_deck_builder(name, hash, null, deckHashField);
	}
	else {
		currentDeckBuilder.focus();
	};
}

function open_deck_builder(name, hash, inventory, deckHashField) {
	var parameters = ["nosort"];
	if (hash) {
		parameters.push("hash=" + hash);
	}
	if (inventory) {
		parameters.push("inventory=" + inventory);
	}

	if (name) {
		parameters.push("name=" + name);
	}
	if (_DEFINED("ajax")) {
		parameters.push("ajax");
	}
	parameters.push("fromSim");

	var url = "DeckBuilder.html?" + parameters.join('&');

	var width = Math.min(screen.width, 1000);
	var height = Math.min(screen.height, 700);
	var left = Number((screen.width - width) / 2);
	var top = Number((screen.height - height) / 2);

	var windowFeatures = 'scrollbars,left=' + left + 'top=' + top + ',width=' + width + ',height=' + height + ',top=' + top + ',left=' + left;
	var win = window.open(url, '', windowFeatures);

	// Push values to window once it has loaded
	$(win).load((function (name, deckHashField) {
		return function () {
			// Tie deck-builder back to the hash field in the simulator.
			if (deckHashField) win.updateSimulator = function (hash) { deckHashField.val(hash).change() };
		}
	})(name, deckHashField));

	return win;
}

function display_generated_link() {
	outp('' +
	'<br>' +
	'<i>Non-autostart link</i>' +
	'<br>' +
	'<a href="' + generate_link() + '">' + generate_link() + '</a>' +
	'<br>' +
	'<br>' +
	'<i>Autostart link</i>' +
	'<br>' +
	'<a href="' + generate_link(1) + '">' + generate_link(1) + '</a>' +
	'<br>' +
	'<br>' +
	'');
}

function clear_history() {
	battle_history = '';
	display_history();
}

function display_history() {
	outp('' +
	'<br>' +
	'<hr>' +
	(battle_history || 'No history available.') +
	'<hr>' +
	'<br>' +
	'<br>' +
	'<input type="button" value="Clear History" onclick="clear_history();" style="text-align: center; font-weight: normal;">' +
	'<br>' +
	'<br>' +
	'');
}

function supports_html5_storage() {
	try {
		return 'localStorage' in window && window['localStorage'] !== null;
	} catch (e) {
		return false;
	}
}

// Initialize global variables
var battle_history = '';
var max_turns = 100;
var debug = false;
var mass_debug = false;
var loss_debug = false;
var win_debug = false;
var found_desired = false;
var play_debug = false;
var showAnimations = false;
var getdeck = '';
var getdeck2 = '';
var getcardlist = '';
var getcardlist2 = '';
var getordered = false;
var getordered2 = false;
var getexactorder = false;
var getexactorder2 = false;
var getcampaign = 0;
var getmission = 0;
var missionlevel = 0;
var getraid = false;
var raidlevel = 0;
var getbattleground = '';
var enemybges = '';
var selfbges = '';
var mapbges = '';
var getsiege = 0;
var tower_level = 0;
var tower_type = 0;
var pvpAI = true;
var echo = '';
var closeDiv = false;
var wins = 0;
var losses = 0;
var draws = 0;
var games = 0;
var points = 0;
var num_sims = 0;
var last_games = [];
var sims_left = 0;
var current_timeout;
var time_start = 0;
var time_stop = 0;
var time_start_batch = 0;
var time_end = 0;	// TODO: Use this
var surge = false;
var battleground = [];
var total_turns = 0;
var cache_player_deck;
var cache_cpu_deck;
var cache_player_deck_cards;
var cache_cpu_deck_cards;
var choice = undefined;
var auto_mode = false;
var tournament = false;
var suppressOutput = false;
var orders = {};
var cardStats = {};;"use strict";
var CARD_GUI = {};
(function () {
	var assetsRoot = '';

	function clearCardSpace() {
		var cardSpace = $("#cardSpace").empty();
	}

	function clearDeckSpace() {
		var cardSpace = document.getElementById("deck");
		cardSpace.innerHTML = '';
	}

	function draw_deck(deck, noblanks) {
		var $deck = $("#deck");
		$deck.children().remove();
		$deck.append(makeDeckHTML(deck, noblanks));
		return $deck;
	}

	function makeDeckHTML(deck, noblanks, battlegrounds) {
		var cards = [];
		var commander = get_card_by_id(deck.commander);
		cards.push(create_card_html(commander, false, false));
		for (var i = 0, len = deck.deck.length; i < len; i++) {
			var deckEntry = deck.deck[i];
			if (battlegrounds) {
				var unit = get_card_apply_battlegrounds(deckEntry, battlegrounds);
			} else {
				var unit = get_card_by_id(deckEntry);
			}
			cards.push(create_card_html(unit, false, false));
		}
		if (!noblanks) for (; i < 15; i++) {
			cards.push(createDiv("card blank"));
		}
		return cards;
	}

	function makeCardListHTML(deck, onclick, onrightclick) {
		var listHTML = createDiv("float-left");
		for (var i = 0, len = deck.deck.length; i < len; i++) {
			var deckEntry = deck.deck[i];
			var unit = get_card_by_id(deckEntry);
			var htmlCard = create_card_html(unit, false, false, onclick, onrightclick, null, i);
			if (deckEntry.index !== undefined) {
				htmlCard.setAttribute("data-index", deckEntry.index);
			}
			listHTML.appendChild(htmlCard);
		}
		return listHTML;
	}

	function draw_card_list(list, compactSkills, onclick, onrightclick, skip, end) {
		var cards = make_card_list(list, compactSkills, null, null, /*onclick, onrightclick,*/ skip, end);
		var $cardSpace = $("#cardSpace");
		$cardSpace.empty();
		$cardSpace.append(cards);

		return $cardSpace;
	}
	
	function draw_inventory(list) {
		var cards = make_card_list(list);
		var $cardSpace = $("#deck");
		$cardSpace.children().remove();
		$cardSpace.append(cards);
		return $cardSpace;
	}
	
	function draw_inventory(deck)
	{
		var cards = make_card_list(deck.deck);
		var $cardSpace = $("#deck");
		$cardSpace.children().remove();
		$cardSpace.append(make_card_list([deck.commander]));
		//$deck.find(".card").hide();
		$cardSpace.append(cards);
		return $cardSpace;
	}
	
	function make_card_list(list, compactSkills, onclick, onrightclick, skip, end) {
		skip = skip || 0;
		var htmlCard;
		var lastUnit;
		var multiplier;
		var uniqueCard = 0;
		var cards = [];
		for (var i = 0, len = list.length; i < len && (!end || uniqueCard < end) ; i++) {
			var listEntry = list[i];
			var unit = get_card_by_id(listEntry);
			if (areEqual(unit, lastUnit)) {
				multiplier++;
			} else {
				if ((uniqueCard >= skip)) {
					addMult(htmlCard, multiplier);
					multiplier = 1;
					htmlCard = create_card_html(unit, compactSkills, false, onclick, onrightclick, null, i);
					htmlCard.setAttribute("data-i", i);
					if (listEntry.index !== undefined) {
						htmlCard.setAttribute("data-index", listEntry.index);
					}
					cards.push(htmlCard);
				}
				lastUnit = unit;
				uniqueCard++;
			}
		}
		addMult(htmlCard, multiplier);
		return cards;
	}

	function doDrawField(field, drawableHand, callback, turn, activeUnit) {
		if (!drawableHand) drawableHand = [];
		var fieldHTML = [];
		if (turn) {
			var htmlTurnCounter = document.createElement("h1");
			htmlTurnCounter.innerHTML = "Turn: " + turn + " (Currently at " + SIMULATOR.calculatePoints(true) + " points)";
			fieldHTML.push(htmlTurnCounter);
		}

		var divField = createDiv("field");
		var activeUnitOwner = null;
		if (activeUnit) {
			var activeUnitOwner = activeUnit.owner;
			if (activeUnit.isCommander()) {
				activeUnit = -1;
			} else {
				activeUnit = activeUnit.key;
			}
		}
		if (activeUnitOwner === 'player') {
			divField.appendChild(draw_field(field.cpu));
			divField.appendChild(draw_field(field.player, activeUnit));
		} else {
			divField.appendChild(draw_field(field.cpu, activeUnit));
			divField.appendChild(draw_field(field.player));
		}
		fieldHTML.push(divField);
		fieldHTML.push(draw_hand(drawableHand, callback, turn));
		fieldHTML.push(document.createElement('br'));
		fieldHTML.push(document.createElement('br'));
		return fieldHTML;
	}

	function draw_cards(field, drawableHand, callback, turn) {
		var fieldHTML = doDrawField(field, drawableHand, callback, turn);
		$("#cardSpace").children().remove().end().append(fieldHTML);
	}

	function draw_field(field, activeUnit) {
		var cards = createDiv("float-left");
		var commander = field.commander;
		var htmlCard = create_card_html(commander, false, true)
		if (activeUnit === -1) {
			highlightCard(htmlCard);
		}
		cards.appendChild(htmlCard);
		var units = field.assaults;
		if (units) for (var i = 0, len = units.length; i < len; i++) {
			var unit = units[i];
			var htmlCard = create_card_html(unit, false, true);
			if (unit.timer) htmlCard.classList.add("inactive");
			if (activeUnit === i) {
				highlightCard(htmlCard);
			}
			cards.appendChild(htmlCard);
		}
		return cards;
	}

	function draw_hand(hand, callback, state) {
		var cards = createDiv("float-left hand");
		for (var i = 0, len = hand.length; i < len; i++) {
			var unit = hand[i];
			if (!unit) continue;
			var htmlCard = create_card_html(unit, false);
			if (i === 0) htmlCard.classList.add("left");
			else if (i === 2) htmlCard.classList.add("right");
			else if (i > 2) htmlCard.classList.add("inactive");
			var cardidx = i;
			if (callback) {
				htmlCard.addEventListener("click", (function (inner) {
					return function () {
						choice = inner;
						callback(state);
					};
				})(i));
			}
			cards.appendChild(htmlCard);
		}
		return cards;
	}

	function highlightCard(htmlCard) {
		htmlCard.style.outline = "5px solid LawnGreen";
	}

	function addMult(htmlCard, multiplier) {
		// Handle range values
		var iMult = parseInt(multiplier);
		if (iMult == multiplier) {
			multiplier = (iMult > 1 ? iMult : null);
		}
		if (multiplier) {
			var multDiv = createDiv("multiplier", "x" + multiplier);
			multDiv.setAttribute("data-count", multiplier);
			var multIcon = createImg(getAssetPath("cardAssets") + "multiplier.png", "multiplier");
			htmlCard.appendChild(multIcon);
			htmlCard.appendChild(multDiv);
		}
	}

	function addWeight(htmlCard, weight) {
		if (weight > 0) {
			var weightDiv = createDiv("weight", (weight * 100).toFixed(2) + "%");
			weightDiv.setAttribute("data-count", weight);
			var weightIcon = createImg(getAssetPath("cardAssets") + "multiplier.png", "weight");
			htmlCard.appendChild(weightIcon);
			htmlCard.appendChild(weightDiv);
		}
	}

	function createItemHTML(name, quantity, image) {
		var htmlCard = createDiv("card item");

		var background = document.createElement("i");
		background.className = 'sprite sprite-Item';
		htmlCard.appendChild(background);
		if (image) {
			image = createImg(getAssetPath("items") + image + ".png");
			image.className = 'item-image';
			htmlCard.appendChild(image);
		}
		var divName = createDiv("card-name", name);
		htmlCard.appendChild(divName);
		htmlCard.classList.add('factionless');
		htmlCard.appendChild(createDiv("faction"));
		addMult(htmlCard, quantity);
		return htmlCard;
	}

	function create_card_html(card, compactSkills, onField, onclick, onrightclick, onmouseover, state) {
		var htmlCard = createDiv("card");
		// Add ID to card
		htmlCard.setAttribute("data-id", card.id);
		// Add level to card
		htmlCard.setAttribute("data-level", card.level);
		// Add Rune(s) to card
		var runes = card.runes;
		var runeIDs = [];
		var boosts = {};
		for (var i = 0, len = runes.length; i < len; i++) {
			var runeID = runes[i].id;
			runeIDs.push(runes[i].id);
			var rune = getRune(runeID);
			for (var key in rune.stat_boost) {
				if (key == "skill") {
					key = rune.stat_boost.skill.id;
				}
				boosts[key] = true;
			}
		}
		var highlighted = card.highlighted;
		if (highlighted) for (var i = 0; i < highlighted.length; i++) {
			var key = highlighted[i];
			boosts[key] = true;
		}
		htmlCard.setAttribute("data-runeids", runeIDs.join(","));

		var picture = loadCard(card.id).picture;
		if (picture) {
			var icon = document.createElement("i");
			if (picture.indexOf("portrait_") == 0) {
				icon.className = 'portrait portrait-' + picture;
			} else {
				icon.className = 'sprite sprite-' + picture;
			}
			htmlCard.appendChild(icon);
		}
		if (card.isCommander()) {
			htmlCard.classList.add("commander");
		}
		htmlCard.classList.add(factions.names[card.type].toLowerCase());
		var cardName = (card.uid !== undefined ? "(" + card.uid + ") " : "") + card.name;
		var divName = createDiv("card-name", cardName);
		var divID = createDiv("card-id", "(" + card.id + ")");
		divName.appendChild(divID);
		htmlCard.appendChild(divName);
		if (!card.isCommander()) {
			if (card.attack >= 0) {
				if (onField) {
					if (!card.isUnjammed()) htmlCard.classList.add("frozen");
					var htmlAttack = createDiv("card-attack", card.adjustedAttack().toString());
					if (card.adjustedAttack() > card.attack) htmlAttack.classList.add("increased");
					else if (card.adjustedAttack() < card.attack) htmlAttack.classList.add("decreased");
					else if (boosts.attack) htmlAttack.classList.add("increased");
				} else {
					var htmlAttack = createDiv("card-attack", card.attack.toString());
				}
				htmlCard.appendChild(createImg(getAssetPath("cardAssets") + "Attack.png", "attack"));
				htmlCard.appendChild(htmlAttack);
			}

			if (card.cost >= 0) {
				if (onField) {
					if (card.timer) {
						htmlCard.appendChild(createDiv("delay", card.timer));
						htmlCard.appendChild(createImg(getAssetPath("cardAssets") + "Timer.png", "timer"));
					}
				} else {
					htmlCard.appendChild(createDiv("delay", card.cost));
					htmlCard.appendChild(createImg(getAssetPath("cardAssets") + "Timer.png", "timer"));
				}
			}
		}
		if (card.health >= 0) {
			if (onField) {
				var htmlHealth = createDiv("card-health", card.health_left.toString());
				if (card.health_left < card.health) htmlHealth.classList.add("decreased");
				else if (boosts.health) htmlHealth.classList.add("increased");
			} else {
				var htmlHealth = createDiv("card-health", card.health.toString());
				if (boosts.health) htmlHealth.classList.add("increased");
			}
			htmlCard.appendChild(createImg(getAssetPath("cardAssets") + "Health.png", "health"));
			htmlCard.appendChild(htmlHealth);
		}
		var divSkills = createDiv("card-skills");
		var skillsShort = createDiv("card-skills-short");
		if (card.earlyActivationSkills) getSkillsHtml(card, divSkills, skillsShort, card.earlyActivationSkills, onField);
		getSkillsHtml(card, divSkills, skillsShort, card.skill, onField);
		if (card.onDeathSkills) getSkillsHtml(card, divSkills, skillsShort, card.onDeathSkills, onField);
		getPassiveSkills(divSkills, skillsShort, card, onField, boosts);
		var skillsDetail = divSkills.cloneNode(true);
		skillsDetail.className = "card-skills-detailed";
		if (skillsShort.hasChildNodes()) {
			if (compactSkills) {
				htmlCard.appendChild(skillsShort);
				htmlCard.appendChild(divSkills);
			} else {
				htmlCard.appendChild(skillsDetail);
			}
		}
		htmlCard.appendChild(createDiv("faction"));
		if (onField) {
			var statuses = getStatuses(card);
			if (statuses.length > 0) {
				htmlCard.appendChild(createDiv("hidden", "..."));
				var divStatuses = createDiv("card-statuses");
				for (var i = 0; i < statuses.length; i++) {
					var status = statuses[i];
					divStatuses.appendChild(status);
				}
				htmlCard.appendChild(divStatuses);
			}
		}
		if (card.set) {
			var htmlSet = getSetIcon(card.set);
			htmlSet.className = "set";
			htmlCard.appendChild(htmlSet);
		}
		var subFactions = card.sub_type;
		if (subFactions.length) {
			var subFactionsDiv = createDiv("subfaction");
			for (var i = 0; i < subFactions.length; i++) {
				var subFactionID = subFactions[i];
				if (subFactionID) {
					var htmlSubfaction = getFactionIcon(subFactionID);
					subFactionsDiv.appendChild(htmlSubfaction);
				}
			}
			htmlCard.appendChild(subFactionsDiv);
		}
		if (card.rarity > 0) {
			if (card.maxLevel > Number(card.rarity) + 2) {
				var htmlLevel = createImg(getAssetPath("cardAssets") + "Level_" + card.rarity + "_" + card.maxLevel + "_" + card.level + ".png");
			} else {
				var htmlLevel = createImg(getAssetPath("cardAssets") + "Level_" + card.rarity + "_" + card.level + ".png");
			}
			htmlLevel.className = "level";
			if (card.id > 9999) {
				var fusion = ((card.id.toString()[0] == "1") ? "Dualfuse" : "Quadfuse");
				fusion = createImg(getAssetPath("cardAssets") + fusion + ".png");
				fusion.className = "fusion";
				htmlCard.appendChild(fusion);
			}
			htmlCard.appendChild(htmlLevel);
		} else if (card.maxLevel > 1) {
			var htmlLevel = createImg(getAssetPath("cardAssets") + card.maxLevel + "_" + card.level + ".png");
			htmlLevel.className = "level";
			htmlCard.appendChild(htmlLevel);
		}
		if (onclick) {
			htmlCard.addEventListener("click", (function (inner) {
				return function () {
					return onclick(htmlCard, state);
				};
			})(htmlCard, state));
		}
		if (onrightclick) {
			htmlCard.oncontextmenu = (function (inner) {
				return function () {
					return onrightclick(htmlCard, state);
				};
			})(htmlCard, state);
		}
		if (onmouseover) {
			htmlCard.onmouseover = (function (inner) {
				return function () {
					return onmouseover(htmlCard, state);
				};
			})(htmlCard, state);
		}
		return htmlCard;
	}

	function getSkillsHtml(card, divSkills, skillsShort, skills, onField) {
		for (var i = 0; i < skills.length; i++) {
			var skill = skills[i];
			divSkills.appendChild(getSkillHtml(card, skill, onField, i));
			divSkills.appendChild(document.createElement('br'));
			skillsShort.appendChild(getSkillIcon(skill.id));
		}
	}

	function getPassiveSkills(divSkills, skillsShort, card, onField, boosts) {
		var passiveSkills = Object.getOwnPropertyNames(SKILL_DATA).filter(function (skillID) {
			return ["passive", "toggle"].indexOf(SKILL_DATA[skillID].type) >= 0;
		}).forEach(function (skill) {
			getNonActivatedSkill(divSkills, skillsShort, onField, card, skill, boosts);
		});
		var flurry = card.flurry;
		if (flurry) {
			divSkills.appendChild(getSkillHtml(card, flurry, onField));
			divSkills.appendChild(document.createElement('br'));
			skillsShort.appendChild(getSkillIcon(flurry.id));
		}
	}

	function getNonActivatedSkill(divSkills, skillsShort, onField, card, skillName, boosts) {
		var value = card[skillName];
		if (value) {
			var skill = {
				id: skillName,
				x: value,
				boosted: boosts[skillName]
			};
			divSkills.appendChild(getSkillHtml(card, skill, onField));
			divSkills.appendChild(document.createElement('br'));
			skillsShort.appendChild(getSkillIcon(skill.id));
		}
	}

	function getSkillHtml(card, skill, onField, i) {
		var htmlSkill = document.createElement("span");
		htmlSkill.className = "skill";
		htmlSkill.appendChild(getSkillIcon(skill.id));
		var imbued = isImbued(card, skill.id, i);
		var enhancement = getEnhancement(card, skill.id, skill.x);
		if (imbued) {
			htmlSkill.classList.add("imbued");
		} else if (skill.boosted || enhancement) {
			htmlSkill.classList.add("increased");
		}
		if (skill.all) htmlSkill.innerHTML += (" All ");
		if (skill.y) htmlSkill.appendChild(getFactionIcon(skill.y));
		if (skill.s) htmlSkill.appendChild(getSkillIcon(skill.s));
		var x = (skill.x | 0) + enhancement;
		if (x) htmlSkill.innerHTML += (" " + x + " ");
		if (skill.c) {
			htmlSkill.innerHTML += (skill.c);
			if (onField) htmlSkill.innerHTML += " (" + (skill.countdown ? skill.countdown : "0") + ")";
		}
		return htmlSkill;
	}

	function getSkillIcon(skillID) {
		var src = getAssetPath("skills");

		var skillData = SKILL_DATA[skillID];
		var iconName = (skillData ? skillData.icon : skillID) + ".png";
		src += iconName;
		var icon = createImg(src);
		switch (skillID) {
			case 'weakenself':
			case 'enlarge':
				icon.classList.add("affect-self");
				break;
			default:
				break;
		}
		icon.title = (skillData ? skillData.name : skillID);
		return icon;
	}

	function getStatuses(card) {
		var debuffs = [];
		/*
		if (card.attack_weaken) {
			var status = createStatus("weaken", card.attack_weaken);
			debuffs.push(status);
		}
		*/
		if (card.enfeebled) {
			var status = createStatus("enfeeble", card.enfeebled);
			debuffs.push(status);
		}
		if (card.marked) {
			var status = createStatus("enfeeble", card.marked);
			debuffs.push(status);
		}
		/*
		if (card.jammed) {
			var status = createStatus("jam");
			debuffs.push(status);
		}
		*/
		if (card.nullified) {
			var status = createStatus("nullify", card.nullified);
			debuffs.push(status);
		}
		if (card.poisoned) {
			var status = createStatus("poison", card.poisoned);
			debuffs.push(status);
		}
		if (card.scorched && card.scorched.amount) {
			var status = createStatus("burn", card.scorched.amount);
			debuffs.push(status);
		}

		var buffs = [];
		/*
		if (card.attack_rally) {
			var status = createStatus("rally", card.attack_rally);
			buffs.push(status);
		}
		if (card.attack_berserk) {
			var status = createStatus("berserk", card.attack_berserk);
			buffs.push(status);
		}
		*/
		if (card.enraged) {
			var status = createStatus("enrage", card.enraged);
			debuffs.push(status);
		}
		if (card.protected) {
			var status = createStatus("protect", card.protected);
			buffs.push(status);
		}
		if (card.invisible) {
			var status = createStatus("evade", card.invisible);
			buffs.push(status);
		}

		var statuses = [];
		if (debuffs.length > 0) {
			var divDebuffs = createDiv("card-debuffs");
			for (var i = 0, len = debuffs.length; i < len; i++) {
				divDebuffs.appendChild(debuffs[i]);
			}
			statuses.push(divDebuffs);
		}
		if (buffs.length > 0) {
			var divBuffs = createDiv("card-buffs");
			for (var i = 0, len = buffs.length; i < len; i++) {
				divBuffs.appendChild(buffs[i]);
			}
			statuses.push(divBuffs);
		}

		return statuses;
	}

	function createStatus(name, value) {
		var spanStatus = document.createElement("span");
		spanStatus.appendChild(getSkillIcon(name));
		if (value) spanStatus.innerHTML += (value);
		return spanStatus;
	}

	function getSetIcon(set) {
		var setName = setNames[set];
		return createImg(getAssetPath('cardAssets') + setName + '.png');
	}

	function getFactionIcon(factionID) {
		var factionName = factions.names[factionID];
		return createImg(getAssetPath('factions') + factionName + '.png');
	}

	function getAssetPath(subpath) {
		return assetsRoot + 'res/' + subpath + '/';
	}

	var setNames = {
		1000: "Basic",
		1100: "Legacy",
		7000: "Basic",
		2000: "Reward",
		2100: "Reward",
		3000: "Premium",
		4000: "BoxOnly",
		5000: "Champion",
		5100: "Champion",
		9999: "StoryElements"
	}

	CARD_GUI.clearCardSpace = clearCardSpace;
	CARD_GUI.clearDeckSpace = clearDeckSpace;
	CARD_GUI.draw_deck = draw_deck;
	CARD_GUI.create_card_html = create_card_html;
	CARD_GUI.makeDeckHTML = makeDeckHTML;
	CARD_GUI.makeCardListHTML = makeCardListHTML;
	CARD_GUI.draw_card_list = draw_card_list;
	CARD_GUI.draw_cards = draw_cards;
	CARD_GUI.doDrawField = doDrawField;
	CARD_GUI.draw_inventory = draw_inventory;
	CARD_GUI.draw_hand = draw_hand;
	CARD_GUI.createItemHTML = createItemHTML;
	CARD_GUI.addMult = addMult;
	CARD_GUI.addWeight = addWeight;

	Object.defineProperties(CARD_GUI, {
		assetsRoot: {
			get: function () {
				return assetsRoot;
			},
			set: function (value) {
				assetsRoot = value;
			}
		}
	});
})();

function createImg(src, className) {
	return $("<img>").addClass(className).attr("src", src)[0];
}

function createDiv(className, value) {
	return $("<div>").addClass(className).html(value)[0];
}

function createSpan(className, value) {
	return $("<span>").addClass(className).html(value)[0];
};function getTutorialScript() {
    var tutorialParts = [
       {
           msg: "Welcome to SIM Spellstone!  This is a brief tutorial of how to use the Simulator.",
       },
       {
           ui: "#setup-container",
           msg: 'Here is where you set everything up for a simulation.',
           actions: [showSetup]
       },
       {
           ui: "#setup-container",
           msg: 'When you are done, you can click the "Setup" bar to hide this section.',
           actions: [hideSetup]
       },
       {
           ui: "#setup-container",
           msg: 'Clicking it again will open it back up.',
           actions: [showSetup]
       },
       {
           ui: "#attacker-container",
           msg: 'Use this section to set up the deck for the attacker.'
       },
       {
           ui: "#edit-player",
           msg: 'Click "Edit" to open the DeckBuilder and create a deck.'
       },
       {
           ui: "#load-player",
           msg: 'Click "Load" to choose a deck from the ones you have saved in the DeckBuilder.'
       },
       {
           ui: "#attacker-hash-container",
           msg: 'If you have a deck hash, you can simply paste it here as well.'
       },
       {
           ui: "#attacker-advanced",
           msg: 'This section contains some additional settings for the attacker that determine how their deck is played.',
       },
       {
           ui: "#auto-container",
           msg: 'Check this to have fights run on auto, rather than playing them yourself.',
           showFor: "battle"
       },
       {
           ui: "#auto-container",
           msg: 'Setting the attacker to "auto" also enables the "Ordered" and "Do Not Shuffle" options.',
           showFor: "battle"
       },
       {
           ui: "#ordered-container",
           msg: 'Check this to have the AI attempt to play the attacker\'s deck as close as possible to the order that the cards are listed.'
       },
       {
           ui: "#exactorder-container",
           msg: 'Check this to disable shuffling of the attacker\'s deck.'
       },
       {
           ui: "#defender-container",
           msg: 'Use this section to set up the deck for the defender.'
       },
       {
           ui: "#defender-hash-container",
           msg: 'You can manually create a deck for the defender here.'
       },
       {
           ui: "#pve-container",
           msg: 'Or you can choose a PvE deck to sim against.',
           actions: [clearCampaign]
       },
       {
           ui: "#campaign-container",
           msg: 'To choose a campaign mission, first pick a Campaign from the dropdown...',
           actions: [chooseCampaign]
       },
       {
           ui: "#mission-container",
           msg: '... then pick a Mission from the mission dropdown.',
           actions: [clearRaid, chooseCampaign, chooseMission]
       },
       {
           ui: "#raid-container",
           msg: 'To fight against a raid boss, pick the desired Raid from the dropdown',
           actions: [clearCampaign, chooseRaid]
       },
       {
           ui: "#defender-advanced",
           msg: 'This section contains some additional settings for the defender that determine how their deck is played.',
           actions: [clearRaid],
       },
       {
           ui: "#surge-container",
           msg: 'Check this to have the defender go first.',
           showFor: "battle"
       },
       {
           ui: "#tower-container",
           msg: 'Use these fields to set up a tower for the defender.'
       },
       {
           ui: "#siege-container",
           msg: 'Check this field to turn the tower on.'
       },
       {
           ui: "#tower_level",
           msg: 'This field determines the BR of the defender.  The tower\'s level is one less than the defender\'s BR.'
       },
       {
           ui: "#tower_type",
           msg: 'This field determines which type of tower the defender will have.'
       },
       {
           ui: "#bge-container",
           msg: 'Check/uncheck boxes here to set active battleground effects.',
           actions: [hideView, showSetup]
       },
       {
           ui: "#view-container",
           msg: 'Click "View" to display the currently set decks for the attacker and defender.',
           actions: [hideSetup, showView]
       },
       {
           ui: "#view-container",
           msg: 'Click it again to hide it.',
           actions: [hideView]
       },
       {
           ui: "#sims-container",
           msg: 'This field determines how many fights to run.',
           showFor: "titans"
       },
       {
           ui: "#btn_simulate",
           msg: 'Click "Simulate" to run a batch of fights.',
           showFor: "titans"
       },
       {
           ui: "#btn_simulate",
           msg: 'Click "Battle" to start a fight.',
           showFor: "battle"
       },
       {
           ui: "#generate_link",
           msg: 'Click "Generate Link" to create a link that will open this tool with all of the current settings.'
       },
       {
           msg: 'To view this tutorial again at any time, you can click the "Help" button.  (Note: this will reset the Simulator.)'
       }
    ];

    var currentPage = getCurrentPage();
    for (var i = 0; i < tutorialParts.length; i++) {
        var part = tutorialParts[i];
        if (part.showFor && part.showFor !== currentPage) {
            tutorialParts.splice(i--, 1);
        }
    }

    function hideSetup() {
        $("#setup-container").accordion('option', 'active', null);
    }

    function showSetup() {
        $("#setup-container").accordion('option', 'active', 0);
    }

    function hideView() {
        $("#view-container").accordion('option', 'active', null);
    }

    function showView() {
        $("#view-container").accordion('option', 'active', 0);
    }

    function chooseCampaign() {
        $('#campaign').val(1).change();
    }

    function chooseMission() {
        $('#mission').val(11).change();
    }

    function clearCampaign() {
        $('#campaign').val('').change();
    }

    function chooseRaid() {
        $('#raid').val(24005).change();
    }

    function clearRaid() {
        $('#raid').val('').change();
    }

    return tutorialParts;
};$(document).ready(function () {

    var tutorialParts = getTutorialScript();

    var overlayHtml = $("<div></div>");
    $(document.body).append(overlayHtml);
    overlayHtml.load("templates/tutorial-overlay.html", null, function() {
        overlayHtml.replaceWith(function () {
            return $(this).contents();
        });
        $("#tutorial-show").prop("checked", storageAPI.shouldShowTutorial).change(function (event) {
            storageAPI.setShowTutorial(this.checked);
        });
        $("#help").click(showTutorial);
        $("#tutorial-close, #tutorial-skip").click(closeTutorial);
        $("#tutorial-next").click(nextTutorial);
        $("#tutorial-prev").click(previousTutorial);
        if (typeof delayTutorial === "undefined") {
            checkTutorial();
        }
    });

    function checkTutorial() {
        if (storageAPI.shouldShowTutorial) {
            showTutorial();
        } else {
            closeTutorial();
        }
    }

    function showTutorial() {
        tutorialIndex = 0;
        setTutorial();
        var tutorial = $("#tutorial").show();
    }

   
    var tutorialIndex = 0;
    function nextTutorial() {
        tutorialIndex++;
        setTutorial();
    }

    function previousTutorial() {
        tutorialIndex--;
        setTutorial();
    }

    function closeTutorial() {
        $("#tutorial").hide();
        if ($("#tutorial-permahide").is(":checked")) {
            storageAPI.hideTutorial();
        }
    }

    var uiTimer;
    function setTutorial() {
        clearTimeout(uiTimer);
        var tutorialPart = tutorialParts[tutorialIndex];

        var actions = tutorialPart.actions;
        if (actions) {
            for (var i = 0; i < actions.length; i++) {
                actions[i]();
            }
        }

        var msg = tutorialPart.msg;

        var uiFocus = tutorialPart.ui;
        if (uiFocus) {
            var target = $(uiFocus);
            if (tutorialPart.dialog) {
                target = target.parent();
            }
            showUI(target);
            if (actions) {
                uiTimer = setTimeout(showUI, 500, target);
            }
            if (msg.indexOf("{0}" >= 0)) {
                msg = msg.replace(/\{0\}/g, target.text());
            }
        } else {
            $(".overlay-fog").width(0).height(0);
        }

        $("#tutorialMessage").text(msg);

        if (tutorialIndex < tutorialParts.length - 1) {
            $("#tutorial-next").show();
            $("#tutorial-close").hide();
        } else {
            $("#tutorial-next").hide();
            $("#tutorial-close").show();
        }

        if (tutorialIndex > 0) {
            $("#tutorial-prev").removeClass("disabled");
        } else {
            $("#tutorial-prev").addClass("disabled");
        }
    }

    function showUI(target) {
        var position = target.offset();
        $(".overlay-fog").css({ top: (position.top - 2) + 'px', left: (position.left - 2) + 'px' }).width((target.outerWidth() + 4) + 'px').height((target.outerHeight() + 4) + 'px');
    }

    window.showTutorial = showTutorial;
    window.checkTutorial = checkTutorial;
});