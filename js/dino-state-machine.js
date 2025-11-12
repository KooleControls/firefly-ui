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
        RESPAWNING: 'RESPAWNING'
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
        this.currentState = DinoState.WAITING;
        this.previousState = null;
        this.stateHistory = [];
        this.listeners = {};
        this.maxHistorySize = 10;
        
        // Game mode specific flags
        this.crashed = false; // Individual crash state (important for competitive mode)
        this.respawning = false;
        this.canRespawn = this.gameMode === GameMode.COMPETITIVE; // Only competitive mode allows respawn
        
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
                Logger.warn('DINO_STATE_MACHINE', 'Invalid state transition from ' + this.currentState + ' to ' + normalizedState);
                return false;
            }

            var oldState = this.currentState;
            
            // Only transition if state is different
            if (oldState === normalizedState) {
                Logger.debug('DINO_STATE_MACHINE', 'State unchanged, skipping transition: ' + normalizedState);
                return false;
            }

            // Update state
            this.previousState = oldState;
            this.currentState = normalizedState;

            Logger.info('DINO_STATE_MACHINE', 'State transition successful', {
                from: oldState,
                to: normalizedState,
                gameMode: this.gameMode
            });

            // Update crashed flag
            if (normalizedState === DinoState.CRASHED) {
                this.crashed = true;
                Logger.info('DINO_STATE_MACHINE', 'Dino crashed flag set to true');
            } else if (normalizedState === DinoState.RESPAWNING) {
                this.respawning = true;
                this.crashed = false; // Reset crashed when respawning
                Logger.info('DINO_STATE_MACHINE', 'Dino respawning, crashed flag reset');
            } else if (normalizedState === DinoState.RUNNING && this.respawning) {
                this.respawning = false; // Finished respawning
                Logger.info('DINO_STATE_MACHINE', 'Dino finished respawning');
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

            // Notify listeners
            this.notifyListeners(oldState, normalizedState, data);

            // Update the dino's status to match
            if (this.dino && this.dino.update) {
                // Sync with Trex.status enum
                var trexStatus = this.getTrexStatusForState(normalizedState);
                Logger.debug('DINO_STATE_MACHINE', 'Syncing dino status', {
                    dinoState: normalizedState,
                    trexStatus: trexStatus,
                    hasDino: !!this.dino,
                    hasUpdate: !!this.dino.update
                });
                if (trexStatus) {
                    this.dino.update(0, trexStatus);
                } else {
                    Logger.warn('DINO_STATE_MACHINE', 'No Trex.status found for: ' + normalizedState);
                }
            } else {
                Logger.warn('DINO_STATE_MACHINE', 'Dino instance or update method not available');
            }

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

            // In collective mode, crashed dinos can't transition to other states
            if (this.gameMode === GameMode.COLLECTIVE && this.isCrashed() && 
                newState !== DinoState.CRASHED) {
                Logger.debug('DINO_STATE_MACHINE', 'Invalid: Collective mode - crashed dinos cannot transition');
                return false;
            }

            // In competitive mode, crashed dinos can respawn
            if (this.gameMode === GameMode.COMPETITIVE && this.isCrashed() && 
                newState === DinoState.RESPAWNING && this.canRespawn) {
                Logger.debug('DINO_STATE_MACHINE', 'Valid: Competitive mode - crashed dino can respawn');
                return true;
            }

            // General transition rules
            var isValid = false;
            switch(this.currentState) {
                case DinoState.CRASHED:
                    // Can only transition to RESPAWNING (competitive) or stay CRASHED
                    isValid = newState === DinoState.RESPAWNING || newState === DinoState.CRASHED;
                    Logger.debug('DINO_STATE_MACHINE', 'CRASHED state transition check', {
                        newState: newState,
                        isValid: isValid,
                        canRespawn: this.canRespawn
                    });
                    break;
                case DinoState.RESPAWNING:
                    // Can transition to RUNNING when respawn completes
                    isValid = newState === DinoState.RUNNING || newState === DinoState.RESPAWNING;
                    Logger.debug('DINO_STATE_MACHINE', 'RESPAWNING state transition check', {
                        newState: newState,
                        isValid: isValid
                    });
                    break;
                case DinoState.WAITING:
                    // Can transition to RUNNING or JUMPING
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
        }
    };

    // Export to global scope
    window.DinoStateMachine = DinoStateMachine;
    window.DinoState = DinoState;
    window.DinoGameMode = GameMode;
})();

