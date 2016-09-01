"use strict";

var SIM_CONTROLLER;

(function () {
    SIM_CONTROLLER = {};

    // Global variables needed by the GUI thread when workers are used
    SIM_CONTROLLER.max_workers = 1;
    SIM_CONTROLLER.end_sims_callback = false;

    // Create a new worker object and add a listener to handle messages from it.
    function createWorker (id) {
        var worker = new Worker('scripts/worker.js');
        worker.postMessage = worker.webkitPostMessage || worker.postMessage;
        worker.id = id;
        // Check if Transferable objects are supported: http://updates.html5rocks.com/2011/12/Transferable-Objects-Lightning-Fast
        // and add the appropriate message listener
        var ab = new ArrayBuffer(1);
        worker.postMessage(ab, [ab]);
        worker.onerror = function (e) {
            window.onerror(e.message, "Worker-" + id + ":" + e.filename, e.lineno);
        }

        var use_transferables = !ab.byteLength; // If Transferable Objects are supported, ab will be cleared when postMessage is called (it gets "transferred" to the receiver)
        if (use_transferables) {
            // Transferable Objects are supported.
            worker.addEventListener('message', ProcessTransferableObjectsMessage, false);
        } else {
            // Transferable Objectss are NOT supported.
            worker.addEventListener('message', ProcessStructuredCloningMessage, false);
        }

        // Load cache script and determine which type of messaging to use
        worker.postMessage({ "cmd": "initializeWorker", "url": document.location.href, "use_transferables": use_transferables });
        return worker;
    }

    var MSG_TYPE_RESULTS = 0;

    // Handle messages from the worker thread using Transferable Objects
    // (Transferable Objects are faster, but they are not supported
    // by all browsers.)
    function  ProcessTransferableObjectsMessage (e) {
        if (sims_left) {
            var msg = e.data;
            var view = new DataView(msg, 0, 4);
            switch (view.getInt32(0)) {
                case MSG_TYPE_RESULTS:
                    progress = true;
                    view = new Int32Array(msg, 4, 6);
                    var num_games = view[0];
                    var num_wins = view[1];
                    var num_draws = view[2];
                    var num_losses = view[3];
                    var turns = view[4];
                    // If a worker's echo is included in results...
                    if (msg.byteLength > 28) {
                        // ... convert it from a byte array to a string
                        var view = new Uint16Array(msg, 28);
                        var chararray = [];
                        for (var i = 0, len = view.length; i < len; i++) {
                            chararray.push(String.fromCharCode(view[i]));
                        }
                        // ... and append it to echo
                        echo += chararray.join("");
                    }

                    add_results(num_games, num_wins, num_draws, num_losses, turns);

                    if (debug && !mass_debug && !loss_debug && !win_debug) {
                        display_debug_results(num_wins, num_draws);
                    } else if (!sims_left) {
                        display_final_results();
                    } else if (debug && (win_debug || loss_debug)) {
                        if ( (win_debug && num_wins) || (loss_debug && (num_losses || num_draws)) ){
                            SIM_CONTROLLER.stopsim(1);
                            display_final_results();
                        }
                    }
                    break;

                default:
                    // No other mesage types at this time
            }
        }
    }

    // Handle messages from the worker thread using Structured Cloning
    // (used when Transferable Objects are NOT supported by the browser)
    function ProcessStructuredCloningMessage (e) {
        if (sims_left) {
            var msg = e.data;
            switch (msg.cmd) {
                case 'return_results':
                    progress = true;
                    var results = msg.data;
                    var num_games = results[0];
                    var num_wins = results[1];
                    var num_draws = results[2];
                    var num_losses = results[3];
                    var turns = results[4];
                    var points = results[5];
                    var worker_echo = results[7];
                    if (worker_echo) {
                        echo += worker_echo;
                    }

                    add_results(num_games, num_wins, num_draws, num_losses, turns, points);

                    if (debug && !mass_debug && !loss_debug && !win_debug) {
                        var result = (num_wins ? 1 : num_draws ? 'draw' : 0);
                        display_debug_results(result);
                    } else if (!sims_left) {
                        display_final_results();
                    }
                    break;

                default:
                    // No other mesage types at this time
            }
        }
    }
        
    // Update the GUI with the current status (sims/sec, % complete, etc...)
    function display_progress() {
        // If stopsims was called, don't display any more output
        if (sims_left > 0) {
            if (progress) {
                progress = false;
                var percent_complete = (games / (num_sims) * 100).toFixed(2);
                var elapse = time_elapsed();
                var batch_size = games - last_games[0];
                var batch_elapse = batch_time_elapsed(last_start_times[0]);
                var simpersecbatch = 0;
                if (batch_elapse == 0) {
                    simpersecbatch = 0;
                } else {
                    simpersecbatch = batch_size / batch_elapse;
                }
                simpersecbatch = simpersecbatch.toFixed(2);
                setSimStatus("Running simulations...", elapse, simpersecbatch);
                if (suppressOutput && SIM_CONTROLLER.end_sims_callback && !trackStats) {
                } else {
                    showWinrate();
                }

                // Smooth output by calcuating stats for the last few .1 second intervals, rather than the last one
                // This reduces the impact of this loop firing multiple times in between getting results from workers
                var i = 0;
                for (var len = smoothing_factor - 1; i < len; i++) {
                    last_games[i] = last_games[i + 1];
                    last_start_times[i] = last_start_times[i + 1];
                }
                last_games[i] = games;
                last_start_times[i] = new Date().getTime();
            }
            setTimeout(display_progress, 100);
        }
    }

    // Add results from a batch to the total results
    function add_results(num_games, num_wins, num_draws, num_losses, turns) {

        games += num_games;
        wins += num_wins;
        draws += num_draws;
        losses += num_losses;
        total_turns += turns;

        if (sims_left > 0) sims_left -= num_games;

        if (debug) {
            if (loss_debug && !found_loss) {
                if (num_draws > 0) {
                    echo = 'Draw found after ' + games + ' games. Displaying debug output... <br><br>' + echo;
                    echo += '<br><br>';
                    found_loss = true;
                    sims_left = 0;
                    SIM_CONTROLLER.stopsim(1);
                } else if (num_losses > 0) {
                    echo = 'Loss found after ' + games + ' games. Displaying debug output... <br><br>' + echo;
                    echo += '<br><br>';
                    found_loss = true;
                    sims_left = 0;
                    SIM_CONTROLLER.stopsim(1);
                } else {
                    if (sims_left <= num_games) {
                        echo = 'No losses found after ' + games + ' games. No debug output to display.<br><br>';
                        sims_left = 0;
                    } else {
                        echo = ' ';
                    }
                }
            } else if (loss_debug && !found_loss) {
                if (num_wins > 0) {
                    echo = 'Win found after ' + games + ' games. Displaying debug output... <br><br>' + echo;
                    echo += '<br><br>';
                    found_loss = true;
                    sims_left = 0;
                    SIM_CONTROLLER.stopsim(1);
                } else {
                    if (sims_left <= num_games) {
                        echo = 'No wins found after ' + games + ' games. No debug output to display.<br><br>';
                        sims_left = 0;
                    } else {
                        echo = ' ';
                    }
                }
            } else if (mass_debug && sims_left > 0) {
                echo += '<br><hr>NEW BATTLE BEGINS<hr><br>';
            }
        }
    }

    // Display the results of a regular debug simulation
    function display_debug_results(win, draw) {

        sims_left = 0;
        time_stop = new Date().getTime();

        var msg;
        if (result == 'draw') {
            msg = '<br><h1>DRAW</h1><br>';
        } else if (result) {
            msg = '<br><h1>WIN</h1><br>';
        } else {
            msg = '<br><h1>LOSS</h1><br>';
        }
        if (echo) {
            outp(echo);
        }
        setSimStatus(msg);
        showWinrate();

        // Show interface
        toggleUI(true);

        // Hide stop button
        document.getElementById('stop').style.display = 'none';
    }

    // Display the final results after a simulation loop has completed
    function display_final_results() {

        time_stop = new Date().getTime();

        var elapse = time_elapsed();
        var simpersec = games / elapse;
        simpersec = simpersec.toFixed(2);

        setSimStatus("Simulations complete.", elapse, simpersec);
        showWinrate();

        // Show interface
        toggleUI(true);

        // Hide stop button
        document.getElementById('stop').style.display = 'none';

        if (SIM_CONTROLLER.end_sims_callback) SIM_CONTROLLER.end_sims_callback();
    }

    SIM_CONTROLLER.initializeSims = function () {
        for (var i = 0; i < max_workers; i++) {
            if (!workers[i]) workers[i] = createWorker(i);
        }

        if (typeof (Worker) === "undefined") {
            return false;
        }

        // Reset these
        total_turns = 0;
        time_start = new Date().getTime();
        time_stop = 0;
        echo = '';
        found_loss = 0;
        games = 0;
        last_games = [];
        last_start_times = [];
        for (var i = 0; i < smoothing_factor; i++) {
            last_games[i] = 0;
            last_start_times[i] = new Date().getTime();
        }

        num_sims = document.getElementById('sims').value;
        if (!num_sims) num_sims = 1;
        sims_left = num_sims;

        debug = document.getElementById('debug').checked;
        var d = document.getElementById('auto_mode');
        if (d) {
            auto_mode = d.checked;
        }
        mass_debug = document.getElementById('mass_debug').checked;
        loss_debug = document.getElementById('loss_debug').checked;
        win_debug = document.getElementById('win_debug').checked;
        if ((win_debug || loss_debug) && mass_debug) mass_debug = false;
        getdeck = document.getElementById('deck1').value;
        getcardlist = document.getElementById('cardlist').value;
        getdeck2 = document.getElementById('deck2').value;
        getcardlist2 = document.getElementById('cardlist2').value;
        getordered = document.getElementById('ordered').checked;
        getordered2 = document.getElementById('ordered2').checked;
        getexactorder = true;
        getexactorder2 = true;
        getmission = document.getElementById('mission').value;
        getraid = document.getElementById('raid').value;
        raidlevel = document.getElementById('raid_level').value;;
        getsiege = document.getElementById('siege').checked;
        tower_level = document.getElementById('tower_level').value;
        tower_type = document.getElementById('tower_type').value;
        if (BATTLEGROUNDS) {
            getbattleground = getSelectedBattlegrounds();
        }
        surge = document.getElementById('surge').checked;

        // Cache decks where possible
        // Load player deck
        if (getdeck) {
            cache_player_deck = hash_decode(getdeck);
        } else if (getcardlist) {
            cache_player_deck = load_deck_from_cardlist(getcardlist);
        } else {
            cache_player_deck = load_deck_from_cardlist();
        }

        // Load enemy deck
        smartAI = !_DEFINED("randomAI");
        if (getdeck2) {
            cache_cpu_deck = hash_decode(getdeck2);
        } else if (getcardlist2) {
            cache_cpu_deck = load_deck_from_cardlist(getcardlist2);
        } else if (getmission) {
            cache_cpu_deck = load_deck_mission(getmission);
            smartAI = false;    // PvE decks do not use "Smart AI"
        } else if (getraid) {
            cache_cpu_deck = load_deck_raid(getraid, raidlevel);
            smartAI = false;    // PvE decks do not use "Smart AI"
        } else {
            cache_cpu_deck = load_deck_from_cardlist();
        }

        card_cache = {};

        var params = {};
        params['cache_player_deck'] = cache_player_deck;
        params['cache_cpu_deck'] = cache_cpu_deck;
        params['getbattleground'] = getbattleground;
        params['getordered'] = getordered;
        params['getordered2'] = getordered2;
        params['getexactorder'] = getexactorder;
        params['getexactorder2'] = getexactorder2;
        params['getmission'] = getmission;
        params['getraid'] = getraid;
        params['getclash'] = getclash;
        params['raidlevel'] = raidlevel;
        params['getsiege'] = getsiege;
        params['tower_level'] = tower_level;
        params['tower_type'] = tower_type;
        params['smartAI'] = smartAI;
        params['surge'] = surge;
        params['debug'] = debug;
        params['loss_debug'] = loss_debug;
        params['win_debug'] = win_debug;
        params['mass_debug'] = mass_debug;
        params['user_controlled'] = false;
        params['trackStats'] = trackStats;
        params['getCardStats'] = getCardStats;

        var sims_per_worker = ~~(num_sims / max_workers);
        var remainingSims = num_sims - (sims_per_worker * max_workers);
        var worker_index = 0;

        params['sims_per_batch'] = sims_per_worker + 1;
        for (; worker_index < remainingSims; worker_index++) {  // Start a new batch
            //setupWorkerField(workers[i]);
            workers[worker_index].postMessage({ 'cmd': 'initializeSims', 'data': params });
        }

        params['sims_per_batch'] = sims_per_worker;
        if (sims_per_worker) {
            for (; worker_index < max_workers; worker_index++) {  // Start a new batch
                //setupWorkerField(workers[i]);
                workers[worker_index].postMessage({ 'cmd': 'initializeSims', 'data': params });
            }
        }
    }

    // Initialize simulation loop - runs once per simulation session
    SIM_CONTROLLER.updateField = function (field) {

        orders = {};
        winratesByCard = {};
        total_turns = 0;
        total_points = 0;
        time_start = new Date().getTime();
        time_stop = 0;
        echo = '';
        found_loss = 0;
        games = 0;
        wins = 0;
        losses = 0;
        draws = 0;
        last_games = [];
        last_start_times = [];

        for (var i = 0; i < smoothing_factor; i++) {
            last_games[i] = 0;
            last_start_times[i] = new Date().getTime();
        }
        orders = {};
        winratesByCard = {};

        num_sims = document.getElementById('sims').value;
        if (!num_sims) num_sims = 1;
        sims_left = num_sims;

        current_timeout = setTimeout(display_progress, 100);
        run_sims(field);

        return false;
    }

    // Initialize simulation loop - runs once per simulation session
    SIM_CONTROLLER.startsim = function () {
        for (var i = 0; i < max_workers; i++) {
            if (!workers[i]) workers[i] = createWorker(i);
        }

        if (typeof (Worker) === "undefined") {
            return false;
        }

        orders = {};
        winratesByCard = {};
        total_turns = 0;
        total_points = 0;
        time_start = new Date().getTime();
        time_stop = 0;
        echo = '';
        found_loss = 0;
        games = 0;
        wins = 0;
        losses = 0;
        draws = 0;
        last_games = [];
        last_start_times = [];
        for (var i = 0; i < smoothing_factor; i++) {
            last_games[i] = 0;
            last_start_times[i] = new Date().getTime();
        }

        num_sims = Number(document.getElementById('sims').value) || 0;
        if (!num_sims) num_sims = 1;
        sims_left = num_sims;
        debug = document.getElementById('debug').checked;
        var d = document.getElementById('auto_mode');
        if (d) {
            auto_mode = d.checked;
        }
        mass_debug = document.getElementById('mass_debug').checked;
        loss_debug = document.getElementById('loss_debug').checked;
        win_debug = document.getElementById('win_debug').checked;
        if ((win_debug || loss_debug) && mass_debug) mass_debug = false;
        getdeck = document.getElementById('deck').value;
        getcardlist = document.getElementById('cardlist').value;
        getdeck2 = document.getElementById('deck2').value;
        getcardlist2 = document.getElementById('cardlist2').value;
        getordered = document.getElementById('ordered').checked;
        getordered2 = document.getElementById('ordered2').checked;
        getexactorder = document.getElementById('exactorder').checked;
        getexactorder2 = document.getElementById('exactorder2').checked;
        getmission = document.getElementById('mission').value;
        getraid = document.getElementById('raid').value;
        raidlevel = document.getElementById('raid_level').value;;
        getsiege = document.getElementById('siege').checked;
        tower_level = document.getElementById('tower_level').value;
        tower_type = document.getElementById('tower_type').value;
        if (BATTLEGROUNDS) {
            getbattleground = getSelectedBattlegrounds();
        }
        surge = document.getElementById('surge').checked;

        // Hide interface
        toggleUI(false);

        // Display stop button
        document.getElementById('stop').style.display = 'block';

        // Cache decks where possible
        // Load player deck
        if (getdeck) {
            cache_player_deck = hash_decode(getdeck);
        } else if (getcardlist) {
            cache_player_deck = load_deck_from_cardlist(getcardlist);
        } else {
            cache_player_deck = load_deck_from_cardlist();
        }

        // Load enemy deck
        smartAI = !_DEFINED("randomAI");;
        if (getdeck2) {
            cache_cpu_deck = hash_decode(getdeck2);
        } else if (getcardlist2) {
            cache_cpu_deck = load_deck_from_cardlist(getcardlist2);
        } else if (getmission) {
            cache_cpu_deck = load_deck_mission(getmission);
            smartAI = false;    // PvE decks do not use "Smart AI"
        } else if (getraid) {
            cache_cpu_deck = load_deck_raid(getraid, raidlevel);
            smartAI = false;    // PvE decks do not use "Smart AI"
        } else {
            cache_cpu_deck = load_deck_from_cardlist();
        }

        card_cache = {};

        outp(""); // Clear display
        hideTable();
        setSimStatus("Initializing simulations...");

        var params = {};
        params['cache_player_deck'] = cache_player_deck;
        params['cache_cpu_deck'] = cache_cpu_deck;
        params['getbattleground'] = getbattleground;
        params['getordered'] = getordered;
        params['getordered2'] = getordered2;
        params['getexactorder'] = getexactorder;
        params['getexactorder2'] = getexactorder2;
        params['getmission'] = getmission;
        params['getraid'] = getraid;
        params['raidlevel'] = raidlevel;
        params['getsiege'] = getsiege;
        params['tower_level'] = tower_level;
        params['tower_type'] = tower_type;
        params['smartAI'] = smartAI;
        params['surge'] = surge;
        params['debug'] = debug;
        params['loss_debug'] = loss_debug;
        params['win_debug'] = win_debug;
        params['mass_debug'] = mass_debug;
        params['user_controlled'] = false;
        params['trackStats'] = trackStats;
        params['getCardStats'] = getCardStats;
        
        for (var i = 0; i < max_workers; i++) {
            setupWorkerField(workers[i]);
            workers[i].postMessage({ 'cmd': 'initializeSims', 'data': params });
        }

        current_timeout = setTimeout(display_progress, 100);
        run_sims();

        // Output decks for first simulation
        if (debug && (loss_debug || win_debug)) {
        } else if (suppressOutput) {
        } else if (echo == '') {
            debug_dump_decks();
        }

        return false;
    }

    // Interrupt simulations
    SIM_CONTROLLER.nextDeck = function (nextHash) {

        orders = {};
        winratesByCard = {};
        total_turns = 0;
        total_points = 0;
        time_start = new Date().getTime();
        time_stop = 0;
        echo = '';
        found_loss = 0;
        games = 0;
        wins = 0;
        losses = 0;
        draws = 0;

        //num_sims = Number(document.getElementById('sims').value) || 0;
        sims_left = num_sims;

        cache_player_deck = hash_decode(nextHash);
        
        var params = {};
        params['cache_player_deck'] = cache_player_deck;
        params['cache_cpu_deck'] = cache_cpu_deck;
        params['getbattleground'] = getbattleground;
        params['getordered'] = getordered;
        params['getordered2'] = getordered2;
        params['getexactorder'] = getexactorder;
        params['getexactorder2'] = getexactorder2;
        params['getmission'] = getmission;
        params['getraid'] = getraid;
        params['raidlevel'] = raidlevel;
        params['getsiege'] = getsiege;
        params['tower_level'] = tower_level;
        params['tower_type'] = tower_type;
        params['smartAI'] = smartAI;
        params['surge'] = surge;
        params['debug'] = debug;
        params['loss_debug'] = loss_debug;
        params['win_debug'] = win_debug;
        params['mass_debug'] = mass_debug;
        params['user_controlled'] = false;
        params['trackStats'] = trackStats;
        params['getCardStats'] = getCardStats;

        for (var i = 0; i < max_workers; i++) {
            setupWorkerField(workers[i]);
            workers[i].postMessage({ 'cmd': 'initializeSims', 'data': params });
        }

        // Display stop button
        document.getElementById('stop').style.display = 'block';

        run_sims();
    }

    // Interrupt simulations
    SIM_CONTROLLER.stopsim = function (supress_output) {

        sims_left = 0;
        time_stop = new Date().getTime();
        var elapse = time_elapsed();
        var simpersec = games / elapse;
        simpersec = simpersec.toFixed(2);

        // Stop the recursion
        if (current_timeout) clearTimeout(current_timeout);

        for (var i = 0; i < max_workers; i++) {
            workers[i].postMessage({ 'cmd': 'stopsim' });
        }

        if (!supress_output) {
            setSimStatus("Simulations interrupted.", elapse, simpersec);
            showWinrate();
        }

        // Show interface
        toggleUI(true);

        // Hide stop button
        document.getElementById('stop').style.display = 'none';
    }

    function setupWorkerField() { };
    
    // Loops through all simulations
    // - keeps track of number of simulations and outputs status
    function run_sims(field) {
        if (debug && !mass_debug && !loss_debug && !win_debug) {
            if (field) {
                workers[0].postMessage({ 'cmd': 'run_sims_3', 'data': field });
            } else {
                workers[0].postMessage({ 'cmd': 'run_sims' });
            }
        } else {
            time_start_batch = new Date().getTime();

            var sims_per_worker = ~~(num_sims / max_workers);
            var remainingSims = num_sims - (sims_per_worker * max_workers);
            var worker_index = 0;
            for (; worker_index < remainingSims; worker_index++) {  // Start a new batch
                if (field) {
                    workers[worker_index].postMessage({ 'cmd': 'run_sims_3', 'data': field });
                } else {
                    workers[worker_index].postMessage({ 'cmd': 'run_sims', 'data': [sims_per_worker + 1] });
                }
            }
            if (sims_per_worker) {
                for (; worker_index < max_workers; worker_index++) {  // Start a new batch
                    if (field) {
                        workers[worker_index].postMessage({ 'cmd': 'run_sims_3', 'data': field });
                    } else {
                        workers[worker_index].postMessage({ 'cmd': 'run_sims', 'data': [sims_per_worker] });
                    }
                }
            }
        }
    }
    
    Object.defineProperties(SIM_CONTROLLER, {
        setupWorkerField: {
            get: function () {
                return setupWorkerField;
            },
            set: function (value) {
                setupWorkerField = value;
            }
        },
    });

    var workers = [];
    var smoothing_factor = 5;	// Used by the progress reporting logic, determines how many .1 second intervals back to go for sims/sec calculations
    var progress = false;
    var last_start_times = [];
})();