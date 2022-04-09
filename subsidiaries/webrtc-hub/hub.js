#!/usr/bin/env node

process.on('unhandledRejection', function (err) {
    console.error('Unhandled rejection:', err.message)
})

/* ---- Signalhubws bin ---- */

var fs = require('fs')

const port = 3300      /** @todo currently not configurable */
const ssl = fs.existsSync('certs')
  ? {
        key_file_name: 'certs/key.pem',
        cert_file_name: 'certs/cert.pem',
        passphrase: ''
    }
  : null

var server = require('signalhubws/server')(null, ssl)

server.listen(port, () => {
    console.log('Signalhubws running on %s', port)
})

/* ---- TURN bin ---- */

const Turn = require('node-turn');
const stun = require('stun');

const credentials = {          /** @todo currently not configurable */
    power: "to-the-people"
}
const poke = {
    authority: 'stun.l.google.com:19302',
    interval: 600 * 1000
}

var server = new Turn({  // set options
    authMech: 'long-term',
    credentials,
    poke,
    debugLevel: process.env['DEBUG'] ?? 'TRACE'
});
server.start();

server.poke = async function() {
    try {
        const res = await stun.request(this.poke.authority),
              xaddr = res.getXorAddress();
        console.log(new Date(), xaddr.family, xaddr.address);
        this.externalIps = xaddr.address;
    } catch (e) {
        console.warn("(in stun request)", e);
    }
};

/* @todo read from config */
server.poke.authority = poke.authority;
server.poke.interval = poke.interval;
server.poke();

setInterval(() => server.poke(), server.poke.interval);

