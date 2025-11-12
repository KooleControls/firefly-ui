// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// State Machine for T-Rex Runner Game

(function() {
    'use strict';

    /**
     * Game states enum
     */
    var GameState = {
        INITIALIZED: 'initialized',
        MODE_SELECTION: 'mode_selection',
        INTRO: 'intro',
        PLAYING: 'playing',
        PAUSED: 'paused',
        GAME_OVER: 'game_over',
        CRASHED: 'crashed'
    };

    /**
     * State Machine for managing game states
     * @constructor
     */
    function StateMachine() {
        this.currentState = GameState.INITIALIZED;
        this.previousState = null;
        this.stateHistory = [];
        this.listeners = {};
        this.maxHistorySize = 10;
    }

    StateMachine.prototype = {
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
         * Transition to a new state
         * @param {string} newState
         * @param {Object} data Optional data to pass with the transition
         * @return {boolean} True if transition was successful
         */
        transition: function(newState, data) {
            // Normalize state name - handle both enum values and string names
            var normalizedState;
            if (typeof newState === 'string') {
                // If it's already a GameState value, use it directly
                normalizedState = newState.toLowerCase();
                // Check if it exists in GameState enum
                var stateKey = Object.keys(GameState).find(function(key) {
                    return GameState[key] === normalizedState;
                });
                if (!stateKey) {
                    return false;
                }
            } else {
                // If it's already a GameState enum value, use it
                normalizedState = newState;
            }

            var oldState = this.currentState;
            
            // Only transition if state is different
            if (oldState === normalizedState) {
                return false;
            }

            // Update state
            this.previousState = oldState;
            this.currentState = normalizedState;

            // Add to history
            this.stateHistory.push({
                from: oldState,
                to: normalizedState,
                timestamp: Date.now(),
                data: data
            });

            // Limit history size
            if (this.stateHistory.length > this.maxHistorySize) {
                this.stateHistory.shift();
            }

            // Notify listeners
            this.notifyListeners(oldState, normalizedState, data);

            return true;
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
         * Reset the state machine
         */
        reset: function() {
            this.previousState = null;
            this.currentState = GameState.INITIALIZED;
            this.stateHistory = [];
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
    window.StateMachine = StateMachine;
    window.GameState = GameState;
})();

