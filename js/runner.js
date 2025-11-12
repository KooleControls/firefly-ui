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
        this.apiUrl = 'http://192.168.50.27/api/guests/events';
        this.eventSource = null; // For streaming connection (EventSource)
        this.fetchStreamReader = null; // For fetch-based streaming fallback

        this.distanceMeter = null;
        this.distanceRan = 0;

        this.highestScore = 0;

        this.time = 0;
        this.runningTime = 0;
        this.msPerFrame = 1000 / FPS;
        this.currentSpeed = this.config.SPEED;

        this.obstacles = [];

        this.activated = false; // Whether the easter egg has been activated.
        this.playing = false; // Whether the game is currently in play state.
        this.crashed = false;
        this.paused = false;
        this.inverted = false;
        this.invertTimer = 0;
        this.resizeTimerId_ = null;

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

            // Auto-start the game
            this.loadSounds();
            this.playing = true;
            this.activated = true;
            this.playingIntro = false;
            
            // Set container to full width and height immediately (skip intro animation)
            this.containerEl.style.width = this.dimensions.WIDTH + 'px';
            this.containerEl.style.height = this.dimensions.HEIGHT + 'px';
            this.setArcadeMode();

            this.startListening();
            this.startApiPolling();
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
                this.playingIntro = true;
                this.tRex.playingIntro = true;

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
                this.playing = true;
                this.activated = true;
            } else if (this.crashed) {
                this.restart();
            }
        },


        /**
         * Update the game status to started.
         */
        startGame: function () {
            this.setArcadeMode();
            this.runningTime = 0;
            this.playingIntro = false;
            this.tRex.playingIntro = false;
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

            if (this.playing) {
                this.clearCanvas();

                // Update all dinos
                for (var i = 0; i < this.tRexes.length; i++) {
                    var dino = this.tRexes[i];
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
                var collision = false;
                if (hasObstacles && this.horizon.obstacles.length > 0) {
                    for (var i = 0; i < this.tRexes.length; i++) {
                        if (checkForCollision(this.horizon.obstacles[0], this.tRexes[i])) {
                            collision = true;
                            break;
                        }
                    }
                }

                if (!collision) {
                    // Update distance for each dino
                    var distanceIncrement = this.currentSpeed * deltaTime / this.msPerFrame;
                    for (var i = 0; i < this.tRexes.length; i++) {
                        if (this.tRexes[i].distanceRan !== undefined) {
                            this.tRexes[i].distanceRan += distanceIncrement;
                        }
                    }

                    // Increase speed over time if acceleration is enabled
                    if (this.config.ENABLE_SPEED_ACCELERATION && 
                        this.currentSpeed < this.config.MAX_SPEED) {
                        this.currentSpeed += this.config.ACCELERATION;
                    }
                } else {
                    this.gameOver();
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
                this.distanceMeter.drawHighScore();

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

                // Draw scores above each dino
                this.drawDinoScores();
            }

            // Update all dinos
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
                    this.tRexes[i].update(deltaTime);
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
            // Keys.
            document.addEventListener(RunnerGlobal.events.KEYDOWN, this);
            document.addEventListener(RunnerGlobal.events.KEYUP, this);

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
         * Start streaming connection to the API for player data.
         */
        startApiPolling: function () {
            var self = this;
            
            // Close existing connection if any
            if (this.eventSource) {
                this.eventSource.close();
            }
            
            // Try EventSource first (Server-Sent Events)
            try {
                this.eventSource = new EventSource(this.apiUrl);
                
                this.eventSource.onmessage = function(event) {
                    try {
                        // Handle both direct JSON and stringified JSON
                        var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                        // New format: single object with event type
                        if (data && data.event && data.mac) {
                            self.handleEvent(data);
                        }
                    } catch (e) {
                        console.error('Error parsing event data:', e, event.data);
                    }
                };
                
                // Also handle custom event types if the server uses them
                this.eventSource.addEventListener('message', function(event) {
                    try {
                        var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                        // New format: single object with event type
                        if (data && data.event && data.mac) {
                            self.handleEvent(data);
                        }
                    } catch (e) {
                        console.error('Error parsing custom event data:', e);
                    }
                });
                
                this.eventSource.onerror = function(error) {
                    console.error('EventSource error:', error);
                    // Fallback to fetch stream if EventSource fails
                    self.eventSource.close();
                    self.startFetchStream();
                };
            } catch (e) {
                // If EventSource not supported or fails, use fetch stream
                console.log('EventSource not available, using fetch stream');
                this.startFetchStream();
            }
        },

        /**
         * Start fetch-based streaming connection as fallback.
         */
        startFetchStream: function () {
            var self = this;
            var buffer = '';
            
            // Close existing stream if any
            if (this.fetchStreamReader) {
                this.fetchStreamReader.cancel();
                this.fetchStreamReader = null;
            }
            
            function readStream() {
                if (!self.fetchStreamReader) {
                    fetch(self.apiUrl)
                        .then(function(response) {
                            if (!response.ok) {
                                throw new Error('Network response was not ok');
                            }
                            if (!response.body) {
                                throw new Error('Streaming not supported');
                            }
                            self.fetchStreamReader = response.body.getReader();
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
                                            try {
                                                var data = JSON.parse(line);
                                                // New format: single object with event type
                                                if (data && data.event && data.mac) {
                                                    self.handleEvent(data);
                                                }
                                            } catch (e) {
                                                // Might be partial JSON, try to parse the whole buffer
                                                try {
                                                    var fullData = JSON.parse(buffer + line);
                                                    if (fullData && fullData.event && fullData.mac) {
                                                        self.handleEvent(fullData);
                                                        buffer = '';
                                                    }
                                                } catch (e2) {
                                                    // Still partial, keep in buffer
                                                }
                                            }
                                        }
                                    }
                                    
                                    // Also try to parse the remaining buffer as complete JSON
                                    if (buffer.trim()) {
                                        try {
                                            var completeData = JSON.parse(buffer.trim());
                                            if (completeData && completeData.event && completeData.mac) {
                                                self.handleEvent(completeData);
                                                buffer = '';
                                            }
                                        } catch (e) {
                                            // Still incomplete, keep in buffer
                                        }
                                    }
                                    
                                    return pump();
                                }).catch(function(error) {
                                    console.error('Stream read error:', error);
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
                            console.error('Error starting fetch stream:', error);
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
            if (!eventData || !eventData.event || !eventData.mac) {
                return;
            }

            var eventType = eventData.event;
            var mac = eventData.mac;

            switch (eventType) {
                case 'connected':
                    this.handleConnected(mac, eventData.name);
                    break;
                case 'disconnected':
                    this.handleDisconnected(mac);
                    break;
                case 'button':
                    this.handleButton(mac, eventData.value);
                    break;
                default:
                    console.warn('Unknown event type:', eventType);
            }
        },

        /**
         * Handle connected event - add a dino to the array.
         * @param {string} mac MAC address of the device
         * @param {string} name Name of the device (optional)
         */
        handleConnected: function (mac, name) {
            // Don't add if dino already exists
            if (this.playerMap[mac]) {
                return;
            }

            var dino = new Trex(this.canvas, this.spriteDef.TREX);
            // All dinos start at the same x position (they share the track)
            // Small offset for visual distinction
            var offset = this.tRexes.length * 2;
            dino.xPos = Trex.config.START_X_POS + offset;
            // Initialize score tracking for this dino
            dino.distanceRan = 0;
            dino.mac = mac; // Store MAC for reference
            dino.name = name || mac; // Store name if provided
            // Start dino in running state
            dino.update(0, Trex.status.RUNNING);
            this.tRexes.push(dino);
            this.playerMap[mac] = dino;
            this.lastButtonPresses[mac] = 0;

            console.log('Dino connected:', mac, name || '');
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

            console.log('Dino disconnected:', mac);
        },

        /**
         * Handle button event - make the correct dino jump.
         * @param {string} mac MAC address of the device
         * @param {number} value Button press value (optional, for tracking)
         */
        handleButton: function (mac, value) {
            var dino = this.playerMap[mac];
            if (!dino) {
                console.warn('Button press from unknown dino:', mac);
                return;
            }

            // Trigger jump if not already jumping or ducking
            if (dino && !dino.jumping && !dino.ducking) {
                if (this.soundFx && this.soundFx.BUTTON_PRESS) {
                    this.playSound(this.soundFx.BUTTON_PRESS);
                }
                dino.startJump(this.currentSpeed);
            }

            // Update last button press value if provided
            if (value !== undefined) {
                this.lastButtonPresses[mac] = value;
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
                    var dino = new Trex(this.canvas, this.spriteDef.TREX);
                    // All dinos start at the same x position (they share the track)
                    // Small offset for visual distinction (optional - can be removed if you want them overlapping)
                    dino.xPos = Trex.config.START_X_POS + (i * 2); // 2px offset per dino
                    // Initialize score tracking for this dino
                    dino.distanceRan = 0;
                    dino.mac = mac; // Store MAC for reference
                    // Start dino in running state
                    dino.update(0, Trex.status.RUNNING);
                    this.tRexes.push(dino);
                    this.playerMap[mac] = dino;
                    this.lastButtonPresses[mac] = buttonPresses;
                }

                // Check if button presses increased (button was pressed)
                var lastPresses = this.lastButtonPresses[mac] || 0;
                if (buttonPresses > lastPresses) {
                    var dino = this.playerMap[mac];
                    // Trigger jump if not already jumping
                    if (dino && !dino.jumping && !dino.ducking) {
                        if (this.soundFx && this.soundFx.BUTTON_PRESS) {
                            this.playSound(this.soundFx.BUTTON_PRESS);
                        }
                        dino.startJump(this.currentSpeed);
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
            // Prevent native page scrolling whilst tapping on mobile.
            if (IS_MOBILE && this.playing) {
                e.preventDefault();
            }

            if (e.target != this.detailsButton) {
                // Keyboard controls removed - game auto-starts and dinos controlled by API
                // Only handle restart on crash

                if (this.crashed && e.type == RunnerGlobal.events.TOUCHSTART &&
                    e.currentTarget == this.containerEl) {
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
            this.playSound(this.soundFx.HIT);
            vibrate(200);

            this.stop();
            this.crashed = true;
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
            this.playing = false;
            this.paused = true;
            cancelAnimationFrame(this.raqId);
            this.raqId = 0;
            // Keep API streaming running so we can detect new players
            // Only stop on page unload or game destruction
        },

        play: function () {
            if (!this.crashed) {
                this.playing = true;
                this.paused = false;
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
                this.playCount++;
                this.runningTime = 0;
                this.playing = true;
                this.crashed = false;
                // distanceRan removed - tracking per dino now
                this.setSpeed(this.config.SPEED);
                this.time = getTimeStamp();
                this.containerEl.classList.remove(RunnerGlobal.classes.CRASHED);
                this.clearCanvas();
                this.distanceMeter.reset(this.highestScore);
                this.horizon.reset();
                // Reset all dinos
                for (var i = 0; i < this.tRexes.length; i++) {
                    this.tRexes[i].reset();
                    if (this.tRexes[i].distanceRan !== undefined) {
                        this.tRexes[i].distanceRan = 0;
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
         * Draw score above each dino.
         */
        drawDinoScores: function () {
            for (var i = 0; i < this.tRexes.length; i++) {
                var dino = this.tRexes[i];
                if (dino.distanceRan !== undefined) {
                    var score = Math.ceil(this.distanceMeter.getActualDistance(dino.distanceRan));
                    var scoreText = score.toString();
                    
                    // Position score above the dino
                    var scoreX = dino.xPos + (Trex.config.WIDTH / 2);
                    var scoreY = dino.yPos - 15; // 15px above the dino
                    
                    // Draw score using canvas text
                    this.canvasCtx.save();
                    this.canvasCtx.font = '12px Arial';
                    this.canvasCtx.fillStyle = '#535353';
                    this.canvasCtx.textAlign = 'center';
                    this.canvasCtx.textBaseline = 'bottom';
                    this.canvasCtx.fillText(scoreText, scoreX, scoreY);
                    this.canvasCtx.restore();
                }
            }
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
