define('ui', [
	'base64',
	'urlHelper',
	'loadDeck',
	'debugLog',
	'storageAPI',
	'dataUpdater',
	'matchStats',
	'animations',
	'simController',
	'simTutorial'
], function (
	base64,
	urlHelper,
	loadDeck,
	debugLog,
	storageAPI,
	dataUpdater,
	matchStats,
	animations,
	simController,
	simTutorial
) {
	'use strict';

	var api = {
		show: showUI,
		hide: hideUI,
		getSelectedBattlegrounds: getSelectedBattlegrounds,
		getSelectedMapBattlegrounds: getSelectedMapBattlegrounds,
		generateLink: generateLink,
		displayText: displayText,
		displayTurns: displayTurns,
		showWinrate: showWinrate,
		hideTable: hideTable,
		setSimStatus: setSimStatus,
		loadDeckBuilder: loadDeckBuilder,
		updateGameData: updateGameData,
		loadSavedDeck: loadSavedDeck,
		toggleTheme: toggleTheme,
		getConfiguration: getConfiguration
	};

	simController.onDebugEnd = displayDebugEnd;

	var loadDeckDialog,
		battleHistory;

	window.addEventListener('error', function onUncaughtException(message, url, lineNumber) {
		var errorDescription = "JavaScript error:\n " + message + "\n on line " + lineNumber + "\n for " + url;

		window.sa('send', 'exception', {
			'exDescription': errorDescription,
			'exFatal': false
		});

		if (lineNumber === 0) {
			var msg = "<br><br><i>Error Message:</i><br><br>" +
				"<i>It appears you're having trouble loading SimSpellstone. " +
				"Thanks.</i><br><br>";
			displayText(msg);
			return 1;
		}

		errorDescription += "\n";
		errorDescription += "Browser CodeName: " + navigator.appCodeName + "\n";
		errorDescription += "Browser Name: " + navigator.appName + "\n";
		errorDescription += "Browser Version: " + navigator.appVersion + "\n";
		errorDescription += "Cookies Enabled: " + navigator.cookieEnabled + "\n";
		errorDescription += "Platform: " + navigator.platform + "\n";
		errorDescription += "User-agent header: " + navigator.userAgent + "\n";
		try {
			errorDescription += "URL: " + generateLink() + "\n";
		} catch (err) {
			// Swallow
		}

		displayText("<br><br><i>Error Message:</i><br><textarea cols=50 rows=6 onclick=\"this.select()\"><blockquote>" + errorDescription + "</blockquote></textarea>");

		// Stop the recursion if any
		try {
			simController.clearStatusTimeout();
		} catch (err) {
			// Swallow
		}
	});

	function _toggleUI(display) {
		if (display) {
			$("#ui").show();
		} else {
			$("#ui").hide();
		}
	}

	function showUI() {
		// Show interface
		_toggleUI(true);
		// Hide stop button
		document.getElementById('stop').style.display = 'none';
	}

	function hideUI() {
		$(".accordion").accordion('option', 'active', null);
		// Hide interface
		_toggleUI(false);
		// Display stop button
		document.getElementById('stop').style.display = 'block';
	}

	function getSelectedBattlegrounds(prefix) {
		prefix = (prefix || "");
		var selectedBattlegrounds = [];
		var bgCheckBoxes = document.getElementsByName(prefix + "battleground");
		for (var i = 0; i < bgCheckBoxes.length; i++) {
			var checkbox = bgCheckBoxes[i];
			if (checkbox && checkbox.checked) {
				selectedBattlegrounds.push(checkbox.value);
			}
		}
		selectedBattlegrounds = selectedBattlegrounds.join();
		return selectedBattlegrounds;
	}

	function getSelectedMapBattlegrounds() {
		var selectedBattlegrounds = [];
		var locationID = $("#location").val();
		var selects = document.getElementsByName("map-battleground");
		for (var i = 0; i < selects.length; i++) {
			var select = selects[i];
			if (select.value > 0) {
				selectedBattlegrounds.push(locationID + "-" + i + "-" + select.value);
			}
		}
		selectedBattlegrounds = selectedBattlegrounds.join();
		return selectedBattlegrounds;
	}

	function displayDebugEnd(result, matchPoints) {
		var msg = '';
        if (matchPoints !== undefined) {
            msg = ' (' + SIMULATOR.calculatePoints() + ' points)';
        }
        if (result === 'draw') {
            msg = '<br><h1>DRAW' + msg + '</h1><br>';
        } else if (result) {
            msg = '<br><h1>WIN' + msg + '</h1><br>';
        } else {
            msg = '<br><h1>LOSS' + msg + '</h1><br>';
        }

        displayTurns();
        setSimStatus(msg);

        showUI();
	}

	// Modify HTML to output simulation results
	function displayText(text) {
		$('#content').html(text);
	}

	function displayTurns(closeDiv) {
		var turnData = debugLog.getLog();
		if (!turnData) {
			return;
		}

		if (closeDiv) {
			turnData += "</div>";
		}
		turnData = "<input id='show-turns' type='button' value='Show All' /> <div id='turn-container'>Turn: <select id='turn-picker'></select></div> <div>" + turnData + "</div>";
		displayText(turnData);
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

		if (debugLog.enabled || SIMULATOR.remainingSims === 0) {
			// Generate links
			var links = '';
			links += '<br>' +
				'<br>' +
				'<i>Non-autostart link</i>' +
				'<br>' +
				'<a href="' + generateLink() + '">' + generateLink() + '</a>' +
				'<br>' +
				'<br>' +
				'<i>Autostart link</i>' +
				'<br>' +
				'<a href="' + generateLink(1) + '">' + generateLink(1) + '</a>' +
				'<br>' +
				'<br>';
			if (debugLog.enabled) return links;
		}
		// Win/Loss ratios
		var winPercent = matchStats.matchesWon / matchStats.matchesPlayed;
		var winrate = (winPercent * 100).toFixed(2) + "%";
		$("#wins").html(matchStats.matchesWon);
		$("#winrate").html(winrate);

		var lossrate = matchStats.matchesLost / matchStats.matchesPlayed * 100;
		lossrate = lossrate.toFixed(2) + "%";
		$("#losses").html(matchStats.matchesLost);
		$("#lossrate").html(lossrate);

		var drawrate = matchStats.matchesDrawn / matchStats.matchesPlayed * 100;
		drawrate = drawrate.toFixed(2) + "%";
		$("#draws").html(matchStats.matchesDrawn);
		$("#drawrate").html(drawrate);

		var mErr = _marginOfError(matchStats.matchesWon, matchStats.matchesPlayed);
		$("#marginGames").html((mErr * matchStats.matchesPlayed).toFixed(0));
		mErr = mErr.toFixed(2) + "%";
		$("#marginPercent").html(mErr);

		var totalSims = matchStats.matchesPlayed + SIMULATOR.remainingSims;
		var percentComplete = (matchStats.matchesPlayed * 100 / totalSims).toFixed("2") + "%";
		$(".battleCount").html(matchStats.matchesPlayed);
		$("#percentComplete").html(percentComplete);

		// Calculate Average length of battle
		$("#avgLength").html((matchStats.totalTurns / matchStats.matchesPlayed).toFixed(1));

		$("#avgPoints").html((matchStats.totalPoints / matchStats.matchesPlayed).toFixed(2));

		$("#winrateTable").show();
		// Final output
		var full_table = "";
		if (SIMULATOR.remainingSims === 0) {
			// Add generated links to final output
			full_table += links;

			// Append results to history

			var current_deck = '';
			var deck = [];
			var deck1Hash = document.getElementById('deck1').value;

			// Load player deck
			if (deck1Hash) {
				deck.player = base64.decodeHash(deck1Hash);
			}
			if (deck.player) {
				current_deck = base64.encodeHash(deck.player);
			}

			battleHistory += winrate + ' (+/- ' + mErr + ') &nbsp; &nbsp; ' + current_deck + '<br>';
		}

		return full_table;
	}

	function hideTable() {
		$("#winrateTable").hide();
	}

	function setSimStatus(simStatusMsg, elapse, simsPerSec) {
		$("#simStatusMsg").html(simStatusMsg);
		if (elapse && simsPerSec) {
			var totalSims = matchStats.matchesPlayed + SIMULATOR.remainingSims;
			var percentComplete = (matchStats.matchesPlayed * 100 / totalSims).toFixed("2") + "%";
			var progress = ('(' + matchStats.matchesPlayed + '/' + totalSims + ') ' + percentComplete);
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

	// http://onlinestatbook.com/2/estimation/proportion_ci.html
	function _marginOfError(wins, games) {
		if (games <= 1) return 1;

		var p = wins / games;
		var N = games;
		var stdErr = Math.sqrt((p * (1 - p)) / N);
		var Z95 = 1.96;
		return ((stdErr * Z95) + 0.5 / N) * 100;
	}

	// Generate a link from current settings and input
	function generateLink(autostart) {
		var url_base = document.URL;
		var index_of_query = url_base.indexOf('?');
		if (index_of_query > 0) {
			url_base = url_base.substring(0, index_of_query);
		}

		var parameters = [];
		_addValueParam(parameters, "deck1");
		_addValueParam(parameters, "deck2");

		_addValueParam(parameters, "location");
		_addValueParam(parameters, "campaign");
		_addValueParam(parameters, "mission");
		_addValueParam(parameters, "mission_level");
		_addValueParam(parameters, "raid");
		_addValueParam(parameters, "raid_level");
		var mapBges = $('select[name=map-battleground]').toArray().reduce(function (acc, val) { return acc + val.value; }, "");
		if (mapBges.length) {
			parameters.push('mapBges=' + mapBges);
		}

		_addBoolParam(parameters, "surge");

		if (_addBoolParam(parameters, "siege")) {
			_addValueParam(parameters, "tower_level");
			_addValueParam(parameters, "tower_type");
		}

		_addBoolParam(parameters, "auto_mode");
		_addBoolParam(parameters, "tournament");
		_addBoolParam(parameters, "ordered");
		_addBoolParam(parameters, "exactorder");
		_addBoolParam(parameters, "ordered2");
		_addBoolParam(parameters, "exactorder2");

		_addBgeParam(parameters, 'battleground', 'bges', 0);
		_addBgeParam(parameters, 'self-battleground', 'selfbges', 10000);
		_addBgeParam(parameters, 'enemy-battleground', 'enemybges', 10000);

		_addValueParam(parameters, "sims");

		_addBoolParam(parameters, "debug");
		_addBoolParam(parameters, "mass_debug");
		_addBoolParam(parameters, "loss_debug");
		_addBoolParam(parameters, "win_debug");
		_addBoolParam(parameters, "play_debug");

		if (autostart) {
			parameters.push('autostart');
		}

		if (parameters.length > 0) {
			return url_base + '?' + parameters.join('&');
		} else {
			return url_base;
		}
	}

	function _addValueParam(params, paramName, fieldName) {
		var value = $("#" + (fieldName || paramName)).val();
		if (value) {
			params.push(paramName + "=" + value);
			return true;
		} else {
			return false;
		}
	}

	function _addBoolParam(params, paramName) {
		var checked = $("#" + paramName).is(":checked");
		if (checked) {
			params.push(paramName);
			return true;
		} else {
			return false;
		}
	}

	function _addBgeParam(params, elementName, paramName, offset) {
		var bges = [].slice.call(document.getElementsByName(elementName))
			.filter(function (bgeEl) { return bgeEl.checked; })
			.map(function (bgeEl) { return base64.fromDecimal(bgeEl.value - offset, 2); })
			.join('');
		if (bges) {
			params.push(paramName + '=' + bges);
		}
	}

	var deckBuilders = {};
	function loadDeckBuilder(player) {
		var deckHash;
		var selectedMission;
		var missionLevel;
		var selectedRaid;
		var raidLevel;
		var deck;

		if (player === 'player') {
			deckHash = $('#deck1').val();
		} else {
			deckHash = $('#deck2').val();
			selectedMission = $('#mission').val();
			missionLevel = $('#mission_level').val();
			selectedRaid = $('#raid').val();
			raidLevel = $('#raid_level').val();
		}

		// Load player deck
		if (deckHash) {
			deck = base64.decodeHash(deckHash);
		} else if (selectedMission) {
			deck = loadDeck.mission(selectedMission, missionLevel);
		} else if (selectedRaid) {
			deck = loadDeck.raid(selectedRaid, raidLevel);
		} else {
			deck = loadDeck.defaultDeck();
		}
		var hash = base64.encodeHash(deck);

		var name = (player === 'player' ? 'Player Deck' : 'Enemy Deck');
		var deckHashField = (player ? $("#" + (player === 'player' ? 'deck1' : 'deck2')) : null);

		var currentDeckBuilder = deckBuilders[player];
		if (!currentDeckBuilder || currentDeckBuilder.closed) {
			deckBuilders[player] = _openDeckBuilder(name, hash, null, deckHashField);
		}
		else {
			currentDeckBuilder.focus();
		}
	}

	function _openDeckBuilder(name, hash, inventory, deckHashField) {
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
		if (urlHelper.paramDefined("ajax")) {
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
		//$(win).load((function (deckHashField) {
		win.addEventListener('load', (function createOnLoad(deckHashField) {
			return function linkToDeckHashField() {
				// Tie deck-builder back to the hash field in the simulator.
				if (deckHashField) win.updateSimulator = function (hash) { deckHashField.val(hash).change(); };
			};
		})(deckHashField));

		return win;
	}

	function _doneLoading() {
		$("body").removeClass("loading");
		simTutorial.checkTutorial();
	}

	function updateGameData(callback) {
		var done = _doneLoading;
		if (callback) {
			done = function () {
				_doneLoading();
				callback();
			};
		}
		dataUpdater.updateData(done, true);
	}

	function loadSavedDeck(hashField) {
		$('label[for="loadDeckName"]').html('<strong>Deck:</strong>');
		loadDeckDialog.dialog("open");
		loadDeckDialog.dialog("option", "position", { my: "center", at: "center", of: window });

		loadDeckDialog.hashField = hashField;
	}

	function _onDeckLoaded(newHash, hashField) {
		$(hashField).val(newHash).change();
	}

	var dark = false;
	function toggleTheme() {
		if (dark) {
			$("#theme").attr("href", "dist/light.min.css");
			$("#toggleTheme").val("Dark Theme");
		} else {
			$("#theme").attr("href", "dist/dark.min.css");
			$("#toggleTheme").val("Light Theme");
		}
		dark = !dark;
	}

	function getConfiguration() {
        var playerHash = $('#deck1').val();
        var playerOrdered = $('#ordered').is(':checked');
        var playerExactOrder = $('#exactorder').is(':checked');

        var cpuHash = $('#deck2').val();
        var selectedCampaign = $('#campaign').val();
        var selectedMission = $('#mission').val();
        var missionLevel = $('#mission_level').val();
        var selectedRaid = $('#raid').val();
        var raidLevel = $('#raid_level').val();
        var cpuOrdered = $('#ordered2').is(':checked');
        var cpuExactOrder = $('#exactorder2').is(':checked');
        var surgeMode = $('#surge').is(':checked');
        var pvpAI = (!cpuHash && (selectedMission || selectedRaid)); // PvE decks do not use "Smart AI"

        var siegeMode = $('#siege').is(':checked');
        var towerLevel = $('#tower_level').val();
        var towerType = $('#tower_type').val();

        var selectedBges = '';
        var selfbges = '';
        var enemybges = '';
        var mapbges = '';
        if (BATTLEGROUNDS) {
            selectedBges = getSelectedBattlegrounds();
            selfbges = getSelectedBattlegrounds("self-");
            enemybges = getSelectedBattlegrounds("enemy-");
            mapbges = (selectedMission ? getSelectedMapBattlegrounds() : "");
        }

        var simsToRun = $('#sims').val() || 1;

        debugLog.enabled = $('#debug').is(':checked');
        if(debugLog.enabled) {
            debugLog.cardsPlayedOnly = $('#play_debug').is(':checked');
            if (debugLog.cardsPlayedOnly) debugLog.enabled = false;
            debugLog.massDebug = $('#mass_debug').is(':checked');
            debugLog.firstWin = $('#win_debug').is(':checked');
            debugLog.firstLoss = $('#loss_debug').is(':checked');
        }
        animations.areShown = $('#animations').is(':checked');
		setSimulatorEventHandlers(animations.areShown);

        var userControlled = false;
        if ($('#auto_mode').length) {
            userControlled = !$('#auto_mode').is(':checked');
            SIMULATOR.user_controlled = userControlled;
        }

        // Not currently in UI - attacker's first card has +1 delay
        var tournamentMode = $("#tournament").is(":checked");

        return {
            playerHash: playerHash,
            playerOrdered: playerOrdered,
            playerExactOrder: playerExactOrder,
            cpuHash: cpuHash,
            selectedCampaign: selectedCampaign,
            selectedMission: selectedMission,
            missionLevel: missionLevel,
            selectedRaid: selectedRaid,
            raidLevel: raidLevel,
            cpuOrdered: cpuOrdered,
            cpuExactOrder: cpuExactOrder,
            surgeMode: surgeMode,
            siegeMode: siegeMode,
            towerLevel: towerLevel,
            towerType: towerType,
            selectedBges: selectedBges,
            selfbges: selfbges,
            enemybges: enemybges,
            mapbges: mapbges,
            simsToRun: simsToRun,
            userControlled: userControlled,
            tournamentMode: tournamentMode,
            pvpAI: pvpAI
        };
	}
	
	function setSimulatorEventHandlers(showAnimations) {
		if (showAnimations) {
			SIMULATOR.events.onCardPlayed = function onCardPlayed(field, turn) {
				animations.drawField(field, null, null, turn);
			};
			SIMULATOR.events.onEarlyActivationSkills = function onEarlyActivationSkills(field, turn, sourceCard) {
				animations.drawField(field, null, null, turn, sourceCard);
			};
			SIMULATOR.events.onActivationSkills = function (field, turn, sourceUnit) {
				animations.drawField(field, null, null, turn, sourceUnit);
			};
			SIMULATOR.events.onOnDeathSkills = function onOnDeathSkills(field, turn, dying) {
				animations.drawField(field, null, null, turn, dying);
			};
			SIMULATOR.events.onUnitAttacked = function onUnitAttacked(field, turn, current_assault) {
				animations.drawField(field, null, null, turn, current_assault);
			};
			SIMULATOR.events.onUnitDone = function onUnitDone(field, turn, current_assault) {
				animations.drawField(field, null, null, turn, current_assault);
			};
		} else {
			var noop = function noop() {};
			SIMULATOR.events.onCardPlayed = noop;
			SIMULATOR.events.onEarlyActivationSkills = noop;
			SIMULATOR.events.onActivationSkills = noop;
			SIMULATOR.events.onOnDeathSkills = noop;
			SIMULATOR.events.onUnitAttacked = noop;
			SIMULATOR.events.onUnitDone = noop;
		}

		SIMULATOR.events.onPresentCardChoice = function onPresentCardChoice(field, drawableHand, onCardChosen, turn) {
			hideTable();
			displayTurns(true);
			animations.drawField(field, drawableHand, onCardChosen, turn);
		};
		SIMULATOR.events.onCardChosen = animations.clearFrames;
	}


	function clearHistory() {
		battleHistory = '';
		displayHistory();
	}

	function displayHistory() {
		displayText('' +
			'<br>' +
			'<hr>' +
			(battleHistory || 'No history available.') +
			'<hr>' +
			'<br>' +
			'<br>' +
			'<input id="clear-history" type="button" value="Clear History" style="text-align: center; font-weight: normal;">' +
			'<br>' +
			'<br>' +
			'');
		$('#clear-history').click(clearHistory);
	}

	$(function () {
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
					storageAPI.deleteDeck(name);
				},
				Load: function () {
					var name = $("#loadDeckName").val();
					var newHash = storageAPI.loadDeck(name);
					_onDeckLoaded(newHash, loadDeckDialog.hashField);
					loadDeckDialog.dialog("close");
				},
				Cancel: function () {
					loadDeckDialog.dialog("close");
				}
			}
		});

		$("#display_history").on("click", displayHistory);
	});

	// Temporary fix for HTML access
	window.ui = api;

	return api;
});