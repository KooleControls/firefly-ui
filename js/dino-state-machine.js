// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// Dino State Machine for T-Rex Runner Game

(function() {
    'use strict';

    /**
     * Dino states enum (matches Trex.status)
     */
    var DinoState = {
        WAITING: 'WAITING',
        RUNNING: 'RUNNING',
        JUMPING: 'JUMPING',
        DUCKING: 'DUCKING',
        CRASHED: 'CRASHED',
        RESPAWNING_BLINKING: 'RESPAWNING_BLINKING',
        RESPAWNING_FALLING: 'RESPAWNING_FALLING'
    };

    /**
     * Game mode types
     */
    var GameMode = {
        COLLECTIVE: 'collective',
        COMPETITIVE: 'competitive'
    };

    /**
     * Dino State Machine for managing individual dino states
     * @param {string} gameMode 'collective' or 'competitive'
     * @param {Object} dinoInstance The Trex instance this state machine manages
     * @constructor
     */
    function DinoStateMachine(gameMode, dinoInstance) {
        this.gameMode = gameMode || GameMode.COLLECTIVE;
        this.dino = dinoInstance;
        this.currentState = DinoState.RESPAWNING_BLINKING;
        this.previousState = null;
        this.stateHistory = [];
        this.listeners = {};
        this.entryHandlers = {}; // State entry handlers
        this.exitHandlers = {}; // State exit handlers
        this.maxHistorySize = 10;
        
        // Game mode specific flags
        this.crashed = false; // Individual crash state (important for competitive mode)
        this.respawning = false;
        this.canRespawn = this.gameMode === GameMode.COMPETITIVE; // Only competitive mode allows respawn
        
        // Initialize default entry handlers
        this.initDefaultEntryHandlers();
        
        Logger.info('DINO_STATE_MACHINE', 'Constructor called', {
            gameMode: this.gameMode,
            canRespawn: this.canRespawn,
            hasDino: !!dinoInstance,
            initialState: this.currentState
        });
    }

    DinoStateMachine.prototype = {
        /**
         * Get the current state
         * @return {string}
         */
        getState: function() {
            return this.currentState;
        },

        /**
         * Get the previous state
         * @return {string}
         */
        getPreviousState: function() {
            return this.previousState;
        },

        /**
         * Check if current state matches given state
         * @param {string} state
         * @return {boolean}
         */
        isState: function(state) {
            return this.currentState === state;
        },

        /**
         * Check if current state is one of the given states
         * @param {Array<string>} states
         * @return {boolean}
         */
        isAnyState: function(states) {
            return states.indexOf(this.currentState) !== -1;
        },

        /**
         * Check if dino is crashed (game mode aware)
         * @return {boolean}
         */
        isCrashed: function() {
            var result = this.crashed || this.currentState === DinoState.CRASHED;
            Logger.debug('DINO_STATE_MACHINE', 'isCrashed() called', {
                crashed: this.crashed,
                currentState: this.currentState,
                result: result
            });
            return result;
        },

        /**
         * Check if dino can be updated (game mode aware)
         * In competitive mode, crashed dinos are skipped
         * @return {boolean}
         */
        canUpdate: function() {
            var isCrashed = this.isCrashed();
            var canUpdate = !(this.gameMode === GameMode.COMPETITIVE && isCrashed);
            Logger.debug('DINO_STATE_MACHINE', 'canUpdate() called', {
                gameMode: this.gameMode,
                isCrashed: isCrashed,
                canUpdate: canUpdate,
                currentState: this.currentState
            });
            return canUpdate;
        },

        /**
         * Transition to a new state
         * @param {string} newState
         * @param {Object} data Optional data to pass with the transition
         * @return {boolean} True if transition was successful
         */
        transition: function(newState, data) {
            Logger.info('DINO_STATE_MACHINE', 'transition() called', {
                requestedState: newState,
                currentState: this.currentState,
                gameMode: this.gameMode,
                crashed: this.crashed,
                respawning: this.respawning,
                data: data
            });

            // Normalize state name
            var normalizedState;
            if (typeof newState === 'string') {
                normalizedState = newState.toUpperCase();
                // Check if it exists in DinoState enum
                var stateKey = Object.keys(DinoState).find(function(key) {
                    return DinoState[key] === normalizedState;
                });
                if (!stateKey) {
                    Logger.warn('DINO_STATE_MACHINE', 'Unknown dino state: ' + newState);
                    return false;
                }
                Logger.debug('DINO_STATE_MACHINE', 'Normalized state: ' + normalizedState);
            } else {
                normalizedState = newState;
            }

            // Validate transition based on game mode
            var isValid = this.isValidTransition(normalizedState);
            Logger.debug('DINO_STATE_MACHINE', 'Transition validation', {
                from: this.currentState,
                to: normalizedState,
                isValid: isValid,
                gameMode: this.gameMode
            });

            if (!isValid) {
                return false;
            }

            var oldState = this.currentState;
            
            // Allow self-transitions (same state) - they will update history and notify listeners
            // This is useful for re-triggering state logic or ensuring state consistency
            if (oldState === normalizedState) {
                Logger.debug('DINO_STATE_MACHINE', 'Self-transition: ' + normalizedState);
                // Still update history and notify listeners for self-transitions
                this.stateHistory.push({
                    from: oldState,
                    to: normalizedState,
                    timestamp: Date.now(),
                    gameMode: this.gameMode,
                    data: data,
                    selfTransition: true
                });

                // Limit history size
                if (this.stateHistory.length > this.maxHistorySize) {
                    this.stateHistory.shift();
                }

                // Notify listeners even for self-transitions
                this.notifyListeners(oldState, normalizedState, data);

                // Sync dino status to ensure consistency
                this.syncDinoStatusFromState(normalizedState);

                // Call entry handler for self-transition (useful for re-initialization)
                this.callEntryHandler(normalizedState, oldState, data);

                Logger.debug('DINO_STATE_MACHINE', 'Self-transition complete. Current state: ' + this.currentState);
                return true;
            }

            // Update state
            this.previousState = oldState;
            this.currentState = normalizedState;

            Logger.info('DINO_STATE_MACHINE', 'State transition successful', {
                from: oldState,
                to: normalizedState,
                gameMode: this.gameMode
            });

            // Update crashed and respawning flags based on state
            // These flags are the source of truth and will be synced to dino properties
            if (normalizedState === DinoState.CRASHED) {
                this.crashed = true;
                this.respawning = false; // Clear respawning if crashing
                Logger.info('DINO_STATE_MACHINE', 'Dino crashed flag set to true');
            } else if (normalizedState === DinoState.RESPAWNING_BLINKING || normalizedState === DinoState.RESPAWNING_FALLING) {
                this.respawning = true;
                this.crashed = false; // Reset crashed when respawning
                Logger.info('DINO_STATE_MACHINE', 'Dino respawning, crashed flag reset');
            } else if (normalizedState === DinoState.RUNNING && this.respawning) {
                this.respawning = false; // Finished respawning
                Logger.info('DINO_STATE_MACHINE', 'Dino finished respawning');
            } else if (normalizedState !== DinoState.RESPAWNING_BLINKING && normalizedState !== DinoState.RESPAWNING_FALLING && normalizedState !== DinoState.CRASHED) {
                // Clear respawning flag for any other state (except RESPAWNING states and CRASHED)
                // This ensures respawning is only true when actually in RESPAWNING state
                if (this.respawning) {
                    this.respawning = false;
                    Logger.debug('DINO_STATE_MACHINE', 'Cleared respawning flag for state: ' + normalizedState);
                }
            }

            // Add to history
            this.stateHistory.push({
                from: oldState,
                to: normalizedState,
                timestamp: Date.now(),
                gameMode: this.gameMode,
                data: data
            });

            // Limit history size
            if (this.stateHistory.length > this.maxHistorySize) {
                this.stateHistory.shift();
            }

            // Call exit handler for old state
            this.callExitHandler(oldState, normalizedState, data);

            // Notify listeners
            this.notifyListeners(oldState, normalizedState, data);

            // Sync the dino's legacy status from state machine (source of truth)
            this.syncDinoStatusFromState(normalizedState);

            // Call entry handler for new state
            this.callEntryHandler(normalizedState, oldState, data);

            Logger.debug('DINO_STATE_MACHINE', 'Transition complete. Current state: ' + this.currentState);
            return true;
        },

        /**
         * Validate if a transition is allowed based on current state and game mode
         * @param {string} newState
         * @return {boolean}
         */
        isValidTransition: function(newState) {
            Logger.debug('DINO_STATE_MACHINE', 'isValidTransition() called', {
                currentState: this.currentState,
                newState: newState,
                gameMode: this.gameMode,
                isCrashed: this.isCrashed(),
                crashed: this.crashed,
                canRespawn: this.canRespawn
            });

            // Always allow self-transitions (transitioning to the same state)
            if (this.currentState === newState) {
                Logger.debug('DINO_STATE_MACHINE', 'Self-transition allowed: ' + newState);
                return true;
            }

            // In collective mode, crashed dinos can't transition to other states
            if (this.gameMode === GameMode.COLLECTIVE && this.isCrashed() && 
                newState !== DinoState.CRASHED) {
                Logger.debug('DINO_STATE_MACHINE', 'Invalid: Collective mode - crashed dinos cannot transition');
                return false;
            }

            // In competitive mode, crashed dinos can respawn
            if (this.gameMode === GameMode.COMPETITIVE && this.isCrashed() && 
                newState === DinoState.RESPAWNING_BLINKING && this.canRespawn) {
                Logger.debug('DINO_STATE_MACHINE', 'Valid: Competitive mode - crashed dino can respawn');
                return true;
            }

            // General transition rules
            var isValid = false;
            switch(this.currentState) {
                case DinoState.CRASHED:
                    // Can only transition to RESPAWNING_BLINKING (competitive) or stay CRASHED
                    isValid = newState === DinoState.RESPAWNING_BLINKING || newState === DinoState.CRASHED;
                    Logger.debug('DINO_STATE_MACHINE', 'CRASHED state transition check', {
                        newState: newState,
                        isValid: isValid,
                        canRespawn: this.canRespawn
                    });
                    break;
                case DinoState.RESPAWNING_BLINKING:
                    // Can transition to RESPAWNING_FALLING when button pressed, or stay blinking
                    isValid = newState === DinoState.RESPAWNING_FALLING || newState === DinoState.RESPAWNING_BLINKING;
                    Logger.debug('DINO_STATE_MACHINE', 'RESPAWNING_BLINKING state transition check', {
                        newState: newState,
                        isValid: isValid
                    });
                    break;
                case DinoState.RESPAWNING_FALLING:
                    // Can transition to RUNNING when respawn completes, or stay falling
                    isValid = newState === DinoState.RUNNING || newState === DinoState.RESPAWNING_FALLING;
                    Logger.debug('DINO_STATE_MACHINE', 'RESPAWNING_FALLING state transition check', {
                        newState: newState,
                        isValid: isValid
                    });
                    break;
                case DinoState.WAITING:
                    // Can transition to RUNNING, JUMPING, or stay WAITING
                    isValid = [DinoState.RUNNING, DinoState.JUMPING, DinoState.WAITING].indexOf(newState) !== -1;
                    Logger.debug('DINO_STATE_MACHINE', 'WAITING state transition check', {
                        newState: newState,
                        isValid: isValid
                    });
                    break;
                case DinoState.RUNNING:
                    // Can transition to JUMPING, DUCKING, or CRASHED
                    isValid = [DinoState.JUMPING, DinoState.DUCKING, DinoState.CRASHED, DinoState.RUNNING].indexOf(newState) !== -1;
                    Logger.debug('DINO_STATE_MACHINE', 'RUNNING state transition check', {
                        newState: newState,
                        isValid: isValid
                    });
                    break;
                case DinoState.JUMPING:
                    // Can transition to RUNNING, DUCKING, or CRASHED
                    isValid = [DinoState.RUNNING, DinoState.DUCKING, DinoState.CRASHED, DinoState.JUMPING].indexOf(newState) !== -1;
                    Logger.debug('DINO_STATE_MACHINE', 'JUMPING state transition check', {
                        newState: newState,
                        isValid: isValid
                    });
                    break;
                case DinoState.DUCKING:
                    // Can transition to RUNNING or CRASHED
                    isValid = [DinoState.RUNNING, DinoState.CRASHED, DinoState.DUCKING].indexOf(newState) !== -1;
                    Logger.debug('DINO_STATE_MACHINE', 'DUCKING state transition check', {
                        newState: newState,
                        isValid: isValid
                    });
                    break;
                default:
                    isValid = true;
                    Logger.debug('DINO_STATE_MACHINE', 'Unknown current state, allowing transition: ' + this.currentState);
                    break;
            }
            
            Logger.debug('DINO_STATE_MACHINE', 'Final validation result: ' + isValid);
            return isValid;
        },

        /**
         * Get Trex.status enum value for a given state
         * @param {string} state
         * @return {string|null}
         */
        getTrexStatusForState: function(state) {
            // Map DinoState to Trex.status (they should match)
            if (window.Trex && window.Trex.status) {
                return window.Trex.status[state] || null;
            }
            return state;
        },

        /**
         * Sync the dino's legacy status property and all state-related properties from the state machine
         * This ensures the state machine is the source of truth for all state-related properties
         * @param {string} dinoState The current dino state
         */
        syncDinoStatusFromState: function(dinoState) {
            if (!this.dino) {
                Logger.warn('DINO_STATE_MACHINE', 'Cannot sync status - no dino instance');
                return;
            }

            // Get the corresponding Trex.status enum value
            var trexStatus = this.getTrexStatusForState(dinoState);
            
            if (!trexStatus) {
                Logger.warn('DINO_STATE_MACHINE', 'No Trex.status found for state: ' + dinoState);
                return;
            }

            Logger.debug('DINO_STATE_MACHINE', 'Syncing dino properties from state machine', {
                dinoState: dinoState,
                trexStatus: trexStatus,
                currentDinoStatus: this.dino.status,
                stateMachineCrashed: this.crashed,
                stateMachineRespawning: this.respawning
            });

            // Sync legacy status property and animation frames
            this.dino.status = trexStatus;
            this.dino.currentFrame = 0;
            
            // Update animation frames if available
            if (window.Trex && window.Trex.animFrames && window.Trex.animFrames[trexStatus]) {
                this.dino.msPerFrame = window.Trex.animFrames[trexStatus].msPerFrame;
                this.dino.currentAnimFrames = window.Trex.animFrames[trexStatus].frames;
            }

            // Sync state-related properties from state machine (source of truth)
            // These should never be set directly on dino - always go through state machine
            this.dino.crashed = this.crashed;
            this.dino.respawning = this.respawning;
            
            // Sync jumping/ducking based on current state
            this.dino.jumping = (dinoState === DinoState.JUMPING);
            this.dino.ducking = (dinoState === DinoState.DUCKING);

            // Handle special status initialization
            if (trexStatus === window.Trex.status.WAITING) {
                if (this.dino.animStartTime !== undefined) {
                    // Use global getTimeStamp function if available, otherwise fallback to Date.now()
                    var timeStampFn = (typeof getTimeStamp !== 'undefined') ? getTimeStamp : 
                                     (window.getTimeStamp ? window.getTimeStamp : null);
                    this.dino.animStartTime = timeStampFn ? timeStampFn() : Date.now();
                }
                if (this.dino.setBlinkDelay) {
                    this.dino.setBlinkDelay();
                }
            }

            Logger.debug('DINO_STATE_MACHINE', 'Dino properties synced', {
                newStatus: this.dino.status,
                crashed: this.dino.crashed,
                respawning: this.dino.respawning,
                jumping: this.dino.jumping,
                ducking: this.dino.ducking,
                stateMachineState: this.currentState
            });
        },

        /**
         * Add a state change listener
         * @param {string} state State to listen for (or '*' for all states)
         * @param {Function} callback Function(state, previousState, data)
         */
        onStateChange: function(state, callback) {
            if (!this.listeners[state]) {
                this.listeners[state] = [];
            }
            this.listeners[state].push(callback);
        },

        /**
         * Remove a state change listener
         * @param {string} state State to remove listener from
         * @param {Function} callback Callback to remove
         */
        offStateChange: function(state, callback) {
            if (this.listeners[state]) {
                var index = this.listeners[state].indexOf(callback);
                if (index !== -1) {
                    this.listeners[state].splice(index, 1);
                }
            }
        },

        /**
         * Notify all listeners of a state change
         * @param {string} oldState
         * @param {string} newState
         * @param {Object} data
         */
        notifyListeners: function(oldState, newState, data) {
            // Notify listeners for this specific state
            if (this.listeners[newState]) {
                this.listeners[newState].forEach(function(callback) {
                    callback(newState, oldState, data);
                });
            }

            // Notify wildcard listeners
            if (this.listeners['*']) {
                this.listeners['*'].forEach(function(callback) {
                    callback(newState, oldState, data);
                });
            }
        },

        /**
         * Set game mode (affects state transitions)
         * @param {string} gameMode
         */
        setGameMode: function(gameMode) {
            Logger.info('DINO_STATE_MACHINE', 'setGameMode() called', {
                oldGameMode: this.gameMode,
                newGameMode: gameMode,
                currentState: this.currentState
            });
            this.gameMode = gameMode;
            this.canRespawn = gameMode === GameMode.COMPETITIVE;
            Logger.info('DINO_STATE_MACHINE', 'Game mode updated. canRespawn: ' + this.canRespawn);
        },

        /**
         * Reset the state machine
         */
        reset: function() {
            this.previousState = null;
            this.currentState = DinoState.WAITING;
            this.stateHistory = [];
            this.crashed = false;
            this.respawning = false;
        },

        /**
         * Get state history
         * @return {Array}
         */
        getHistory: function() {
            return this.stateHistory.slice();
        },

        /**
         * Check if dino is grounded (yPos >= groundYPos)
         * @return {boolean}
         */
        isGrounded: function() {
            if (!this.dino || this.dino.groundYPos === undefined || this.dino.yPos === undefined) {
                Logger.warn('DINO_STATE_MACHINE', 'isGrounded() called but dino position not available');
                return false;
            }
            return this.dino.yPos >= this.dino.groundYPos;
        },

        /**
         * Check if dino is airborne (yPos < groundYPos)
         * @return {boolean}
         */
        isAirborne: function() {
            if (!this.dino || this.dino.groundYPos === undefined || this.dino.yPos === undefined) {
                Logger.warn('DINO_STATE_MACHINE', 'isAirborne() called but dino position not available');
                return false;
            }
            return this.dino.yPos < this.dino.groundYPos;
        },

        /**
         * Get position state as a string
         * @return {string} 'grounded', 'airborne', or 'floating' (for respawning above ground)
         */
        getPositionState: function() {
            if (!this.dino || this.dino.groundYPos === undefined || this.dino.yPos === undefined) {
                return 'unknown';
            }
            if (this.dino.yPos > this.dino.groundYPos) {
                return 'below_ground'; // Below ground (shouldn't happen normally)
            } else if (this.dino.yPos === this.dino.groundYPos) {
                return 'grounded';
            } else if (this.isState(DinoState.RESPAWNING_BLINKING) || this.isState(DinoState.RESPAWNING_FALLING)) {
                return 'floating'; // Floating above ground during respawn
            } else {
                return 'airborne'; // In the air (jumping)
            }
        },

        /**
         * Get distance from ground (positive = above ground, negative = below ground)
         * @return {number}
         */
        getDistanceFromGround: function() {
            if (!this.dino || this.dino.groundYPos === undefined || this.dino.yPos === undefined) {
                return 0;
            }
            return this.dino.groundYPos - this.dino.yPos;
        },

        /**
         * Initialize default entry handlers for position initialization
         */
        initDefaultEntryHandlers: function() {
            var self = this;
            
            // RESPAWNING_BLINKING: Position dino above ground and reset xPos
            this.entryHandlers[DinoState.RESPAWNING_BLINKING] = function(newState, oldState, data) {
                if (!self.dino) return;
                // Only set position if groundYPos is initialized
                if (self.dino.groundYPos !== undefined && self.dino.groundYPos !== null) {
                    var floatHeight = 50; // Pixels above ground
                    self.dino.yPos = self.dino.groundYPos - floatHeight;
                }
                self.dino.jumpVelocity = 0; // Keep it floating
                // Reset xPos to original position (or START_X_POS as fallback)
                if (self.dino.originalXPos !== undefined) {
                    self.dino.xPos = self.dino.originalXPos;
                } else if (window.Trex && window.Trex.config && window.Trex.config.START_X_POS !== undefined) {
                    self.dino.xPos = window.Trex.config.START_X_POS;
                }
                // Set respawn start time immediately to start the 1-second timer
                var timeStampFn = (typeof getTimeStamp !== 'undefined') ? getTimeStamp : 
                                 (window.getTimeStamp ? window.getTimeStamp : Date.now);
                self.dino.respawnStartTime = timeStampFn();
                self.dino.respawnBlinkCount = 0;
                self.dino.respawnFallTriggered = false;
                Logger.debug('DINO_STATE_MACHINE', 'RESPAWNING_BLINKING entry: Positioned dino above ground', {
                    xPos: self.dino.xPos,
                    yPos: self.dino.yPos,
                    groundYPos: self.dino.groundYPos,
                    floatHeight: floatHeight,
                    originalXPos: self.dino.originalXPos
                });
            };

            // RESPAWNING_FALLING: Ensure dino is above ground before falling
            this.entryHandlers[DinoState.RESPAWNING_FALLING] = function(newState, oldState, data) {
                if (!self.dino) return;

                self.dino.distanceRan = 0;

                // If already on ground, transition directly to RUNNING
                if (self.dino.yPos >= self.dino.groundYPos) {
                    self.dino.yPos = self.dino.groundYPos;
                    self.dino.jumpVelocity = 0;

                    Logger.debug('DINO_STATE_MACHINE', 'RESPAWNING_FALLING entry: Already on ground, transitioning to RUNNING');
                    self.transition(DinoState.RUNNING);
                    return;
                }
                // Otherwise, start falling (jumpVelocity will be updated by physics)
                Logger.debug('DINO_STATE_MACHINE', 'RESPAWNING_FALLING entry: Starting fall', {
                    yPos: self.dino.yPos,
                    groundYPos: self.dino.groundYPos
                });
            };

            // RUNNING: Ensure dino is on ground
            this.entryHandlers[DinoState.RUNNING] = function(newState, oldState, data) {
                if (!self.dino) return;
                self.dino.yPos = self.dino.groundYPos;
                self.dino.jumpVelocity = 0;
                Logger.debug('DINO_STATE_MACHINE', 'RUNNING entry: Positioned dino on ground', {
                    yPos: self.dino.yPos,
                    groundYPos: self.dino.groundYPos
                });
            };

            // JUMPING: Validate position (can start from ground)
            this.entryHandlers[DinoState.JUMPING] = function(newState, oldState, data) {
                if (!self.dino) return;
                // JUMPING can start from ground, so we don't force position
                // But we ensure jumpVelocity is set (should be set by startJump)
                Logger.debug('DINO_STATE_MACHINE', 'JUMPING entry: Validated jump start', {
                    yPos: self.dino.yPos,
                    groundYPos: self.dino.groundYPos,
                    jumpVelocity: self.dino.jumpVelocity
                });
            };

            // DUCKING: Ensure dino is on ground
            this.entryHandlers[DinoState.DUCKING] = function(newState, oldState, data) {
                if (!self.dino) return;
                self.dino.yPos = self.dino.groundYPos;
                Logger.debug('DINO_STATE_MACHINE', 'DUCKING entry: Positioned dino on ground');
            };

            // WAITING: Ensure dino is on ground
            this.entryHandlers[DinoState.WAITING] = function(newState, oldState, data) {
                if (!self.dino) return;
                self.dino.yPos = self.dino.groundYPos;
                self.dino.jumpVelocity = 0;
                Logger.debug('DINO_STATE_MACHINE', 'WAITING entry: Positioned dino on ground');
            };

            // CRASHED: No position requirement, but log for debugging
            this.entryHandlers[DinoState.CRASHED] = function(newState, oldState, data) {
                if (!self.dino) return;
                Logger.debug('DINO_STATE_MACHINE', 'CRASHED entry: State changed to crashed', {
                    yPos: self.dino.yPos,
                    groundYPos: self.dino.groundYPos
                });
            };
        },

        /**
         * Register a state entry handler
         * @param {string} state State to register handler for
         * @param {Function} callback Function(newState, oldState, data)
         */
        registerStateEntryHandler: function(state, callback) {
            if (!this.entryHandlers[state]) {
                this.entryHandlers[state] = callback;
            } else {
                // Chain with existing handler
                var existing = this.entryHandlers[state];
                this.entryHandlers[state] = function(newState, oldState, data) {
                    existing.call(this, newState, oldState, data);
                    callback.call(this, newState, oldState, data);
                };
            }
            Logger.debug('DINO_STATE_MACHINE', 'Registered entry handler for state: ' + state);
        },

        /**
         * Register a state exit handler
         * @param {string} state State to register handler for
         * @param {Function} callback Function(oldState, newState, data)
         */
        registerStateExitHandler: function(state, callback) {
            if (!this.exitHandlers[state]) {
                this.exitHandlers[state] = callback;
            } else {
                // Chain with existing handler
                var existing = this.exitHandlers[state];
                this.exitHandlers[state] = function(oldState, newState, data) {
                    existing.call(this, oldState, newState, data);
                    callback.call(this, oldState, newState, data);
                };
            }
            Logger.debug('DINO_STATE_MACHINE', 'Registered exit handler for state: ' + state);
        },

        /**
         * Call entry handler for a state
         * @param {string} state
         * @param {string} oldState
         * @param {Object} data
         */
        callEntryHandler: function(state, oldState, data) {
            if (this.entryHandlers[state]) {
                try {
                    this.entryHandlers[state].call(this, state, oldState, data);
                } catch (e) {
                    Logger.error('DINO_STATE_MACHINE', 'Error in entry handler for ' + state, { error: e });
                }
            }
        },

        /**
         * Call exit handler for a state
         * @param {string} state
         * @param {string} newState
         * @param {Object} data
         */
        callExitHandler: function(state, newState, data) {
            if (this.exitHandlers[state]) {
                try {
                    this.exitHandlers[state].call(this, state, newState, data);
                } catch (e) {
                    Logger.error('DINO_STATE_MACHINE', 'Error in exit handler for ' + state, { error: e });
                }
            }
        },

        /**
         * Validate that position matches the current state
         * @return {boolean} True if position is valid for current state
         */
        validatePositionState: function() {
            if (!this.dino || this.dino.groundYPos === undefined || this.dino.yPos === undefined) {
                Logger.warn('DINO_STATE_MACHINE', 'validatePositionState() called but dino position not available');
                return false;
            }

            var state = this.currentState;
            var yPos = this.dino.yPos;
            var groundYPos = this.dino.groundYPos;
            var isValid = true;
            var reason = '';

            switch(state) {
                case DinoState.JUMPING:
                    // JUMPING: Should be airborne (yPos < groundYPos) or just starting from ground
                    // Allow small tolerance for floating point errors
                    if (yPos > groundYPos + 1) {
                        isValid = false;
                        reason = 'JUMPING state but yPos > groundYPos (below ground)';
                    }
                    break;
                case DinoState.RUNNING:
                case DinoState.DUCKING:
                case DinoState.WAITING:
                    // These states require being on ground
                    if (Math.abs(yPos - groundYPos) > 1) {
                        isValid = false;
                        reason = state + ' state but yPos != groundYPos (not on ground)';
                    }
                    break;
                case DinoState.RESPAWNING_BLINKING:
                case DinoState.RESPAWNING_FALLING:
                    // RESPAWNING: Can be above ground (floating) or at ground (falling)
                    if (yPos > groundYPos + 1) {
                        isValid = false;
                        reason = state + ' state but yPos > groundYPos (below ground)';
                    }
                    break;
                case DinoState.CRASHED:
                    // CRASHED: No position requirement
                    isValid = true;
                    break;
                default:
                    // Unknown state, allow any position
                    isValid = true;
                    break;
            }

            if (!isValid) {
                Logger.warn('DINO_STATE_MACHINE', 'Position validation failed', {
                    state: state,
                    yPos: yPos,
                    groundYPos: groundYPos,
                    reason: reason
                });
            }

            return isValid;
        },

        /**
         * Auto-correct position to match current state
         * @return {boolean} True if correction was made
         */
        autoCorrectPosition: function() {
            if (!this.dino || this.dino.groundYPos === undefined || this.dino.yPos === undefined) {
                return false;
            }

            var state = this.currentState;
            var yPos = this.dino.yPos;
            var groundYPos = this.dino.groundYPos;
            var corrected = false;
            var oldYPos = yPos;

            switch(state) {
                case DinoState.RUNNING:
                case DinoState.DUCKING:
                case DinoState.WAITING:
                    // These states require being on ground
                    if (Math.abs(yPos - groundYPos) > 1) {
                        this.dino.yPos = groundYPos;
                        this.dino.jumpVelocity = 0;
                        corrected = true;
                        Logger.info('DINO_STATE_MACHINE', 'Auto-corrected position for ' + state, {
                            oldYPos: oldYPos,
                            newYPos: groundYPos,
                            groundYPos: groundYPos
                        });
                    }
                    break;
                case DinoState.JUMPING:
                    // If below ground, move to ground (shouldn't happen, but fix it)
                    if (yPos > groundYPos + 1) {
                        this.dino.yPos = groundYPos;
                        this.dino.jumpVelocity = 0;
                        corrected = true;
                        Logger.info('DINO_STATE_MACHINE', 'Auto-corrected JUMPING position (was below ground)', {
                            oldYPos: oldYPos,
                            newYPos: groundYPos
                        });
                        // Transition to RUNNING since we're on ground
                        this.transition(DinoState.RUNNING);
                    }
                    break;
                case DinoState.RESPAWNING_BLINKING:
                case DinoState.RESPAWNING_FALLING:
                    // If below ground, move to ground
                    if (yPos > groundYPos + 1) {
                        this.dino.yPos = groundYPos;
                        this.dino.jumpVelocity = 0;
                        corrected = true;
                        Logger.info('DINO_STATE_MACHINE', 'Auto-corrected ' + state + ' position (was below ground)', {
                            oldYPos: oldYPos,
                            newYPos: groundYPos
                        });
                        // If falling and on ground, transition to RUNNING
                        if (state === DinoState.RESPAWNING_FALLING) {
                            this.transition(DinoState.RUNNING);
                        }
                    }
                    break;
                case DinoState.CRASHED:
                    // No position correction for crashed state
                    break;
            }

            return corrected;
        },

        /**
         * Check position and automatically transition states if conditions are met
         * @return {boolean} True if a transition occurred
         */
        checkPositionBasedTransitions: function() {
            if (!this.dino || this.dino.groundYPos === undefined || this.dino.yPos === undefined) {
                return false;
            }

            var state = this.currentState;
            var yPos = this.dino.yPos;
            var groundYPos = this.dino.groundYPos;
            var transitioned = false;

            // JUMPING -> RUNNING: When dino lands (yPos >= groundYPos)
            if (state === DinoState.JUMPING && this.isGrounded()) {
                Logger.info('DINO_STATE_MACHINE', 'Automatic transition: JUMPING -> RUNNING (landed)', {
                    yPos: yPos,
                    groundYPos: groundYPos
                });
                this.transition(DinoState.RUNNING);
                transitioned = true;
            }

            // RESPAWNING_FALLING -> RUNNING: When falling dino reaches ground
            if (state === DinoState.RESPAWNING_FALLING && this.isGrounded()) {
                Logger.info('DINO_STATE_MACHINE', 'Automatic transition: RESPAWNING_FALLING -> RUNNING (landed)', {
                    yPos: yPos,
                    groundYPos: groundYPos
                });
                // Reset respawn animation state
                if (this.dino.respawnStartTime !== undefined) {
                    this.dino.respawnStartTime = 0;
                }
                if (this.dino.respawnBlinkCount !== undefined) {
                    this.dino.respawnBlinkCount = 0;
                }
                if (this.dino.respawnFallTriggered !== undefined) {
                    this.dino.respawnFallTriggered = false;
                }
                this.transition(DinoState.RUNNING);
                transitioned = true;
            }

            return transitioned;
        },

        /**
         * Update position and handle automatic state transitions
         * This method should be called after physics updates position
         * @param {number} deltaTime Time elapsed since last update
         * @param {number} opt_newYPos Optional new Y position (if not provided, uses dino.yPos)
         * @return {boolean} True if a state transition occurred
         */
        updatePosition: function(deltaTime, opt_newYPos) {
            if (!this.dino || this.dino.groundYPos === undefined) {
                return false;
            }

            // Use provided position or current dino position
            var newYPos = opt_newYPos !== undefined ? opt_newYPos : this.dino.yPos;
            
            // Update dino position if provided
            if (opt_newYPos !== undefined) {
                this.dino.yPos = newYPos;
            }

            // Validate position matches state
            var isValid = this.validatePositionState();
            
            // Auto-correct if invalid (but don't override physics updates)
            if (!isValid) {
                Logger.debug('DINO_STATE_MACHINE', 'Position validation failed, attempting auto-correction');
                this.autoCorrectPosition();
            }

            // Check for automatic position-based transitions
            var transitioned = this.checkPositionBasedTransitions();

            Logger.debug('DINO_STATE_MACHINE', 'updatePosition() completed', {
                yPos: this.dino.yPos,
                groundYPos: this.dino.groundYPos,
                state: this.currentState,
                isValid: isValid,
                transitioned: transitioned
            });

            return transitioned;
        }
    };

    // Export to global scope
    window.DinoStateMachine = DinoStateMachine;
    window.DinoState = DinoState;
    window.DinoGameMode = GameMode;
})();

