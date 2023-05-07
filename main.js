'use strict';

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require("fs");

const axios = require('axios');

const wallboxapis = [
    'vitals',
    'wifi_status',
    'version',
    'lifetime'
];


class TeslaWallbox extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'tesla-wallbox',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.updateInterval = null;
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here

        if (!this.config.ipaddress) {
            this.log.error('Server IP address is empty - please check instance configuration');
            return;
        }
        this.requestClient = axios.default.create({
            baseURL: `http://${this.config.ipaddress}/api/1/`,
            timeout: 10000
        });

        this.log.debug('Wallbox adapter - connection to ' + this.config.ipaddress);
        this.setState('info.connection', false, true);

        await this.readandcreateallstates(true);

        this.log.info('All states read - terminate');
        this.stop();
        /*
        this.updateInterval = setInterval(async () => {
            await this.readandcreateallstates(false);
        }, 10 * 60 * 1000);   // config this.config.interval
        */
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        this.log.info('onUnload called');
        this.setState('info.connection', false, true);
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);

            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }

    async readandcreateallstates(createflag) {
        for (const api of wallboxapis) {
            if (createflag) {
                try {
                    await this.setObjectNotExistsAsync(api, {
                        type: 'channel',
                        role: 'info',
                        common: {
                            name: api
                        },
                        native: {},
                    });
                    this.log.debug('Channel ' + api + ' created');
                } catch(err) {
                    this.log.error('Cannot create channel ' + api + ' (' + err + ')');
                }
            }
            await this.readandcreatestates(api, createflag);
        }

    }

    async readandcreatestates(api, createflag) {
        await this.requestClient.get(api)
            .then(async (res) => {
                this.log.debug('Got data from wallbox for ' + api);
                this.log.debug(JSON.stringify(res.data));
                this.setState('info.connection', true, true);

                if (createflag) {
                    this.log.info('Creating Objects for ' + api);
                    for (const key in res.data) {
                        const value = res.data[key];
                        let vt = 'mixed';
                        switch (typeof value) {
                            case 'number':
                                vt = 'number';
                                break;
                            case 'boolean':
                                vt = 'boolean';
                                break;
                            case 'string':
                                vt = 'string';
                                break;
                        }

                        this.log.debug("Creating object '" + api + '.' + key + "'");

                        try {
                            await this.setObjectNotExistsAsync(api + '.' + key, {
                                type: 'state',
                                common: {
                                    name: key,
                                    role: 'value',
                                    type: vt,
                                    // @ts-ignore
                                    read: true,
                                    write: false
                                },
                                native: {},
                            });
                            this.log.debug('Object created: ' + api + '.' + key);
                        } catch(err)  {
                            this.log.error(err);
                        }
                    }
                }

                this.log.debug('Created all states, now setting values for ' + api);
                const promises = [];

                for (const key in res.data) {
                    const value = res.data[key];

                    promises.push(this.setStateAsync(api + '.' + key, (typeof value == 'object' ? JSON.stringify(value) : value), true));
                }
                Promise.all(promises)
                    .then(result => {
                        this.log.info('All States set: ' + result);
                    })
                    .catch(err => {
                        this.log.error('Cannot set state: ' + err);

                    });
            })
            .catch((error) => {
                this.log.error(error);
                if (error.response) {
                    // The request was made and the server responded with a status code
                    // that falls out of the range of 2xx
                    this.log.error(JSON.stringify(error.response.data));
                    this.log.error(JSON.stringify(error.response.status));
                    this.log.error(JSON.stringify(error.response.headers));
                } else if (error.request) {
                    // The request was made but no response was received
                    // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
                    // http.ClientRequest in node.js
                    this.log.error(JSON.stringify(error.request));
                } else {
                    // Something happened in setting up the request that triggered an Error
                    this.log.error(JSON.stringify(error.message));
                }
                this.log.error(JSON.stringify(error.config));
            });
        this.log.debug('Handled data got for ' + api);
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new TeslaWallbox(options);
} else {
    // otherwise start the instance directly
    new TeslaWallbox();
}