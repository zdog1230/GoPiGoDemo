'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _getPrototypeOf = require('babel-runtime/core-js/object/get-prototype-of');

var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _possibleConstructorReturn2 = require('babel-runtime/helpers/possibleConstructorReturn');

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _inherits2 = require('babel-runtime/helpers/inherits');

var _inherits3 = _interopRequireDefault(_inherits2);

var _map = require('babel-runtime/core-js/map');

var _map2 = _interopRequireDefault(_map);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _serialport = require('serialport');

var _serialport2 = _interopRequireDefault(_serialport);

var _bitBuffer = require('bit-buffer');

var _events = require('events');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function wait(time) {
    return new _promise2.default(function (respond) {
        setTimeout(respond, time);
    });
}

var DEFAULT_SERIALPORT_PATH = 'COM3'; // /dev/ttyUSB0

var START_FLAG = 0xA5;
var START_FLAG2 = 0x5A;
var COMMANDS = _lodash2.default.mapValues({
    STOP: 0x25,
    RESET: 0x40,
    SCAN: 0x20,
    EXPRESS_SCAN: 0x82,
    FORCE_SCAN: 0x21,
    GET_INFO: 0x50,
    GET_HEALTH: 0x52,
    GET_SAMPLERATE: 0x59,
    GET_ACC_BOARD_FLAG: 0xFF,
    SET_MOTOR_PWM: 0xF0
}, function (command) {
    return Buffer.from([START_FLAG, command]);
});

var RESPONSE_MODES = {
    SINGLE_REQUEST_SINGLE_RESPONSE: 0x0,
    SINGLE_REQUEST_MULTIPLE_RESPONSE: 0x1,
    RESERVED_3: 0x3,
    RESERVED_$: 0x4,
    NO_RESPONSE: 5
};

var RESPONSES = {
    SCAN_START: {
        responseMode: RESPONSE_MODES.SINGLE_REQUEST_MULTIPLE_RESPONSE,
        bytes: [START_FLAG, START_FLAG2, 0x05, 0x00, 0x00, 0x40, 0x81]
    },
    HEALTH: {
        responseMode: RESPONSE_MODES.SINGLE_REQUEST_SINGLE_RESPONSE,
        bytes: [START_FLAG, START_FLAG2, 0x03, 0x00, 0x00, 0x00, 0x06],
        dataLength: 3 },
    INFO: {
        responseMode: RESPONSE_MODES.SINGLE_REQUEST_SINGLE_RESPONSE,
        bytes: [START_FLAG, START_FLAG2, 0x14, 0x00, 0x00, 0x00, 0x04],
        dataLength: 20
    }
};

// Start Flag   | Command | Payload Size | Payload Data | Checksum
// 1byte (0xA5) | 1byte   | 1byte        | 0-255 bytes  | 1byte
//                                Optional Section, ≤5 seconds
//
// checksum = 0 ⨁ 0𝑥𝐴5 ⨁ 𝐶𝑚𝑑𝑇𝑦𝑝𝑒 ⨁ 𝑃𝑎𝑦𝑙𝑜𝑎𝑑𝑆𝑖𝑧𝑒 ⨁ 𝑃𝑎𝑦𝑙𝑜𝑎𝑑[0] ⨁ … ⨁ 𝑃𝑎𝑦𝑙𝑜𝑎𝑑[𝑛]

// Start Flag1  | Start Flag2  | Data Response Length | Send Mode | Data Type
// 1byte (0xA5) | 1byte (0x5A) | 30bits               | 2bits     | 1byte

var RPLIDAR_STATES = {
    UNKNOWN: 0,
    IDLE: 1,
    PROCESSING: 2,
    SCANNING: 3,
    STOP: 4
};

var MOTOR_STATES = {
    OFF: 0,
    ON: 1
};

var HEALTH_STATUSES = new _map2.default();
HEALTH_STATUSES.set(0x00, 'Good');
HEALTH_STATUSES.set(0x01, 'Warning');
HEALTH_STATUSES.set(0x02, 'Error');

var RESPONSE_TYPES = {
    SCAN: 0,
    EXPRESS_SCAN: 1,
    FORCE_SCAN: 2,
    INFO: 3,
    HEALTH: 4,
    SAMPLERATE: 5
};

var RPLidar = function (_EventEmitter) {
    (0, _inherits3.default)(RPLidar, _EventEmitter);
    (0, _createClass3.default)(RPLidar, null, [{
        key: 'parser',
        value: function parser() {
            var _scanCache = new Buffer(0);

            return function (emitter, buffer) {
                if (isHealthCheckResponse(buffer)) {
                    emitter.emit('health', {
                        status: parseInt('' + hexToBinaryString(buffer[7]), 2),
                        errorCode: parseInt('' + hexToBinaryString(buffer[9]) + hexToBinaryString(buffer[8]), 2)
                    });
                } else if (isInfoCheckResponse(buffer)) {
                    emitter.emit('info', parseInfo(buffer));
                } else if (isScanStart(buffer)) {
                    emitter.emit('scan-start');
                } else if (isBootUpMessage(buffer)) {
                    this.emit('boot', String(buffer));
                } else if (buffer.length === 256) {
                    try {
                        // add any extra bytes left off from the last buffer
                        var data = Buffer.concat([_scanCache, buffer]);
                        var dataLength = data.length;
                        var extraBits = dataLength % 5;

                        for (var offset = 0; offset < dataLength - extraBits; offset += 5) {
                            emitter.emit('data', parseScan(data.slice(offset, offset + 5)));
                        }

                        // add any bits that don't make up a complete data packet to the cache
                        _scanCache = data.slice(dataLength - extraBits, dataLength);
                    } catch (err) {
                        emitter.emit('error', err);
                    }
                } else {
                    console.log('Unknown packet');
                }
            };
        }

        // The motor seems to always start as off

    }]);

    function RPLidar() {
        var path = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : DEFAULT_SERIALPORT_PATH;
        var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        (0, _classCallCheck3.default)(this, RPLidar);

        var _this = (0, _possibleConstructorReturn3.default)(this, (RPLidar.__proto__ || (0, _getPrototypeOf2.default)(RPLidar)).call(this));

        _this.state = RPLIDAR_STATES.UNKNOWN;
        _this.motorState = MOTOR_STATES.OFF;


        _this.path = path;
        _this.debug = !!options.debug;
        return _this;
    }

    (0, _createClass3.default)(RPLidar, [{
        key: 'init',
        value: function init() {
            var _this2 = this;

            return new _promise2.default(function (resolve, reject) {
                if (_this2._port) setTimeout(reject());

                _this2._port = new _serialport2.default(_this2.path, {
                    baudrate: 115200,
                    buffersize: 256,
                    parser: RPLidar.parser()
                });

                _this2._port.on('error', function (err) {
                    return _this2.emit('error', err);
                });
                _this2._port.on('disconnect', function () {
                    return _this2.emit('disconnect');
                });
                _this2._port.on('close', function () {
                    return _this2.emit('close');
                });
                _this2._port.on('data', function (data) {
                    if (_this2.state !== RPLIDAR_STATES.SCANNING) {
                        // console.log('GARBAGE', data);
                        // probably a lost packet fragment from an ungraceful shutdown during scanning. Throw it away.
                    } else {
                        if(data.error==0){
                          return _this2.emit('data', data);
                        }
                        //console.log(data);
                    }
                });
                _this2._port.on('health', function (health) {
                    return _this2.emit('health', health);
                });

                _this2._port.on('open', function () {
                    _this2._port.flush(function (err) {
                        if (err) return reject(err);

                        _this2.state = RPLIDAR_STATES.IDLE;

                        _this2.emit('ready');
                        resolve();
                    });
                });
            });
        }
    }, {
        key: 'getHealth',
        value: function getHealth() {
            var _this3 = this;

            this.state = RPLIDAR_STATES.PROCESSING;
            this.waitingFor = 'HEALTH'; // REPLIES.HEALTH
            this._port.write(COMMANDS.GET_HEALTH);

            return new _promise2.default(function (resolve, reject) {
                _this3._port.once('health', function (health) {
                    resolve(health);
                    _this3.waitingFor = false;
                });
            });
        }
    }, {
        key: 'getInfo',
        value: function getInfo() {
            var _this4 = this;

            this.state = RPLIDAR_STATES.PROCESSING;
            this.waitingFor = 'INFO';
            this._port.write(COMMANDS.GET_INFO);

            return new _promise2.default(function (resolve, reject) {
                _this4._port.once('info', function (info) {
                    resolve(info);
                    _this4.waitingFor = false;
                });
            });
        }

        /**
         * Resets the RPLidar
         *
         * @returns Promise
         */

    }, {
        key: 'reset',
        value: function reset() {
            var _this5 = this;

            this._port.write(COMMANDS.RESET);

            return new _promise2.default(function (resolve) {
                _this5._port.once('boot', function () /*bootMessage*/{
                    // if debug log bootMessage
                    resolve();
                });
            });
        }
    }, {
        key: 'startMotor',
        value: function startMotor() {
            this._port.set({ dtr: false });
            this.motorState = MOTOR_STATES.ON;

            return wait(5);
        }
    }, {
        key: 'stopMotor',
        value: function stopMotor() {
            this._port.set({ dtr: true });
            this.motorState = MOTOR_STATES.OFF;

            return wait(5);
        }
    }, {
        key: 'scan',
        value: function scan() {
            var _this6 = this;

            // If the motor is off, we need to start it first
            var motorPromise = void 0;
            if (this.motorState === MOTOR_STATES.OFF) {
                motorPromise = this.startMotor();
            } else {
                motorPromise = new _promise2.default(function (resolve) {
                    return setTimeout(resolve);
                });
            }

            return motorPromise.then(function () {
                _this6.state = RPLIDAR_STATES.PROCESSING;
                _this6.waitingFor = 'SCAN_START';
                _this6._port.write(COMMANDS.SCAN);

                return new _promise2.default(function (resolve, reject) {
                    _this6._port.once('scan-start', function () {
                        _this6.state = RPLIDAR_STATES.SCANNING;
                        _this6.waitingFor = 'SCAN';
                        resolve();
                    });
                });
            });
        }
    }, {
        key: 'stopScan',
        value: function stopScan() {
            this._port.write(COMMANDS.STOP);

            return wait(1);
        }
    }]);
    return RPLidar;
}(_events.EventEmitter);

exports.default = RPLidar;


function isHealthCheckResponse(buffer) {
    if (buffer.length !== 10) return false;

    return buffer[0] === START_FLAG && buffer[1] === 0x5A && buffer[2] === 0x03 && buffer[3] === 0x00 && buffer[4] === 0x00 && buffer[5] === 0x00 && buffer[6] === 0x06;
}

function isInfoCheckResponse(buffer) {
    if (buffer.length !== RESPONSES.INFO.bytes.length + RESPONSES.INFO.dataLength) return false;

    for (var i = 0; i < RESPONSES.INFO.bytes.length; i++) {
        if (buffer[i] !== RESPONSES.INFO.bytes[i]) return false;
    }

    return true;
}

function isScanStart(buffer) {
    if (buffer.length !== 7) return false;

    return buffer[0] === START_FLAG && buffer[1] === 0x5A && buffer[2] === 0x05 && buffer[3] === 0x00 && buffer[4] === 0x00 && buffer[5] === 0x40 && buffer[6] === 0x81;
}

function isBootUpMessage(buffer) {
    if (buffer.length !== 56) return false;

    return buffer[0] === 0x52 && buffer[1] === 0x50 && buffer[2] === 0x20 && buffer[3] === 0x4c && buffer[4] === 0x49 && buffer[5] === 0x44 && buffer[6] === 0x41 && buffer[7] === 0x52;
}

function parseInfo(buffer) {
    return {
        model: buffer[7],
        firmware_minor: buffer[8],
        firmware_major: buffer[9],
        hardware: buffer[10],
        serial_number: _lodash2.default.reduce(buffer.slice(11, 27), function (acc, item) {
            return '' + acc + item.toString(16);
        }, '')
    };
}

function hexToBinaryString(hex) {
    return _lodash2.default.padStart((hex >>> 0).toString(2), 8, '0');
}

function parseScan(data) {
    var byte0 = hexToBinaryString(data[0]);
    var byte1 = hexToBinaryString(data[1]);
    var byte2 = hexToBinaryString(data[2]);
    var byte3 = hexToBinaryString(data[3]);
    var byte4 = hexToBinaryString(data[4]);

    var error = 0;
    var bb = new _bitBuffer.BitView(data);

    //console.log(byte0 + ' ' + byte1 + ' ' + byte2 + ' ' + byte3 + ' ' + byte4);

    var quality = bb.getBits(2, 6, false);

    var start = byte0.substring(7, 8);
    var inverseStart = byte0.substring(6, 7);
    if (start === inverseStart){error=1;};

    var C = byte1.substring(7, 8);
    if (C != 1){error=1;};

    var angle = bb.getBits(9, 15, false) / 64.0; // 0-360 deg
    if (angle < 0 || angle > 360){error=1;};

    var distance = bb.getBits(24, 16, false); // mm

    return {
        error : error,
        start: start,
        inverseStart: inverseStart,
        quality: quality,
        C: C,
        angle: angle,
        distance: distance
    };
}

module.exports = RPLidar;
