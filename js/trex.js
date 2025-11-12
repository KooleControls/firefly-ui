// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// T-rex game character

(function() {
    'use strict';

    /**
     * T-rex game character.
     * @param {HTMLCanvas} canvas
     * @param {Object} spritePos Positioning within image sprite.
     * @param {string} opt_gameMode Optional game mode ('collective' or 'competitive')
     * @constructor
     */
    function Trex(canvas, spritePos, opt_gameMode) {
        this.canvas = canvas;
        this.canvasCtx = canvas.getContext('2d');
        this.spritePos = spritePos;
        this.xPos = 0;
        this.yPos = 0;
        // Position when on the ground.
        this.groundYPos = 0;
        this.currentFrame = 0;
        this.currentAnimFrames = [];
        this.blinkDelay = 0;
        this.blinkCount = 0;
        this.animStartTime = 0;
        this.timer = 0;
        this.msPerFrame = 1000 / FPS;
        this.config = Trex.config;
        // Current status (synced from state machine)
        this.status = Trex.status.WAITING;

        this.jumping = false;
        this.ducking = false;
        this.jumpVelocity = 0;
        this.reachedMinHeight = false;
        this.speedDrop = false;
        this.jumpCount = 0;
        this.jumpspotX = 0;

        // Respawn animation state
        this.respawning = false;
        this.respawnBlinkCount = 0;
        this.respawnStartTime = 0;
        this.respawnBlinkDelay = 200; // Time between blinks in ms
        this.respawnFallTriggered = false; // Whether button was pressed to trigger fall
        this.crashTime = 0; // Timestamp when dino crashed (0 = not crashed)

        // Initialize dino state machine
        var gameMode = opt_gameMode || DinoGameMode.COLLECTIVE;
        Logger.info('TREX', 'Creating dino with game mode: ' + gameMode);
        this.stateMachine = new DinoStateMachine(gameMode, this);
        Logger.debug('TREX', 'State machine created, transitioning to WAITING');
        this.stateMachine.transition(DinoState.WAITING);
        Logger.debug('TREX', 'Dino initialized. State machine state: ' + this.stateMachine.getState());

        this.init();
    }

    /**
     * T-rex player config.
     * @enum {number}
     */
    Trex.config = {
        DROP_VELOCITY: -5,
        GRAVITY: 0.6,
        HEIGHT: 47,
        HEIGHT_DUCK: 25,
        INIITAL_JUMP_VELOCITY: -10,
        INTRO_DURATION: 1500,
        MAX_JUMP_HEIGHT: 30,
        MIN_JUMP_HEIGHT: 30,
        SPEED_DROP_COEFFICIENT: 3,
        SPRITE_WIDTH: 262,
        START_X_POS: 50,
        WIDTH: 44,
        WIDTH_DUCK: 59
    };

    /**
     * Used in collision detection.
     * @type {Array<CollisionBox>}
     */
    Trex.collisionBoxes = {
        DUCKING: [
            new CollisionBox(1, 18, 55, 25)
        ],
        RUNNING: [
            new CollisionBox(22, 0, 17, 16),
            new CollisionBox(1, 18, 30, 9),
            new CollisionBox(10, 35, 14, 8),
            new CollisionBox(1, 24, 29, 5),
            new CollisionBox(5, 30, 21, 4),
            new CollisionBox(9, 34, 15, 4)
        ]
    };

    /**
     * Animation states.
     * @enum {string}
     */
    Trex.status = {
        CRASHED: 'CRASHED',
        DUCKING: 'DUCKING',
        JUMPING: 'JUMPING',
        RUNNING: 'RUNNING',
        WAITING: 'WAITING',
        RESPAWNING_BLINKING: 'RESPAWNING_BLINKING',
        RESPAWNING_FALLING: 'RESPAWNING_FALLING'
    };

    /**
     * Blinking coefficient.
     * @const
     */
    Trex.BLINK_TIMING = 7000;

    /**
     * Animation config for different states.
     * @enum {Object}
     */
    Trex.animFrames = {
        WAITING: {
            frames: [44, 0],
            msPerFrame: 1000 / 3
        },
        RUNNING: {
            frames: [88, 132],
            msPerFrame: 1000 / 12
        },
        CRASHED: {
            frames: [220],
            msPerFrame: 1000 / 60
        },
        JUMPING: {
            frames: [0],
            msPerFrame: 1000 / 60
        },
        DUCKING: {
            frames: [264, 323],
            msPerFrame: 1000 / 8
        },
        RESPAWNING_BLINKING: {
            frames: [44, 0], // Same as WAITING for blinking effect
            msPerFrame: 1000 / 3
        },
        RESPAWNING_FALLING: {
            frames: [0], // Single frame while falling
            msPerFrame: 1000 / 60
        }
    };

    Trex.prototype = {
        /**
         * T-rex player initaliser.
         * Sets the t-rex to blink at random intervals.
         */
        init: function () {
            this.groundYPos = window.Runner.defaultDimensions.HEIGHT - this.config.HEIGHT -
                window.Runner.config.BOTTOM_PAD;
            // Position will be set by state machine entry handler when transitioning to WAITING
            this.minJumpHeight = this.groundYPos - this.config.MIN_JUMP_HEIGHT;

            this.draw(0, 0);
            this.update(0, Trex.status.WAITING);
        },

        /**
         * Convert Trex.status to DinoState
         * @param {string} trexStatus
         * @return {string|null}
         */
        getDinoStateFromTrexStatus: function(trexStatus) {
            Logger.debug('TREX', 'getDinoStateFromTrexStatus() called', {
                trexStatus: trexStatus,
                hasDinoState: !!window.DinoState,
                availableStates: window.DinoState ? Object.keys(window.DinoState) : 'N/A'
            });
            if (!trexStatus || !window.DinoState) {
                Logger.warn('TREX', 'Missing trexStatus or DinoState', {
                    trexStatus: trexStatus,
                    hasDinoState: !!window.DinoState
                });
                return null;
            }
            // Trex.status and DinoState should match
            var result = window.DinoState[trexStatus] || null;
            Logger.debug('TREX', 'Conversion result', {
                trexStatus: trexStatus,
                dinoState: result,
                availableKeys: Object.keys(window.DinoState)
            });
            return result;
        },

        /**
         * Set game mode for the state machine
         * @param {string} gameMode
         */
        setGameMode: function(gameMode) {
            if (this.stateMachine) {
                this.stateMachine.setGameMode(gameMode);
            }
        },

        /**
         * Setter for the jump velocity.
         * The approriate drop velocity is also set.
         */
        setJumpVelocity: function (setting) {
            this.config.INIITAL_JUMP_VELOCITY = -setting;
            this.config.DROP_VELOCITY = -setting / 2;
        },

        /**
         * Set the animation status.
         * @param {!number} deltaTime
         * @param {Trex.status} status Optional status to switch to.
         */
        update: function (deltaTime, opt_status) {
            this.timer += deltaTime;

            // State machine is the source of truth
            if (opt_status && this.stateMachine) {
                Logger.debug('TREX', 'update() called with status: ' + opt_status);
                // Convert Trex.status to DinoState and transition through state machine
                var dinoState = this.getDinoStateFromTrexStatus(opt_status);
                Logger.debug('TREX', 'Converted Trex.status to DinoState', {
                    trexStatus: opt_status,
                    dinoState: dinoState,
                    hasStateMachine: !!this.stateMachine,
                    currentState: this.stateMachine.getState()
                });
                if (dinoState) {
                    Logger.debug('TREX', 'Transitioning state machine to: ' + dinoState);
                    // State machine will sync the status property via syncDinoStatusFromState()
                    var transitionSuccess = this.stateMachine.transition(dinoState);
                    if (!transitionSuccess) {
                        Logger.warn('TREX', 'State transition failed, status may be out of sync', {
                            requestedState: dinoState,
                            currentState: this.stateMachine.getState(),
                            requestedStatus: opt_status,
                            currentStatus: this.status
                        });
                    }
                } else {
                    Logger.warn('TREX', 'Could not convert Trex.status to DinoState: ' + opt_status);
                }
                // Don't update status directly - state machine is source of truth
                // Status will be synced by state machine after successful transition
            }

            // Game intro animation, T-rex moves in from the left.
            if (this.playingIntro && this.xPos < this.config.START_X_POS) {
                this.xPos += Math.round((this.config.START_X_POS /
                    this.config.INTRO_DURATION) * deltaTime);
            }

            // Handle respawn animations
            if (this.status == Trex.status.RESPAWNING_BLINKING) {
                this.updateRespawnBlinking(deltaTime);
            } else if (this.status == Trex.status.RESPAWNING_FALLING) {
                this.updateRespawnFalling(deltaTime);
            } else if (this.status == Trex.status.WAITING) {
                this.blink(getTimeStamp());
            } else {
                this.draw(this.currentAnimFrames[this.currentFrame], 0);
            }

            // Update the frame position (skip for respawning states - handled in their update functions)
            if (this.status != Trex.status.RESPAWNING_BLINKING && 
                this.status != Trex.status.RESPAWNING_FALLING && 
                this.timer >= this.msPerFrame) {
                this.currentFrame = this.currentFrame ==
                    this.currentAnimFrames.length - 1 ? 0 : this.currentFrame + 1;
                this.timer = 0;
            }

            // Speed drop becomes duck if the down key is still being pressed.
            if (this.speedDrop && this.stateMachine && this.stateMachine.isGrounded()) {
                this.speedDrop = false;
                this.setDuck(true);
            }
        },

        /**
         * Draw the t-rex to a particular position.
         * @param {number} x
         * @param {number} y
         */
        draw: function (x, y) {
            var sourceX = x;
            var sourceY = y;
            var sourceWidth = this.ducking && this.status != Trex.status.CRASHED ?
                this.config.WIDTH_DUCK : this.config.WIDTH;
            var sourceHeight = this.config.HEIGHT;

            if (IS_HIDPI) {
                sourceX *= 2;
                sourceY *= 2;
                sourceWidth *= 2;
                sourceHeight *= 2;
            }

            // Adjustments for sprite sheet position.
            sourceX += this.spritePos.x;
            sourceY += this.spritePos.y;

            // Ducking.
            if (this.ducking && this.status != Trex.status.CRASHED) {
                this.canvasCtx.drawImage(window.Runner.imageSprite, sourceX, sourceY,
                    sourceWidth, sourceHeight,
                    this.xPos, this.yPos,
                    this.config.WIDTH_DUCK, this.config.HEIGHT);
            } else {
                // Crashed whilst ducking. Trex is standing up so needs adjustment.
                if (this.ducking && this.status == Trex.status.CRASHED) {
                    this.xPos++;
                }
                // Standing / running
                this.canvasCtx.drawImage(window.Runner.imageSprite, sourceX, sourceY,
                    sourceWidth, sourceHeight,
                    this.xPos, this.yPos,
                    this.config.WIDTH, this.config.HEIGHT);
            }
        },

        /**
         * Sets a random time for the blink to happen.
         */
        setBlinkDelay: function () {
            this.blinkDelay = Math.ceil(Math.random() * Trex.BLINK_TIMING);
        },

        /**
         * Make t-rex blink at random intervals.
         * @param {number} time Current time in milliseconds.
         */
        blink: function (time) {
            var deltaTime = time - this.animStartTime;

            if (deltaTime >= this.blinkDelay) {
                this.draw(this.currentAnimFrames[this.currentFrame], 0);

                if (this.currentFrame == 1) {
                    // Set new random delay to blink.
                    this.setBlinkDelay();
                    this.animStartTime = time;
                    this.blinkCount++;
                }
            }
        },

        /**
         * Update respawn blinking animation: float above ground and blink.
         * @param {number} deltaTime
         */
        updateRespawnBlinking: function (deltaTime) {
            var currentTime = getTimeStamp();
            
            // Initialize respawn start time if not set
            if (this.respawnStartTime === 0) {
                this.respawnStartTime = currentTime;
                this.respawnBlinkCount = 0;
                // Position dino above ground (float height)
                var floatHeight = 50; // Pixels above ground
                var newYPos = this.groundYPos - floatHeight;
                console.log('[RESPAWN_BLINKING] Positioning dino above ground', {
                    oldYPos: this.yPos,
                    newYPos: newYPos,
                    groundYPos: this.groundYPos,
                    floatHeight: floatHeight,
                    xPos: this.xPos
                });
                this.yPos = newYPos;
                this.jumpVelocity = 0; // Keep it floating
            }

            var elapsedTime = currentTime - this.respawnStartTime;
            var blinkInterval = this.respawnBlinkDelay * 2; // Time for one complete blink (open + close)

            // Calculate which frame of the blink we're on
            var blinkCycle = Math.floor((elapsedTime % blinkInterval) / this.respawnBlinkDelay);
            this.currentFrame = blinkCycle;
            
            // Update blink count based on elapsed time
            var newBlinkCount = Math.floor(elapsedTime / blinkInterval);
            if (newBlinkCount > this.respawnBlinkCount) {
                this.respawnBlinkCount = newBlinkCount;
            }
            
            // Draw the blinking dino
            this.draw(this.currentAnimFrames[this.currentFrame], 0);
        },

        /**
         * Update respawn falling animation: fall to ground.
         * @param {number} deltaTime
         */
        updateRespawnFalling: function (deltaTime) {
            // Apply gravity to make it fall (use same approach as updateJump)
            // Use standard 60fps for physics calculations (not animation frame rate)
            var msPerFrame = 1000 / 60; // ~16.67ms per frame at 60fps
            var framesElapsed = deltaTime / msPerFrame;
            
            // Update position first (like updateJump does)
            this.yPos += Math.round(this.jumpVelocity * framesElapsed);
            
            // Then apply gravity
            this.jumpVelocity += this.config.GRAVITY * framesElapsed;
            
            // Draw the dino while falling
            this.draw(this.currentAnimFrames[0], 0);
            
            // Update state machine with new position - it will handle automatic transitions
            var wasFalling = this.stateMachine.isState(DinoState.RESPAWNING_FALLING);
            var transitioned = this.stateMachine.updatePosition(deltaTime);
            // If state machine transitioned from RESPAWNING_FALLING to RUNNING, do cleanup
            if (wasFalling && transitioned && this.stateMachine.isState(DinoState.RUNNING)) {
                // Reset respawn animation state (state machine entry handler already set position)
                this.respawnStartTime = 0;
                this.respawnBlinkCount = 0;
                this.jumpVelocity = 0;
            }
        },

        /**
         * Initialise a jump.
         * @param {number} speed
         */
        startJump: function (speed) {
            Logger.info('BUTTON_PRESS', 'startJump() called', {
                speed: speed,
                currentState: this.stateMachine ? this.stateMachine.getState() : 'N/A',
                jumping: this.jumping,
                ducking: this.ducking,
                status: this.status,
                yPos: this.yPos,
                groundYPos: this.groundYPos
            });
            if (!this.jumping) {
                Logger.debug('TREX', 'Starting jump - calling update with JUMPING status');
                this.update(0, Trex.status.JUMPING);
                // Tweak the jump velocity based on the speed.
                this.jumpVelocity = this.config.INIITAL_JUMP_VELOCITY - (speed / 10);
                // jumping property is synced by state machine - don't set directly
                this.reachedMinHeight = false;
                this.speedDrop = false;
                Logger.info('BUTTON_PRESS', 'Jump started successfully', {
                    jumpVelocity: this.jumpVelocity,
                    jumping: this.jumping,
                    stateAfterJump: this.stateMachine ? this.stateMachine.getState() : 'N/A',
                    statusAfterJump: this.status
                });
            } else {
                Logger.debug('TREX', 'Jump NOT started - already jumping');
            }
        },

        /**
         * Jump is complete, falling down.
         */
        endJump: function () {
            if (this.reachedMinHeight &&
                this.jumpVelocity < this.config.DROP_VELOCITY) {
                this.jumpVelocity = this.config.DROP_VELOCITY;
            }
        },

        /**
         * Update frame for a jump.
         * @param {number} deltaTime
         * @param {number} speed
         */
        updateJump: function (deltaTime, speed) {
            var msPerFrame = Trex.animFrames[this.status].msPerFrame;
            var framesElapsed = deltaTime / msPerFrame;

            // Speed drop makes Trex fall faster.
            if (this.speedDrop) {
                this.yPos += Math.round(this.jumpVelocity *
                    this.config.SPEED_DROP_COEFFICIENT * framesElapsed);
            } else {
                this.yPos += Math.round(this.jumpVelocity * framesElapsed);
            }

            this.jumpVelocity += this.config.GRAVITY * framesElapsed;

            // Minimum height has been reached.
            if (this.yPos < this.minJumpHeight || this.speedDrop) {
                this.reachedMinHeight = true;
            }

            // Reached max height
            if (this.yPos < this.config.MAX_JUMP_HEIGHT || this.speedDrop) {
                this.endJump();
            }

            // Update state machine with new position - it will handle automatic transitions
            var wasJumping = this.stateMachine.isState(DinoState.JUMPING);
            var transitioned = this.stateMachine.updatePosition(deltaTime);
            // If state machine transitioned from JUMPING to RUNNING, do cleanup
            if (wasJumping && transitioned && this.stateMachine.isState(DinoState.RUNNING)) {
                // Reset jump-related properties (state machine entry handler already set position)
                this.jumpVelocity = 0;
                this.midair = false;
                this.speedDrop = false;
                this.jumpCount++;
            }

            this.update(deltaTime);
        },

        /**
         * Set the speed drop. Immediately cancels the current jump.
         */
        setSpeedDrop: function () {
            this.speedDrop = true;
            this.jumpVelocity = 1;
        },

        /**
         * @param {boolean} isDucking.
         */
        setDuck: function (isDucking) {
            if (isDucking && this.status != Trex.status.DUCKING) {
                this.update(0, Trex.status.DUCKING);
                // ducking property is synced by state machine - don't set directly
            } else if (this.status == Trex.status.DUCKING) {
                this.update(0, Trex.status.RUNNING);
                // ducking property is synced by state machine - don't set directly
            }
        },

        /**
         * Reset the t-rex to running at start of game.
         */
        reset: function () {
            // Position will be set by state machine entry handler when transitioning to RUNNING
            this.jumpVelocity = 0;
            // jumping and ducking properties are synced by state machine - don't set directly
            this.update(0, Trex.status.RUNNING);
            this.midair = false;
            this.speedDrop = false;
            this.jumpCount = 0;
        }
    };

    // Export globally
    window.Trex = Trex;
})();

