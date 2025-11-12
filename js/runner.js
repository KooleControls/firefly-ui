// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// Runner class - main game controller

(function() {
    'use strict';

    // Get reference to global Runner object (created in config.js)
    var RunnerGlobal = window.Runner;

    /**
     * T-Rex runner.
     * @param {string} outerContainerId Outer containing element id.
     * @param {Object} opt_config
     * @constructor
     * @export
     */
    function Runner(outerContainerId, opt_config) {
        // Singleton
        if (Runner.instance_) {
            return Runner.instance_;
        }
        Runner.instance_ = this;

        this.outerContainerEl = document.querySelector(outerContainerId);
        this.containerEl = null;
        this.snackbarEl = null;
        this.detailsButton = this.outerContainerEl.querySelector('#details-button');

        this.config = opt_config || RunnerGlobal.config;

        this.dimensions = RunnerGlobal.defaultDimensions;

        this.canvas = null;
        this.canvasCtx = null;

        this.tRex = null; // Keep for backward compatibility
        this.tRexes = []; // Array of dinos for multiplayer
        this.playerMap = {}; // Map MAC addresses to dino instances
        this.lastButtonPresses = {}; // Track last button press count per player
        this.apiBaseUrl = 'http://192.168.50.27';
        this.eventsEndpoint = '/api/guests/events';
        this.scorePostEndpoint = '/api/score';
        this.apiUrl = this.apiBaseUrl + this.eventsEndpoint;
        this.eventSource = null; // For streaming connection (EventSource)
        this.fetchStreamReader = null; // For fetch-based streaming fallback

        this.distanceMeter = null;
        this.distanceRan = 0;

        this.highestScore = 0;
        this.highScores = {}; // mac -> highest score


        this.time = 0;
        this.runningTime = 0;
        this.msPerFrame = 1000 / FPS;
        this.currentSpeed = this.config.SPEED;

        this.obstacles = [];

        // State machine for managing game states
        this.stateMachine = new StateMachine();
        
        // Legacy boolean flags (kept for backward compatibility, but should use stateMachine)
        this.activated = false; // Whether the easter egg has been activated.
        this.playing = false; // Whether the game is currently in play state.
        this.crashed = false;
        this.paused = false;
        this.inverted = false;
        this.invertTimer = 0;
        this.resizeTimerId_ = null;
        
        // Game mode: 'collective' or 'competitive'
        this.gameMode = null; // Will be set by user selection
        this.waitingForModeSelection = true; // Whether we're waiting for mode selection
        
        // Initialize state machine listeners
        this.setupStateMachineListeners();

        this.playCount = 0;

        // Sound FX.
        this.audioBuffer = null;
        this.soundFx = {};

        // Global web audio context for playing sounds.
        this.audioContext = null;

        // Images.
        this.images = {};
        this.imagesLoaded = 0;

        if (this.isDisabled()) {
            this.setupDisabledRunner();
        } else {
            this.loadImages();
        }
    }

    Runner.prototype = {
        /**
         * Setup state machine listeners to sync with legacy boolean flags
         */
        setupStateMachineListeners: function() {
            var self = this;
            
            // Listen to all state changes to keep legacy flags in sync
            this.stateMachine.onStateChange('*', function(newState, oldState) {
                // Update legacy flags based on state
                switch(newState) {
                    case GameState.INITIALIZED:
                        self.activated = false;
                        self.playing = false;
                        self.crashed = false;
                        self.paused = false;
                        break;
                    case GameState.MODE_SELECTION:
                        self.waitingForModeSelection = true;
                        self.playing = false;
                        self.paused = false;
                        break;
                    case GameState.INTRO:
                        self.activated = true;
                        self.playing = true;
                        self.playingIntro = true;
                        break;
                    case GameState.PLAYING:
                        self.playing = true;
                        self.paused = false;
                        self.crashed = false;
                        self.playingIntro = false;
                        break;
                    case GameState.PAUSED:
                        self.paused = true;
                        self.playing = false;
                        break;
                    case GameState.GAME_OVER:
                    case GameState.CRASHED:
                        self.crashed = true;
                        self.playing = false;
                        self.paused = true;
                        break;
                }
            });
        },
        
        /**
         * Whether the easter egg has been disabled. CrOS enterprise enrolled devices.
         * @return {boolean}
         */
        isDisabled: function () {
            // return loadTimeData && loadTimeData.valueExists('disabledEasterEgg');
            return false;
        },

        /**
         * For disabled instances, set up a snackbar with the disabled message.
         */
        setupDisabledRunner: function () {
            this.containerEl = document.createElement('div');
            this.containerEl.className = RunnerGlobal.classes.SNACKBAR;
            this.containerEl.textContent = loadTimeData.getValue('disabledEasterEgg');
            this.outerContainerEl.appendChild(this.containerEl);

            // Show notification when the activation key is pressed.
            document.addEventListener(RunnerGlobal.events.KEYDOWN, function (e) {
                if (RunnerGlobal.keycodes.JUMP[e.keyCode]) {
                    this.containerEl.classList.add(RunnerGlobal.classes.SNACKBAR_SHOW);
                    document.querySelector('.icon').classList.add('icon-disabled');
                }
            }.bind(this));
        },

        /**
         * Setting individual settings for debugging.
         * @param {string} setting
         * @param {*} value
         */
        updateConfigSetting: function (setting, value) {
            if (setting in this.config && value != undefined) {
                this.config[setting] = value;

                switch (setting) {
                    case 'GRAVITY':
                    case 'MIN_JUMP_HEIGHT':
                    case 'SPEED_DROP_COEFFICIENT':
                        this.tRex.config[setting] = value;
                        break;
                    case 'INITIAL_JUMP_VELOCITY':
                        this.tRex.setJumpVelocity(value);
                        break;
                    case 'SPEED':
                        this.setSpeed(value);
                        break;
                }
            }
        },

        /**
         * Cache the appropriate image sprite from the page and get the sprite sheet
         * definition.
         */
        loadImages: function () {
            if (IS_HIDPI) {
                RunnerGlobal.imageSprite = document.getElementById('offline-resources-2x');
                this.spriteDef = RunnerGlobal.spriteDefinition.HDPI;
            } else {
                RunnerGlobal.imageSprite = document.getElementById('offline-resources-1x');
                this.spriteDef = RunnerGlobal.spriteDefinition.LDPI;
            }
            
            // Also set on window.Runner for other modules
            if (window.Runner) {
                window.Runner.imageSprite = RunnerGlobal.imageSprite;
            }

            if (RunnerGlobal.imageSprite.complete) {
                this.init();
            } else {
                // If the images are not yet loaded, add a listener.
                RunnerGlobal.imageSprite.addEventListener(RunnerGlobal.events.LOAD,
                    this.init.bind(this));
            }
        },

        /**
         * Load and decode base 64 encoded sounds.
         */
        loadSounds: function () {
            if (!IS_IOS) {
                this.audioContext = new AudioContext();

                var resourceTemplate =
                    document.getElementById(this.config.RESOURCE_TEMPLATE_ID).content;

                for (var sound in RunnerGlobal.sounds) {
                    var soundSrc =
                        resourceTemplate.getElementById(RunnerGlobal.sounds[sound]).src;
                    soundSrc = soundSrc.substr(soundSrc.indexOf(',') + 1);
                    var buffer = decodeBase64ToArrayBuffer(soundSrc);

                    // Async, so no guarantee of order in array.
                    this.audioContext.decodeAudioData(buffer, function (index, audioData) {
                        this.soundFx[index] = audioData;
                    }.bind(this, sound));
                }
            }
        },

        /**
         * Sets the game speed. Adjust the speed accordingly if on a smaller screen.
         * @param {number} opt_speed
         */
        setSpeed: function (opt_speed) {
            var speed = opt_speed || this.currentSpeed;

            // Reduce the speed on smaller mobile screens.
            if (this.dimensions.WIDTH < DEFAULT_WIDTH) {
                var mobileSpeed = speed * this.dimensions.WIDTH / DEFAULT_WIDTH *
                    this.config.MOBILE_SPEED_COEFFICIENT;
                this.currentSpeed = mobileSpeed > speed ? speed : mobileSpeed;
            } else if (opt_speed) {
                this.currentSpeed = opt_speed;
            }
        },

        /**
         * Game initialiser.
         */
        init: function () {
            // Hide the static icon.
            document.querySelector('.' + RunnerGlobal.classes.ICON).style.visibility =
                'hidden';

            this.adjustDimensions();
            this.setSpeed();

            this.containerEl = document.createElement('div');
            this.containerEl.className = RunnerGlobal.classes.CONTAINER;

            // Player canvas container.
            this.canvas = createCanvas(this.containerEl, this.dimensions.WIDTH,
                this.dimensions.HEIGHT, RunnerGlobal.classes.PLAYER);

            this.canvasCtx = this.canvas.getContext('2d');
            this.canvasCtx.fillStyle = '#f7f7f7';
            this.canvasCtx.fill();
            RunnerGlobal.updateCanvasScaling(this.canvas);

            // Horizon contains clouds, obstacles and the ground.
            this.horizon = new Horizon(this.canvas, this.spriteDef, this.dimensions,
                this.config.GAP_COEFFICIENT);

            // Distance meter (only for high score display)
            this.distanceMeter = new DistanceMeter(this.canvas,
                this.spriteDef.TEXT_SPRITE, this.dimensions.WIDTH);

            // Don't create initial dino - dinos will be created from API
            this.tRex = null; // No initial dino

            this.outerContainerEl.appendChild(this.containerEl);

            if (IS_MOBILE) {
                this.createTouchController();
            }

            // Load sounds but don't start game yet - wait for mode selection
            this.loadSounds();
            
            // Set container to full width and height immediately (skip intro animation)
            this.containerEl.style.width = this.dimensions.WIDTH + 'px';
            this.containerEl.style.height = this.dimensions.HEIGHT + 'px';
            this.setArcadeMode();

            // Initialize state machine to MODE_SELECTION
            this.stateMachine.transition(GameState.MODE_SELECTION);
            
            this.startListening();
            // Show mode selection screen
            this.showModeSelection();
            this.update();

            window.addEventListener(RunnerGlobal.events.RESIZE,
                this.debounceResize.bind(this));
        },

        /**
         * Create the touch controller. A div that covers whole screen.
         */
        createTouchController: function () {
            this.touchController = document.createElement('div');
            this.touchController.className = RunnerGlobal.classes.TOUCH_CONTROLLER;
            this.outerContainerEl.appendChild(this.touchController);
        },

        /**
         * Debounce the resize event.
         */
        debounceResize: function () {
            if (!this.resizeTimerId_) {
                this.resizeTimerId_ =
                    setInterval(this.adjustDimensions.bind(this), 250);
            }
        },

        /**
         * Adjust game space dimensions on resize.
         */
        adjustDimensions: function () {
            clearInterval(this.resizeTimerId_);
            this.resizeTimerId_ = null;

            var boxStyles = window.getComputedStyle(this.outerContainerEl);
            var padding = Number(boxStyles.paddingLeft.substr(0,
                boxStyles.paddingLeft.length - 2));

            this.dimensions.WIDTH = this.outerContainerEl.offsetWidth - padding * 2;
            this.dimensions.WIDTH = Math.min(DEFAULT_WIDTH, this.dimensions.WIDTH); //Arcade Mode
            if (this.activated) {
                this.setArcadeModeContainerScale();
            }
            
            // Redraw the elements back onto the canvas.
            if (this.canvas) {
                this.canvas.width = this.dimensions.WIDTH;
                this.canvas.height = this.dimensions.HEIGHT;

                RunnerGlobal.updateCanvasScaling(this.canvas);

                this.distanceMeter.calcXPos(this.dimensions.WIDTH);
                this.clearCanvas();
                this.horizon.update(0, 0, true);
                for (var i = 0; i < this.tRexes.length; i++) {
                    this.tRexes[i].update(0);
                }

                // Outer container and distance meter.
                if (this.playing || this.crashed || this.paused) {
                    this.containerEl.style.width = this.dimensions.WIDTH + 'px';
                    this.containerEl.style.height = this.dimensions.HEIGHT + 'px';
                    // Only draw high score, not current score
                    this.distanceMeter.drawHighScore();
                    this.stop();
                } else {
                    for (var i = 0; i < this.tRexes.length; i++) {
                        this.tRexes[i].draw(0, 0);
                    }
                }

                // Game over panel.
                if (this.crashed && this.gameOverPanel) {
                    this.gameOverPanel.updateDimensions(this.dimensions.WIDTH);
                    this.gameOverPanel.draw();
                }
            }
        },

        /**
         * Play the game intro.
         * Canvas container width expands out to the full width.
         */
        playIntro: function () {
            if (!this.activated && !this.crashed) {
                // Transition to INTRO state
                this.stateMachine.transition(GameState.INTRO);
                
                this.playingIntro = true;
                if (this.tRex) {
                    this.tRex.playingIntro = true;
                }

                // CSS animation definition.
                var keyframes = '@-webkit-keyframes intro { ' +
                    'from { width:' + Trex.config.WIDTH + 'px }' +
                    'to { width: ' + this.dimensions.WIDTH + 'px }' +
                    '}';
                
                // create a style sheet to put the keyframe rule in 
                // and then place the style sheet in the html head    
                var sheet = document.createElement('style');
                sheet.innerHTML = keyframes;
                document.head.appendChild(sheet);

                this.containerEl.addEventListener(RunnerGlobal.events.ANIM_END,
                    this.startGame.bind(this));

                this.containerEl.style.webkitAnimation = 'intro .4s ease-out 1 both';
                this.containerEl.style.width = this.dimensions.WIDTH + 'px';

                // if (this.touchController) {
                //     this.outerContainerEl.appendChild(this.touchController);
                // }
            } else if (this.crashed) {
                this.restart();
            }
        },


        /**
         * Update the game status to started.
         */
        startGame: function () {
            // Transition to PLAYING state
            this.stateMachine.transition(GameState.PLAYING);
            
            this.setArcadeMode();
            this.runningTime = 0;
            this.playingIntro = false;
            if (this.tRex) {
                this.tRex.playingIntro = false;
            }
            this.containerEl.style.webkitAnimation = '';
            this.playCount++;

            // Handle tabbing off the page. Pause the current game.
            document.addEventListener(RunnerGlobal.events.VISIBILITY,
                this.onVisibilityChange.bind(this));

            window.addEventListener(RunnerGlobal.events.BLUR,
                this.onVisibilityChange.bind(this));

            window.addEventListener(RunnerGlobal.events.FOCUS,
                this.onVisibilityChange.bind(this));
        },

        clearCanvas: function () {
            this.canvasCtx.clearRect(0, 0, this.dimensions.WIDTH,
                this.dimensions.HEIGHT);
        },

        /**
         * Update the game frame and schedules the next one.
         */
        update: function () {
            this.updatePending = false;

            var now = getTimeStamp();
            var deltaTime = now - (this.time || now);
            this.time = now;

            // Draw mode selection screen if waiting for selection
            if (this.waitingForModeSelection) {
                this.clearCanvas();
                this.drawModeSelection();
                this.scheduleNextUpdate();
                return;
            }

            if (this.playing) {
                this.clearCanvas();

                // Update all dinos
                for (var i = 0; i < this.tRexes.length; i++) {
                    var dino = this.tRexes[i];
                    // Use state machine's canUpdate method (game mode aware)
                    if (dino.stateMachine && !dino.stateMachine.canUpdate()) {
                        continue;
                    }
                    // Skip respawning dinos - they have their own animation
                    if (dino.respawning || dino.status === Trex.status.RESPAWNING_BLINKING || dino.status === Trex.status.RESPAWNING_FALLING) {
                        continue;
                    }
                    if (dino.jumping) {
                        dino.updateJump(deltaTime);
                    }
                }

                this.runningTime += deltaTime;
                var hasObstacles = this.runningTime > this.config.CLEAR_TIME;

                // First jump triggers the intro (check any dino).
                var anyDinoJumped = false;
                for (var i = 0; i < this.tRexes.length; i++) {
                    if (this.tRexes[i].jumpCount == 1) {
                        anyDinoJumped = true;
                        break;
                    }
                }
                if (anyDinoJumped && !this.playingIntro) {
                    this.playIntro();
                }

                // The horizon doesn't move until the intro is over.
                if (this.playingIntro) {
                    this.horizon.update(0, this.currentSpeed, hasObstacles);
                } else {
                    deltaTime = !this.activated ? 0 : deltaTime;
                    this.horizon.update(deltaTime, this.currentSpeed, hasObstacles,
                        this.inverted);
                }

                // Check for collisions with all dinos.
                if (hasObstacles && this.horizon.obstacles.length > 0) {
                    for (var i = 0; i < this.tRexes.length; i++) {
                        var dino = this.tRexes[i];
                        // Skip crashed dinos in competitive mode
                        if (this.gameMode === 'competitive' && dino.crashed) {
                            continue;
                        }
                        // Skip respawning dinos (they're floating above ground)
                        if (dino.respawning || dino.status === Trex.status.RESPAWNING_BLINKING || dino.status === Trex.status.RESPAWNING_FALLING) {
                            continue;
                        }
                        
                        if (checkForCollision(this.horizon.obstacles[0], dino)) {
                            if (this.gameMode === 'collective') {
                                // Collective mode: any crash = game over for all
                                this.gameOver();
                                return;
                            } else if (this.gameMode === 'competitive') {
                                // Competitive mode: mark this dino as crashed
                                this.handleDinoCrash(dino);
                            }
                        }
                    }
                }

                // Update distance for non-crashed dinos
                var distanceIncrement = this.currentSpeed * deltaTime / this.msPerFrame;
                for (var i = 0; i < this.tRexes.length; i++) {
                    var dino = this.tRexes[i];
                    // Only update distance for non-crashed, non-respawning dinos
                    if (!dino.crashed && !dino.respawning && 
                        dino.status !== Trex.status.RESPAWNING_BLINKING && 
                        dino.status !== Trex.status.RESPAWNING_FALLING && 
                        dino.distanceRan !== undefined) {
                        dino.distanceRan += distanceIncrement;
                    }
                }

                // Increase speed over time if acceleration is enabled
                if (this.config.ENABLE_SPEED_ACCELERATION && 
                    this.currentSpeed < this.config.MAX_SPEED) {
                    this.currentSpeed += this.config.ACCELERATION;
                }

                // Update high score only (no current score display)
                // Check all dinos for new high score
                var maxDistance = 0;
                for (var i = 0; i < this.tRexes.length; i++) {
                    if (this.tRexes[i].distanceRan > maxDistance) {
                        maxDistance = this.tRexes[i].distanceRan;
                    }
                }
                if (maxDistance > this.highestScore) {
                    this.highestScore = Math.ceil(maxDistance);
                    this.distanceMeter.setHighScore(this.highestScore);
                }
                // Only draw high score, not current score
                //this.distanceMeter.drawHighScore();

                // Night mode - use max distance from all dinos
                var maxDistanceForNightMode = 0;
                for (var i = 0; i < this.tRexes.length; i++) {
                    if (this.tRexes[i].distanceRan > maxDistanceForNightMode) {
                        maxDistanceForNightMode = this.tRexes[i].distanceRan;
                    }
                }
                
                if (this.invertTimer > this.config.INVERT_FADE_DURATION) {
                    this.invertTimer = 0;
                    this.invertTrigger = false;
                    this.invert();
                } else if (this.invertTimer) {
                    this.invertTimer += deltaTime;
                } else {
                    var actualDistance =
                        this.distanceMeter.getActualDistance(Math.ceil(maxDistanceForNightMode));

                    if (actualDistance > 0) {
                        this.invertTrigger = !(actualDistance %
                            this.config.INVERT_DISTANCE);

                        if (this.invertTrigger && this.invertTimer === 0) {
                            this.invertTimer += deltaTime;
                            this.invert();
                        }
                    }
                }

                // Draw scores above each dino (only non-crashed ones)
                this.drawDinoScores();
                this.drawLeaderboard();
            } else if (this.waitingForModeSelection) {
                // Keep updating to show mode selection screen
                this.scheduleNextUpdate();
            }

            // Update all dinos (only non-crashed ones in competitive mode)
            var shouldUpdate = false;
            if (this.playing) {
                shouldUpdate = true;
            } else if (!this.activated) {
                // Check if any dino should blink
                for (var i = 0; i < this.tRexes.length; i++) {
                    if (this.tRexes[i].blinkCount < RunnerGlobal.config.MAX_BLINK_COUNT) {
                        shouldUpdate = true;
                        break;
                    }
                }
            }

            if (shouldUpdate) {
                for (var i = 0; i < this.tRexes.length; i++) {
                    var dino = this.tRexes[i];
                    // In competitive mode, still update crashed dinos so they're drawn,
                    // but skip movement/jumping updates
                    if (this.gameMode === 'competitive' && dino.crashed) {
                        // Move crashed dino backwards with the ground scroll
                        // The ground scrolls at currentSpeed * (FPS / 1000) * deltaTime pixels per update
                        var groundScrollIncrement = Math.floor(this.currentSpeed * (FPS / 1000) * deltaTime);
                        dino.xPos -= groundScrollIncrement;
                        // Still update to draw the crashed state
                        dino.update(deltaTime);
                        continue;
                    }
                    dino.update(deltaTime);
                }
                this.scheduleNextUpdate();
            }
        },

        /**
         * Event handler.
         */
        handleEvent: function (e) {
            return (function (evtType, events) {
                switch (evtType) {
                    case events.KEYDOWN:
                    case events.TOUCHSTART:
                    case events.MOUSEDOWN:
                        this.onKeyDown(e);
                        break;
                    case events.KEYUP:
                    case events.TOUCHEND:
                    case events.MOUSEUP:
                        this.onKeyUp(e);
                        break;
                }
            }.bind(this))(e.type, RunnerGlobal.events);
        },

        /**
         * Bind relevant key / mouse / touch listeners.
         */
        startListening: function () {
            Logger.debug('RUNNER', 'startListening() called - setting up event listeners');
            
            // Keys.
            // Add listeners to both document and window to ensure we catch keydown events
            document.addEventListener(RunnerGlobal.events.KEYDOWN, this);
            document.addEventListener(RunnerGlobal.events.KEYUP, this);
            window.addEventListener(RunnerGlobal.events.KEYDOWN, this);
            window.addEventListener(RunnerGlobal.events.KEYUP, this);
            
            Logger.debug('RUNNER', 'Added keydown/keyup listeners to document and window');
            
            // Also add a direct listener to ensure keydown events are captured
            var self = this;
            var directHandler = function(e) {
                Logger.debug('BUTTON_PRESS', 'Direct keydown handler triggered', {
                    keyCode: e.keyCode,
                    key: e.key,
                    waitingForModeSelection: self.waitingForModeSelection
                });
                if (self.waitingForModeSelection) {
                    self.onKeyDown(e);
                }
            };
            document.addEventListener('keydown', directHandler);
            window.addEventListener('keydown', directHandler);
            this.directKeyHandler = directHandler; // Store reference for cleanup
            
            Logger.debug('RUNNER', 'Added direct keydown handlers');

            if (IS_MOBILE) {
                // Mobile only touch devices.
                this.touchController.addEventListener(RunnerGlobal.events.TOUCHSTART, this);
                this.touchController.addEventListener(RunnerGlobal.events.TOUCHEND, this);
                this.containerEl.addEventListener(RunnerGlobal.events.TOUCHSTART, this);
            } else {
                // Mouse.
                document.addEventListener(RunnerGlobal.events.MOUSEDOWN, this);
                document.addEventListener(RunnerGlobal.events.MOUSEUP, this);
            }
        },

        /**
         * Remove all listeners.
         */
        stopListening: function () {
            document.removeEventListener(RunnerGlobal.events.KEYDOWN, this);
            document.removeEventListener(RunnerGlobal.events.KEYUP, this);
            window.removeEventListener(RunnerGlobal.events.KEYDOWN, this);
            window.removeEventListener(RunnerGlobal.events.KEYUP, this);
            
            // Remove direct handler if it exists
            if (this.directKeyHandler) {
                document.removeEventListener('keydown', this.directKeyHandler);
                window.removeEventListener('keydown', this.directKeyHandler);
                this.directKeyHandler = null;
            }

            if (IS_MOBILE) {
                this.touchController.removeEventListener(RunnerGlobal.events.TOUCHSTART, this);
                this.touchController.removeEventListener(RunnerGlobal.events.TOUCHEND, this);
                this.containerEl.removeEventListener(RunnerGlobal.events.TOUCHSTART, this);
            } else {
                document.removeEventListener(RunnerGlobal.events.MOUSEDOWN, this);
                document.removeEventListener(RunnerGlobal.events.MOUSEUP, this);
            }
        },

        /**
         * Periodically push each player's score to the API.
         */
        startScorePushLoop: function () {
            var self = this;

            if (this.scorePushInterval) {
                clearInterval(this.scorePushInterval);
            }

            this.scorePushInterval = setInterval(function () {
                for (var mac in self.playerMap) {
                    var dino = self.playerMap[mac];
                    if (!dino || dino.crashed) continue;

                    var score = Math.ceil(self.distanceMeter.getActualDistance(dino.distanceRan));

                    fetch(self.apiBaseUrl + self.scorePostEndpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ score: score, mac: mac })
                    }).catch((err) => {
                        console.warn("Score push failed for", mac, err);
                    });
                }
            }, 1000); // every 1 second
        },


        /**
         * Start streaming connection to the API for player data.
         */
        startApiPolling: function () {
            var self = this;
            
            Logger.info('API', 'startApiPolling() called', {
                apiUrl: this.apiUrl,
                hasEventSource: !!this.eventSource,
                hasFetchStreamReader: !!this.fetchStreamReader
            });
            
            // Close existing connection if any
            if (this.eventSource) {
                Logger.debug('API', 'Closing existing EventSource connection');
                this.eventSource.close();
            }
            
            // Try EventSource first (Server-Sent Events)
            try {
                Logger.info('API', 'Attempting to create EventSource connection to: ' + this.apiUrl);
                this.eventSource = new EventSource(this.apiUrl);
                Logger.info('API', 'EventSource created successfully');
                
                this.eventSource.onmessage = function(event) {
                    Logger.debug('API', 'EventSource message received', {
                        rawData: event.data,
                        type: event.type
                    });
                    try {
                        // Handle both direct JSON and stringified JSON
                        var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                        Logger.debug('API', 'Parsed event data', data);
                        // New format: single object with event type
                        if (data && data.event && data.mac) {
                            Logger.info('API', 'Valid event received, calling handleEvent', {
                                event: data.event,
                                mac: data.mac,
                                name: data.name,
                                value: data.value
                            });
                            self.handleEvent(data);
                        } else {
                            Logger.warn('API', 'Invalid event format (missing event or mac)', data);
                        }
                    } catch (e) {
                        Logger.error('API', 'Error parsing event data', { error: e, data: event.data });
                    }
                };
                
                // Also handle custom event types if the server uses them
                this.eventSource.addEventListener('message', function(event) {
                    Logger.debug('API', 'EventSource custom message event received', {
                        rawData: event.data,
                        type: event.type
                    });
                    try {
                        var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                        Logger.debug('API', 'Parsed custom event data', data);
                        // New format: single object with event type
                        if (data && data.event && data.mac) {
                            Logger.info('API', 'Valid custom event received, calling handleEvent', {
                                event: data.event,
                                mac: data.mac,
                                name: data.name,
                                value: data.value
                            });
                            self.handleEvent(data);
                        } else {
                            Logger.warn('API', 'Invalid custom event format (missing event or mac)', data);
                        }
                    } catch (e) {
                        Logger.error('API', 'Error parsing custom event data', { error: e });
                    }
                });
                
                this.eventSource.onerror = function(error) {
                    Logger.error('API', 'EventSource error', { error: error });
                    // Fallback to fetch stream if EventSource fails
                    self.eventSource.close();
                    self.startFetchStream();
                };
            } catch (e) {
                // If EventSource not supported or fails, use fetch stream
                Logger.warn('API', 'EventSource not available, using fetch stream', { error: e });
                this.startFetchStream();
            }
        },

        /**
         * Start fetch-based streaming connection as fallback.
         */
        startFetchStream: function () {
            var self = this;
            var buffer = '';
            
            Logger.info('API', 'startFetchStream() called', {
                apiUrl: this.apiUrl,
                hasFetchStreamReader: !!this.fetchStreamReader
            });
            
            // Close existing stream if any
            if (this.fetchStreamReader) {
                Logger.debug('API', 'Cancelling existing fetch stream reader');
                this.fetchStreamReader.cancel();
                this.fetchStreamReader = null;
            }
            
            function readStream() {
                if (!self.fetchStreamReader) {
                    Logger.info('API', 'Starting fetch request to: ' + self.apiUrl);
                    fetch(self.apiUrl)
                        .then(function(response) {
                            Logger.debug('API', 'Fetch response received', {
                                ok: response.ok,
                                status: response.status,
                                hasBody: !!response.body
                            });
                            if (!response.ok) {
                                throw new Error('Network response was not ok');
                            }
                            if (!response.body) {
                                throw new Error('Streaming not supported');
                            }
                            Logger.debug('API', 'Getting stream reader');
                            self.fetchStreamReader = response.body.getReader();
                            Logger.info('API', 'Stream reader obtained, starting to read');
                            var reader = self.fetchStreamReader;
                            var decoder = new TextDecoder();
                            
                            function pump() {
                                return reader.read().then(function(result) {
                                    if (result.done) {
                                        // Stream ended, reconnect after a delay
                                        self.fetchStreamReader = null;
                                        setTimeout(function() {
                                            self.startFetchStream();
                                        }, 1000);
                                        return;
                                    }
                                    
                                    // Decode chunk and process
                                    buffer += decoder.decode(result.value, { stream: true });
                                    
                                    // Try to parse complete JSON objects from buffer
                                    // Handle both newline-separated JSON and continuous JSON
                                    var lines = buffer.split('\n');
                                    buffer = lines.pop() || ''; // Keep incomplete line in buffer
                                    
                                    for (var i = 0; i < lines.length; i++) {
                                        var line = lines[i].trim();
                                        if (line) {
                                            Logger.debug('API', 'Fetch stream - processing line: ' + line);
                                            try {
                                                var data = JSON.parse(line);
                                                Logger.debug('API', 'Fetch stream - parsed data', data);
                                                // New format: single object with event type
                                                if (data && data.event && data.mac) {
                                                    Logger.info('API', 'Fetch stream - valid event, calling handleEvent', {
                                                        event: data.event,
                                                        mac: data.mac,
                                                        name: data.name,
                                                        value: data.value
                                                    });
                                                    self.handleEvent(data);
                                                } else {
                                                    Logger.warn('API', 'Fetch stream - invalid event format', data);
                                                }
                                            } catch (e) {
                                                Logger.debug('API', 'Fetch stream - line parse failed, trying buffer: ' + e.message);
                                                // Might be partial JSON, try to parse the whole buffer
                                                try {
                                                    var fullData = JSON.parse(buffer + line);
                                                    Logger.debug('API', 'Fetch stream - parsed from buffer', fullData);
                                                    if (fullData && fullData.event && fullData.mac) {
                                                        Logger.info('API', 'Fetch stream - valid event from buffer, calling handleEvent', {
                                                            event: fullData.event,
                                                            mac: fullData.mac,
                                                            name: fullData.name,
                                                            value: fullData.value
                                                        });
                                                        self.handleEvent(fullData);
                                                        buffer = '';
                                                    }
                                                } catch (e2) {
                                                    Logger.debug('API', 'Fetch stream - buffer parse also failed, keeping in buffer');
                                                    // Still partial, keep in buffer
                                                }
                                            }
                                        }
                                    }
                                    
                                    // Also try to parse the remaining buffer as complete JSON
                                    if (buffer.trim()) {
                                        Logger.debug('API', 'Fetch stream - trying to parse remaining buffer: ' + buffer.trim());
                                        try {
                                            var completeData = JSON.parse(buffer.trim());
                                            Logger.debug('API', 'Fetch stream - parsed buffer data', completeData);
                                            if (completeData && completeData.event && completeData.mac) {
                                                Logger.info('API', 'Fetch stream - valid event from buffer, calling handleEvent', {
                                                    event: completeData.event,
                                                    mac: completeData.mac,
                                                    name: completeData.name,
                                                    value: completeData.value
                                                });
                                                self.handleEvent(completeData);
                                                buffer = '';
                                            }
                                        } catch (e) {
                                            Logger.debug('API', 'Fetch stream - buffer still incomplete, keeping: ' + e.message);
                                            // Still incomplete, keep in buffer
                                        }
                                    }
                                    
                                    return pump();
                                }).catch(function(error) {
                                    Logger.error('API', 'Stream read error', { error: error });
                                    // Reconnect after error
                                    self.fetchStreamReader = null;
                                    setTimeout(function() {
                                        self.startFetchStream();
                                    }, 1000);
                                });
                            }
                            
                            return pump();
                        })
                        .catch(function(error) {
                            Logger.error('API', 'Error starting fetch stream', { error: error });
                            // Retry after delay
                            setTimeout(function() {
                                self.startFetchStream();
                            }, 2000);
                        });
                }
            }
            
            readStream();
        },

        /**
         * Handle a single event from the event stream.
         * @param {Object} eventData Event object with mac, event, name, and value
         */
        handleEvent: function (eventData) {
            Logger.debug('API', 'handleEvent() called with', eventData);
            
            if (!eventData || !eventData.event || !eventData.mac) {
                Logger.warn('API', 'handleEvent() - Invalid event data (missing event or mac)', eventData);
                return;
            }

            var eventType = eventData.event;
            var mac = eventData.mac;
            var name = eventData.name;
            var value = eventData.value;

            Logger.info('API', 'Processing event', {
                type: eventType,
                mac: mac,
                name: name,
                value: value,
                timestamp: new Date().toISOString()
            });

            switch (eventType) {
                case 'startup':
                    Logger.info('API', 'Event type: STARTUP');
                    this.handleStartup(mac, name);
                    break;
                case 'disconnected':
                    Logger.info('API', 'Event type: DISCONNECTED');
                    this.handleDisconnected(mac);
                    break;
                case 'button':
                    Logger.info('API', 'Event type: BUTTON PRESS - calling handleButton()');
                    this.handleButton(mac, value, name);
                    break;
                default:
                    Logger.warn('API', 'Unknown event type: ' + eventType + ' for MAC: ' + mac);
            }
        },

        /**
         * Handle startup event - add a dino to the array.
         * @param {string} mac MAC address of the device
         * @param {string} name Name of the device (optional)
         */
        handleStartup: function (mac, name) {
            // Don't add if dino already exists
            if (this.playerMap[mac]) {
                return;
            }

            // Create dino with game mode
            var dino = new Trex(this.canvas, this.spriteDef.TREX, this.gameMode);
            // All dinos start at the same x position (they share the track)
            // Small offset for visual distinction
            var offset = this.tRexes.length * 2;
            dino.xPos = Trex.config.START_X_POS + offset;
            dino.originalXPos = dino.xPos; // Store original xPos for respawn
            // Initialize score tracking for this dino
            dino.distanceRan = 0;
            dino.mac = mac; // Store MAC for reference
            dino.name = name || mac; // Store name if provided
            // State properties (crashed, respawning, jumping, ducking) are managed by state machine
            // Start dino in running state - state machine will sync all properties
            dino.update(0, Trex.status.RUNNING);
            this.tRexes.push(dino);
            this.playerMap[mac] = dino;
            this.lastButtonPresses[mac] = 0;

            Logger.info('API', 'Dino started: ' + mac + (name ? ' (' + name + ')' : ''));
        },

        /**
         * Handle disconnected event - remove dino from the array.
         * @param {string} mac MAC address of the device
         */
        handleDisconnected: function (mac) {
            if (!this.playerMap[mac]) {
                return;
            }

            // Remove dino from array
            var dino = this.playerMap[mac];
            var index = this.tRexes.indexOf(dino);
            if (index > -1) {
                this.tRexes.splice(index, 1);
            }
            delete this.playerMap[mac];
            delete this.lastButtonPresses[mac];

            Logger.info('API', 'Dino disconnected: ' + mac);
        },

        /**
         * Handle button event - make the correct dino jump.
         * @param {string} mac MAC address of the device
         * @param {number} value Button press value (optional, for tracking)
         * @param {string} name Name of the device (optional)
         */
        handleButton: function (mac, value, name) {
            Logger.info('BUTTON_PRESS', 'handleButton() called from API', {
                mac: mac,
                name: name,
                value: value,
                timestamp: new Date().toISOString()
            });
            
            var dino = this.playerMap[mac];
            Logger.debug('BUTTON_PRESS', 'Button press - dino lookup', {
                mac: mac,
                hasDino: !!dino,
                dinoName: dino ? dino.name : 'N/A',
                dinoState: dino && dino.stateMachine ? dino.stateMachine.getState() : 'N/A'
            });
            
            // If dino doesn't exist, create it first (auto-startup)
            if (!dino) {
                Logger.info('BUTTON_PRESS', 'Button press from unknown dino, creating dino: ' + mac);
                this.handleStartup(mac, name);
                dino = this.playerMap[mac];
                Logger.info('BUTTON_PRESS', 'Dino created after button press', {
                    mac: mac,
                    hasDino: !!dino
                });
            }

            // Debounce: prevent processing the same button press multiple times in quick succession
            var timeStampFn = (typeof getTimeStamp !== 'undefined') ? getTimeStamp : 
                             (window.getTimeStamp ? window.getTimeStamp : Date.now);
            var currentTime = timeStampFn();
            var lastButtonTime = dino.lastButtonTime || 0;
            var buttonDebounceTime = 100; // 100ms debounce to prevent duplicate processing
            
            if (currentTime - lastButtonTime < buttonDebounceTime) {
                console.log('[BUTTON_PRESS] Ignoring duplicate button press (debounced)', {
                    mac: mac,
                    timeSinceLastPress: currentTime - lastButtonTime,
                    timestamp: new Date().toISOString()
                });
                return; // Ignore duplicate button press
            }
            dino.lastButtonTime = currentTime;

            // Get current state BEFORE any transitions to prevent double-processing
            var currentState = dino && dino.stateMachine ? dino.stateMachine.getState() : null;
            console.log('[BUTTON_PRESS] Current state at start of handler:', currentState, {
                mac: mac,
                xPos: dino ? dino.xPos : 'N/A',
                yPos: dino ? dino.yPos : 'N/A',
                groundYPos: dino ? dino.groundYPos : 'N/A',
                timestamp: new Date().toISOString()
            });

            // If dino is crashed, transition to RESPAWNING_BLINKING on button press
            // Use state machine to check crashed state - check BEFORE transitioning
            // Only allow respawn if at least 2 seconds have passed since crash
            if (dino && dino.stateMachine && currentState === DinoState.CRASHED) {
                // Check if 2 seconds have passed since crash
                var timeStampFn = (typeof getTimeStamp !== 'undefined') ? getTimeStamp : 
                                 (window.getTimeStamp ? window.getTimeStamp : Date.now);
                var currentTime = timeStampFn();
                var timeSinceCrash = currentTime - (dino.crashTime || 0);
                var minCrashDuration = 2000; // 2 seconds in milliseconds
                
                if (dino.crashTime === 0) {
                    // Crash time not set, allow respawn (backward compatibility)
                    console.warn('[BUTTON_PRESS] Crash time not set, allowing respawn anyway');
                } else if (timeSinceCrash < minCrashDuration) {
                    // Not enough time has passed since crash
                    var remainingTime = minCrashDuration - timeSinceCrash;
                    console.log('[BUTTON_PRESS] Button press during CRASHED state - but only ' + Math.round(timeSinceCrash) + 'ms have passed. Need ' + minCrashDuration + 'ms. Waiting ' + Math.round(remainingTime) + 'ms more.', {
                        mac: mac,
                        status: dino.status,
                        stateMachineState: currentState,
                        timeSinceCrash: timeSinceCrash,
                        crashTime: dino.crashTime,
                        currentTime: currentTime,
                        timestamp: new Date().toISOString()
                    });
                    Logger.info('BUTTON_PRESS', 'Button press while crashed - but not enough time has passed', {
                        mac: mac,
                        status: dino.status,
                        stateMachineState: currentState,
                        timeSinceCrash: timeSinceCrash,
                        minCrashDuration: minCrashDuration
                    });
                    return; // Don't allow respawn yet
                }
                
                console.log('[BUTTON_PRESS] Button press received during CRASHED state - transitioning to RESPAWNING_BLINKING', {
                    mac: mac,
                    status: dino.status,
                    stateMachineState: currentState,
                    timeSinceCrash: timeSinceCrash,
                    xPos: dino.xPos,
                    yPos: dino.yPos,
                    groundYPos: dino.groundYPos,
                    timestamp: new Date().toISOString()
                });
                Logger.info('BUTTON_PRESS', 'Button press while crashed - transitioning to RESPAWNING_BLINKING', {
                    mac: mac,
                    status: dino.status,
                    stateMachineState: currentState,
                    timeSinceCrash: timeSinceCrash
                });
                dino.update(0, Trex.status.RESPAWNING_BLINKING);
                // Reset crash time when respawning starts
                dino.crashTime = 0;
                if (this.soundFx && this.soundFx.BUTTON_PRESS) {
                    this.playSound(this.soundFx.BUTTON_PRESS);
                }
                return; // Don't process as jump - IMPORTANT: return immediately to prevent checking RESPAWNING_BLINKING below
            }

            // If dino is blinking (waiting for fall), transition to falling state
            // Use state machine to check state - check BEFORE transitioning
            if (dino && dino.stateMachine && currentState === DinoState.RESPAWNING_BLINKING) {
                console.log('[BUTTON_PRESS] Button press received during RESPAWNING_BLINKING state - transitioning to RESPAWNING_FALLING', {
                    mac: mac,
                    status: dino.status,
                    stateMachineState: currentState,
                    xPos: dino.xPos,
                    yPos: dino.yPos,
                    groundYPos: dino.groundYPos,
                    timestamp: new Date().toISOString()
                });
                Logger.info('BUTTON_PRESS', 'Button press during respawn blinking - transitioning to falling', {
                    mac: mac,
                    respawning: dino.respawning,
                    status: dino.status,
                    stateMachineState: currentState
                });
                dino.update(0, Trex.status.RESPAWNING_FALLING);
                if (this.soundFx && this.soundFx.BUTTON_PRESS) {
                    this.playSound(this.soundFx.BUTTON_PRESS);
                }
                return; // Don't process as jump during respawn
            }

            // If dino is falling, ignore button press (already falling)
            // Use state machine to check state
            if (dino && dino.stateMachine && dino.stateMachine.isState(DinoState.RESPAWNING_FALLING)) {
                Logger.debug('BUTTON_PRESS', 'Button press during respawn falling - ignored', {
                    mac: mac,
                    status: dino.status,
                    stateMachineState: dino.stateMachine.getState()
                });
                return; // Don't process as jump during respawn
            }

            // Trigger jump if not already jumping or ducking
            Logger.debug('BUTTON_PRESS', 'Button press - checking jump conditions', {
                mac: mac,
                hasDino: !!dino,
                jumping: dino ? dino.jumping : 'N/A',
                ducking: dino ? dino.ducking : 'N/A',
                canJump: dino && !dino.jumping && !dino.ducking
            });
            
            if (dino && !dino.jumping && !dino.ducking) {
                Logger.info('BUTTON_PRESS', 'Button press - JUMP TRIGGERED', {
                    mac: mac,
                    name: name,
                    speed: this.currentSpeed,
                    dinoState: dino.stateMachine ? dino.stateMachine.getState() : 'N/A'
                });
                if (this.soundFx && this.soundFx.BUTTON_PRESS) {
                    this.playSound(this.soundFx.BUTTON_PRESS);
                }
                dino.startJump(this.currentSpeed);
                Logger.info('BUTTON_PRESS', 'Button press - jump started, dino state after', {
                    mac: mac,
                    jumping: dino.jumping,
                    state: dino.stateMachine ? dino.stateMachine.getState() : 'N/A'
                });
            } else {
                Logger.debug('BUTTON_PRESS', 'Button press - jump NOT triggered', {
                    mac: mac,
                    reason: !dino ? 'No dino' : (dino.jumping ? 'Already jumping' : 'Ducking')
                });
            }

            // Update last button press value if provided
            if (value !== undefined) {
                var oldValue = this.lastButtonPresses[mac];
                this.lastButtonPresses[mac] = value;
                Logger.debug('BUTTON_PRESS', 'Button press value updated', {
                    mac: mac,
                    oldValue: oldValue,
                    newValue: value
                });
            }
        },

        /**
         * Update players based on API data.
         * @param {Array} players Array of player objects with mac and buttonPresses
         * @deprecated This function is kept for backward compatibility but is no longer used
         */
        updatePlayers: function (players) {
            if (!Array.isArray(players)) {
                return;
            }

            // Create or update dinos for each player
            for (var i = 0; i < players.length; i++) {
                var player = players[i];
                var mac = player.mac;
                var buttonPresses = player.buttonPresses || 0;

                // Create dino if it doesn't exist
                if (!this.playerMap[mac]) {
                    // Create dino with game mode
                    var dino = new Trex(this.canvas, this.spriteDef.TREX, this.gameMode);
                    // All dinos start at the same x position (they share the track)
                    // Small offset for visual distinction (optional - can be removed if you want them overlapping)
                    dino.xPos = Trex.config.START_X_POS + (i * 2); // 2px offset per dino
                    dino.originalXPos = dino.xPos; // Store original xPos for respawn
                    // Initialize score tracking for this dino
                    dino.distanceRan = 0;
                    dino.mac = mac; // Store MAC for reference
                    // State properties (crashed, respawning, jumping, ducking) are managed by state machine
                    // Start dino in running state - state machine will sync all properties
                    dino.update(0, Trex.status.RUNNING);
                    this.tRexes.push(dino);
                    this.playerMap[mac] = dino;
                    this.lastButtonPresses[mac] = buttonPresses;
                }

                // Check if button presses increased (button was pressed)
                var lastPresses = this.lastButtonPresses[mac] || 0;
            Logger.debug('BUTTON_PRESS', 'Checking button press for player', {
                mac: mac,
                name: player.name,
                buttonPresses: buttonPresses,
                lastPresses: lastPresses,
                increased: buttonPresses > lastPresses
            });
                
                if (buttonPresses > lastPresses) {
                    var dino = this.playerMap[mac];
                    Logger.info('BUTTON_PRESS', 'Button press detected! Triggering jump', {
                        mac: mac,
                        name: player.name,
                        buttonPresses: buttonPresses,
                        lastPresses: lastPresses,
                        hasDino: !!dino,
                        dinoJumping: dino ? dino.jumping : 'N/A',
                        dinoDucking: dino ? dino.ducking : 'N/A',
                        dinoState: dino && dino.stateMachine ? dino.stateMachine.getState() : 'N/A',
                        currentSpeed: this.currentSpeed
                    });
                    
                    // Trigger jump if not already jumping
                    if (dino && !dino.jumping && !dino.ducking) {
                        Logger.info('BUTTON_PRESS', 'Starting jump for dino', {
                            mac: mac,
                            name: player.name,
                            speed: this.currentSpeed
                        });
                        if (this.soundFx && this.soundFx.BUTTON_PRESS) {
                            this.playSound(this.soundFx.BUTTON_PRESS);
                        }
                        dino.startJump(this.currentSpeed);
                        Logger.info('BUTTON_PRESS', 'Jump started. Dino state after jump', {
                            mac: mac,
                            jumping: dino.jumping,
                            state: dino.stateMachine ? dino.stateMachine.getState() : 'N/A'
                        });
                    } else {
                        Logger.debug('BUTTON_PRESS', 'Jump NOT triggered - dino conditions not met', {
                            mac: mac,
                            hasDino: !!dino,
                            jumping: dino ? dino.jumping : false,
                            ducking: dino ? dino.ducking : false
                        });
                    }
                    this.lastButtonPresses[mac] = buttonPresses;
                }
            }

            // Remove dinos for players that are no longer in the API response
            var currentMacs = players.map(function(p) { return p.mac; });
            for (var mac in this.playerMap) {
                if (currentMacs.indexOf(mac) === -1) {
                    // Remove dino from array
                    var dino = this.playerMap[mac];
                    var index = this.tRexes.indexOf(dino);
                    if (index > -1) {
                        this.tRexes.splice(index, 1);
                    }
                    delete this.playerMap[mac];
                    delete this.lastButtonPresses[mac];
                }
            }
        },

        /**
         * Process keydown.
         * @param {Event} e
         */
        onKeyDown: function (e) {
            Logger.debug('BUTTON_PRESS', 'onKeyDown() called', {
                keyCode: e.keyCode,
                key: e.key,
                code: e.code,
                type: e.type,
                target: e.target,
                waitingForModeSelection: this.waitingForModeSelection,
                playing: this.playing,
                crashed: this.crashed,
                gameMode: this.gameMode
            });

            // Prevent native page scrolling whilst tapping on mobile.
            if (IS_MOBILE && this.playing) {
                e.preventDefault();
                Logger.debug('RUNNER', 'Prevented default (mobile)');
            }

            // Handle game mode selection
            if (this.waitingForModeSelection) {
                var keyCode = String(e.keyCode);
                var key = e.key || e.code || '';
                
                Logger.debug('BUTTON_PRESS', 'Mode selection - checking key', {
                    keyCode: keyCode,
                    key: key,
                    keyCodeStr: keyCode
                });
                
                // Check both keyCode and key for better compatibility
                if (keyCode === '49' || keyCode === '97' || key === '1' || key === 'Digit1') { // Key '1'
                    Logger.info('BUTTON_PRESS', 'Button press: Selecting COLLECTIVE mode');
                    this.selectGameMode('collective');
                    e.preventDefault();
                    return;
                } else if (keyCode === '50' || keyCode === '98' || key === '2' || key === 'Digit2') { // Key '2'
                    Logger.info('BUTTON_PRESS', 'Button press: Selecting COMPETITIVE mode');
                    this.selectGameMode('competitive');
                    e.preventDefault();
                    return;
                } else {
                    Logger.debug('BUTTON_PRESS', 'Mode selection - key not recognized', {
                        keyCode: keyCode,
                        key: key
                    });
                }
            }

            if (e.target != this.detailsButton) {
                // Keyboard controls removed - game auto-starts and dinos controlled by API
                // Only handle restart on crash

                if (this.crashed && e.type == RunnerGlobal.events.TOUCHSTART &&
                    e.currentTarget == this.containerEl) {
                    Logger.info('BUTTON_PRESS', 'Button press: Restarting game (touch on crash)');
                    this.restart();
                }
            }

            // Duck controls removed - dinos controlled by API only
        },


        /**
         * Process key up.
         * @param {Event} e
         */
        onKeyUp: function (e) {
            var keyCode = String(e.keyCode);
            
            // Only handle restart on crash
            if (this.crashed) {
                // Check that enough time has elapsed before allowing jump key to restart.
                var deltaTime = getTimeStamp() - this.time;

                if (RunnerGlobal.keycodes.RESTART[keyCode] || this.isLeftClickOnCanvas(e) ||
                    (deltaTime >= this.config.GAMEOVER_CLEAR_TIME &&
                        RunnerGlobal.keycodes.JUMP[keyCode])) {
                    this.restart();
                }
            }
            // All other keyboard controls removed - dinos controlled by API
        },

        /**
         * Returns whether the event was a left click on canvas.
         * On Windows right click is registered as a click.
         * @param {Event} e
         * @return {boolean}
         */
        isLeftClickOnCanvas: function (e) {
            return e.button != null && e.button < 2 &&
                e.type == RunnerGlobal.events.MOUSEUP && e.target == this.canvas;
        },

        /**
         * RequestAnimationFrame wrapper.
         */
        scheduleNextUpdate: function () {
            if (!this.updatePending) {
                this.updatePending = true;
                this.raqId = requestAnimationFrame(this.update.bind(this));
            }
        },

        /**
         * Whether the game is running.
         * @return {boolean}
         */
        isRunning: function () {
            return !!this.raqId;
        },

        /**
         * Game over state.
         */
        gameOver: function () {
            // Transition to GAME_OVER state
            this.stateMachine.transition(GameState.GAME_OVER);
            
            this.playSound(this.soundFx.HIT);
            vibrate(200);

            this.stop();
            this.distanceMeter.acheivement = false;

            // Update all dinos to crashed state
            for (var i = 0; i < this.tRexes.length; i++) {
                this.tRexes[i].update(100, Trex.status.CRASHED);
            }

            // Game over panel.
            if (!this.gameOverPanel) {
                this.gameOverPanel = new GameOverPanel(this.canvas,
                    this.spriteDef.TEXT_SPRITE, this.spriteDef.RESTART,
                    this.dimensions);
            } else {
                this.gameOverPanel.draw();
            }

            // Update the high score from all dinos.
            var maxDistance = 0;
            for (var i = 0; i < this.tRexes.length; i++) {
                if (this.tRexes[i].distanceRan > maxDistance) {
                    maxDistance = this.tRexes[i].distanceRan;
                }
            }
            if (maxDistance > this.highestScore) {
                this.highestScore = Math.ceil(maxDistance);
                this.distanceMeter.setHighScore(this.highestScore);
            }

            // Reset the time clock.
            this.time = getTimeStamp();
        },

        stop: function () {
            // Only transition to PAUSED if we're currently playing
            if (this.stateMachine.isState(GameState.PLAYING) || 
                this.stateMachine.isState(GameState.INTRO)) {
                this.stateMachine.transition(GameState.PAUSED);
            }
            
            cancelAnimationFrame(this.raqId);
            this.raqId = 0;
            // Keep API streaming running so we can detect new players
            // Only stop on page unload or game destruction
        },

        play: function () {
            if (!this.crashed) {
                // Transition to PLAYING state
                this.stateMachine.transition(GameState.PLAYING);
                
                // Restart API streaming if it was stopped
                if (!this.eventSource && !this.fetchStreamReader) {
                    this.startApiPolling();
                }
                // Update all dinos to running state
                for (var i = 0; i < this.tRexes.length; i++) {
                    this.tRexes[i].update(0, Trex.status.RUNNING);
                }
                this.time = getTimeStamp();
                this.update();
            }
        },

        restart: function () {
            if (!this.raqId) {
                // Transition to PLAYING state
                this.stateMachine.transition(GameState.PLAYING);
                
                this.playCount++;
                this.runningTime = 0;
                // distanceRan removed - tracking per dino now
                this.setSpeed(this.config.SPEED);
                this.time = getTimeStamp();
                this.containerEl.classList.remove(RunnerGlobal.classes.CRASHED);
                this.clearCanvas();
                this.distanceMeter.reset(this.highestScore);
                this.horizon.reset();
                // Reset all dinos (including crashed state for competitive mode)
                for (var i = 0; i < this.tRexes.length; i++) {
                    var dino = this.tRexes[i];
                    // State properties are managed by state machine - transition to WAITING will reset them
                    // Reset xPos to original position
                    if (dino.originalXPos !== undefined) {
                        dino.xPos = dino.originalXPos;
                    }
                    dino.reset();
                    if (dino.distanceRan !== undefined) {
                        dino.distanceRan = 0;
                    }
                }
                this.playSound(this.soundFx.BUTTON_PRESS);
                this.invert(true);
                this.update();
            }
        },
        
        /**
         * Hides offline messaging for a fullscreen game only experience.
         */
        setArcadeMode: function() {
            document.body.classList.add(RunnerGlobal.classes.ARCADE_MODE);
            this.setArcadeModeContainerScale();
        },

        /**
         * Sets the scaling for arcade mode.
         */
        setArcadeModeContainerScale: function() {
            var windowHeight = window.innerHeight;
            var scaleHeight = windowHeight / this.dimensions.HEIGHT;
            var scaleWidth = window.innerWidth / this.dimensions.WIDTH;
            var scale = Math.max(1, Math.min(scaleHeight, scaleWidth));
            var scaledCanvasHeight = this.dimensions.HEIGHT * scale;
            // Positions the game container at 10% of the available vertical window
            // height minus the game container height.
            var translateY = Math.ceil(Math.max(0, (windowHeight - scaledCanvasHeight -
                                                      RunnerGlobal.config.ARCADE_MODE_INITIAL_TOP_POSITION) *
                                                  RunnerGlobal.config.ARCADE_MODE_TOP_POSITION_PERCENT)) *
                  window.devicePixelRatio;

            var cssScale = scale;
            this.containerEl.style.transform =
                'scale(' + cssScale + ') translateY(' + translateY + 'px)';
        },
        
        /**
         * Pause the game if the tab is not in focus.
         */
        onVisibilityChange: function (e) {
            if (document.hidden || document.webkitHidden || e.type == 'blur' ||
                document.visibilityState != 'visible') {
                this.stop();
            } else if (!this.crashed) {
                this.tRex.reset();
                this.play();
            }
        },

        /**
         * Play a sound.
         * @param {SoundBuffer} soundBuffer
         */
        playSound: function (soundBuffer) {
            if (soundBuffer) {
                var sourceNode = this.audioContext.createBufferSource();
                sourceNode.buffer = soundBuffer;
                sourceNode.connect(this.audioContext.destination);
                sourceNode.start(0);
            }
        },

        /**
         * Draw name and current score above each dino.
         */
        drawDinoScores: function () {
            if (!this.highScores) this.highScores = {};

            for (var i = 0; i < this.tRexes.length; i++) {
                var dino = this.tRexes[i];
                if (!dino) continue;

                // Skip crashed dinos in competitive mode
                if (this.gameMode === 'competitive' && dino.crashed) continue;

                if (dino.distanceRan !== undefined) {
                    var score = Math.ceil(this.distanceMeter.getActualDistance(dino.distanceRan));

                    // Track highscore per MAC
                    if (!this.highScores[dino.mac] || score > this.highScores[dino.mac]) {
                        this.highScores[dino.mac] = score;
                    }

                    var nameText = dino.name || dino.mac || "Unknown";

                    // Draw name + score above the dino
                    var centerX = dino.xPos + (Trex.config.WIDTH / 2);
                    var baseY = dino.yPos - 15;

                    this.canvasCtx.save();
                    this.canvasCtx.textAlign = 'center';
                    this.canvasCtx.textBaseline = 'bottom';

                    // Draw name
                    this.canvasCtx.font = 'bold 12px Arial';
                    this.canvasCtx.fillStyle = '#222';
                    this.canvasCtx.fillText(nameText, centerX, baseY - 12);

                    // Draw current score
                    this.canvasCtx.font = '12px Arial';
                    this.canvasCtx.fillStyle = '#555';
                    this.canvasCtx.fillText(score.toString(), centerX, baseY);

                    this.canvasCtx.restore();
                }
            }
        },


        /**
         * Draw top 5 leaderboard with name + all-time highscore.
         */
        drawLeaderboard: function () {
            if (!this.highScores) this.highScores = {};

            // Collect players from tRexes
            var players = [];
            for (var i = 0; i < this.tRexes.length; i++) {
                var dino = this.tRexes[i];
                if (!dino) continue;

                var mac = dino.mac;
                var name = dino.name || mac || "Unknown";
                var high = this.highScores[mac] || 0;

                players.push({ mac: mac, name: name, high: high });
            }

            // Sort descending by all-time highscore and take top 5
            players.sort((a, b) => b.high - a.high);
            var top5 = players.slice(0, 5);

            // Draw leaderboard on right
            this.canvasCtx.save();
            this.canvasCtx.textAlign = "right";
            this.canvasCtx.textBaseline = "top";
            this.canvasCtx.font = "bold 14px Arial";
            this.canvasCtx.fillStyle = "#000";

            var marginRight = 20;
            var startX = this.dimensions.WIDTH - marginRight;
            var startY = 20;

            this.canvasCtx.fillText("🏆 TOP 5", startX, startY);

            this.canvasCtx.font = "12px Arial";
            for (var i = 0; i < top5.length; i++) {
                var p = top5[i];
                var line = (i + 1) + ". " + p.name + " - " + p.high;
                this.canvasCtx.fillText(line, startX, startY + 20 + i * 16);
            }

            this.canvasCtx.restore();
        },







        /**
         * Inverts the current page / canvas colors.
         * @param {boolean} Whether to reset colors.
         */
        invert: function (reset) {
            if (reset) {
                document.body.classList.toggle(RunnerGlobal.classes.INVERTED, false);
                this.invertTimer = 0;
                this.inverted = false;
            } else {
                this.inverted = document.body.classList.toggle(RunnerGlobal.classes.INVERTED,
                    this.invertTrigger);
            }
        },

        /**
         * Show game mode selection screen.
         */
        showModeSelection: function () {
            // Transition to MODE_SELECTION state
            this.stateMachine.transition(GameState.MODE_SELECTION);
            
            // Mode selection will be drawn in the update loop
            this.modeSelectionPanel = {
                visible: true
            };
        },

        /**
         * Select game mode and start the game.
         * @param {string} mode 'collective' or 'competitive'
         */
        selectGameMode: function (mode) {
            this.gameMode = mode;
            this.waitingForModeSelection = false;
            this.modeSelectionPanel = null;
            
            // Update all existing dinos' state machines with the new game mode
            for (var i = 0; i < this.tRexes.length; i++) {
                if (this.tRexes[i].setGameMode) {
                    this.tRexes[i].setGameMode(mode);
                }
            }
            
            // Transition to PLAYING state when mode is selected
            this.stateMachine.transition(GameState.PLAYING);
            
            // Start the game
            this.activated = true;
            this.startApiPolling();
            this.startScorePushLoop();
        },

        /**
         * Handle individual dino crash in competitive mode.
         * @param {Object} dino The crashed dino
         */
        handleDinoCrash: function (dino) {
            // Check if already crashed using state machine
            if (dino.stateMachine && dino.stateMachine.isCrashed()) {
                return; // Already crashed
            }
            
            this.playSound(this.soundFx.HIT);
            // Transition to CRASHED state - state machine will sync crashed property
            dino.update(100, Trex.status.CRASHED);
            
            // Record crash time - use getTimeStamp if available, otherwise Date.now()
            var timeStampFn = (typeof getTimeStamp !== 'undefined') ? getTimeStamp : 
                             (window.getTimeStamp ? window.getTimeStamp : Date.now);
            dino.crashTime = timeStampFn();
            
            // No automatic respawn - user must press button to respawn (after 2 seconds)
        },

        /**
         * Respawn a dino in competitive mode.
         * @param {Object} dino The dino to respawn
         */
        respawnDino: function (dino) {
            dino.distanceRan = 0; // Reset counter to 0
            // Reset xPos to original position
            if (dino.originalXPos !== undefined) {
                dino.xPos = dino.originalXPos;
            }
            // Reset dino animation properties
            dino.yPos = dino.groundYPos;
            dino.jumpVelocity = 0;
            dino.speedDrop = false;
            dino.jumpCount = 0;
            // Reset respawn animation state
            dino.respawnStartTime = 0; // Will be set in updateRespawnBlinking
            dino.respawnBlinkCount = 0;
            dino.lastBlinkFrame = 0;
            // Transition to RESPAWNING_BLINKING state - state machine will sync crashed, respawning, jumping, ducking properties
            dino.update(0, Trex.status.RESPAWNING_BLINKING);
        },

        /**
         * Draw mode selection screen.
         */
        drawModeSelection: function () {
            if (!this.modeSelectionPanel || !this.modeSelectionPanel.visible) {
                return;
            }

            var centerX = this.dimensions.WIDTH / 2;
            var centerY = this.dimensions.HEIGHT / 2;

            // Draw semi-transparent overlay
            this.canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.canvasCtx.fillRect(0, 0, this.dimensions.WIDTH, this.dimensions.HEIGHT);

            // Draw title
            this.canvasCtx.save();
            this.canvasCtx.font = 'bold 24px Arial';
            this.canvasCtx.fillStyle = '#ffffff';
            this.canvasCtx.textAlign = 'center';
            this.canvasCtx.textBaseline = 'middle';
            this.canvasCtx.fillText('Select Game Mode', centerX, centerY - 80);

            // Draw mode options
            this.canvasCtx.font = '18px Arial';
            this.canvasCtx.fillText('Press 1: Collective Mode', centerX, centerY - 30);
            this.canvasCtx.font = '14px Arial';
            this.canvasCtx.fillStyle = '#cccccc';
            this.canvasCtx.fillText('If one dino crashes, game over for all', centerX, centerY - 10);

            this.canvasCtx.font = '18px Arial';
            this.canvasCtx.fillStyle = '#ffffff';
            this.canvasCtx.fillText('Press 2: Competitive Mode', centerX, centerY + 20);
            this.canvasCtx.font = '14px Arial';
            this.canvasCtx.fillStyle = '#cccccc';
            this.canvasCtx.fillText('Dinos can crash individually and respawn', centerX, centerY + 40);
            this.canvasCtx.fillText('with counter reset to 0', centerX, centerY + 55);

            this.canvasCtx.restore();
        }
    };

    // Copy static properties from global Runner to local Runner function
    Runner.config = RunnerGlobal.config;
    Runner.defaultDimensions = RunnerGlobal.defaultDimensions;
    Runner.classes = RunnerGlobal.classes;
    Runner.spriteDefinition = RunnerGlobal.spriteDefinition;
    Runner.sounds = RunnerGlobal.sounds;
    Runner.keycodes = RunnerGlobal.keycodes;
    Runner.events = RunnerGlobal.events;
    Runner.updateCanvasScaling = RunnerGlobal.updateCanvasScaling;
    Runner.imageSprite = null; // Will be set dynamically in loadImages

    // Export globally - this will replace the empty object with the actual Runner function
    window.Runner = Runner;
    
    // Make sure imageSprite is accessible on window.Runner
    // It will be set in loadImages, but we also need to update it when it changes
})();
