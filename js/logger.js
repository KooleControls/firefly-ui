// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// Centralized Logger for T-Rex Runner Game
//
// Usage:
//   Logger.info('API', 'Message', { data: 'optional' });
//   Logger.debug('TREX', 'Debug message');
//   Logger.warn('BUTTON_PRESS', 'Warning message');
//   Logger.error('API', 'Error message', { error: err });
//
// Enable/Disable logging:
//   Logger.disable('API');           // Disable API logging
//   Logger.enable('BUTTON_PRESS');    // Enable button press logging
//   Logger.disable('ALL');            // Disable all logging
//   Logger.enable('ALL');             // Enable all logging
//
// Set log level (filters out messages below the level):
//   Logger.setLogLevel(LogLevel.DEBUG);  // Show all logs
//   Logger.setLogLevel(LogLevel.INFO);   // Show info, warn, error (default)
//   Logger.setLogLevel(LogLevel.WARN);    // Show only warnings and errors
//   Logger.setLogLevel(LogLevel.ERROR);   // Show only errors

(function() {
    'use strict';

    /**
     * Logger configuration - enable/disable different log types
     * Modify these values to control what gets logged
     */
    var LoggerConfig = {
        API: true,              // API events and button presses
        RUNNER: false,           // Runner/game controller events
        TREX: false,             // Trex/dino events
        DINO_STATE_MACHINE: false, // Dino state machine transitions
        GAME_STATE_MACHINE: false, // Game state machine transitions
        BUTTON_PRESS: false,     // Button press events (keyboard and API)
        ALL: true               // Master switch - if false, disables all logging
    };

    /**
     * Log levels
     */
    var LogLevel = {
        DEBUG: 'debug',
        INFO: 'info',
        WARN: 'warn',
        ERROR: 'error'
    };

    /**
     * Centralized Logger
     * @constructor
     */
    function Logger() {
        this.config = LoggerConfig;
        this.logLevel = LogLevel.INFO; // Default log level
    }

    Logger.prototype = {
        /**
         * Check if logging is enabled for a given type
         * @param {string} type
         * @return {boolean}
         */
        isEnabled: function(type) {
            if (!this.config.ALL) {
                return false;
            }
            return this.config[type] === true;
        },

        /**
         * Enable logging for a specific type
         * @param {string} type
         */
        enable: function(type) {
            if (type === 'ALL') {
                this.config.ALL = true;
            } else {
                this.config[type] = true;
            }
        },

        /**
         * Disable logging for a specific type
         * @param {string} type
         */
        disable: function(type) {
            if (type === 'ALL') {
                this.config.ALL = false;
            } else {
                this.config[type] = false;
            }
        },

        /**
         * Set log level
         * @param {string} level
         */
        setLogLevel: function(level) {
            this.logLevel = level;
        },

        /**
         * Get current log level
         * @return {string}
         */
        getLogLevel: function() {
            return this.logLevel;
        },

        /**
         * Log a message
         * @param {string} type Log type (API, RUNNER, TREX, etc.)
         * @param {string} level Log level (debug, info, warn, error)
         * @param {string} message Log message
         * @param {Object} data Optional data object
         */
        log: function(type, level, message, data) {
            if (!this.isEnabled(type)) {
                return;
            }

            // Check log level
            var levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
            var currentLevelIndex = levels.indexOf(this.logLevel);
            var messageLevelIndex = levels.indexOf(level);
            
            if (messageLevelIndex < currentLevelIndex) {
                return; // Don't log if message level is below current log level
            }

            var prefix = '[' + type + ']';
            var fullMessage = prefix + ' ' + message;

            // Use appropriate console method based on level
            switch(level) {
                case LogLevel.DEBUG:
                    if (data) {
                        console.debug(fullMessage, data);
                    } else {
                        console.debug(fullMessage);
                    }
                    break;
                case LogLevel.INFO:
                    if (data) {
                        console.log(fullMessage, data);
                    } else {
                        console.log(fullMessage);
                    }
                    break;
                case LogLevel.WARN:
                    if (data) {
                        console.warn(fullMessage, data);
                    } else {
                        console.warn(fullMessage);
                    }
                    break;
                case LogLevel.ERROR:
                    if (data) {
                        console.error(fullMessage, data);
                    } else {
                        console.error(fullMessage);
                    }
                    break;
                default:
                    if (data) {
                        console.log(fullMessage, data);
                    } else {
                        console.log(fullMessage);
                    }
            }
        },

        /**
         * Log debug message
         * @param {string} type
         * @param {string} message
         * @param {Object} data
         */
        debug: function(type, message, data) {
            this.log(type, LogLevel.DEBUG, message, data);
        },

        /**
         * Log info message
         * @param {string} type
         * @param {string} message
         * @param {Object} data
         */
        info: function(type, message, data) {
            this.log(type, LogLevel.INFO, message, data);
        },

        /**
         * Log warning message
         * @param {string} type
         * @param {string} message
         * @param {Object} data
         */
        warn: function(type, message, data) {
            this.log(type, LogLevel.WARN, message, data);
        },

        /**
         * Log error message
         * @param {string} type
         * @param {string} message
         * @param {Object} data
         */
        error: function(type, message, data) {
            this.log(type, LogLevel.ERROR, message, data);
        },

        /**
         * Get current configuration
         * @return {Object}
         */
        getConfig: function() {
            return JSON.parse(JSON.stringify(this.config)); // Return copy
        },

        /**
         * Update configuration
         * @param {Object} newConfig
         */
        updateConfig: function(newConfig) {
            for (var key in newConfig) {
                if (this.config.hasOwnProperty(key)) {
                    this.config[key] = newConfig[key];
                }
            }
        }
    };

    // Create singleton instance
    var logger = new Logger();

    // Export to global scope
    window.Logger = logger;
    window.LoggerConfig = LoggerConfig;
    window.LogLevel = LogLevel;

    // Convenience function for quick access
    window.log = function(type, message, data) {
        logger.info(type, message, data);
    };
})();

